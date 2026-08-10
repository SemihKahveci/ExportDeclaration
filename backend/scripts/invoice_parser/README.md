# Invoice Parser (Python)

Fatura PDF'lerini OCR + GTİP + kalem çıkarımı ile işler. Node backend `child_process` ile `run_invoice.py` çağırır.

## Yerel kurulum (Windows)

```powershell
cd backend/scripts/invoice_parser
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

```env
INVOICE_PARSER_ENABLED=true
INVOICE_PARSER_PYTHON=C:\...\venv\Scripts\python.exe
```

Linux/macOS'ta varsayılan binary `python3`'tür; Windows'ta `python`.

## Render (canlı)

Netlify frontend değişmez. Backend Render Web Service olarak çalışır.

**Root Directory:** repo kökü (`.`)

| Alan | Değer |
|------|--------|
| **Build Command** | `npm install && npm run build && pip3 install --user -r backend/scripts/invoice_parser/requirements.txt` |
| **Start Command** | `npm start` |

**Environment Variables (Render panel):**

```env
INVOICE_PARSER_ENABLED=true
INVOICE_PARSER_PYTHON=python3
INVOICE_PARSER_DIR=backend/scripts/invoice_parser
MONGODB_URI=...
CORS_ORIGIN=https://siteniz.netlify.app
UPLOAD_DIR=/tmp/uploads
```

`render.yaml` dosyası aynı ayarların şablonunu içerir.

### Native runtime riski

Render'ın **Node native** imajında `python3` çoğu zaman vardır ama **garanti değildir**. Build'de `pip3` patlarsa veya runtime'da `python3: not found` görürseniz → **Dockerfile** ile Node + Python'u aynı image'a kurun (en sağlam yol).

### PaddleOCR boyutu

`requirements.txt` içinde `paddleocr` + `paddlepaddle` vardır. Build uzun sürer; çalışma anında **en az 1 GB RAM** (Starter plan) önerilir. Free tier'da OCR genelde timeout veya OOM verir.

### Akış

```
Netlify frontend
   ↓ PDF upload
Render Node.js (npm start)
   ↓ child_process: python3 run_invoice.py ...
Python parser → JSON
   ↓
MongoDB extractedData
```

```
POST /api/declarations/:id/documents  (type=INVOICE)
POST /api/declarations/:id/extract
POST /api/declarations/:id/normalize
```

## Manuel test

```bash
python3 run_invoice.py /path/to/fatura.pdf --output /tmp/invoice_result.json
```
