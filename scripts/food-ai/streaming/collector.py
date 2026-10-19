"""Allowlisted Wikimedia collection. Unverified candidates cannot enter training."""
import base64
from datetime import datetime, timezone
import html
import json
import os
import re
from urllib.parse import urlparse

import requests
from drive_store import sha
from hybrid import clean_image

HEADERS = {"User-Agent": "BodyMakeResearch/1.0 (public licensed food dataset; bounded 30 images/run)"}
LICENSES = {"CC0": "https://creativecommons.org/publicdomain/zero/1.0/",
    "CC BY 2.0": "https://creativecommons.org/licenses/by/2.0/",
    "CC BY 3.0": "https://creativecommons.org/licenses/by/3.0/",
    "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/"}


def now():
    return datetime.now(timezone.utc).isoformat()


def local_review(data, labels):
    """Optional existing local VLM only. No hosted inference and no model auto-download."""
    model = os.environ.get("BODYMAKE_REVIEW_MODEL")
    if not model:
        return {"decision": "pending", "reason": "independent_visual_review_required"}
    # Fixed loopback URL prevents accidentally sending a private photo to a paid/external API.
    response = requests.post("http://127.0.0.1:11434/api/chat", json={
        "model": model, "stream": False, "format": "json", "options": {"temperature": 0, "num_ctx": 2048},
        "messages": [{"role": "user", "content": "Inspect only the pixels. Choose the single clearly dominant food. Return JSON {foodId, confidence, clearFood, noPeople, reason}. If ambiguous/multiple main foods/people/body photo return clearFood=false. foodId must be one of: " + json.dumps(labels) + ". Do not invent nutrition values.",
            "images": [base64.b64encode(data).decode()]}],
    }, timeout=(5, 120))
    response.raise_for_status()
    verdict = json.loads(response.json()["message"]["content"])
    accepted = verdict.get("foodId") in labels and verdict.get("clearFood") is True and verdict.get("noPeople") is True and isinstance(verdict.get("confidence"), (float, int)) and .95 <= verdict["confidence"] <= 1
    return {"decision": "accepted" if accepted else "pending", "method": "local-vlm", "reviewer": model,
        "reviewedAt": now(), "imageSha256": sha(data), "foodId": verdict.get("foodId"),
        "confidence": verdict.get("confidence", 0), "reason": str(verdict.get("reason", ""))[:500]}


def collect(drive, folder, label_pairs, weak_labels, stopping, notify, maximum=30, state_folder=None, queries=None, history=None, skip_ids=None):
    """Query fixed catalog prompts only, never user free text or held-out test mistakes."""
    from acquisition import fetch_json, fetch_bytes
    candidates = []
    existing = drive.children(folder)
    names = {f["name"] for f in existing}
    state_folder = state_folder or folder
    state = drive.json(state_folder, "commons-continuation.json", {})
    collected = 0
    for label, prompt in label_pairs:
        if label not in weak_labels or stopping() or collected >= maximum:
            continue
        query = (queries or {}).get(label, prompt)
        state_key = label if query == prompt else label + ":" + sha(query.encode())[:16]
        prior = state.get(state_key, {})
        if prior.get("completeOn") == now()[:10]:
            continue
        continuation = prior.get("continuation", {})
        result = fetch_json("https://commons.wikimedia.org/w/api.php", {"commons.wikimedia.org"}, params={
            "action": "query", "format": "json", "generator": "search", "gsrnamespace": 6,
            "gsrsearch": query, "gsrlimit": 10, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 1024, "maxlag": 5, **continuation,
        })
        if "error" in result:
            raise RuntimeError("Commons API declined collection; retry on a later run")
        exhausted_page = True
        for page in result.get("query", {}).get("pages", {}).values():
            if stopping() or collected >= maximum:
                exhausted_page = False
                break
            name = "commons-" + str(page["pageid"])
            if name + ".json" in names or history and name in history.value["items"] or name in (skip_ids or set()):
                continue
            info = page.get("imageinfo", [{}])[0]
            ext = info.get("extmetadata", {})
            license_name = ext.get("LicenseShortName", {}).get("value", "").upper()
            if license_name not in LICENSES:
                continue
            url = info.get("thumburl", info.get("url", ""))
            parsed = urlparse(url)
            if parsed.scheme != "https" or parsed.hostname not in {"upload.wikimedia.org", "thumb.wikimedia.org"}:
                continue
            drive.capacity(5_000_000)
            data, dhash = clean_image(fetch_bytes(url, {"upload.wikimedia.org", "thumb.wikimedia.org"}, 5_000_000))
            attribution = html.unescape(re.sub("<[^>]+>", "", ext.get("Artist", {}).get("value", "")))[:2000]
            if not attribution:
                continue
            if history:
                from acquisition import save_candidate
                record = save_candidate(drive, folder, history, name, data, dhash, label, label_pairs,
                    {"pageUrl": "https://commons.wikimedia.org/?curid=" + str(page["pageid"]),
                     "imageUrl": url, "license": license_name, "licenseUrl": LICENSES[license_name],
                     "attribution": attribution, "title": page.get("title", ""),
                     "credit": html.unescape(re.sub("<[^>]+>", "", ext.get("Credit", {}).get("value", "")))[:2000],
                     "changes": "EXIF removed; resized JPEG"})
                if record:
                    candidates.append(record)
                    collected += 1
                    notify("collect", collected, "公開画像をDriveへ保存（未確認は学習に不使用）")
                continue
            review = local_review(data, dict(label_pairs))
            record = {"schemaVersion": 2, "id": name, "source": "autonomous_public", "imageSha256": sha(data),
                "dhash": dhash, "confirmedFoodId": review.get("foodId") if review.get("decision") == "accepted" else label,
                "candidateFoodId": label, "createdAt": now(), "review": review,
                "provenance": {"pageUrl": "https://commons.wikimedia.org/?curid=" + str(page["pageid"]),
                    "imageUrl": url, "license": license_name, "licenseUrl": LICENSES[license_name],
                    "attribution": html.unescape(re.sub("<[^>]+>", "", ext.get("Artist", {}).get("value", "")))[:2000]}}
            if not record["provenance"]["attribution"]:
                continue
            record["imageFileId"] = drive.put(folder, name + ".jpg", data, "image/jpeg")
            record_id = drive.put_json(folder, name + ".json", record)
            candidates.append({**record, "recordFileId": record_id})
            names.add(name + ".json")
            collected += 1
            notify("collect", collected, "公開画像をDriveへ保存（未確認は学習に不使用）")
        if exhausted_page:
            state[state_key] = {"query": query, "continuation": result.get("continue", {}), "completeOn": now()[:10] if not result.get("continue") else None}
            drive.put_json(state_folder, "commons-continuation.json", state, replace=True)
    if history:
        history.source("commons", saved=collected, status="review_required", queriedLabels=weak_labels)
    return candidates
