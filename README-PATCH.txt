Foundation 2.2 - Paddle CPU Runtime Control

Changed files only:
- backend/scripts/invoice_parser/ocr_runtime.py
- backend/src/modules/idp/analyzer/ocrEnricher.ts

What changes:
1. Uses PaddleOCR's official cpu_threads parameter (default 2) instead of relying on OMP variables.
2. Forces CPU device explicitly and keeps MKL-DNN enabled.
3. Keeps BLAS/OpenMP helper pools at 1 thread to avoid nested oversubscription.
4. Serializes heavy Paddle inference inside the worker process, independently of BullMQ worker concurrency.
5. Keeps existing render cap, watchdogs and process-group kill behavior.

No env.ts, compose, auth, DB, model or schema files are overwritten.
