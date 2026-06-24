import fitz
import numpy as np
from PIL import Image
from paddleocr import PaddleOCR
from pathlib import Path


def render_page_to_image(page, zoom=3):
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat)
    return Image.frombytes("RGB", [pix.width, pix.height], pix.samples)


def box_to_rect(box):
    xs = [p[0] for p in box]
    ys = [p[1] for p in box]

    return {
        "x0": min(xs),
        "y0": min(ys),
        "x1": max(xs),
        "y1": max(ys)
    }


def run_ocr(pdf_path, output_dir="output"):
    output_dir = Path(output_dir)
    output_dir.mkdir(exist_ok=True)

    doc = fitz.open(pdf_path)

    ocr = PaddleOCR(
        use_angle_cls=True,
        lang="en",
        show_log=False
    )

    pages = []

    for page_index, page in enumerate(doc, start=1):
        img = render_page_to_image(page, zoom=3)

        img_path = output_dir / f"page_{page_index}.png"
        img.save(img_path)

        result = ocr.ocr(str(img_path), cls=True)

        page_words = []

        if result and result[0]:
            for line in result[0]:
                box = line[0]
                text = line[1][0]
                score = line[1][1]

                page_words.append({
                    "text": text,
                    "score": score,
                    **box_to_rect(box)
                })

        pages.append({
            "page": page_index,
            "words": page_words
        })

    return pages