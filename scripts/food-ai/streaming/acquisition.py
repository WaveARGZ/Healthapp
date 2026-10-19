"""Bounded, disk-free source discovery. Discovery is NOT permission or ground truth."""
from datetime import datetime, timezone
import json
import re
from urllib.parse import urlparse

import requests

from drive_store import encoded, sha
from hybrid import clean_image, predict
from collector import LICENSES, local_review

HEADERS = {"User-Agent": "BodyMakeResearch/2.0 (https://github.com/WaveARGZ/Healthapp)"}


def now():
    return datetime.now(timezone.utc).isoformat()


class SourceUnavailable(RuntimeError):
    """Public provider unavailable; no workaround or tight retry loop."""


def fetch_bytes(url, hosts, limit, params=None, headers=None, expected_revision=None):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in hosts or parsed.port not in (None, 443) or parsed.username or parsed.password:
        raise ValueError("Source URL outside allowlist")
    try:
        with requests.get(url, params=params, headers=headers or HEADERS, stream=True,
                          allow_redirects=False, timeout=(10, 45)) as response:
            if response.status_code != 200:
                raise SourceUnavailable("Source HTTP " + str(response.status_code))
            if expected_revision and response.headers.get("X-Revision") != expected_revision:
                raise SourceUnavailable("Viewer revision missing or changed")
            if int(response.headers.get("Content-Length", 0)) > limit:
                raise SourceUnavailable("Source byte limit")
            output = bytearray()
            for chunk in response.iter_content(65536):
                if len(output) + len(chunk) > limit:
                    raise SourceUnavailable("Source byte limit")
                output.extend(chunk)
            return bytes(output)
    except requests.RequestException:
        raise SourceUnavailable("Public source connection failed") from None


def fetch_json(url, hosts, params=None, headers=None, expected_revision=None):
    try:
        return json.loads(fetch_bytes(url, hosts, 2_000_000, params, headers, expected_revision))
    except (ValueError, UnicodeError):
        raise SourceUnavailable("Invalid bounded source JSON") from None


def plan_acquisition(records, cached, registry, label_pairs, master, incumbent=None):
    """Never consult test/validation outcomes or send user labels/text to a provider."""
    labels = [label for label, _ in label_pairs]
    names = {food["id"]: food["name"] for food in master.get("foods", [])}
    eligible, seen = [], set()
    for record in records:
        assignment = registry.get("assignments", {}).get(record["imageSha256"], {})
        group = record.get("sceneId") or assignment.get("sceneId") or record.get("dhash") or record["imageSha256"]
        if assignment.get("split") != "train" or record.get("requiredSplit") in {"test", "validation"} or group in seen:
            continue
        if assignment.get("label") != record["confirmedFoodId"]:
            continue
        seen.add(group)
        eligible.append(record)
    cached_by_hash = {row["imageSha256"]: row for row in cached}
    scored = [{**cached_by_hash[r["imageSha256"]], **r} for r in eligible if r["imageSha256"] in cached_by_hash]
    misses = {}
    if scored:
        for record, scores in zip(scored, predict(scored, labels, incumbent)):
            if labels[int(scores.argmax())] != record["confirmedFoodId"]:
                misses[record["confirmedFoodId"]] = misses.get(record["confirmedFoodId"], 0) + 1
    priorities = []
    for label, prompt in label_pairs:
        rows = [r for r in eligible if r["confirmedFoodId"] == label]
        corrections = sum(r["source"] == "app_user_corrected" for r in rows)
        deficit = max(0, 20 - len(rows))
        priorities.append({"foodId": label, "name": names.get(label, label), "trainGroups": len(rows),
            "trainCorrections": corrections, "trainErrors": misses.get(label, 0), "deficit": deficit,
            "priority": deficit + 5 * corrections + 3 * misses.get(label, 0) + (2 if label in {"edamame", "natto"} else 0),
            "queries": list(dict.fromkeys([prompt, names.get(label, prompt)]))})
    priorities.sort(key=lambda entry: (-entry["priority"], entry["foodId"]))
    return {"schemaVersion": 1, "basis": "historical_train_only_not_accuracy_estimate", "priorities": priorities,
        "catalogOutsideModel": [{"foodId": key, "name": names[key]} for key in sorted(set(names) - set(labels))],
        "note": "候補外の料理は要設計。自動追加せず、最終評価の誤答は探索に使わない。"}


class History:
    def __init__(self, drive, folder):
        self.drive, self.folder = drive, folder
        self.value = drive.json(folder, "acquisition_history.json", {"schemaVersion": 1, "items": {}, "sources": {}})
        if self.value.get("schemaVersion") != 1 or not isinstance(self.value.get("items"), dict) or not isinstance(self.value.get("sources"), dict):
            raise ValueError("Unknown acquisition history; preserve and investigate")

    def save(self):
        if len(self.value["items"]) > 10000:
            raise RuntimeError("Acquisition history limit reached")
        self.drive.put_json(self.folder, "acquisition_history.json", self.value, replace=True)

    def source(self, name, **values):
        self.value["sources"][name] = {**self.value["sources"].get(name, {}), **values, "updatedAt": now()}
        self.save()


def save_candidate(drive, folder, history, key, data, dhash, label, label_pairs, provenance, extra=None):
    """Only commit the receipt after both independent Drive readbacks have succeeded."""
    digest = sha(data)
    if len(history.value["items"]) >= 10000:
        raise RuntimeError("Acquisition history limit reached")
    duplicates = [item for item in history.value["items"].values() if item.get("imageSha256") == digest and item.get("jsonFileId")]
    # Share image bytes only, not label/split assertions. Both records reach partition(),
    # where conflicting labels or official splits are quarantined rather than hidden.
    duplicate_image_id = duplicates[0].get("imageFileId") if duplicates else None
    if duplicate_image_id:
        if drive.guard(duplicate_image_id).get("parents") != [folder] or sha(drive.read(duplicate_image_id, 5_000_000)) != digest:
            duplicate_image_id = None
    # Recover a successfully saved record if the process stopped before its history checkpoint.
    previous = drive.find(folder, key + ".json")
    if previous:
        record = json.loads(drive.read(previous["id"], 2_500_000))
        if record.get("id") != key or record.get("imageSha256") != digest:
            raise ValueError("Existing source record conflict")
        image_meta = drive.guard(record["imageFileId"])
        if image_meta.get("parents") != [folder] or sha(drive.read(record["imageFileId"], 5_000_000)) != digest:
            raise ValueError("Existing source image conflict")
        record_id = previous["id"]
    else:
        review = local_review(data, dict(label_pairs))
        record = {"schemaVersion": 2, "id": key, "source": "autonomous_public", "imageSha256": digest,
            "dhash": dhash, "createdAt": now(), "candidateFoodId": label,
            "confirmedFoodId": review.get("foodId") if review.get("decision") == "accepted" else label,
            "review": review, "provenance": provenance, **(extra or {})}
        record["imageFileId"] = duplicate_image_id or drive.put(folder, key + ".jpg", data, "image/jpeg")
        record_id = drive.put_json(folder, key + ".json", record)
    history.value["items"][key] = {"imageSha256": digest, "imageFileId": record["imageFileId"], "jsonFileId": record_id}
    history.save()
    return {**record, "recordFileId": record_id}


def discover_hf(drive, folder, history, queries, stopping):
    """Search public metadata, not archives. A card's license tag alone cannot authorize its images."""
    for query in queries[:2]:
        key = "hf-search-" + sha(query.encode())[:16]
        if stopping() or history.value["sources"].get(key, {}).get("checkedOn") == now()[:10]:
            continue
        result = fetch_json("https://huggingface.co/api/datasets", {"huggingface.co"},
                            {"search": query, "limit": 10, "full": "true"})
        candidates = []
        for item in result if isinstance(result, list) else []:
            dataset = item.get("id", "")
            if item.get("private") or item.get("gated") or not re.fullmatch(r"[\w.-]+/[\w.-]+", dataset):
                continue
            candidates.append({"dataset": dataset, "revision": item.get("sha"),
                "declaredLicenses": [tag[8:] for tag in item.get("tags", []) if tag.startswith("license:")],
                "url": "https://huggingface.co/datasets/" + dataset, "status": "image_rights_review_required"})
        drive.put_json(folder, key + ".json", {"query": query, "checkedAt": now(), "candidates": candidates}, replace=True)
        history.source(key, checkedOn=now()[:10], candidates=len(candidates))


def validate_hf_registry(spec, labels):
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", spec.get("dataset", "")) or not re.fullmatch(r"[a-f0-9]{40}", spec.get("revision", "")):
        raise ValueError("Hugging Face dataset/revision must be pinned")
    rights = spec.get("rights", {})
    if rights.get("imagesCovered") is not True or rights.get("commercialUse") is not True or not all(rights.get(k) for k in ("reviewer", "reviewedAt", "evidenceUrl", "attribution")):
        raise ValueError("Image-level rights review required")
    if rights.get("license") not in LICENSES or rights.get("licenseUrl") != LICENSES[rights["license"]]:
        raise ValueError("Unapproved image license")
    if urlparse(rights["evidenceUrl"]).scheme != "https":
        raise ValueError("Rights evidence URL required")
    if not isinstance(spec.get("labelMap"), dict) or not spec["labelMap"] or not set(spec["labelMap"].values()).issubset(labels):
        raise ValueError("Explicit catalog label mapping required")
    if not all(isinstance(spec.get(k), str) and spec[k] for k in ("config", "split", "imageColumn", "labelColumn")) or spec.get("splitRole") not in {"train", "validation", "test"}:
        raise ValueError("Official split and columns required")


def collect_hf(drive, folders, history, label_pairs, weak_labels, stopping, notify, maximum=10):
    registry = drive.json(folders["cache"], "approved-hf-sources.json", {"schemaVersion": 1, "datasets": []})
    if registry.get("schemaVersion") != 1 or len(registry.get("datasets", [])) > 10:
        raise ValueError("Invalid Hugging Face registry")
    candidates = []
    for spec in registry.get("datasets", []):
        if stopping() or len(candidates) >= maximum:
            break
        validate_hf_registry(spec, dict(label_pairs))
        dataset = spec["dataset"]
        selected_labels = sorted(set(weak_labels).intersection(spec["labelMap"].values()))
        if not selected_labels:
            continue
        meta = fetch_json("https://huggingface.co/api/datasets/" + dataset, {"huggingface.co"})
        # Viewer serves its current revision, not an arbitrary pinned commit. Reject drift.
        if meta.get("sha") != spec["revision"] or meta.get("private") or meta.get("gated"):
            raise ValueError("Dataset revision/access changed; rights review required")
        state_key = "hf-rows-" + sha(encoded({k: spec[k] for k in ("dataset", "revision", "config", "split")} | {"labels": selected_labels}))[:20]
        prior = history.value["sources"].get(state_key, {})
        if prior.get("complete"):
            continue
        offset = prior.get("offset", 0)
        result = fetch_json("https://datasets-server.huggingface.co/rows", {"datasets-server.huggingface.co"},
            {"dataset": dataset, "config": spec["config"], "split": spec["split"], "offset": offset, "length": min(10, maximum - len(candidates))},
            expected_revision=spec["revision"])
        if result.get("partial") is not False or not isinstance(result.get("num_rows_total"), int):
            raise SourceUnavailable("Incomplete dataset viewer result")
        for entry in result.get("rows", []):
            if stopping() or len(candidates) >= maximum:
                break
            index = entry["row_idx"]
            if index != offset:
                raise SourceUnavailable("Dataset viewer row continuity changed")
            key = "hf-" + sha(encoded([dataset, spec["revision"], spec["config"], spec["split"], index]))[:40]
            row = entry["row"]
            label = spec["labelMap"].get(str(row.get(spec["labelColumn"])))
            if key not in history.value["items"] and label in weak_labels and not entry.get("truncated_cells"):
                image = row.get(spec["imageColumn"])
                if not isinstance(image, dict) or not image.get("src"):
                    raise SourceUnavailable("Dataset image cell requires adapter review")
                drive.capacity(5_000_000)
                raw = fetch_bytes(image["src"], {"datasets-server.huggingface.co", "datasets-server.hf.co", "huggingface.co"}, 5_000_000)
                data, dhash = clean_image(raw)
                rights = spec["rights"]
                record = save_candidate(drive, folders["auto_inbox"], history, key, data, dhash, label, label_pairs,
                    {k: rights[k] for k in ("license", "licenseUrl", "attribution")} | {
                        "pageUrl": "https://huggingface.co/datasets/" + dataset + "/tree/" + spec["revision"],
                        "rightsEvidenceUrl": rights["evidenceUrl"], "dataset": dataset, "revision": spec["revision"],
                        "config": spec["config"], "officialSplit": spec["split"], "rowIndex": index},
                    {"requiredSplit": spec["splitRole"]})
                if record:
                    candidates.append(record)
                    notify("collect", len(candidates), "権利確認済みデータセットの画像をDriveへ保存（検品前は不使用）")
            offset = index + 1
            history.source(state_key, offset=offset, complete=offset >= result.get("num_rows_total", offset + 1))
    history.source("huggingface", approvedDatasets=len(registry.get("datasets", [])), saved=len(candidates),
                   status="ready" if registry.get("datasets") else "image_rights_review_required")
    return candidates


def collect_off(drive, folders, history, stopping, contact=None, terms_accepted=False, maximum=3):
    """Product references stay isolated. Package/ODbL/SA content is NOT dish-classifier truth."""
    if not contact or not terms_accepted:
        history.source("openfoodfacts", status="usage_terms_and_contact_required", saved=0)
        return
    prior = history.value["sources"].get("openfoodfacts", {})
    if prior.get("checkedOn") == now()[:10] or prior.get("complete") or stopping():
        return
    page = prior.get("nextPage", 1)
    headers = {"User-Agent": "BodyMakeResearch/2.0 (" + contact + ")"}
    result = fetch_json("https://world.openfoodfacts.org/api/v2/search", {"world.openfoodfacts.org"},
        {"labels_tags": "en:high-protein", "page_size": min(maximum, 3), "page": page,
         "fields": "code,product_name,nutriments,nutrition_data_per,serving_size,image_front_small_url,last_modified_t"}, headers)
    count = 0
    products = result.get("products", [])[:min(maximum, 3)]
    exhausted = True
    for product in products:
        if stopping():
            exhausted = False
            break
        code = str(product.get("code", ""))
        if not re.fullmatch(r"[0-9]{8,14}", code):
            continue
        key = "off-" + code + "-" + str(int(product.get("last_modified_t", 0)))
        if key in history.value["items"]:
            continue
        image_url = product.get("image_front_small_url")
        if not image_url:
            continue
        drive.capacity(5_000_000)
        data, dhash = clean_image(fetch_bytes(image_url, {"images.openfoodfacts.org"}, 5_000_000, headers=headers))
        image_id = drive.put(folders["products"], key + ".jpg", data, "image/jpeg")
        record = {"schemaVersion": 1, "source": "openfoodfacts_product_reference", "classifierEligible": False,
            "code": code, "productName": product.get("product_name"), "nutriments": product.get("nutriments", {}),
            "nutritionDataPer": product.get("nutrition_data_per"), "servingSize": product.get("serving_size"),
            "nutritionEvidence": "provider_reported_not_photo_estimated", "imageSha256": sha(data), "imageFileId": image_id,
            "dhash": dhash, "provenance": {"pageUrl": "https://world.openfoodfacts.org/product/" + code,
                "imageUrl": image_url, "attribution": "Open Food Facts contributors", "databaseLicense": "ODbL-1.0",
                "databaseLicenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/", "imageLicense": "CC BY-SA 3.0",
                "imageLicenseUrl": "https://creativecommons.org/licenses/by-sa/3.0/", "changes": "EXIF removed; resized JPEG"}}
        json_id = drive.put_json(folders["products"], key + ".json", record)
        history.value["items"][key] = {"imageSha256": sha(data), "imageFileId": image_id, "jsonFileId": json_id, "referenceOnly": True}
        history.save()
        count += 1
    history.source("openfoodfacts", status="product_reference_only", saved=count,
        checkedOn=now()[:10] if exhausted else None, nextPage=page+1 if exhausted else page,
        complete=not products)


def collect_sources(drive, folders, label_pairs, plan, stopping, notify, commons_collect, maximum=30, skip_ids=None):
    history = History(drive, folders["cache"])
    priorities = plan["priorities"][:3]
    weak = [item["foodId"] for item in priorities]
    notify("discovery", 0, "学習用データの不足・修正履歴から公開データを探索（最終評価は不使用）")
    collected = []
    try:
        discover_hf(drive, folders["logs"], history, ["food", weak[0].replace("-", " ")] if weak else ["food"], stopping)
        collected.extend(collect_hf(drive, folders, history, label_pairs, weak, stopping, notify, min(10, maximum)))
    except SourceUnavailable as error:
        history.source("huggingface", status="provider_unavailable", reason=str(error))
    if not stopping() and len(collected) < maximum:
        # Daily English/Japanese alternation keeps existing Commons cursors intact.
        queries = {item["foodId"]: item["queries"][int(now()[8:10]) % len(item["queries"])] for item in priorities}
        collected.extend(commons_collect(drive, folders["auto_inbox"], label_pairs, weak, stopping, notify,
            maximum=maximum - len(collected), state_folder=folders["logs"], queries=queries, history=history, skip_ids=skip_ids))
    if not stopping():
        import os
        try:
            collect_off(drive, folders, history, stopping, os.environ.get("BODYMAKE_OFF_CONTACT"), os.environ.get("BODYMAKE_OFF_TERMS_ACCEPTED") == "1")
        except SourceUnavailable as error:
            history.source("openfoodfacts", status="provider_unavailable", reason=str(error))
    return collected
