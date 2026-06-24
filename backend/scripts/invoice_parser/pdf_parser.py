import fitz

def parse_digital_pdf(pdf_path):
    doc = fitz.open(pdf_path)
    pages = []

    for page_no, page in enumerate(doc, start=1):
        page_width = float(page.rect.width)
        page_height = float(page.rect.height)

        scale_x = 1700 / page_width
        scale_y = 2500 / page_height

        words = []

        for w in page.get_text("words"):
            words.append({
                "text": w[4],
                "x0": float(w[0]) * scale_x,
                "y0": float(w[1]) * scale_y,
                "x1": float(w[2]) * scale_x,
                "y1": float(w[3]) * scale_y,
                "score": 1.0
            })

        pages.append({
            "page": page_no,
            "words": words
        })

    return pages