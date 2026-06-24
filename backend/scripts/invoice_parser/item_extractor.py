import json
import re
from pathlib import Path

from column_detector import detect_columns

DELIVERY_TERMS = [
    "EXW", "FCA", "FOB", "CIF", "CFR", "DAP", "DPU", "DDP",
    "FAS", "CPT", "CIP"
]

STOP_DESCRIPTION_WORDS = {
    "VERGI", "VERGİ",
    "MUAFIYET", "MUAFİYET",
    "ODEME", "ÖDEME",
    "KOSULU", "KOŞULU",
    "ACIKLAMALAR", "AÇIKLAMALAR",
    "TOPLAM",
}

TRANSPORT_MODES = {
    "KARAYOLU": "Karayolu",
    "KARAYOLU:": "Karayolu",
    "ROAD": "Karayolu",
    "DENIZYOLU": "Denizyolu",
    "DENİZYOLU": "Denizyolu",
    "SEA": "Denizyolu",
    "HAVAYOLU": "Havayolu",
    "AIR": "Havayolu",
    "DEMIRYOLU": "Demiryolu",
    "DEMİRYOLU": "Demiryolu",
    "RAIL": "Demiryolu",
}

CURRENCIES = {
    "USD",
    "EUR",
    "TL",
    "TRY",
    "GBP"
}

QUANTITY_UNITS = [
    "ADET",
    "ADE",
    "PCS",
    "KG",
    "SET",
    "MT"
]

ORIGINS = {
    "GERMANY", "MOROCCO", "U.K", "UK",
    "TURKEY", "TURKIYE", "TURKIYE",
    "FRANCE", "ITALY", "INDIA", "POLAND", "CHINA",
}

def repair_quantity_by_amount_and_price(quantity, unit_price, amount):
    q = parse_tr_number(quantity)
    p = parse_tr_number(unit_price)
    a = parse_tr_number(amount)

    if p and a:
        calculated_q = a / p

        if calculated_q > 0 and abs(calculated_q - round(calculated_q)) < 0.01:
            calculated_q = int(round(calculated_q))

            if not q or abs(q * p - a) > 0.05:
                return str(calculated_q), False

    return quantity, True

def normalize_code(text):
    return normalize_text(text).replace("-", "").replace(".", "").replace(" ", "")

def build_description_column(columns):
    product_col = columns.get("PRODUCT")
    qty_col = columns.get("QTY")

    if product_col and qty_col:
        return {
            "xMin": product_col["xMin"] + 70,
            "xMax": qty_col["xMin"] - 5,
        }

    if qty_col:
        return {
            "xMin": 120,
            "xMax": qty_col["xMin"] - 5,
        }

    return {
        "xMin": 120,
        "xMax": 430,
    }

def extract_description_from_words(words, product_code):
    desc_words = []

    for w in sorted(words, key=lambda x: (x["y0"], x["x0"])):
        text = w["text"].strip()
        upper = normalize_text(text)
        x = w["x0"]

        if not text:
            continue

        # Malzeme/Hizmet kolon aralığı
        if not (90 <= x <= 430):
            continue

        # Headerları alma
        if upper in {
            "MALZEME", "HIZMET", "HİZMET", "KODU",
            "AÇIKLAMASI", "ACIKLAMASI", "AÇIKLAMA", "ACIKLAMA",
            "SATIR"
        }:
            continue

        # Product code description içine girmesin
        if product_code and normalize_code(product_code) == normalize_code(text):
            continue

        if upper in ORIGINS:
            continue

        if upper in ["ACIKLAMASI", "ACIKLAMAS!", "AGIKLAMASI", "AGIKLAMAS!"]:
            continue
        if re.fullmatch(r"\d{1,3}", upper):
            continue
        if upper in STOP_DESCRIPTION_WORDS:
            break
        desc_words.append(text)

    description = " ".join(desc_words)
    description = re.sub(r"\s+", " ", description).strip()

    return description or None

def normalize_text(text):
    return (text or "").strip().upper().replace("İ", "I").replace("Ü", "U").replace("Ş", "S").replace("Ğ", "G").replace("Ö", "O").replace("Ç", "C")

def find_nearby_words(words, y0, y_range=45):
    return [w for w in words if abs(w["y0"] - y0) <= y_range]

def find_delivery_term(words):
    joined = " ".join(
        normalize_text(w["text"])
        for w in sorted(words, key=lambda x: x["x0"])
    )

    for term in DELIVERY_TERMS:
        if term in joined:
            return term

    return None

def normalize_transport_text(text):
    text = normalize_text(text)
    return (
        text
        .replace("KARAYOIU", "KARAYOLU")
        .replace("KARAY0LU", "KARAYOLU")
        .replace("KARAY0IU", "KARAYOLU")
    )

def find_transport_mode(words):
    joined = " ".join(normalize_transport_text(w["text"]) for w in sorted(words, key=lambda x: x["x0"]))

    for key, value in TRANSPORT_MODES.items():
        if key in joined:
            return value

    return None


def find_currency(words):
    for w in sorted(words, key=lambda x: x["x0"]):
        text = normalize_text(w["text"])
        for cur in CURRENCIES:
            if re.search(rf"\b{cur}\b", text):
                return "TRY" if cur == "TL" else cur
    return None

def extract_money(text):
    match = re.search(r"\d{1,3}(?:\.\d{3})*,\d{2,4}", text or "")
    return match.group(0) if match else None

def parse_tr_number(value):
    if not value:
        return None

    try:
        return float(value.replace(".", "").replace(",", "."))
    except ValueError:
        return None

def extract_line_number_and_code(text):
    match = re.search(
        r"(?:(\d{1,3})\s+)?((?:[A-Z]{2,5}\.)+[A-Z0-9]+(?:\.[A-Z0-9]+)*)",
        text or "",
        re.IGNORECASE
    )
    if not match:
        return None, None

    line_no = int(match.group(1)) if match.group(1) else None
    product_code = match.group(2).upper()
    return line_no, product_code

def split_product_codes(full_code):
    if not full_code:
        return None, None

    full_code = full_code.upper()

    if full_code.startswith("AG."):
        short_code = full_code.split(".")[-1]
    else:
        short_code = full_code

    return full_code, short_code

def extract_product_codes(words):
    joined = " ".join(w["text"].strip() for w in words)

    _, code = extract_line_number_and_code(joined)
    if code:
        return split_product_codes(code)

    for w in words:
        text = w["text"].strip()
        if re.fullmatch(r"\d{5,10}", text):
            return text, text

    return None, None

def split_joined_quantity_price(text):
    text = normalize_text(text)

    # Örn:
    # 5 ADET13,2200
    # ADET 2512,5900
    # 9010,6300
    patterns = [
        r"(\d{1,5})\s*(ADET|ADE|PCS|KG|SET|MT)\s*(\d{1,3},\d{2,4})",
        r"(ADET|ADE|PCS|KG|SET|MT)\s*(\d{1,5})(\d{1,3},\d{2,4})",
        r"\b(\d{1,3})(\d{1,3},\d{2,4})\b",
    ]

    for p in patterns:
        m = re.search(p, text)
        if not m:
            continue

        if len(m.groups()) == 3:
            groups = m.groups()

            if groups[0] in QUANTITY_UNITS:
                return groups[1], groups[0], groups[2]

            return groups[0], groups[1], groups[2]

        if len(m.groups()) == 2:
            return m.group(1), None, m.group(2)

    return None, None, None

def repair_quantity_price_by_amount(quantity, unit_price, amount):
    q = parse_tr_number(quantity)
    p = parse_tr_number(unit_price)
    a = parse_tr_number(amount)

    if q and p and a and abs(q * p - a) < 0.05:
        return quantity, unit_price, False

    if not quantity or not unit_price or not amount:
        return quantity, unit_price, True

    joined = f"{quantity}{unit_price}"
    m = re.fullmatch(r"(\d+)(\d+,\d{2,4})", joined)

    if not m:
        return quantity, unit_price, True

    digits = m.group(1)
    decimal_part = m.group(2)

    for split_pos in range(1, len(digits) + 1):
        q_candidate = digits[:split_pos]
        price_candidate = digits[split_pos:] + decimal_part

        qv = parse_tr_number(q_candidate)
        pv = parse_tr_number(price_candidate)

        if qv and pv and a and abs(qv * pv - a) < 0.05:
            return q_candidate, price_candidate, False

    return quantity, unit_price, True

def extract_quantity(words):
    sorted_words = sorted(words, key=lambda w: w["x0"])
    unit_pattern = r"\b(" + "|".join(QUANTITY_UNITS) + r")\b"

    # 1) Aynı kutuda: "80 Adet"
    for w in sorted_words:
        text = normalize_text(w["text"])
        unit_match = re.search(unit_pattern, text)
        if unit_match:
            number_match = re.search(r"\d{1,6}(?:\.\d{3})*", text)
            if number_match:
                return number_match.group(0), unit_match.group(0)

    # 2) Ayrı kutular: "200" ... "Adet" veya "Adet" ... "200"
    for i, w in enumerate(sorted_words):
        text = normalize_text(w["text"])

        unit_match = re.fullmatch(unit_pattern, text)
        if unit_match:
            neighbors = sorted_words[max(0, i - 3): i + 4]

            number_candidates = []

            for n in neighbors:
                n_text = normalize_text(n["text"])

                if re.fullmatch(r"\d{1,6}(?:\.\d{3})*", n_text):
                    number_candidates.append(n)

            if number_candidates:
                best = min(
                    number_candidates,
                    key=lambda n: abs(n["x0"] - w["x0"]) + abs(n["y0"] - w["y0"])
                )
                return normalize_text(best["text"]), unit_match.group(1)

    return None, None


def normalize_money_ocr(text):
    return (
        str(text or "")
        .replace("O", "0")
        .replace("o", "0")
        .replace("D", "0")
    )

def extract_money_candidates(words):
    candidates = []

    for w in words:
        text = normalize_money_ocr(w["text"])

        for money in re.findall(r"\d{1,3}(?:\.\d{3})*,\d{2,4}", text):
            candidates.append(money)

    return candidates

def find_value_box(words, value, y_near, column=None, y_range=55, mode="contains"):
    if not value:
        return None

    value_norm = normalize_text(str(value)).replace(".", "").replace(",", "")

    candidates = []

    for w in words:
        if abs(w["y0"] - y_near) > y_range:
            continue

        if column:
            if not (column["xMin"] <= w["x0"] <= column["xMax"]):
                continue

        text_norm = normalize_text(normalize_money_ocr(w["text"])).replace(".", "").replace(",", "")

        if mode == "exact":
            if text_norm == value_norm:
                candidates.append(w)
        else:
            if value_norm and value_norm in text_norm:
                candidates.append(w)

    if not candidates:
        return None

    selected = min(candidates, key=lambda w:(
        abs(w["y0"] - y_near),
        abs(w["x0"] - column["xMin"]) if column else w["x0"],
        )
    )

    return [selected["x0"], selected["y0"], selected["x1"], selected["y1"]]

def find_unit_price_and_amount(words, quantity):
    money_values = extract_money_candidates(words)

    if not money_values or not quantity:
        return None, None

    q = parse_tr_number(quantity)

    if not q:
        return None, None

    parsed = [
        (m, parse_tr_number(m))
        for m in money_values
        if parse_tr_number(m) is not None
    ]

    for price_text, price_val in parsed:
        for amount_text, amount_val in parsed:
            if price_text == amount_text:
                continue

            if abs((q * price_val) - amount_val) < 0.05:
                return price_text, amount_text

    return None, None
    
def find_best_amount(words, quantity, unit_price):
    expected = None

    q = parse_tr_number(quantity)
    p = parse_tr_number(unit_price)

    if q is not None and p is not None:
        expected = q * p

    candidates = []

    for w in sorted(words, key=lambda x: x["x0"]):
        money_values = re.findall(r"\d{1,3}(?:\.\d{3})*,\d{2,4}", w["text"])

        for money in money_values:
            value = parse_tr_number(money)

            if value is None:
                continue

            diff = abs(value - expected) if expected is not None else 999999

            candidates.append({
                "money": money,
                "value": value,
                "diff": diff,
                "text": w["text"],
                "x0": w["x0"]
            })

    if not candidates:
        return None

    if expected is not None:
        good = [c for c in candidates if c["diff"] < 0.05]
        if good:
            return good[0]["money"]

    non_zero = [c for c in candidates if c["value"] != 0]
    if non_zero:
        return non_zero[-1]["money"]

    return candidates[-1]["money"]

def extract_product_and_origin(same_line):
    product_code = None
    line_no = None
    origin = None
    unit = None

    sorted_words = sorted(same_line, key=lambda w: w["x0"])

    for w in sorted_words:
        text = w["text"].strip()
        upper = normalize_text(text)

        found_line_no, found_code = extract_line_number_and_code(text)
        if found_code:
            product_code = found_code
            if found_line_no:
                line_no = found_line_no

        # Genel sayısal ürün kodu
        if not product_code and re.fullmatch(r"\d{5,10}", text):
            # GTIP 12 hane, fatura no/tarih vs değil
            if len(text) != 12:
                product_code = text

        # Sıra no genelde soldaki tek/iki haneli sayı
        if line_no is None and re.fullmatch(r"\d{1,3}", text) and w["x0"] < 130:
            line_no = int(text)

        if upper in ["GERMANY", "MOROCCO", "U.K", "UK", "TURKEY", "TURKIYE", "TÜRKİYE"]:
            origin = upper

        if "ADET" in upper:
            unit = "Adet"
        elif "KG" in upper:
            unit = "KG"
        elif "PCS" in upper:
            unit = "PCS"

    return line_no, product_code, origin, unit

def find_product_word(words, product_code):
    if not product_code:
        return None

    return next(
        (
            w for w in words
            if normalize_text(product_code) in normalize_text(w["text"])
        ),
        None
    )


def find_next_product_y(words, current_y):
    product_pattern = r"(?:[A-Z]{2,5}\.)+[A-Z0-9]+(?:\.[A-Z0-9]+)*"

    candidates = [
        w for w in words
        if w["y0"] > current_y
        and re.search(product_pattern, w["text"], re.IGNORECASE)
    ]

    if not candidates:
        return None

    return min(candidates, key=lambda w: w["y0"])["y0"]


def get_description_row_words(words, product_code, fallback_y):
    product_word = find_product_word(words, product_code)

    desc_y = product_word["y0"] if product_word else fallback_y
    next_product_y = find_next_product_y(words, desc_y)

    bottom_y = next_product_y - 5 if next_product_y else desc_y + 95

    return [
        w for w in words
        if desc_y - 35 <= w["y0"] < bottom_y
    ]

def extract_items(paddle_all, gtip_result):
    items = []

    page_map = {p["page"]: p["words"] for p in paddle_all}
    gtips = sorted(gtip_result["allGtips"], key=lambda g: (g["page"], g["y0"]))

    for idx, g in enumerate(gtips, start=1):
        words = page_map[g["page"]]
        y = g["y0"]

        same_line = sorted(find_nearby_words(words, y, 55), key=lambda w: w["x0"])
        product_code_full, product_code_short = extract_product_codes(same_line)
        product_code = product_code_short
        currency = find_currency(same_line)
        delivery_term = find_delivery_term(same_line)
        transport_mode = find_transport_mode(same_line)
        quantity, unit = extract_quantity(same_line)
        unit_price, amount = find_unit_price_and_amount(same_line, quantity)
        if not unit_price or not amount:
            money_values = []

            for w in same_line:
                money_values.extend(re.findall(r"\d{1,3}(?:\.\d{3})*,\d{2,4}", w["text"]))

            # Sıfırları at
            non_zero_money = [
                m for m in money_values
                if parse_tr_number(m) not in [0, None]
            ]

            if not unit_price and non_zero_money:
                unit_price = non_zero_money[0]

            if not amount and len(non_zero_money) >= 2:
                amount = non_zero_money[-1]

        if not quantity or not unit_price:
            for w in same_line:
                joined_qty, joined_unit, joined_price = split_joined_quantity_price(w["text"])

                if joined_qty and joined_price:
                    quantity = quantity or joined_qty
                    unit = unit or joined_unit or "ADET"
                    unit_price = unit_price or joined_price
                    break

        if quantity and unit_price and not amount:
            amount = find_best_amount(same_line, quantity, unit_price)
        quantity, unit_price, math_review = repair_quantity_price_by_amount(
            quantity,
            unit_price,
            amount
        )
        quantity, qty_repaired_ok = repair_quantity_by_amount_and_price(
            quantity,
            unit_price,
            amount
        )

        math_review = math_review and qty_repaired_ok

        # Description columundaki kutular y ekseninde tasabilir
        row_words = get_description_row_words(words, product_code, y)

        description = extract_description_from_words(row_words, product_code)

        columns = detect_columns(words)

        boxes = {
            "gtip": [g["x0"], g["y0"], g["x1"], g["y1"]] if g.get("x1") else None,
            "productCode": find_value_box(words, product_code, y, columns.get("PRODUCT"), mode="contains"),
            "quantity": find_value_box(words, quantity, y, columns.get("QTY"), mode="exact"),
            "unitPrice": find_value_box(words, unit_price, y, columns.get("PRICE"), mode="exact"),
            "amount": find_value_box(words, amount, y, columns.get("AMOUNT"), mode="exact"),
        }

        item = {
            "lineNo": idx,
            "productCode": product_code_short,
            "productCodeFull": product_code_full,
            "productCodeShort": product_code_short,
            "currency": currency,
            "deliveryTerm": delivery_term,
            "transportMode": transport_mode,
            "quantity": quantity,
            "unit": unit,
            "unitPrice": unit_price,
            "amount": amount,
            "needsReview": math_review,
            "description": description,
            "boxes": boxes,
            "gtip": g["gtip"],
            "rawLine": " ".join(w["text"].strip() for w in same_line),
            "source": {
                "page": g["page"],
                "x0": g["x0"],
                "y0": g["y0"],
                "raw": g["raw"]
            }
        }

        items.append(item)

    return items