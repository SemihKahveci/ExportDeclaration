#!/usr/bin/env python3
"""Create a deterministic image-only invoice PDF for Foundation 6.18.

The first in-memory page contains vector text only as a fixture authoring aid. It is
rendered to a bitmap and only that bitmap is embedded in the saved PDF, so the
production analyzer cannot recover a native text layer and must use OCR.
"""
import sys
from pathlib import Path
import fitz

out = Path(sys.argv[1])
out.parent.mkdir(parents=True, exist_ok=True)

source = fitz.open()
page = source.new_page(width=595, height=842)
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
    page.insert_text((x, y), text, fontsize=10)

# 3x render gives Paddle a clean ~1785x2526 source while remaining lightweight.
pix = page.get_pixmap(matrix=fitz.Matrix(3, 3), alpha=False)
png = pix.tobytes("png")
source.close()

scanned = fitz.open()
out_page = scanned.new_page(width=595, height=842)
out_page.insert_image(out_page.rect, stream=png)
scanned.save(str(out), deflate=True)
scanned.close()
print(str(out))
