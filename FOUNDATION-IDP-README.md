# IDP Foundation - Phase 1

This phase introduces the product-grade processing foundation without removing the current extractors.

## Added
- Redis + BullMQ queue
- Separate `idp-worker` process
- `ProcessingRun` immutable processing history foundation
- `LogicalDocument` model (one upload can later be segmented into multiple documents)
- StorageProvider abstraction + local filesystem implementation
- SHA-256 and storage metadata on uploaded files
- Async processing endpoints:
  - `POST /api/declarations/:id/documents/:documentId/process`
  - `GET /api/declarations/:id/documents/:documentId/processing-runs`

## Compatibility
Existing `UploadedDocument` Mongo collection is preserved. New code treats it conceptually as `UploadedFile`; the old export remains temporarily so normalization/extraction continues to work.

The worker currently invokes the existing extractor and writes its result both to `ProcessingRun.finalResult` and the legacy `extractedData` field. This is deliberate transitional compatibility. Later phases replace the single extractor call with ANALYZE -> EXTRACT_CONTENT -> SEGMENT -> CLASSIFY -> CANDIDATES -> RESOLVE -> VALIDATE -> FINALIZE.

## One required dependency install
`package.json` now contains `bullmq`. Because the review environment has no npm registry access, `package-lock.json` could not be regenerated here. Before Docker build, run once in the project root:

    npm install

Commit the resulting `package-lock.json`. After that Docker's existing `npm ci` flow remains reproducible.

## Start

    docker compose -f compose.dev.yaml down
    docker compose -f compose.dev.yaml up --build

Expected services: mongo, redis, backend, idp-worker, frontend.


## Installation company context

Bu on-prem mimaride `SUPERADMIN` kullanıcı kaydı firma bağımsızdır (`companyId = null`).
Operasyonel kayıtların tenant kapsamı `INSTALLATION_COMPANY_ID` ile belirlenir. Bu değer her kurulum için bir kez üretilmeli ve kurulum ömrü boyunca değiştirilmemelidir. Normal kullanıcıların `companyId` değeri zorunludur; superadmin işlemlerinde ise `req.auth.operationalCompanyId` kurulum kimliğini taşır.


## Yeni Talep → IDP bağlantısı

Foundation 1 entegrasyonunda Dosya Takip / Yeni Talep ekranında seçilen dosyalar artık talep oluşturulduktan sonra gerçek document upload endpoint'ine gönderilir. Başarılı her upload otomatik olarak bir ProcessingRun oluşturur ve BullMQ üzerinden `idp-worker` kuyruğuna alınır. Ayrı `/process` endpoint'i manuel reprocess/retry amacıyla korunur.

Yeni Talep ekranında henüz belge tipi seçimi/classification bulunmadığı için XML dosyaları geçici olarak `E_INVOICE_XML`, diğer desteklenen dosyalar `INVOICE` adayı olarak yüklenir. Bu geçici eşleme Canonical Document Model + segmentation/classification aşamasında kaldırılacaktır.

## Foundation 2.1 - Canonical Document Model + PDF Analyzer

PDF dosyaları IDP worker içinde mevcut invoice extractor'dan önce belge-tipinden bağımsız analiz edilir.

- Sayfa boyutları ve rotation kaydedilir.
- Native PDF text, word ve line içerikleri çıkarılır.
- Word/line bounding box koordinatları `0..1` aralığında normalize edilir.
- Sayfalar DIGITAL / SCANNED / MIXED olarak analiz edilir.
- Belge geneli `analysis.contentKind` ile özetlenir.
- Sonuç immutable `ProcessingRun.canonicalDocument` snapshot'ında tutulur.
- Mevcut Python invoice parser geriye dönük uyumluluk için analizden sonra çalışmaya devam eder.

Bu faz OCR yapmaz. Native text bulunmayan sayfalar SCANNED olarak işaretlenir; OCR fallback Foundation 2.2'de canonical modele `source: OCR` olarak eklenecektir.

## Foundation 3.1 - Deterministic Document Segmentation

Status: COMPLETED

CanonicalDocument sayfaları deterministik ve açıklanabilir sınır sinyalleriyle logical document segmentlerine ayrılır. Boundary evidence; document family, document id, printed page sequence ve header discontinuity sinyallerini saklar. OCR batching yalnızca çalışma birimidir; semantic segment değildir.

Regression:
- VED2026000000146: pages 1-8 -> tek INVOICE segmenti
- VED2026000000110: pages 1-3 -> tek INVOICE segmenti
- 55-page composite: pages 1-35, 36-53, 54, 55 -> 4 segment

## Foundation 3.2 - Deterministic Segment Classification

Status: COMPLETED

Her segment ayrı sınıflandırılır. Desteklenen sınıflar: INVOICE, PACKING_LIST, ATR, EUR1, CERTIFICATE_OF_ORIGIN, BILL_OF_LADING, CMR ve UNKNOWN. Sınıflandırıcı konservatiftir; güçlü kanıt yoksa UNKNOWN üretir. Classification evidence ve confidence ProcessingRun içinde persist edilir.

55-page regression:
- 1-35 -> INVOICE
- 36-53 -> UNKNOWN
- 54 -> CERTIFICATE_OF_ORIGIN
- 55 -> ATR

Invoice projection regression: 55 canonical sayfadan yalnızca 1-35 candidate extraction girdisine seçilir.

## Foundation 3.3 - Candidate Extraction by Document Type

Status: IN PROGRESS

Candidate extraction artık segment + classification kontratı üzerinden yürütülür. Registry başlangıçta yalnızca INVOICE extractor içerir. UNKNOWN segmentler SKIPPED, bilinen fakat extractor'ı henüz kayıtlı olmayan belge tipleri UNSUPPORTED olarak audit edilir. ProcessingRun.candidates segment bazlı versioned envelope saklar. Legacy declaration uyumluluğu için rawExtraction/finalResult/extractedData, başarılı birincil INVOICE candidate sonucundan derive edilir; PDF/OCR fallback eklenmez.
