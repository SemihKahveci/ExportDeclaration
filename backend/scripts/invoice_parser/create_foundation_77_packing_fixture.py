#!/usr/bin/env python3
import sys
from pathlib import Path
import fitz

out = Path(sys.argv[1])
quantity = sys.argv[2] if len(sys.argv) > 2 else "2"
out.parent.mkdir(parents=True, exist_ok=True)
doc = fitz.open()
page = doc.new_page(width=595, height=842)
rows = [
    (50, 50, "PACKING LIST"),
    (50, 90, "Invoice No: EXP2026000000001"),
    (50, 130, "Product: TEST CIRCUIT BREAKER"),
    (50, 160, f"QTY: {quantity}"),
    (50, 190, "Packages: 1 CARTON"),
]
for x, y, text in rows:
    page.insert_text((x, y), text, fontsize=11)
doc.save(str(out))
doc.close()
print(str(out))
