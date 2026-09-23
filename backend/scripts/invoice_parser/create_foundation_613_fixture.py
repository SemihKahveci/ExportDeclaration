#!/usr/bin/env python3
import sys
from pathlib import Path
import fitz

out = Path(sys.argv[1])
out.parent.mkdir(parents=True, exist_ok=True)
doc = fitz.open()
page = doc.new_page(width=595, height=842)
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
doc.save(str(out))
doc.close()
print(str(out))
