Foundation 2.3 - Canonical Candidate Extraction Bridge

Purpose:
- Reuse CanonicalDocument OCR words during legacy invoice candidate extraction.
- Prevent scanned/mixed invoices from running PaddleOCR a second time in LEGACY_EXTRACT.
- Preserve legacy extractor coordinate expectations via a normalized-bbox adapter.

Expected scanned test log:
- OCR_ENRICH completes normally.
- Before LEGACY_EXTRACT Python execution:
  idp.legacy_extract.canonical_input with ocrPageCount/ocrWordCount.
- LEGACY_EXTRACT should drop from minutes to seconds (depending on extraction rules).

Mongo verification:
ProcessingRun.finalResult.extractMeta.extractionSource = CANONICAL_DOCUMENT

Fallback behavior:
- Existing non-IDP callers remain compatible because canonicalDocument is optional.
- If no canonical OCR is supplied, run_invoice.py retains the existing legacy PDF/OCR path.
