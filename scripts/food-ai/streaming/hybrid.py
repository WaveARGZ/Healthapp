"""Pure in-memory validation, stable grouping, weighted fitting and held-out gates."""
import copy
import hashlib
import io
import json
import math
import re
from datetime import datetime
from urllib.parse import urlparse
from collections import Counter

import numpy as np
from PIL import Image, ImageOps

SOURCES = {"public_base", "autonomous_public", "app_user_confirmed", "app_user_corrected"}
CONTRACT = {"baseModel": "Xenova/clip-vit-base-patch32",
    "baseRevision": "d15189d7028b43f1d3e65039190477f6af591c2a", "dtype": "q4",
    "transformersVersion": "4.3.0", "template": "This is a photo of {}", "featureSize": 512}
Image.MAX_IMAGE_PIXELS = 20_000_000


def clean_image(data):
    with Image.open(io.BytesIO(data)) as image:
        if image.width * image.height > Image.MAX_IMAGE_PIXELS or min(image.size) < 64:
            raise ValueError("Image dimensions outside safety limits")
        image = ImageOps.exif_transpose(image).convert("RGB")
        thumb = np.asarray(image.resize((9, 8)).convert("L"))
        dhash = f"{int(''.join('1' if x else '0' for x in (thumb[:, 1:] > thumb[:, :-1]).flat), 2):016x}"
        image.thumbnail((1280, 1280))
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=85)  # no exif, ICC or user metadata
        return output.getvalue(), dhash


def reviewed(record):
    review = record.get("review", {})
    return bool(review.get("decision") == "accepted" and review.get("imageSha256") == record.get("imageSha256")
        and review.get("foodId") == record.get("confirmedFoodId") and review.get("reviewer")
        and review.get("reviewedAt") and review.get("method") in {"human", "visual-agent", "local-vlm"})


def validate_record(record, labels):
    if not isinstance(record.get("id"), str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,160}", record["id"]):
        raise ValueError("Invalid record identifier")
    if not re.fullmatch(r"[a-f0-9]{64}", record.get("imageSha256", "")):
        raise ValueError("Invalid image hash")
    if record.get("source") not in SOURCES or record.get("confirmedFoodId") not in labels:
        raise ValueError("Unknown source or label; requires review")
    if not reviewed(record):
        raise ValueError("Independent image review is missing")
    datetime.fromisoformat(record["review"]["reviewedAt"].replace("Z", "+00:00"))
    if record["source"].startswith("app_"):
        consent = record.get("consent", {})
        if consent.get("granted") is not True or consent.get("version") != "food-photo-training-v2" or consent.get("purpose") != "food-recognition":
            raise ValueError("Explicit photo training consent is missing")
        if not consent.get("at"):
            raise ValueError("Consent timestamp is missing")
        datetime.fromisoformat(consent["at"].replace("Z", "+00:00"))
    else:
        provenance = record.get("provenance", {})
        if provenance.get("license") not in {"CC0", "CC BY 2.0", "CC BY 3.0", "CC BY 4.0"} or not all(
            provenance.get(key) for key in ("pageUrl", "licenseUrl", "attribution")
        ):
            raise ValueError("Commercial license evidence is missing")
        url = urlparse(provenance["licenseUrl"])
        path = "/publicdomain/zero/1.0" if provenance["license"] == "CC0" else "/licenses/by/" + provenance["license"].split()[-1]
        if url.scheme not in {"http", "https"} or url.hostname != "creativecommons.org" or not (url.path.rstrip("/") == path or url.path.startswith(path + "/")):
            raise ValueError("License URL does not match license")
    if record.get("revoked"):
        raise ValueError("Consent revoked")
    return record


def partition(records, registry):
    """Union near-duplicates + explicit scenes before assigning; never reshuffle history."""
    result = copy.deepcopy(registry)
    assignments = result.setdefault("assignments", {})
    for key, value in assignments.items():
        if not re.fullmatch(r"[a-f0-9]{64}", key) or value.get("split") not in {"train", "validation", "test"} or not re.fullmatch(r"[a-f0-9]{16}", value.get("dhash", "")):
            raise ValueError("Historical split registry invalid; preserve and investigate")
    nodes = {key: dict(value) for key, value in assignments.items()}
    for record in records:
        nodes.setdefault(record["imageSha256"], {"dhash": record["dhash"]})
        if record.get("sceneId"):
            nodes[record["imageSha256"]]["sceneId"] = record["sceneId"]
    keys = sorted(nodes)
    parents = {key: key for key in keys}

    def root(key):
        while parents[key] != key:
            parents[key] = parents[parents[key]]
            key = parents[key]
        return key

    for i, key in enumerate(keys):
        if len(nodes[key].get("dhash", "")) != 16:
            raise ValueError("Invalid historical perceptual hash")
        for other in keys[:i]:
            same_scene = nodes[key].get("sceneId") and nodes[key].get("sceneId") == nodes[other].get("sceneId")
            if same_scene or (int(nodes[key]["dhash"], 16) ^ int(nodes[other]["dhash"], 16)).bit_count() <= 4:
                parents[root(key)] = root(other)
    groups = {}
    for key in keys:
        groups.setdefault(root(key), []).append(key)
    rows, quarantined = [], []
    by_hash = {}
    for record in records:
        by_hash.setdefault(record["imageSha256"], []).append(record)
    for group in groups.values():
        current = [r for key in group for r in by_hash.get(key, [])]
        if not current:
            continue
        history = [assignments[key] for key in group if key in assignments]
        splits = {r["split"] for r in history} | {r["requiredSplit"] for r in current if r.get("requiredSplit")}
        if not splits.issubset({"train", "validation", "test"}):
            raise ValueError("Invalid required split")
        labels = {r["confirmedFoodId"] for r in current} | {r["label"] for r in history}
        domains = {"app" if r["source"].startswith("app_") else "public" for r in current}
        if len(splits) > 1 or len(labels) != 1 or len(domains) > 1:
            quarantined.extend(r["id"] for r in current)
            continue
        representative = sorted(current, key=lambda r: (r["source"] != "public_base", r["imageSha256"], r["id"]))[0]
        number = int(hashlib.sha256(min(group).encode()).hexdigest()[:8], 16) % 100
        split = next(iter(splits)) if splits else "test" if number < 20 else "validation" if number < 30 else "train"
        # Machine labels are never held-out truth, even if a random hash picks an eval bucket.
        if representative["review"]["method"] == "local-vlm" and split != "train":
            quarantined.extend(r["id"] for r in current)
            continue
        for key in group:
            assignments.setdefault(key, {"split": split, "label": representative["confirmedFoodId"], "dhash": nodes[key]["dhash"]})
            if nodes[key].get("sceneId"):
                assignments[key]["sceneId"] = nodes[key]["sceneId"]
        rows.append({**representative, "split": split})
    return rows, result, quarantined


def model_revoked(model, revocations):
    """Withdraw affected heads, including older heads without hash provenance."""
    if not model:
        return False
    if set(revocations.get("ids", [])).intersection(model.get("trainingIds", [])):
        return True
    hashes = set(revocations.get("imageSha256", []))
    return bool(hashes and ("trainingHashes" not in model or hashes.intersection(model["trainingHashes"])))


def sample_weights(rows, base_share=.6):
    weights = np.asarray([1.0 if r["source"] == "public_base" else
        1.5 * min(1., max(0., r["review"].get("confidence", 0))) if r["source"] == "autonomous_public" else
        3.0 if r["source"] == "app_user_confirmed" else 5.0 for r in rows])
    base = np.asarray([r["source"] == "public_base" for r in rows])
    if not base.any():
        raise ValueError("Public base replay data is required")
    # New autonomous volume must not swamp application corrections within a class.
    # The global base-replay floor takes precedence: universal per-class app majority
    # and >=50% base mass cannot both hold if every class has app examples.
    for label in {r["confirmedFoodId"] for r in rows}:
        app = np.asarray([r["confirmedFoodId"] == label and r["source"].startswith("app_") for r in rows])
        auto = np.asarray([r["confirmedFoodId"] == label and r["source"] == "autonomous_public" for r in rows])
        if app.any() and weights[auto].sum() > .8 * weights[app].sum():
            weights[auto] *= .8 * weights[app].sum() / weights[auto].sum()
    # The sample-loss mass, not just record count, must retain >=60% base replay.
    base_sum, other_sum = weights[base].sum(), weights[~base].sum()
    if other_sum and base_sum / (base_sum + other_sum) < base_share:
        weights[base] *= base_share * other_sum / ((1 - base_share) * base_sum)
    return weights / weights.sum()


def arrays(rows, labels):
    x = np.asarray([r["embedding"] for r in rows], dtype=np.float64)
    p = np.asarray([r["scores"] for r in rows], dtype=np.float64)
    y = np.asarray([labels.index(r["confirmedFoodId"]) for r in rows])
    if x.shape != (len(rows), 512) or p.shape != (len(rows), len(labels)) or not np.isfinite(x).all() or not np.isfinite(p).all() or (p < 0).any() or not np.allclose(p.sum(axis=1), 1, atol=1e-5) or not np.allclose(np.linalg.norm(x, axis=1), 1, atol=1e-4):
        raise ValueError("Feature contract violation")
    return x, p, y


def predict(rows, labels, model=None):
    x, p, _ = arrays(rows, labels)
    logits = np.log(np.maximum(p, 1e-8))
    if model and model.get("status") == "trained":
        if model.get("labelIds") != labels:
            raise ValueError("Incumbent label mismatch")
        if model.get("schemaVersion") == 2 and model.get("contract") == CONTRACT:
            logits += x @ np.asarray(model["weights"]).T + model["biases"]
        elif model.get("schemaVersion") == 1 and model.get("baseModel") == CONTRACT["baseModel"] and model.get("baseRevision") == CONTRACT["baseRevision"]:
            logits += p @ np.asarray(model["weights"]).T + model["biases"]
        else:
            raise ValueError("Incumbent feature contract mismatch")
    exps = np.exp(logits - logits.max(axis=1, keepdims=True))
    return exps / exps.sum(axis=1, keepdims=True)


def fit(rows, labels, clip_labels, regularization=.03, epochs=160, stopping=lambda: False):
    x, p, y = arrays(rows, labels)
    sample = sample_weights(rows)
    weights, biases = np.zeros((len(labels), 512)), np.zeros(len(labels))
    one_hot = np.eye(len(labels))[y]
    for epoch in range(epochs):
        if stopping():
            raise InterruptedError("Stopped at training epoch boundary")
        logits = np.log(np.maximum(p, 1e-8)) + x @ weights.T + biases
        exps = np.exp(logits - logits.max(axis=1, keepdims=True))
        residual = (exps / exps.sum(axis=1, keepdims=True) - one_hot) * sample[:, None]
        weights -= .2 * (residual.T @ x + regularization * weights)
        biases -= .2 * (residual.sum(axis=0) + regularization * biases)
    return {"schemaVersion": 2, "status": "trained", "contract": CONTRACT, "labelIds": labels,
        "clipLabels": clip_labels, "weights": weights.tolist(), "biases": biases.tolist()}


def evaluate(rows, labels, model=None):
    if not rows:
        return {"total": 0, "top1": 0, "top3": 0, "mrr": 0, "perClass": {}, "correct": []}
    predictions = predict(rows, labels, model)
    rank = np.argsort(-predictions, axis=1, kind="stable")
    positions = [list(order).index(labels.index(row["confirmedFoodId"])) + 1 for order, row in zip(rank, rows)]
    per_class = {}
    for label in labels:
        values = [position for position, row in zip(positions, rows) if row["confirmedFoodId"] == label]
        per_class[label] = {"total": len(values), "top1": sum(v == 1 for v in values), "top3": sum(v <= 3 for v in values)}
    return {"total": len(rows), "top1": sum(v == 1 for v in positions), "top3": sum(v <= 3 for v in positions),
        "mrr": sum(1/v for v in positions)/len(rows), "perClass": per_class, "correct": [v == 1 for v in positions]}


def promotion(public_before, public_after, app_before, app_after, labels):
    reasons = []
    for domain, before, after in [("public", public_before, public_after), ("app", app_before, app_after)]:
        if before["total"] < 30 or before["total"] != after["total"]:
            reasons.append(f"{domain}: fewer than 30 independently reviewed held-out images")
        if any(after[k] + 1e-12 < before[k] for k in ("top1", "top3", "mrr")):
            reasons.append(f"{domain}: metric regression")
        for label in labels:
            a, b = before["perClass"].get(label, {}), after["perClass"].get(label, {})
            if domain == "public" and a.get("total", 0) < 2:
                reasons.append(f"public: insufficient class coverage: {label}")
            if any(b.get(k, 0) < a.get(k, 0) for k in ("top1", "top3")):
                reasons.append(f"{domain}: class regression: {label}")
    improved = sum(not a and b for a, b in zip(app_before["correct"], app_after["correct"]))
    regressed = sum(a and not b for a, b in zip(app_before["correct"], app_after["correct"]))
    n = improved + regressed
    p_value = sum(math.exp(math.lgamma(n+1)-math.lgamma(k+1)-math.lgamma(n-k+1)-n*math.log(2)) for k in range(improved, n+1)) if n else 1.
    if app_after["top1"] < app_before["top1"] + 2 or app_after["mrr"] <= app_before["mrr"] or p_value > .1:
        reasons.append("app: insufficient paired improvement (>=2 top1, better MRR, p<=0.1 required)")
    return {"passed": not reasons, "reasons": reasons, "pairedP": p_value}


def pack_cache(rows, fingerprint):
    output = io.BytesIO()
    metadata = [{k: v for k, v in row.items() if k not in {"embedding", "scores"}} for row in rows]
    np.savez_compressed(output, metadata=np.frombuffer(json.dumps({"fingerprint": fingerprint, "rows": metadata}, ensure_ascii=False).encode(), dtype=np.uint8),
        embeddings=np.asarray([r["embedding"] for r in rows], dtype=np.float32), scores=np.asarray([r["scores"] for r in rows], dtype=np.float32))
    return output.getvalue()


def unpack_cache(data, fingerprint):
    if not data:
        return []
    # Bound uncompressed ZIP members before numpy allocates (zip-bomb protection).
    import zipfile
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if sum(f.file_size for f in archive.infolist()) > 128 * 1024 * 1024:
            raise ValueError("Feature cache RAM limit exceeded")
    with np.load(io.BytesIO(data), allow_pickle=False) as cache:
        meta = json.loads(cache["metadata"].tobytes())
        if meta["fingerprint"] != fingerprint:
            raise ValueError("Feature cache fingerprint differs; keep old cache and use a new namespace")
        if len(meta["rows"]) != len(cache["embeddings"]) or len(meta["rows"]) != len(cache["scores"]):
            raise ValueError("Feature cache length mismatch")
        return [{**row, "embedding": x.tolist(), "scores": p.tolist()} for row, x, p in zip(meta["rows"], cache["embeddings"], cache["scores"])]
