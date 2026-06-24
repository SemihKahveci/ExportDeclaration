from pathlib import Path
from PIL import Image, ImageDraw, JpegImagePlugin  

from column_detector import detect_columns

COLORS = {
    "GTIP": "red",
    "PRODUCT": "blue",
    "QTY": "orange",
    "PRICE": "purple",
    "AMOUNT": "green",
}

def normalize_value(value):
    return str(value or "").replace(" ", "").replace(".", "").replace(",", "")


def normalize_text(text):
    return str(text or "").replace(" ", "").replace(".", "").replace(",", "")

def value_matches_word(value, word_text):
    if not value:
        return False

    v = normalize_value(value)
    t = normalize_text(word_text)

    if not v or not t:
        return False

    # Normal case: amount/product/price direkt geçer.
    if v in t:
        return True

    # GTIP padded case: items.json 12 hane, OCR word 11 hane olabilir.
    # Örn 853890990000 vs 85389099000
    if len(v) == 12:
        return v.rstrip("0") in t

    return False

def word_in_column(word, col):
        if not col:
            return True

        return col["xMin"] <= word["x0"] <= col["xMax"]
        
def find_value_box(words, value, y_near, column=None, y_range=55):
        candidates = []

        for w in words:
            if abs(w["y0"] - y_near) > y_range:
                continue

            if column and not word_in_column(w, column):
                continue

            if not value_matches_word(value, w["text"]):
                continue

            candidates.append(w)

        if not candidates:
            return None

        # Aynı satırda ve kolon merkezine en yakın olanı seç.
        if column:
            center = (column["xMin"] + column["xMax"]) / 2
            selected = sorted(
                candidates,
                key=lambda w: (abs(w["y0"] - y_near), abs(((w["x0"] + w["x1"]) / 2) - center))
            )[0]
        else:
            selected = sorted(candidates, key=lambda w: abs(w["y0"] - y_near))[0]

        return [selected["x0"], selected["y0"], selected["x1"], selected["y1"]]

def draw_box(draw, box, label, color):
    x0, y0, x1, y1 = box
    draw.rectangle([x0, y0, x1, y1], outline=color, width=3)

    label_y = max(0, y0 - 24)
    draw.rectangle([x0, label_y, x0 + len(label) * 8 + 10, y0], fill=color)
    draw.text([x0 + 4, label_y + 4], label, fill="white")


def annotate_invoice_images(paddle_all, items, output_dir="output"):
    output_dir = Path(output_dir)
    annotated_images = []

    pages = {p["page"]: p["words"] for p in paddle_all}
    
    for page_no, words in pages.items():
        img_path = output_dir / f"page_{page_no}.png"
        if not img_path.exists():
            continue

        img = Image.open(img_path).convert("RGB")
        draw = ImageDraw.Draw(img)

        page_items = [i for i in items if i["source"]["page"] == page_no]

        for item in page_items:
            y = item["source"]["y0"]

            for label, field in [
                ("GTIP", "gtip"),
                ("PRODUCT", "productCode"),
                ("QTY", "quantity"),
                ("PRICE", "unitPrice"),
                ("AMOUNT", "amount"),
            ]:  
                box = item.get("boxes", {}).get(field)
                if box:
                    draw_box(draw, box, label, COLORS[label])

        out = output_dir / f"annotated_page_{page_no}.png"
        img.save(out)
        annotated_images.append(out)

    if annotated_images:
        imgs = [Image.open(p).convert("RGB") for p in annotated_images]
        pdf_path = output_dir / "annotated_invoice.pdf"
        imgs[0].save(pdf_path, save_all=True, append_images=imgs[1:])

    return annotated_images