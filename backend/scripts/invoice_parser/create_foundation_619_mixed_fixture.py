#!/usr/bin/env python3
"""Create a deterministic two-page MIXED invoice PDF for Foundation 6.19.

Page 1 remains native vector text. Page 2 is authored as vector text only in an
in-memory document, rasterized, and embedded as an image-only continuation page.
The saved PDF therefore forces selective OCR on page 2 while preserving native
invoice extraction on page 1.
"""
import sys
from pathlib import Path
import fitz

out = Path(sys.argv[1])
out.parent.mkdir(parents=True, exist_ok=True)

doc = fitz.open()
p1 = doc.new_page(width=595, height=842)
rows = [
    (50, 50, "COMMERCIAL INVOICE"),
    (50, 80, "Invoice No: EXP2026000000001"),
    (50, 100, "Invoice Date: 23.09.2026"),
    (50, 180, "PRODUCT CODE"),
    (160, 180, "DESCRIPTION"),
    (300, 180, "QTY"),
    (350, 180, "UNIT PRICE"),
    (430, 180, "AMOUNT"),
    (510, 180, "GTIP"),
    (50, 250, "AG.TEST.1001"),
    (160, 250, "TEST CIRCUIT BREAKER"),
    (300, 250, "2 PCS"),
    (350, 250, "10,0000 EUR"),
    (430, 250, "20,00 EUR"),
    (510, 250, "853620100011"),
    (50, 300, "FCA"),
    (100, 300, "ROAD"),
]
for x, y, text in rows:
    p1.insert_text((x, y), text, fontsize=10)

continuation = fitz.open()
cp = continuation.new_page(width=595, height=842)
for x, y, text in [
    (50, 60, "COMMERCIAL INVOICE CONTINUATION"),
    (50, 100, "Invoice No: EXP2026000000001"),
    (50, 150, "SHIPPING NOTES"),
    (50, 180, "FCA ROAD"),
    (50, 220, "END OF INVOICE"),
]:
    cp.insert_text((x, y), text, fontsize=12)
pix = cp.get_pixmap(matrix=fitz.Matrix(3, 3), alpha=False)
png = pix.tobytes("png")
continuation.close()

p2 = doc.new_page(width=595, height=842)
p2.insert_image(p2.rect, stream=png)
doc.save(str(out), deflate=True)
doc.close()
print(str(out))
