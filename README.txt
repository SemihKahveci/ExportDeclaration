Foundation 2.3B - Canonical-only extraction cleanup

Goals:
- CanonicalDocument is the only PDF content source for invoice candidate extraction.
- OCR is owned only by IDP OCR_ENRICH.
- run_invoice.py requires --canonical-input and no longer has legacy OCR/native-PDF fallback.
- GTIP Query uses analyze -> OCR enrich -> canonical candidate extraction.
- declaration runExtraction consumes ProcessingRun results instead of reparsing files.
- dead legacy OCR/PDF reader files are removed.
- IDP stage log renamed LEGACY_EXTRACT -> CANDIDATE_EXTRACT.

After copying the changed files, delete the paths in DELETE_THESE_FILES.txt.
Then rebuild Docker and regression-test scanned 0110 and digital 0146 before committing.
