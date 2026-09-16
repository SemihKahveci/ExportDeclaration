import argparse
import json
import fitz
from pathlib import Path

from pdf_type_detector import detect_pdf_type
from gtip_extractor import extract_all_gtips
from item_extractor import extract_items
from pdf_parser import parse_digital_pdf
from ocr_engine import run_ocr
from annotator import annotate_invoice_images

OUTPUT_DIR = Path("output")

def render_pdf_pages(pdf_path, output_dir, dpi=200):
    output_dir.mkdir(exist_ok=True)

    doc = fitz.open(str(pdf_path))
    image_paths = []

    zoom = dpi / 72
    matrix = fitz.Matrix(zoom, zoom)

    for i, page in enumerate(doc, start=1):
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        image_path = output_dir / f"page_{i}.png"
        pix.save(str(image_path))
        image_paths.append(image_path)

    doc.close()
    return image_paths

def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def save_json(path, data):
    Path(path).parent.mkdir(exist_ok=True)
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def canonical_to_legacy_words(canonical_document):
    """Adapt normalized CanonicalDocument words to the coordinate space used
    by the existing GTIP/item extractors without running OCR again.

    Legacy scanned OCR rendered PDF pages at zoom=3, so scanned/mixed pages
    are projected to page-points * 3. Digital pages retain the historical
    1700x2500 coordinate system used by parse_digital_pdf().
    """
    pages = []

    for page in canonical_document.get("pages", []):
        page_no = int(page.get("pageNumber", len(pages) + 1))
        content_kind = page.get("contentKind")

        if content_kind == "DIGITAL":
            target_width = 1700.0
            target_height = 2500.0
        else:
            target_width = float(page.get("width") or 0) * 3.0
            target_height = float(page.get("height") or 0) * 3.0

        if target_width <= 0 or target_height <= 0:
            raise ValueError(f"Canonical page dimensions invalid: page={page_no}")

        words = []
        for word in page.get("words", []):
            text = str(word.get("text") or "").strip()
            bbox = word.get("bbox") or {}
            if not text:
                continue

            try:
                x0 = float(bbox["x0"]) * target_width
                y0 = float(bbox["y0"]) * target_height
                x1 = float(bbox["x1"]) * target_width
                y1 = float(bbox["y1"]) * target_height
            except (KeyError, TypeError, ValueError):
                continue

            words.append({
                "text": text,
                "score": float(word.get("confidence", 1.0)),
                "x0": x0,
                "y0": y0,
                "x1": x1,
                "y1": y1,
            })

        pages.append({"page": page_no, "words": words})

    return pages


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_path")
    parser.add_argument("--output", default="output/invoice_result.json")
    parser.add_argument("--debug-dir", default="output")
    parser.add_argument("--annotate", action="store_true")
    parser.add_argument("--annotated-output", default="output/annotated_invoice.pdf")
    parser.add_argument("--canonical-input")
    return parser.parse_args()


def main():
    args = parse_args()

    pdf_path = Path(args.pdf_path)
    debug_dir = Path(args.debug_dir)
    output_path = Path(args.output)

    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF bulunamadı: {pdf_path}")

    pdf_type = detect_pdf_type(str(pdf_path))
    extraction_source = "LEGACY_PDF"

    if args.canonical_input:
        canonical_document = load_json(args.canonical_input)
        paddle_all = canonical_to_legacy_words(canonical_document)
        extraction_source = "CANONICAL_DOCUMENT"
        # Annotation needs rendered page images, but normal extraction does not.
        if args.annotate:
            render_pdf_pages(pdf_path, debug_dir)
    elif pdf_type == "DIGITAL_TEXT_PDF":
        paddle_all = parse_digital_pdf(str(pdf_path))
        render_pdf_pages(pdf_path, debug_dir)
    else:
        paddle_all = run_ocr(str(pdf_path), debug_dir)

    gtip_result = extract_all_gtips(paddle_all)
    items = extract_items(paddle_all, gtip_result)

    result = {
        "pdfType": pdf_type,
        "inputFile": str(pdf_path),
        "itemCount": len(items),
        "items": items,
        "extractionSource": extraction_source
    }

    save_json(output_path, result)
    annotated_images = []

    if args.annotate:
        annotated_images = annotate_invoice_images(paddle_all, items, debug_dir)
    print(json.dumps({
        "success": True,
        "pdfType": pdf_type,
        "itemCount": len(items),
        "extractionSource": extraction_source,
        "output": str(output_path),
        "annotatedImages": [str(p) for p in annotated_images],
        "annotatedPdf": str(debug_dir / "annotated_invoice.pdf") if args.annotate else None
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()