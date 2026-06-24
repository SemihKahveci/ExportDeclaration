import re
from statistics import median


HEADER_ALIASES = {
    "PRODUCT": ["MALZEME", "HIZMET KODU", "MAL HIZMET", "ITEM CODE", "PRODUCT CODE"],
    "QTY": ["MIKTAR", "MIKTAR", "QTY", "QUANTITY"],
    "PRICE": ["BIRIM FIYAT", "UNIT PRICE", "PRICE"],
    "AMOUNT": ["MALZEME HIZMET TUTARI", "MAL HIZMET TUTARI", "TUTAR", "AMOUNT", "TOTAL"],
    "GTIP": ["GTIP", "GTİP", "HS CODE", "TARIFF"],
}


def norm(text):
    return (
        str(text or "")
        .upper()
        .replace("İ", "I")
        .replace("Ş", "S")
        .replace("Ğ", "G")
        .replace("Ü", "U")
        .replace("Ö", "O")
        .replace("Ç", "C")
        .replace("/", " ")
        .replace("\n", " ")
        .strip()
    )


def expand_col(x, width=80):
    return {
        "xMin": max(0, x - width / 2),
        "xMax": x + width / 2,
    }


def detect_by_header(words):
    columns = {}

    for field, aliases in HEADER_ALIASES.items():
        for w in sorted(words, key=lambda x: (x["y0"], x["x0"])):
            text = norm(w["text"])

            if any(norm(alias) in text for alias in aliases):
                columns[field] = {
                    "xMin": w["x0"] - 20,
                    "xMax": w["x1"] + 20,
                    "method": "header",
                    "confidence": 0.8,
                }
                break

    return columns


def detect_gtip_by_pattern(words):
    xs = []

    for w in words:
        digits = re.findall(r"\d{10,12}", w.get("text", ""))
        if digits:
            xs.append((w["x0"] + w["x1"]) / 2)

    if len(xs) < 2:
        return None

    x = median(xs)
    return {
        **expand_col(x, 180),
        "method": "pattern",
        "confidence": 0.75,
    }


def detect_product_by_pattern(words):
    xs = []

    for w in words:
        text = w.get("text", "")
        if re.search(r"[A-Z]{1,5}\.?\s*[A-Z]{1,5}\.?\s*\d+", text, re.IGNORECASE):
            xs.append((w["x0"] + w["x1"]) / 2)
        elif re.fullmatch(r"\d{5,10}", text.strip()):
            xs.append((w["x0"] + w["x1"]) / 2)

    if len(xs) < 2:
        return None

    x = median(xs)
    return {
        **expand_col(x, 160),
        "method": "pattern",
        "confidence": 0.75,
    }


def detect_qty_by_pattern(words):
    xs = []

    unit_words = {"ADET", "ADE", "PCS", "KG", "SET", "MT"}

    sorted_words = sorted(words, key=lambda w: (w["y0"], w["x0"]))

    for i, w in enumerate(sorted_words):
        text = norm(w["text"])

        if text in unit_words or any(u in text for u in unit_words):
            nearby = sorted_words[max(0, i - 3): i + 4]

            for n in nearby:
                if re.fullmatch(r"\d{1,6}", norm(n["text"])):
                    xs.append((n["x0"] + n["x1"]) / 2)

    if len(xs) < 2:
        return None

    x = median(xs)
    return {
        **expand_col(x, 100),
        "method": "pattern",
        "confidence": 0.7,
    }


def is_money(text):
    return re.search(r"\d{1,3}(?:\.\d{3})*,\d{2,4}", text or "") is not None


def detect_money_columns_by_pattern(words):
    money_xs = []

    for w in words:
        if is_money(w.get("text", "")):
            money_xs.append((w["x0"] + w["x1"]) / 2)

    if len(money_xs) < 4:
        return {}

    money_xs = sorted(money_xs)

    # Basit ilk versiyon:
    # soldaki para kolonları unit price,
    # sağdaki para kolonları amount adayı.
    price_x = money_xs[0]
    amount_x = money_xs[-1]

    return {
        "PRICE": {
            **expand_col(price_x, 110),
            "method": "pattern",
            "confidence": 0.55,
        },
        "AMOUNT": {
            **expand_col(amount_x, 150),
            "method": "pattern",
            "confidence": 0.55,
        },
    }


def merge_columns(header_cols, pattern_cols):
    result = dict(header_cols)

    for field, col in pattern_cols.items():
        if field not in result or result[field]["confidence"] < col["confidence"]:
            result[field] = col

    return result


def detect_columns(words):
    header_cols = detect_by_header(words)

    pattern_cols = {}

    gtip_col = detect_gtip_by_pattern(words)
    if gtip_col:
        pattern_cols["GTIP"] = gtip_col

    product_col = detect_product_by_pattern(words)
    if product_col:
        pattern_cols["PRODUCT"] = product_col

    qty_col = detect_qty_by_pattern(words)
    if qty_col:
        pattern_cols["QTY"] = qty_col

    pattern_cols.update(detect_money_columns_by_pattern(words))

    return merge_columns(header_cols, pattern_cols)