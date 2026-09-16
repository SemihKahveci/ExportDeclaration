#!/usr/bin/env python3
import argparse
import json
import os
import sys
import time
import warnings

# stdout is the machine protocol channel. Diagnostics are JSONL on stderr.
os.environ.setdefault("GLOG_minloglevel", "2")
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
warnings.filterwarnings("ignore")

import fitz
import numpy as np
from PIL import Image
from ocr_runtime import create_ocr, emit, extract_detections


def norm_bbox(rect, width, height):
    x0, y0, x1, y1 = rect
    if width <= 0 or height <= 0:
        return {"x0": 0.0, "y0": 0.0, "x1": 0.0, "y1": 0.0}
    return {
        "x0": max(0.0, min(1.0, float(x0) / width)),
        "y0": max(0.0, min(1.0, float(y0) / height)),
        "x1": max(0.0, min(1.0, float(x1) / width)),
        "y1": max(0.0, min(1.0, float(y1) / height)),
    }


def box_to_rect(box):
    xs = [float(p[0]) for p in box]
    ys = [float(p[1]) for p in box]
    return min(xs), min(ys), max(xs), max(ys)


def render_page(page, zoom=2.0):
    # Render at a useful OCR resolution, but cap very large pages. Paddle's
    # detector cost grows quickly with pixel count and can monopolize CPU.
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

    max_dimension = int(os.environ.get("OCR_MAX_RENDER_DIMENSION", "2400"))
    longest = max(image.size)
    if max_dimension > 0 and longest > max_dimension:
        scale = max_dimension / float(longest)
        new_size = (
            max(1, round(image.width * scale)),
            max(1, round(image.height * scale)),
        )
        image = image.resize(new_size, Image.Resampling.LANCZOS)

    return image, float(image.width), float(image.height)


def parse_pages(value):
    return sorted({int(token.strip()) for token in value.split(",") if token.strip()})


def run(pdf_path, page_numbers):
    doc = fitz.open(pdf_path)
    try:
        valid_pages = [p for p in page_numbers if 1 <= p <= len(doc)]
        if not valid_pages:
            return {"pages": []}

        emit("ocr.run.started", pageCount=len(valid_pages), pages=valid_pages)
        ocr = create_ocr()
        output_pages = []

        for page_number in valid_pages:
            started = time.monotonic()
            emit("ocr.page.started", pageNumber=page_number)
            page = doc[page_number - 1]
            image, image_width, image_height = render_page(page)
            emit(
                "ocr.page.rendered",
                pageNumber=page_number,
                width=round(image_width),
                height=round(image_height),
            )
            detections = extract_detections(ocr.predict(np.asarray(image)))

            words = []
            lines = []
            text_parts = []
            for text, confidence, poly in detections:
                bbox = norm_bbox(box_to_rect(poly), image_width, image_height)
                confidence = max(0.0, min(1.0, confidence))
                words.append({"text": text, "bbox": bbox, "confidence": confidence, "source": "OCR"})
                lines.append({"text": text, "bbox": bbox, "source": "OCR"})
                text_parts.append(text)

            output_pages.append({
                "pageNumber": page_number,
                "words": words,
                "lines": lines,
                "text": "\n".join(text_parts),
            })
            emit(
                "ocr.page.completed",
                pageNumber=page_number,
                wordCount=len(words),
                durationMs=round((time.monotonic() - started) * 1000),
            )

        emit("ocr.run.completed", pageCount=len(output_pages), wordCount=sum(len(p["words"]) for p in output_pages))
        return {"pages": output_pages}
    finally:
        doc.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_path")
    parser.add_argument("--pages", required=True)
    args = parser.parse_args()
    result = run(args.pdf_path, parse_pages(args.pages))
    sys.stdout.write(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
