"""Manual, bounded streaming run. All outputs go to verified private foodDB folders."""
import argparse
from datetime import datetime, timezone
import json
import os
import re
from pathlib import Path
import signal
import socket
import sys
import uuid

# Set before importing numpy/ONNX. Running with -B also prevents __pycache__ writes.
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
from drive_store import DriveStore, MissingDriveFolder, encoded, sha
from hybrid import CONTRACT, clean_image, evaluate, fit, model_revoked, pack_cache, partition, promotion, unpack_cache, validate_record
from collector import collect, LICENSES
from acquisition import collect_sources, plan_acquisition
from features import Features

REPO = Path(__file__).resolve().parents[3]
STOP = False


def request_stop(*_):
    global STOP
    STOP = True


def local_json(relative, fallback=None):
    path = REPO / relative
    return json.loads(path.read_text()) if path.is_file() else fallback


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
    count = 0
    for path in sorted(source_dir.glob("commons-*.json")):
        if STOP or count >= 100:
            break
        if path.name in existing:
            continue
        original = json.loads(path.read_text())
        if not original.get("labelVerified") or original.get("confirmedFoodId") not in labels:
            continue
        source = original.get("source", {})
        license_name = source.get("license", "").upper()
        if license_name not in LICENSES or original["id"] in exclusions:
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
        record = {"schemaVersion": 2, "id": original["id"], "source": "public_base",
            "confirmedFoodId": original["confirmedFoodId"], "imageSha256": sha(data), "review": original["review"],
            "provenance": {"pageUrl": source.get("filePage"), "license": license_name,
                "licenseUrl": source.get("licenseUrl"), "attribution": source.get("author"), "originalSource": source}}
        validate_record(record, labels)
        record["imageFileId"] = drive.put(folder, image_path.name, data, "image/jpeg")
        drive.put_json(folder, path.name, record)
        count += 1
        notify("import", count, "既存の目視確認済み公開データをDriveへ移行（元ファイルは変更なし）")


def run(options, drive=None):
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

    def notify(stage, count, detail):
        status = {"runId": run_id, "stage": stage, "processed": count, "detail": detail, "updatedAt": datetime.now(timezone.utc).isoformat(), "productionChanged": False}
        print(json.dumps(status, ensure_ascii=False), flush=True)
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
    records, pending = [], 0
    for key in ["app_inbox", "base", "auto_inbox", "public_eval"]:
        if STOP:
            break
        for file in drive.children(folders[key]):
            if not file["name"].endswith(".json") or file["name"].endswith("-index.json"):
                continue
            record = json.loads(drive.read(file["id"], 2_500_000))
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
    rows, extractor, processed = [], None, 0
    eligible_ids = {r["id"] for r in records}

    def checkpoint():
        # Keep previously extracted eligible features on safe stop / bounded runs.
        combined = {r["imageSha256"]: r for r in cached if r["id"] in eligible_ids and r["id"] not in revoked and r["imageSha256"] not in revoked_hashes}
        combined.update({r["imageSha256"]: r for r in rows})
        save_cache(drive, folders, cache_name, list(combined.values()), fingerprint)
    try:
        for record in records:
            if STOP:
                break
            previous = cached_by_hash.get(record["imageSha256"])
            image_meta = drive.guard(record["imageFileId"])
            if image_meta.get("parents") != [record["sourceFolderId"]]:
                raise ValueError("Image/record source folder mismatch")
            if previous and previous.get("imageVersion") == image_meta.get("version") and previous.get("imageFileId") == record["imageFileId"]:
                rows.append({**previous, **record})
                continue
            if processed >= 100:
                pending += 1
                continue
            raw = drive.read(record["imageFileId"], 5_000_000)
            if sha(raw) != record["imageSha256"]:
                raise ValueError("Image and ground-truth hash mismatch")
            _, dhash = clean_image(raw)
            if extractor is None:
                notify("features", processed, "固定CLIPを準備（モデル資材もDriveに保存）")
                extractor = Features(drive, folders["assets"])
            features = extractor.extract(raw, prompts)
            rows.append({**record, "embedding": features["embedding"], "scores": features["scores"],
                "dhash": history.get("assignments", {}).get(record["imageSha256"], {}).get("dhash", dhash), "imageVersion": image_meta.get("version")})
            processed += 1
            if processed % 10 == 0:
                checkpoint()
                notify("features", processed, "新規写真の特徴量をDriveへ照合保存")
    finally:
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
    coverage = all(sum(r["confirmedFoodId"] == label for r in train) >= 5 and sum(r["confirmedFoodId"] == label for r in validation) >= 2 for label in labels)
    report = {"runId": run_id, "contract": CONTRACT, "fingerprint": fingerprint, "pendingReview": pending,
        "quarantined": quarantined, "train": len(train), "validation": len(validation), "test": len(test), "adopted": False,
        "acquisitionPriorities": [item["foodId"] for item in plan["priorities"][:3]],
        "acquisitionStatus": drive.json(folders["cache"], "acquisition_history.json", {}).get("sources", {})}
    if not coverage or not any(r["source"] == "public_base" for r in train):
        report["reason"] = "独立確認済みデータが不足（各料理：学習5枚・検証2枚以上、公開基本データが必要）"
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
    snapshot = {"runId": run_id, "report": report, "files": {}}
    for path in sorted(Path(__file__).parent.glob("*.py")) + sorted(Path(__file__).parent.glob("*.mjs")):
        snapshot["files"][path.name] = path.read_text()
    drive.put_json(folders["logs"], run_id + "-code.json", snapshot)
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
        # Deliberately omit provider error strings/tokens/free text labels.
        print(json.dumps({"stage": "blocked", "reason": type(error).__name__, "detail": "認証・Drive権限・データ検証で停止しました。既存データは保持しています。"}, ensure_ascii=False), flush=True)
        sys.exit(1)
