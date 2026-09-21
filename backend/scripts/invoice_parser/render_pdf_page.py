from __future__ import annotations
import sys
import fitz

def main() -> int:
    if len(sys.argv) != 4:
        print("usage: render_pdf_page.py <pdf-path> <page-number> <output-png>", file=sys.stderr)
        return 2
    try:
        page_number = int(sys.argv[2])
    except ValueError:
        return 2
    if page_number < 1:
        return 2

    doc = fitz.open(sys.argv[1])
    try:
        if page_number > doc.page_count:
            return 3
        page = doc.load_page(page_number - 1)
        pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=False)
        pix.save(sys.argv[3])
        return 0
    finally:
        doc.close()

if __name__ == "__main__":
    raise SystemExit(main())
