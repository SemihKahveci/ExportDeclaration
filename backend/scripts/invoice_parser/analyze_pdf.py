#!/usr/bin/env python3
import argparse
import json
import fitz

MIN_NATIVE_CHARS = 20
MIN_NATIVE_WORDS = 3


def norm_bbox(rect, width, height):
    x0, y0, x1, y1 = rect
    if width <= 0 or height <= 0:
        return {"x0": 0, "y0": 0, "x1": 0, "y1": 0}
    return {
        "x0": max(0.0, min(1.0, float(x0) / width)),
        "y0": max(0.0, min(1.0, float(y0) / height)),
        "x1": max(0.0, min(1.0, float(x1) / width)),
        "y1": max(0.0, min(1.0, float(y1) / height)),
    }


def line_bbox(spans):
    boxes = [s.get("bbox") for s in spans if s.get("bbox")]
    if not boxes:
        return None
    return (
        min(b[0] for b in boxes), min(b[1] for b in boxes),
        max(b[2] for b in boxes), max(b[3] for b in boxes)
    )


def analyze(pdf_path):
    doc = fitz.open(pdf_path)
    pages = []
    digital = scanned = mixed = native_pages = 0

    for idx, page in enumerate(doc):
        width = float(page.rect.width)
        height = float(page.rect.height)
        native_text = page.get_text("text").strip()
        raw_words = page.get_text("words")
        images = page.get_images(full=True)
        image_infos = page.get_image_info()
        page_area = max(width * height, 1.0)
        image_coverage = 0.0
        for info in image_infos:
            bbox = info.get("bbox")
            if bbox:
                image_coverage += max(0.0, float(bbox[2] - bbox[0])) * max(0.0, float(bbox[3] - bbox[1])) / page_area
        image_coverage = min(1.0, image_coverage)
        has_native = len(native_text) >= MIN_NATIVE_CHARS and len(raw_words) >= MIN_NATIVE_WORDS

        if has_native:
            native_pages += 1

        # Küçük logo/ikonlar dijital PDF'yi MIXED yapmamalı. Büyük raster içerik + native text varsa MIXED.
        if has_native and image_coverage >= 0.35:
            page_kind = "MIXED"
            mixed += 1
        elif has_native:
            page_kind = "DIGITAL"
            digital += 1
        else:
            page_kind = "SCANNED"
            scanned += 1

        words = [{
            "text": str(w[4]),
            "bbox": norm_bbox((w[0], w[1], w[2], w[3]), width, height),
            "confidence": 1.0,
            "source": "NATIVE_TEXT"
        } for w in raw_words if str(w[4]).strip()]

        lines = []
        text_dict = page.get_text("dict")
        for block in text_dict.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                spans = line.get("spans", [])
                text = "".join(str(s.get("text", "")) for s in spans).strip()
                bbox = line_bbox(spans)
                if text and bbox:
                    lines.append({
                        "text": text,
                        "bbox": norm_bbox(bbox, width, height),
                        "source": "NATIVE_TEXT"
                    })

        pages.append({
            "pageNumber": idx + 1,
            "width": width,
            "height": height,
            "rotation": int(page.rotation),
            "nativeText": native_text,
            "nativeCharCount": len(native_text),
            "nativeWordCount": len(words),
            "hasNativeText": has_native,
            "imageCount": len(images),
            "imageCoverage": image_coverage,
            "contentKind": page_kind,
            "words": words,
            "lines": lines
        })

    page_count = len(pages)
    if page_count == 0:
        content_kind = "SCANNED"
    elif scanned == page_count:
        content_kind = "SCANNED"
    elif digital == page_count and mixed == 0:
        content_kind = "DIGITAL"
    elif scanned == 0 and digital > 0 and mixed == 0:
        content_kind = "DIGITAL"
    else:
        content_kind = "MIXED"

    return {
        "analysis": {
            "contentKind": content_kind,
            "pageCount": page_count,
            "digitalPageCount": digital,
            "scannedPageCount": scanned,
            "mixedPageCount": mixed,
            "nativeTextPageCount": native_pages
        },
        "pages": pages
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_path")
    args = parser.parse_args()
    print(json.dumps(analyze(args.pdf_path), ensure_ascii=False))


if __name__ == "__main__":
    main()
