# ExportDeclaration — IDP Foundation

Bu dosya IDP foundation için tek yaşayan teknik README'dir. Yeni milestone'larda ayrı foundation README oluşturulmaz; bu dosya güncellenir.

## Hedef mimari

```text
Upload
  -> Storage
  -> Queue
  -> IDP Worker
  -> ANALYZE
  -> EXTRACT_CONTENT / OCR_ENRICH
  -> SEGMENT
  -> CLASSIFY
  -> EXTRACT_CANDIDATES
  -> RESOLVE
  -> VALIDATE
  -> FINALIZE
```

Temel kural: PDF/native text/OCR yalnızca Canonical Document katmanında üretilir. Sonraki aşamalar PDF'yi yeniden okumaz ve OCR'ı tekrar çalıştırmaz.

## Processing modeli

- `UploadedFile`: fiziksel yüklenen dosya.
- `LogicalDocument`: dosya içindeki semantik belge için foundation model.
- `ProcessingRun`: processing attempt/snapshot ve audit kaydı.
- `CanonicalDocument`: sayfa, native text, OCR, bbox ve analiz için tek içerik kaynağı.
- `segments`: deterministic belge sınırları.
- `classifications`: segment bazlı deterministic belge tipi.
- `candidates`: segment bazlı extraction envelope.
- `resolvedResult`: candidate'ların resolution sonucu.
- `validationResult`: sonraki VALIDATE aşaması için ayrılmış alan.
- `finalResult`: downstream compatibility/final business sonucu.

Processing durumları: `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`, `REVIEW_REQUIRED`, `CANCELLED`.

## Tenant / kurulum kimliği

`SUPERADMIN` firma bağımsızdır (`companyId = null`). Operasyonel tenant kapsamı kurulum boyunca değişmeyen `INSTALLATION_COMPANY_ID` ile belirlenir. Normal kullanıcıların `companyId` alanı zorunludur. Superadmin operasyonlarında `req.auth.operationalCompanyId` kurulum şirketini taşır.

## Foundation 1 — Queue / Worker / Storage — COMPLETED

- Redis + BullMQ.
- Ayrı `idp-worker`.
- StorageProvider abstraction + local persistent storage.
- `LogicalDocument` ve `ProcessingRun` foundation.
- Upload sonrası otomatik ProcessingRun + queue.
- Manuel `/process` reprocess/retry için korunur.
- Yeni Talep UI gerçek document upload endpoint'ine bağlıdır.

## Foundation 2.1 — Canonical Document + PDF Analyzer — COMPLETED

- Page dimensions/rotation.
- Native text, words ve lines.
- `0..1` normalized bbox.
- Page/document `DIGITAL`, `SCANNED`, `MIXED` analizi.
- Canonical snapshot `ProcessingRun.canonicalDocument` içinde persist edilir.

## Foundation 2.2 — OCR Enrichment — COMPLETED

- SCANNED/MIXED hedef sayfalarda PaddleOCR 3.7 / PaddlePaddle 3.2.
- OCR words/lines canonical modele `source: OCR` ile eklenir.
- Model preload + runtime offline.
- CPU/thread/render limitleri.
- Tek worker içinde OCR slot gate.
- Batch OCR (`OCR_BATCH_SIZE`, default 10), checkpoint ve retry/resume.
- `Schema.Types.Mixed` canonical persistence için explicit `markModified`.
- 55 sayfalık fixture 6 batch ile tamamlandı; 55 OCR sayfası / 10320 OCR word persist edildi.

## Foundation 2.3 — Canonical-only Candidate Input — COMPLETED

- Legacy ikinci OCR/native PDF read yolu kaldırıldı.
- Invoice candidate extraction yalnızca CanonicalDocument tüketir.
- Digital PDF OCR çalıştırmaz.
- Scanned PDF canonical OCR sonucunu tekrar kullanır.
- GTIP query de canonical pipeline kullanır.

Regresyon:
- 0110 scanned: tek OCR cycle; candidate extraction ~sub-second seviyesinde.
- 0146 digital: OCR yok; 56 invoice goods line korunuyor.

## Foundation 3.1 — Deterministic Segmentation — COMPLETED

Boundary sinyalleri document anchor/id, printed page sequence, header continuity ve footer evidence kullanır. Fixture-specific page hardcode yoktur.

55-page regression:
- segment-001: pages 1–35, INVOICE anchor.
- segment-002: pages 36–53, boundary `PAGE_SEQUENCE_COMPLETED`.
- segment-003: page 54, CERTIFICATE_OF_ORIGIN anchor.
- segment-004: page 55, ATR anchor.

0146: tek segment 1–8. 0110: tek segment 1–3.

## Foundation 3.2 — Deterministic Classification — COMPLETED

Desteklenen sınıflar: `INVOICE`, `PACKING_LIST`, `ATR`, `EUR1`, `CERTIFICATE_OF_ORIGIN`, `BILL_OF_LADING`, `CMR`, `UNKNOWN`.

Weak/ambiguous evidence `UNKNOWN` üretir; Qwen classification yapmaz.

55-page regression:
- segment-001 -> INVOICE 0.99
- segment-002 -> UNKNOWN
- segment-003 -> CERTIFICATE_OF_ORIGIN 0.99
- segment-004 -> ATR 0.99

Invoice projection yalnızca invoice segment sayfalarını candidate extractor'a geçirir.

## Foundation 3.3 — Document-type Candidate Extraction Registry — COMPLETED

Candidate extraction segment/classification bazlı registry üzerinden çalışır.

```text
INVOICE                 -> invoice-canonical-v1 -> EXTRACTED
UNKNOWN                 -> SKIPPED
known but no extractor  -> UNSUPPORTED
```

ATR/Certificate gibi tipler için sahte extractor yoktur. Extractor kayıtlı değilse audit sonucu açıkça `UNSUPPORTED` olur.

55-page regression:
- INVOICE pages 1–35 -> EXTRACTED.
- UNKNOWN pages 36–53 -> SKIPPED.
- CERTIFICATE_OF_ORIGIN page 54 -> UNSUPPORTED.
- ATR page 55 -> UNSUPPORTED.

Fresh 0146 E2E: ANALYZE -> OCR_ENRICH(skip) -> SEGMENT -> CLASSIFY -> CANDIDATE_EXTRACT -> COMPLETED yaklaşık 2 saniye; candidate 8 sayfa ve 56 goods line ile MongoDB'ye persist edildi.

## Foundation 3.4 — Deterministic Resolve Contract — COMPLETED

Amaç candidate extraction ile ilerideki Qwen/validation katmanları arasına açık bir resolution contract koymaktır.

Kurallar:
- Tek `EXTRACTED INVOICE` candidate -> `RESOLVED / SINGLE_CANDIDATE`.
- Sıfır invoice candidate -> `REVIEW_REQUIRED / NO_INVOICE_CANDIDATE`.
- Birden fazla invoice candidate -> `REVIEW_REQUIRED / MULTIPLE_INVOICE_CANDIDATES`.
- Birden fazla candidate varsa **ilk candidate sessizce seçilmez**.
- Resolution envelope `ProcessingRun.resolvedResult` içinde audit için persist edilir.
- Başarılı single-candidate resolution'ın `data` alanı mevcut `finalResult` / `UploadedFile.extractedData` compatibility yoluna aktarılır.

Qwen bu foundation'da eklenmez. Önce deterministic resolution contract ve failure/review semantics sabitlenir; Qwen daha sonra RESOLVE implementasyonlarından biri olarak bu contract'ın arkasına eklenir.

Regression:
- Fresh 0146 E2E: `RESOLVED / SINGLE_CANDIDATE`; `resolvedResult` MongoDB'ye persist edildi ve 56 goods line korundu.
- Resolver domain regression: 0 candidate -> `REVIEW_REQUIRED / NO_INVOICE_CANDIDATE`; 1 candidate -> `RESOLVED / SINGLE_CANDIDATE`; 2 candidate -> `REVIEW_REQUIRED / MULTIPLE_INVOICE_CANDIDATES`.
- Review-required sonuçlarında `data` alanı üretilmez; ambiguous candidate otomatik promote edilmez.

## Build / compile gate

`Dockerfile.backend.dev` build sırasında `npm run typecheck` çalıştırır. Milestone kapanışında:

```powershell
docker compose -f compose.dev.yaml build
```

DB volume'larını gereksiz yere silmeyin; `docker compose down -v` normal geliştirme/rebuild komutu değildir.
