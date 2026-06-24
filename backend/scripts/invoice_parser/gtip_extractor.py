import json
import re
from pathlib import Path

def extract_gtip_runs(text):
    text = text or ""
    return re.findall(r"\d{10,12}", text)


def normalize_gtip_run(run):
    if len(run) == 12:
        return run, True, "exact"

    if len(run) == 11:
        return run + "0", False, "padded_zero_11"

    if len(run) == 10:
        return run + "00", False, "padded_zero_10"

    return None, False, "invalid"

def extract_gtips_from_text(text):
    candidates = []

    for run in extract_gtip_runs(text):
        gtip, is_exact, method = normalize_gtip_run(run)

        if gtip:
            candidates.append({
                "gtip": gtip,
                "isExact12": is_exact,
                "method": method,
                "needsReview": not is_exact
            })

    return candidates

def is_right_side_candidate(word):
    # Header'daki fatura tarihi gibi şeyleri elemek için.
    # Bu görselde tablo genelde y > 700 civarında başlıyor.
    return word.get("x0", 0) > 1000


def has_transport_nearby(words, target, y_threshold=40):
    ty = target["y0"]

    nearby = [
        w for w in words
        if abs(w["y0"] - ty) < y_threshold
    ]

    text = " ".join(w["text"] for w in nearby).lower()

    return (
        "karayolu" in text
        or "denizyolu" in text
        or "havayolu" in text
        or "demiryolu" in text
        or "fca" in text
        or "exw" in text
        or "dap" in text
    )


def extract_gtip_candidates(words, page_no):
    candidates = []

    for word in words:
        text = word.get("text", "")

        if not is_right_side_candidate(word):
            continue

        if page_no == 1 and word["y0"] < 650:
            continue

        found_gtips = extract_gtips_from_text(text)

        if not found_gtips:
            continue

        for found in found_gtips:
            candidates.append({
                **found,
                "raw": text,
                "score": word.get("score"),
                "x0": word.get("x0"),
                "y0": word.get("y0"),
                "x1": word.get("x1"),
                "y1": word.get("y1"),
            })

    return candidates

def extract_all_gtips(paddle_data):
    result = {
        "pages": [],
        "allGtips": []
    }

    for page in paddle_data:
        page_no = page["page"]
        words = page["words"]

        candidates = extract_gtip_candidates(words, page_no)

        result["pages"].append({
            "page": page_no,
            "gtipCount": len(candidates),
            "gtips": candidates
        })

        result["allGtips"].extend([
            {
                "page": page_no,
                **candidate
            }
            for candidate in candidates
        ])

    return result

def main():
    input_path = Path("output/paddle_all.json")

    if not input_path.exists():
        print("output/paddle_all.json bulunamadı.")
        return

    data = json.loads(input_path.read_text(encoding="utf-8"))

    result = {
        "pages": [],
        "allGtips": []
    }

    for page in data:
        page_no = page["page"]
        words = page["words"]

        candidates = extract_gtip_candidates(words)

        result["pages"].append({
            "page": page_no,
            "gtipCount": len(candidates),
            "gtips": candidates
        })

        result["allGtips"].extend([
            {
                "page": page_no,
                **candidate
            }
            for candidate in candidates
        ])

    Path("output").mkdir(exist_ok=True)

    with open("output/gtip_candidates.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print("GTIP adayları çıkarıldı: output/gtip_candidates.json")
    print("Toplam aday:", len(result["allGtips"]))

    exact_count = sum(1 for x in result["allGtips"] if x["isExact12"])
    review_count = sum(1 for x in result["allGtips"] if x["needsReview"])

    print("12 hane kesin:", exact_count)
    print("Kontrol gerekli:", review_count)


if __name__ == "__main__":
    main()