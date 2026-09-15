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
