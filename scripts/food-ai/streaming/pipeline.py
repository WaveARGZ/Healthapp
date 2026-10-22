"""Manual, bounded streaming run. All outputs go to verified private foodDB folders."""
import argparse
import errno
from datetime import datetime, timezone
import json
import os
import re
from pathlib import Path
import signal
import socket
import sys
import uuid
import requests

# Set before importing numpy/ONNX. Running with -B also prevents __pycache__ writes.
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
from drive_store import DriveStore, MissingDriveFolder, encoded, sha
from hybrid import CONTRACT, clean_image, evaluate, fit, model_revoked, pack_cache, partition, promotion, unpack_cache, validate_record
from collector import collect
from acquisition import collect_sources, plan_acquisition
from features import Features
from legacy import ArchiveReader, archive_index, archived_records, reviewed_legacy_record, source_index

REPO = Path(__file__).resolve().parents[3]
STOP = False
OWNER_STATE_FILES = (
    "ml/artifacts/drive-archive/state.json",
    "ml/artifacts/drive-archive/queue.json",
    "ml/artifacts/verified-splits.json",
    "ml/artifacts/verified-exclusions.json",
    "training-data/commons/sources.json",
)


class OwnerLearningStateMissing(RuntimeError):
    """A source-only clone must not treat private historical evidence as empty."""


def require_owner_learning_state():
    """Read-only, before authentication or any Drive mutation; never bootstrap data."""
    try:
        for relative in OWNER_STATE_FILES:
            path = REPO / relative
            if path.is_symlink() or not path.is_file() or path.stat().st_size == 0:
                raise OwnerLearningStateMissing()
        folder = REPO / "training-data/commons"
        if folder.is_symlink() or not any(path.is_file() and not path.is_symlink() and path.stat().st_size > 0
                for path in folder.glob("commons-*.json")):
            raise OwnerLearningStateMissing()
    except OSError:
        raise OwnerLearningStateMissing() from None


def request_stop(*_):
    global STOP
    STOP = True


def failure_status(error):
    """Only fixed, actionable diagnostics; provider exception text is never returned."""
    code, detail, retryable = "unexpected_failure", "処理を完了できませんでした。確認済みデータは保持しています。", False
    kind, message = type(error).__name__, str(error)
    if isinstance(error, OwnerLearningStateMissing):
        code, detail = "owner_learning_state_missing", "学習用の既存台帳・確認記録がないため停止しました。学習は履歴を保持する所有者の管理PCだけで実行してください。認証情報や学習データをGitHubへ追加・コピーしないでください。"
    elif kind == "DefaultCredentialsError":
        code, detail = "drive_auth_missing", "学習プログラム用のGoogle Drive認証が未設定です。初回認証を完了してから再試行してください。"
    elif kind == "RefreshError":
        code, detail = "drive_auth_expired", "学習プログラムのGoogle認証を更新できませんでした。所有者アカウントで再認証してください。"
    elif isinstance(error, MissingDriveFolder):
        code, detail = "drive_setup_required", "foodDB内の学習用フォルダが未作成です。管理画面の開始ボタンから初期設定してください。"
    elif isinstance(error, OSError) and error.errno == errno.EADDRINUSE:
        code, detail = "run_already_active", "別の学習処理が実行中です。完了するか、安全に停止してから再試行してください。"
    elif message == "CLIP worker exceeded time limit":
        code, detail, retryable = "feature_loading_timeout", "画像認識モデルの読み込みが制限時間に達しました。保存済みモデル資材を使って次回再開できます。", True
    elif isinstance(error, (requests.exceptions.RequestException, TimeoutError)) or kind == "TransportError":
        code, detail, retryable = "connection_failed", "通信が完了しませんでした。接続が戻ってから再試行すると、保存確認済みの続きから処理します。", True
    elif isinstance(error, MemoryError) or message in {"RAM byte limit exceeded", "Feature cache RAM limit exceeded", "Model asset RAM limit exceeded"}:
        code, detail = "memory_limit", "処理中のデータがメモリ上限に達しました。保存済みデータを保持して停止しました。"
    elif message in {"Drive free capacity unavailable or insufficient", "Conservative 4 TB storage ceiling reached"}:
        code, detail = "drive_capacity", "Driveの空き容量または設定済み容量上限を確認できません。容量を確認してから再試行してください。"
    elif re.fullmatch(r"Drive (?:HTTP|upload initialization HTTP|upload HTTP) (?:401|403)", message):
        code, detail = "drive_access_denied", "学習プログラムからfoodDBへアクセスできません。所有者アカウントの認証とDrive権限を確認してください。"
    elif re.fullmatch(r"Drive (?:HTTP|upload initialization HTTP|upload HTTP) (?:429|5[0-9]{2})", message):
        code, detail, retryable = "drive_temporarily_unavailable", "Driveが一時的に応答できません。時間を置いて再試行してください。保存確認済みのデータから再開します。", True
    elif message in {"Drive item is not verified owner-only", "Drive item is outside the expected parent", "Drive ancestry does not reach foodDB", "Image/record source folder mismatch"}:
        code, detail = "drive_folder_safety", "保存先の親フォルダまたは非公開設定が想定と異なります。foodDB配下の保存先を確認してください。"
    elif message == "Existing archive upload queue must be verified first; no new collection":
        code, detail = "archive_verification_pending", "以前の未確認アーカイブが残っています。Drive上の内容を照合してから学習を再開します。"
    elif message in {"CLIP worker exited", "CLIP feature extraction failed", "CLIP contract mismatch", "Incumbent feature contract mismatch", "Feature contract violation",
        "CLIP model_asset_missing", "CLIP model_download_failed", "CLIP model_cache_failed", "CLIP model_contract_mismatch", "CLIP model_initialization_failed", "CLIP image_feature_failed"}:
        code, detail = "feature_extraction_failed", "画像認識モデルの読み込みまたは特徴量の検証に失敗しました。モデルの互換性を確認してから再開します。"
    elif isinstance(error, ValueError) or message in {"Drive readback SHA-256 mismatch", "Drive model cache could not be verified", "Revoked data influenced incumbent; invalidate and rebuild before use"}:
        code, detail = "data_verification_failed", "写真・正解・保存内容の照合が一致しないか、利用同意の再確認が必要です。該当データを採用せず停止しました。"
    return {"stage": "blocked", "reason": kind, "diagnosticCode": code, "retryable": retryable, "detail": detail}


def local_json(relative, fallback=None):
    path = REPO / relative
    return json.loads(path.read_text()) if path.is_file() else fallback


def code_snapshot(run_id, report):
    """Explicit source-only allowlist; never include credentials, env or user records."""
    files = sorted(Path(__file__).parent.glob("*.py")) + sorted(Path(__file__).parent.glob("*.mjs"))
    files += [REPO / relative for relative in (
        "scripts/google-drive-training-ingest/Code.gs",
        "components/meals/public-food-photo.tsx", "components/meals/photo-meal-analyzer.tsx",
        "lib/drive/google-drive-client.ts", "lib/drive/training-receipt.mjs",
        "hooks/use-google-drive-client-id.ts", "lib/food-ai/clip-features.mjs",
        "lib/food-ai/food-calibration.mjs", "package.json",
    )]
    contents = {}
    for path in files:
        if not path.is_file() or path.is_symlink():
            raise ValueError("Snapshot source is missing or unexpectedly linked")
        contents[path.relative_to(REPO).as_posix()] = path.read_text()
    return {"runId": run_id, "report": report, "files": contents}


def merge_history(remote, legacy):
    registry = remote or {"schemaVersion": 1, "assignments": {}}
    for key, entry in legacy.get("assignments", {}).items():
        if key in registry["assignments"] and any(registry["assignments"][key].get(field) != entry.get(field) for field in ("split", "label", "dhash")):
            raise ValueError("Historical split conflict; automatic migration stopped")
        registry["assignments"].setdefault(key, entry)
    return registry


def legacy_collection_ids():
    """Read old source identities without rewriting or claiming a new Drive receipt."""
    ids = {path.stem for path in (REPO / "training-data/commons").glob("commons-*.json")}
    state = local_json("ml/artifacts/drive-archive/state.json", {})
    batches = state.get("batches", [])
    for batch in batches.values() if isinstance(batches, dict) else batches:
        if batch.get("dataset") == "commons":
            for file in batch.get("files", []):
                match = re.search(r"/(commons-[0-9]+)\.(?:jpg|json)$", file.get("key", ""))
                if match:
                    ids.add(match[1])
    return ids


def import_existing(drive, folder, labels, exclusions, notify):
    """Read-only import of already reviewed, metadata-free public JPEGs. No re-download."""
    source_dir = REPO / "training-data/commons"
    existing = {item["name"] for item in drive.children(folder)}
    sources = source_index(local_json("training-data/commons/sources.json", []))
    archived = archive_index(local_json("ml/artifacts/drive-archive/state.json", {}))
    count = 0
    for path in sorted(source_dir.glob("commons-*.json")):
        if STOP or count >= 100:
            break
        if path.name in existing or "commons/images/" + path.stem + ".jpg" in archived:
            # Existing Drive archive originals are referenced in RAM, never re-uploaded.
            continue
        original = json.loads(path.read_text())
        record = reviewed_legacy_record(original, sources, labels)
        if not record or original["id"] in exclusions:
            continue
        image_path = source_dir / (original["id"] + ".jpg")
        if image_path.is_symlink() or not image_path.is_file() or image_path.stat().st_size > 5_000_000:
            continue
        data = image_path.read_bytes()
        if sha(data) != original.get("review", {}).get("imageSha256"):
            raise ValueError("Existing review hash mismatch")
        import io
        from PIL import Image
        with Image.open(io.BytesIO(data)) as image:
            if image.getexif():
                continue  # Do not silently change the reviewed hash; needs explicit migrated review.
        validate_record(record, labels)
        record["imageFileId"] = drive.put(folder, image_path.name, data, "image/jpeg")
        drive.put_json(folder, path.name, record)
        count += 1
        notify("import", count, "既存の目視確認済み公開データをDriveへ移行（元ファイルは変更なし）")


def run(options, drive=None):
    require_owner_learning_state()
    drive = drive or DriveStore()
    drive.capacity(0)
    queue = local_json("ml/artifacts/drive-archive/queue.json", {})
    if queue.get("pending"):
        raise RuntimeError("Existing archive upload queue must be verified first; no new collection")
    try:
        folders = drive.layout(create=not options.preflight)
    except MissingDriveFolder:
        if not options.preflight:
            raise
        print(json.dumps({"stage": "setup_required", "detail": "Drive認証・foodDBの非公開設定・容量を確認しました。学習用フォルダは未作成です。「取り込み・学習を開始」でfoodDB内に初期作成します。まだ学習はしていません。"}, ensure_ascii=False), flush=True)
        return
    if options.preflight:
        print(json.dumps({"stage": "ready", "detail": "Drive権限・保存先を確認しました。まだ学習はしていません。"}), flush=True)
        return
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8]

    def notify(stage, count, detail, persist=True):
        status = {"runId": run_id, "stage": stage, "processed": count, "detail": detail, "updatedAt": datetime.now(timezone.utc).isoformat(), "productionChanged": False}
        print(json.dumps(status, ensure_ascii=False), flush=True)
        if persist:
            drive.put_json(folders["logs"], "status.json", status, replace=True)

    notify("prepare", 0, "Driveのみを保存先として処理を開始")
    # Preserve lineage and historical exclusions; never replace the original local ledgers.
    history = local_json("ml/artifacts/verified-splits.json", {"assignments": {}})
    exclusion_data = local_json("ml/artifacts/verified-exclusions.json", {"exclusions": []})
    exclusions = {r["id"]: r for r in exclusion_data["exclusions"]}
    registry = merge_history(drive.json(folders["cache"], "split-registry.json"), history)
    drive.put_json(folders["logs"], "legacy-exclusions-" + sha(encoded(exclusion_data))[:16] + ".json", exclusion_data)
    label_pairs = local_json("lib/food-ai/test-photo-labels.json")
    labels, prompts = [pair[0] for pair in label_pairs], [pair[1] for pair in label_pairs]
    fingerprint = sha(encoded({"contract": CONTRACT, "labels": label_pairs}))
    cache_name = "embeddings-" + fingerprint[:16] + ".npz"
    cache_file = drive.find(folders["cache"], cache_name)
    cached = unpack_cache(drive.read(cache_file["id"]) if cache_file else None, fingerprint)
    revocations = drive.json(folders["logs"], "revocations.json", {"ids": [], "imageSha256": []})
    revoked = set(revocations["ids"])
    revoked_hashes = set(revocations.get("imageSha256", [])) | {r["imageSha256"] for r in cached if r["id"] in revoked}
    if options.import_existing:
        import_existing(drive, folders["base"], labels, exclusions, notify)
    records, pending, scanned, rejected = [], 0, 0, 0
    for key in ["app_inbox", "base", "auto_inbox", "public_eval"]:
        if STOP:
            break
        for file in drive.children(folders[key]):
            if not file["name"].endswith(".json") or file["name"].endswith("-index.json"):
                continue
            record = json.loads(drive.read(file["id"], 2_500_000))
            scanned += 1
            if scanned % 10 == 0:
                notify("prepare", scanned, f"保存済みの写真ラベル・同意・確認履歴を検証中（{scanned}件）", persist=False)
            if not isinstance(record, dict) or not isinstance(record.get("source"), str):
                pending += 1
                continue
            if (key == "app_inbox") != record["source"].startswith("app_"):
                raise ValueError("Source/folder separation mismatch")
            if key == "base" and record["source"] != "public_base" or key == "auto_inbox" and record["source"] != "autonomous_public":
                raise ValueError("Public base/autonomous source mismatch")
            if record.get("id") in exclusions:
                if record.get("imageSha256") != exclusions[record["id"]]["imageSha256"]:
                    raise ValueError("Historical exclusion hash mismatch")
                continue
            if record.get("id") in revoked or record.get("revoked"):
                revoked_hashes.add(record.get("imageSha256"))
                continue
            if isinstance(record.get("review"), dict) and record["review"].get("decision") == "rejected":
                rejected += 1
                continue
            try:
                validate_record(record, labels)
            except ValueError:
                pending += 1
                continue
            record["recordFileId"] = file["id"]
            record["recordVersion"] = file.get("version")
            record["sourceFolderId"] = folders[key]
            if key == "public_eval":
                record["requiredSplit"] = "test"
            # Trust neither a folder placement nor a model prediction as ground truth.
            records.append(record)
    legacy = archived_records(REPO, local_json("ml/artifacts/drive-archive/state.json", {}), labels, exclusions,
        {(r["id"], r["imageSha256"], r["confirmedFoodId"]) for r in records if r["source"] == "public_base"})
    records.extend(legacy)
    notify("prepare", scanned, f"保存済みラベル{scanned}件を確認。旧アーカイブ{len(legacy)}件を原本のまま参照します。", persist=False)
    records = [record for record in records if record["imageSha256"] not in revoked_hashes]
    incumbent = drive.json(folders["candidates"], "active-test.json")
    if model_revoked(incumbent, revocations):
        raise RuntimeError("Revoked data influenced incumbent; invalidate and rebuild before use")
    plan = plan_acquisition(records, cached, registry, label_pairs, local_json("lib/data/food-library.json", {}), incumbent)
    drive.put_json(folders["logs"], "acquisition-plan.json", plan, replace=True)
    if options.collect and not STOP:
        collected = collect_sources(drive, folders, label_pairs, plan, lambda: STOP, notify, collect, skip_ids=legacy_collection_ids())
        for record in collected:
            try:
                validate_record(record, labels)
                if record["id"] not in revoked and record["imageSha256"] not in revoked_hashes:
                    record["sourceFolderId"] = folders["auto_inbox"]
                    records.append(record)
            except ValueError:
                pending += 1
    if len(records) > 10000:
        raise RuntimeError("10,000-record bound reached; shard design needs review")
    # Refresh consent/review membership EVERY run, even for cached features.
    cached_by_hash = {r["imageSha256"]: r for r in cached}
    rows, extractor, processed, pending_features = [], None, 0, 0
    archive_reader = ArchiveReader(drive)
    eligible_ids = {r["id"] for r in records}

    def checkpoint():
        # Keep previously extracted eligible features on safe stop / bounded runs.
        combined = {r["imageSha256"]: r for r in cached if r["id"] in eligible_ids and r["id"] not in revoked and r["imageSha256"] not in revoked_hashes}
        combined.update({r["imageSha256"]: r for r in rows})
        save_cache(drive, folders, cache_name, list(combined.values()), fingerprint)
    try:
        new_records = []
        for checked, record in enumerate(records, 1):
            if STOP:
                break
            previous = cached_by_hash.get(record["imageSha256"])
            image_meta = archive_reader.meta(record["imageArchive"]) if record.get("imageArchive") else drive.guard(record["imageFileId"])
            if image_meta.get("parents") != [record["sourceFolderId"]]:
                raise ValueError("Image/record source folder mismatch")
            if record.get("recordArchive"):
                record_meta = archive_reader.meta(record["recordArchive"])
                source_meta = archive_reader.meta(record["sourceArchive"])
                record["recordVersion"] = ":".join((record["recordArchive"]["sha256"], str(record_meta.get("version")),
                    record["sourceArchive"]["sha256"], str(source_meta.get("version"))))
            if checked % 50 == 0:
                notify("prepare", checked, f"写真と保存場所の対応を検証中（{checked}/{len(records)}件）", persist=False)
            if previous and previous.get("imageVersion") == image_meta.get("version") and previous.get("imageFileId") == record["imageFileId"] and (
                not record.get("imageArchive") or previous.get("imageArchive") == record["imageArchive"] and previous.get("recordVersion") == record["recordVersion"]
            ):
                rows.append({**previous, **record})
                continue
            if len(new_records) >= 100:
                pending_features += 1
                continue
            new_records.append({**record, "imageVersion": image_meta.get("version")})
        # Verify remote reviewed-label bytes in archive order before reading images.
        # This keeps only one tar in RAM and avoids downloading it for every member.
        proofs = [(r, kind) for r in new_records if r.get("recordArchive") for kind in ("recordArchive", "sourceArchive")]
        for checked, (record, kind) in enumerate(sorted(proofs, key=lambda item: item[0][item[1]]["fileId"]), 1):
            if STOP:
                break
            evidence = archive_reader.read(record[kind], 2_500_000)
            if kind == "sourceArchive":
                source = json.loads(evidence)
                expected = record["provenance"]["originalSource"]
                if any(source.get(key) != expected.get(key) for key in ("id", "sha256", "filePage", "license", "licenseUrl", "author")):
                    raise ValueError("Remote legacy attribution differs from the reviewed source")
            if checked % 20 == 0 or checked == len(proofs):
                notify("prepare", checked, f"旧アーカイブのラベルと出典を完全照合中（{checked}/{len(proofs)}件）", persist=False)
        archive_reader.close()
        for record in sorted(new_records, key=lambda r: r["imageFileId"]):
            if STOP:
                break
            raw = archive_reader.read(record["imageArchive"], 5_000_000) if record.get("imageArchive") else drive.read(record["imageFileId"], 5_000_000)
            if sha(raw) != record["imageSha256"]:
                raise ValueError("Image and ground-truth hash mismatch")
            _, dhash = clean_image(raw)
            if extractor is None:
                notify("features", processed, "固定CLIPを準備（モデル資材もDriveに保存）")
                extractor = Features(drive, folders["assets"], lambda detail: notify("features", processed, detail, persist=False))
            features = extractor.extract(raw, prompts)
            rows.append({**record, "embedding": features["embedding"], "scores": features["scores"],
                "dhash": history.get("assignments", {}).get(record["imageSha256"], {}).get("dhash", dhash)})
            processed += 1
            if processed % 10 == 0:
                checkpoint()
                notify("features", processed, "新規写真の特徴量をDriveへ照合保存")
    finally:
        archive_reader.close()
        if extractor:
            extractor.close()
        # Safe stop: complete this batch's cache before exiting, never a disk checkpoint.
        checkpoint()
    if STOP:
        notify("stopped", processed, "安全停止しました。現在までの特徴量はDriveに保存済み")
        return
    rows, registry, quarantined = partition(rows, registry)
    drive.put_json(folders["cache"], "split-registry.json", registry, replace=True)
    # Keep inbox originals for immutable receipt/retry. Verified folders contain small manifests,
    # not extra copies of the same photo. Validation remains separate from final eval internally.
    for folder_key, selected in {
        "app_train": [r for r in rows if r["source"].startswith("app_") and r["split"] != "test"],
        "app_eval": [r for r in rows if r["source"].startswith("app_") and r["split"] == "test"],
        "auto_train": [r for r in rows if r["source"] == "autonomous_public" and r["split"] == "train"],
    }.items():
        drive.put_json(folders[folder_key], "verified-index.json", [{k: r[k] for k in ("id", "imageFileId", "recordFileId", "imageSha256", "split")} for r in selected], replace=True)
    train, validation = [r for r in rows if r["split"] == "train"], [r for r in rows if r["split"] == "validation"]
    test = [r for r in rows if r["split"] == "test"]
    coverage_by_label = {label: {"train": sum(r["confirmedFoodId"] == label for r in train),
        "validation": sum(r["confirmedFoodId"] == label for r in validation),
        "publicTest": sum(r["confirmedFoodId"] == label and not r["source"].startswith("app_") for r in test),
        "appTest": sum(r["confirmedFoodId"] == label and r["source"].startswith("app_") for r in test)} for label in labels}
    lacking_labels = [label for label, counts in coverage_by_label.items() if counts["train"] < 5 or counts["validation"] < 2]
    coverage = not lacking_labels
    report = {"runId": run_id, "contract": CONTRACT, "fingerprint": fingerprint, "pendingReview": pending, "rejectedReview": rejected,
        "pendingFeatures": pending_features, "coverageByLabel": coverage_by_label,
        "quarantined": quarantined, "train": len(train), "validation": len(validation), "test": len(test), "adopted": False,
        "legacyArchiveReferences": len(legacy),
        "acquisitionPriorities": [item["foodId"] for item in plan["priorities"][:3]],
        "acquisitionStatus": drive.json(folders["cache"], "acquisition_history.json", {}).get("sources", {})}
    if not coverage or not any(r["source"] == "public_base" for r in train):
        report["reason"] = (f"独立確認済みデータが不足（学習5枚・検証2枚の条件未達：{len(lacking_labels)}料理、"
            f"確認待ち：{pending}枚、特徴量処理待ち：{pending_features}枚）。")
        if pending_features:
            report["reason"] += "次回は保存済み特徴量を再利用し、未処理分から続けます。"
    else:
        notify("training", len(train), "公開基本データ60%以上を維持して候補順位補正を学習")
        variants = [fit(train, labels, prompts, reg, stopping=lambda: STOP) for reg in (.01, .03, .1, .3)]
        # Hyperparameters chosen ONLY on validation. Final public/app eval is not used for selection.
        candidate = max(variants, key=lambda model: evaluate(validation, labels, model)["mrr"])
        public = [r for r in test if not r["source"].startswith("app_")]
        app = [r for r in test if r["source"].startswith("app_")]
        incumbent = drive.json(folders["candidates"], "active-test.json")
        if model_revoked(incumbent, revocations):
            raise RuntimeError("Revoked data influenced incumbent; invalidate and rebuild before use")
        references = [None, incumbent or local_json("lib/food-ai/test-calibration.json")]
        report["gates"] = [promotion(evaluate(public, labels, ref), evaluate(public, labels, candidate), evaluate(app, labels, ref), evaluate(app, labels, candidate), labels) for ref in references]
        report["public"] = evaluate(public, labels, candidate)
        report["app"] = evaluate(app, labels, candidate)
        report["adopted"] = all(gate["passed"] for gate in report["gates"])
        if report["adopted"]:
            candidate.update({"trainingIds": [r["id"] for r in train], "trainingHashes": [r["imageSha256"] for r in train], "runId": run_id, "gatePassed": True})
            # Both an immutable candidate and an active pointer; production files never written.
            drive.put_json(folders["candidates"], run_id + ".json", candidate)
            drive.put_json(folders["candidates"], "active-test.json", candidate, replace=True)
    drive.put_json(folders["logs"], run_id + ".json", report)
    drive.put_json(folders["logs"], run_id + "-code.json", code_snapshot(run_id, report))
    notify("adopted" if report["adopted"] else "not_adopted", len(rows), "独立評価を通過しテスト候補を保存しました。本番は未変更" if report["adopted"] else report.get("reason", "評価条件を満たさないためモデルは更新していません"))


def save_cache(drive, folders, name, rows, fingerprint):
    cache_id = drive.put(folders["cache"], name, pack_cache(rows, fingerprint), replace=True)
    drive.put_json(folders["cache"], "processed_files_log.json", {"cacheFileId": cache_id, "fingerprint": fingerprint,
        "images": [{"fileId": r["imageFileId"], "sha256": r["imageSha256"]} for r in rows]}, replace=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--preflight", action="store_true")
    parser.add_argument("--collect", action="store_true")
    parser.add_argument("--import-existing", action="store_true")
    options = parser.parse_args()
    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    if hasattr(os, "nice"):
        os.nice(10)
    try:
        # OS-held local mutex; never create a lock file on the PC.
        with socket.socket() as process_lock:
            process_lock.bind(("127.0.0.1", 3003))
            run(options)
    except InterruptedError:
        print(json.dumps({"stage": "stopped", "detail": "安全停止しました。モデルは更新していません。"}), flush=True)
    except Exception as error:
        print(json.dumps(failure_status(error), ensure_ascii=False), flush=True)
        sys.exit(1)
