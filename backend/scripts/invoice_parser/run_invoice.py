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


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_path")
    parser.add_argument("--output", default="output/invoice_result.json")
    parser.add_argument("--debug-dir", default="output")
    parser.add_argument("--annotate", action="store_true")
    parser.add_argument("--annotated-output", default="output/annotated_invoice.pdf")
    return parser.parse_args()


def main():
    args = parse_args()

    pdf_path = Path(args.pdf_path)
    debug_dir = Path(args.debug_dir)
    output_path = Path(args.output)

    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF bulunamadı: {pdf_path}")

    pdf_type = detect_pdf_type(str(pdf_path))

    if pdf_type == "DIGITAL_TEXT_PDF":
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
        "items": items
    }

    save_json(output_path, result)
    annotated_images = []

    if args.annotate:
        annotated_images = annotate_invoice_images(paddle_all, items, debug_dir)
    print(json.dumps({
        "success": True,
        "pdfType": pdf_type,
        "itemCount": len(items),
        "output": str(output_path),
        "annotatedImages": [str(p) for p in annotated_images],
        "annotatedPdf": str(debug_dir / "annotated_invoice.pdf") if args.annotate else None
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()