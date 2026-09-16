import fitz
import numpy as np
from PIL import Image
from pathlib import Path
from ocr_runtime import create_ocr, extract_detections


def render_page_to_image(page, zoom=3):
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    return Image.frombytes("RGB", [pix.width, pix.height], pix.samples)


def box_to_rect(box):
    xs = [float(p[0]) for p in box]
    ys = [float(p[1]) for p in box]
    return {"x0": min(xs), "y0": min(ys), "x1": max(xs), "y1": max(ys)}


def run_ocr(pdf_path, output_dir="output"):
    output_dir = Path(output_dir)
    output_dir.mkdir(exist_ok=True)
    doc = fitz.open(pdf_path)
    try:
        ocr = create_ocr()
        pages = []
        for page_index, page in enumerate(doc, start=1):
            img = render_page_to_image(page, zoom=3)
            img.save(output_dir / f"page_{page_index}.png")
            page_words = [
                {"text": text, "score": score, **box_to_rect(poly)}
                for text, score, poly in extract_detections(ocr.predict(np.asarray(img)))
            ]
            pages.append({"page": page_index, "words": page_words})
        return pages
    finally:
        doc.close()
