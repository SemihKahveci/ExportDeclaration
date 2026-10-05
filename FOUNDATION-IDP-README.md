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

## Foundation 3.5 — Deterministic Validation (COMPLETED)

Validation is a separate audited stage after candidate resolution and before finalization.

- `ProcessingRun.validationResult` stores a versioned validation envelope.
- Validation is document-type registered; the first validator is `invoice-deterministic-v1`.
- `ERROR` issues produce `REVIEW_REQUIRED`; `WARNING` issues are retained for audit but do not block finalization.
- Invoice structural checks cover goods-line presence, positive/unique line numbers, 12-digit GTIP format when GTIP is present, positive quantity/unit price/line total, and soft warnings for missing GTIP, description, unit, currency, or extractor `needsReview` flags.
- Missing GTIP is deliberately a warning rather than a hard error because invoices may legitimately omit GTIP; later resolve/human-review policy can enrich it.
- A resolved candidate is never finalized when deterministic validation contains errors.
- Qwen/LLM is still not part of this stage.

## Foundation 4.1 — LLM Resolve Infrastructure / Qwen Provider (COMPLETED)

Qwen is introduced behind an explicit provider and policy boundary; it does not bypass deterministic resolution or validation.

- `LlmProvider` is vendor/runtime independent.
- `QwenOpenAiProvider` targets an OpenAI-compatible local endpoint, suitable for a LAN-hosted model server such as DGX Spark.
- LLM runtime is disabled by default (`LLM_ENABLED=false`) and has an explicit timeout.
- Provider output has a versioned JSON contract and rejects malformed/empty resolved responses.
- Policy does not call LLM for the deterministic single-candidate happy path.
- No usable invoice candidate is not sent to the LLM because there is no grounded candidate data to resolve.
- Multiple extracted invoice candidates are the first allowed LLM-resolution case, but worker invocation is intentionally not enabled until provider connectivity and response-contract regression pass.
- Any future LLM-resolved data must still pass the existing deterministic `VALIDATE` stage before finalization.
- Provider regression covers disabled-before-HTTP, valid OpenAI-compatible JSON, malformed model content, HTTP 500, and timeout; all failure cases are fail-closed.
- Regression gates passed: `verifyLlmResolveInfrastructure.ts`, `verifyQwenProvider.ts`, full Docker build, and production/release Compose config checks.


## Foundation 4.2 — LLM Resolver Integration (COMPLETED)

The worker RESOLVE stage now uses an orchestration boundary rather than calling the deterministic resolver directly.

Rules:
- 0 extracted invoice candidates -> deterministic `REVIEW_REQUIRED`; LLM is never called.
- 1 extracted invoice candidate -> deterministic `SINGLE_CANDIDATE`; LLM is never called.
- 2+ extracted invoice candidates + `LLM_ENABLED=false` -> deterministic `REVIEW_REQUIRED`.
- 2+ extracted invoice candidates + `LLM_ENABLED=true` -> provider may resolve the ambiguity.
- LLM may reference only extracted invoice segment IDs that were supplied in the request.
- Hallucinated/unknown segment IDs are rejected and never promoted to resolved data.
- Provider timeout/HTTP/parse/runtime failures are fail-closed as `REVIEW_REQUIRED`; they do not fail the IDP job.
- An LLM `REVIEW_REQUIRED` response remains review-required.
- Successful LLM resolution is audited with `strategy=LLM`, provider, model, and source segment IDs.
- Every successful LLM result still passes the existing deterministic VALIDATE stage before FINALIZE.

Regression utility: `backend/scripts/idp/verifyLlmResolverIntegration.ts`.


## Foundation 4.3 — Field Candidate & Evidence Contract (COMPLETED)

Invoice extraction now preserves the existing resolved `goodsLines` shape while adding a backward-compatible `fieldCandidates` envelope.

Design:
- Candidate/evidence types are generic IDP domain types, not invoice-only types.
- Provenance is derived from the extractor's real `boxes` and `source.page`; TypeScript does not invent coordinates.
- Legacy extractor boxes are converted back to canonical normalized 0..1 coordinates.
- Evidence records segment ID, original page number, normalized bbox, matching canonical text when available, and `NATIVE_TEXT`/`OCR` source.
- Description is currently page/segment-provenanced without a fabricated bbox because the legacy extractor derives it from a row window.
- Unit is explicitly marked `DERIVED` until the extractor exposes a dedicated source box.
- Existing resolved data and FINALIZE compatibility remain unchanged.

This is the bridge for field-level deterministic/LLM resolution. Foundation 4.4 will add ambiguity construction/resolution rules over these candidates rather than allowing an LLM to invent arbitrary field values.

Regression utility: `backend/scripts/idp/verifyFieldCandidateEvidence.ts`.

Real 0146 regression: 56 goods lines, 392 field candidate paths, persisted page/bbox/text provenance, VALID/COMPLETED.


## Foundation 4.4 — Deterministic Field Candidate Resolution (COMPLETED)

Field candidates now participate in RESOLVE rather than being audit-only metadata.

Rules:
- One distinct value -> `SINGLE_VALUE`.
- Multiple candidates supporting the same normalized value -> `CONSENSUS`; highest-confidence candidate is retained as selected provenance.
- Multiple distinct values -> `AMBIGUOUS`; no value is selected or promoted.
- Any field ambiguity makes the document resolution `REVIEW_REQUIRED / FIELD_CANDIDATE_AMBIGUITY`.
- Documents/tests without a `fieldCandidates` envelope remain backward compatible.
- Candidate values use the already-normalized extraction value while evidence continues to come from the raw extractor box/page. This prevents a later resolver from replacing numeric normalized values with locale-formatted raw strings.
- Foundation 4.4 is deterministic only; ambiguous fields fail closed and are never promoted.

Regression utilities:
- `backend/scripts/idp/verifyFieldCandidateResolution.ts`
- `backend/scripts/idp/verifyFieldResolutionOrchestration.ts`
- `backend/scripts/idp/verifyFieldCandidateEvidence.ts`


## Foundation 4.5 — Evidence-Constrained LLM Field Resolution (COMPLETED)

Field ambiguity can now be escalated to the existing OpenAI-compatible Qwen boundary without allowing free-form value generation.

Rules:
- `SINGLE_VALUE` and `CONSENSUS` remain deterministic and never call Qwen.
- Only `AMBIGUOUS` field candidates are sent to the field LLM contract.
- The model may select only an existing `candidateId` for the exact field, or return `REVIEW_REQUIRED`.
- Hallucinated IDs, duplicate/extra fields, missing selections, malformed responses, provider failures and timeouts fail closed to `REVIEW_REQUIRED`.
- Selected values are copied from the trusted candidate object; model-generated replacement values are not accepted.
- LLM-resolved values are applied to a cloned resolved data object and still pass through deterministic `VALIDATE`.
- Provider/model audit is persisted through the existing `llmAudit` contract.

Regression utility: `backend/scripts/idp/verifyFieldLlmResolverIntegration.ts`.


## Foundation 4.6 — Generic Invoice Candidate Discovery (COMPLETED)

The next extraction layer starts moving candidate discovery away from supplier/header-specific rules and onto canonical layout/evidence.

V1 rules:
- Discovery consumes only `CanonicalDocument`; it does not call the legacy Python invoice parser.
- A 12-digit HS/GTIP-shaped value can anchor a goods row even when its physical column has no header.
- Row membership comes from normalized canonical geometry rather than fixed pixel coordinates.
- Quantity / unit-price / line-total candidates require a deterministic arithmetic relationship (`quantity * unitPrice ~= lineTotal`) before they are emitted.
- Every discovered value carries page, normalized bbox, evidence text and NATIVE/OCR provenance.
- Generic candidates are initially verified independently before promotion into the production resolver. This is a deliberate migration gate: the legacy extractor remains the production source until real-invoice regressions prove generic discovery has adequate recall and no unsafe conflicts.
- No supplier name, invoice number, fixture-specific x coordinate or header label is encoded in the generic discovery implementation.

Regression utility: `backend/scripts/idp/verifyGenericInvoiceCandidateDiscovery.ts`. The synthetic fixture deliberately contains five headers and eight logical data columns; GTIP, unit price and line total are in headerless columns.

### Foundation 4.6 real-canonical comparison gate

Before generic invoice discovery is promoted into the production candidate registry, compare it against persisted production results using the exact same CanonicalDocument. This avoids re-running PDF analysis/OCR and measures recall/exactness independently of the legacy parser. The comparison utility is diagnostic by design: it reports coverage, exact numeric matches, unmatched generic rows, and NATIVE_TEXT/OCR provenance; it does not silently promote generic candidates or mutate ProcessingRun data.

Utility: `backend/scripts/idp/compareGenericInvoiceDiscovery.ts <processingRunId> [processingRunId...]`.

### Foundation 4.6 — Generic candidate discovery hardening

Generic invoice discovery now rejects date/time values that collapse to 12 digits and reconstructs visual rows from normalized CanonicalDocument geometry with separate OCR/native tolerances. Numeric relationship discovery is direction-agnostic relative to GTIP: quantity, unit price and line total are selected from row candidates by deterministic `quantity × unitPrice ≈ lineTotal` evidence rather than fixed header or left/right column assumptions. Raw CanonicalDocument provenance remains attached to every emitted candidate. Generic discovery remains a comparison/migration path and is not yet promoted over the production invoice extractor.

### Foundation 4.6 hardening v3 — OCR row partitioning

Generic invoice discovery now reconstructs goods rows from neighbouring HS-code anchors. The vertical midpoint between consecutive HS anchors is used as the row boundary, with an adaptive word-height fallback for edge/single rows. This avoids supplier-specific coordinates and fixes OCR baseline drift where quantity, unit price and line total are visually in the same goods row but their OCR boxes do not share a narrow y band. Date/time false-positive suppression from v2 remains in place. A synthetic OCR regression intentionally offsets numeric baselines and verifies two independent arithmetic rows.

### Foundation 4.6 hardening v4 — mixed numeric tokens and duplicate-GTIP-safe comparison

Generic invoice discovery now extracts locale-aware numeric fragments from mixed canonical words such as `78,75 EUR` and `%0,00 EUR1.138,00 EUR`. Arithmetic resolution remains evidence-constrained: quantity, unit price and line total are selected only when the row provides a valid `quantity × unitPrice ≈ lineTotal` relation. The original canonical word/bbox remains the provenance source.

Real-comparison matching is document-order/occurrence based for repeated GTIPs. The same GTIP may legitimately appear on multiple goods lines with different quantity/price/amount values, so comparison must not reuse the first GTIP occurrence or select a row by numeric similarity.

### Foundation 4.6 hardening v5 — source numeric precision

Numeric fragment discovery preserves the complete source token precision before arithmetic validation. A value such as `39,0425` is normalized to `39.0425`; it must not be truncated to `39.042` merely because both values can satisfy a currency-rounded line total. Arithmetic is a validation signal, not a replacement for a stronger directly observed candidate. A regression fixture covers `5 × 39,0425 ≈ 195,21` and asserts that the selected unit-price candidate remains `39.0425` with the original `39,0425` evidence text.

### Foundation 4.6 semantic row discovery (v6)
Generic invoice discovery now also emits evidence-backed candidates for `productCode`, `unit`, and `description` without supplier-specific coordinates or header requirements. Product-code discovery intentionally retains multiple plausible lexical representations for later deterministic/LLM resolution; unit discovery uses generic business-unit vocabulary near the mathematically selected quantity; description is conservative residual human-readable row content. Real-fixture comparison reports product-code candidate coverage, normalized unit agreement, and description exact/token-recall metrics. This remains a migration/quality gate and is not yet promoted into the production candidate registry.

### Foundation 4.6 semantic hardening v7

Generic invoice semantic discovery now reconstructs logical goods rows from each HS anchor forward to the next HS anchor instead of splitting semantic content at anchor midpoints. This keeps multiline/continuation product descriptions with the row that starts them while leaving the already-validated numeric row reconstruction unchanged. Product-code discovery also accepts OCR punctuation variants and emits progressively shorter namespace suffixes as evidence-backed candidates (for example `AG,EAT.216384` -> `EAT.216384`) without supplier-specific prefixes or fixed coordinates. Product/article code text is retained in description evidence because it can legitimately be part of invoice item descriptions.

### Foundation 5.2 — Generic/legacy migration comparison

The production INVOICE candidate path now computes a deterministic `genericCandidateAudit.migration` comparison between the existing production `fieldCandidates` and evidence-validated generic candidates. The policy remains `SHADOW_COMPARE`: it records `AGREE`, `EQUIVALENT`, `GENERIC_ONLY`, `LEGACY_ONLY`, and `CONFLICT` per field without changing RESOLVE output. Product-code namespace aliases are treated as equivalent only through conservative normalized terminal-code matching; arbitrary confidence does not select a winner. `promotable` is true only when generic canonical-evidence validation is VALID and the comparison contains no conflicts. This creates an explicit, auditable promotion gate before the legacy extractor can be retired.

### Foundation 5.2 hardening — semantic equivalence and product-code lineage

- Product-code discovery now combines the numeric/HS anchor row with the semantic continuation row so anchor-line article codes are not lost when descriptions continue below the row baseline.
- Product-code namespace decompositions are retained as one lineage from the strongest canonical source token; unrelated model/spec tokens are no longer emitted as peer product-code candidates.
- Legacy/generic description comparison treats product-code namespace/prefix differences as `EQUIVALENT` only after removing values traceable to the row's product-code candidate families. Materially different descriptions remain `CONFLICT`.
- The promotion gate now requires canonical evidence `VALID`, zero real conflicts, and zero `LEGACY_ONLY` fields. Legacy remains comparison evidence, not ground truth.

### Foundation 5.2 hardening v3 — row-geometry product-code recovery

Generic invoice discovery no longer assumes that a product/article-code token must be left of the selected quantity token. Candidate discovery now excludes already-structured HS/unit/math evidence and ranks remaining lexical code candidates by document-local row geometry and namespace strength. This targets continuation/baseline cases without supplier-specific prefixes, country lists, or fixed x coordinates. Migration remains shadow-only and promotion still requires evidence validation plus zero conflicts and zero legacy-only fields.


### Foundation 5.2 Hardening v4 — semantic continuation and quantity disambiguation

- Generic invoice discovery remains a single-pass canonical geometry pipeline.
- Description continuation is no longer clipped to the width of the selected product-code token.
- The logical description band is bounded by row/quantity geometry and existing structural evidence filters, not supplier names, country lists, or fixed x coordinates.
- This preserves valid continuation tokens (for example model/spec fragments on later visual lines) while keeping origin/other anchor-line columns outside the description band.
- Extractor revision after quantity/unit disambiguation: `invoice-generic-layout-v14`.
- Added a regression fixture for wide multi-line description continuation.
- Migration remains shadow-only at this point; legacy comparison is retained as audit evidence while the final promotion authority is defined separately.


### Foundation 5.2 final — canonical-evidence promotion authority (v15)

Generic invoice readiness is no longer vetoed by disagreement with the legacy extractor. Real DIGITAL and SCANNED fixtures showed that legacy output can contain row leakage and misclassified product-code fragments, so legacy cannot be treated as ground truth.

Rules:
- `genericCandidateAudit.migration` still records `AGREE`, `EQUIVALENT`, `GENERIC_ONLY`, `LEGACY_ONLY`, and `CONFLICT`; these are migration/audit telemetry and are not discarded.
- `promotable` is controlled by the generic result's own canonical-evidence validation, not by legacy equality.
- Evidence validation now requires every discovered goods row to provide `hsCode`, `productCode`, `description`, `quantity`, `unit`, `unitPrice`, and `lineTotal`, with canonical page/bbox/text provenance and arithmetic consistency.
- A document with no generic goods rows is never promotable.
- Legacy conflicts remain visible even when the generic result is `READY`; they are useful for migration review but cannot force the new extractor to reproduce legacy mistakes.
- The production resolver is still unchanged by this audit object; actual review/promotion workflow is handled in the following foundation work.
- Supplier/country-specific description blacklists are removed from generic discovery. Structural filtering is based on document-local geometry plus generic currency/delivery/transport vocabulary.
- Extractor revision: `invoice-generic-layout-v15`.

This closes the legacy-as-authority migration design. Human-review routing remains the next stage before generic extraction can replace the legacy production source.

## Foundation 5.3 — Human Review Pipeline (API foundation)

Human review is an explicit, tenant-scoped and append-only audit layer. A review case is derived from immutable `ProcessingRun` evidence rather than copying or mutating extraction output. It exposes resolver issues, deterministic validation issues, and generic canonical-evidence issues together with the candidate IDs and evidence available for that issue.

Review decisions are stored separately in `HumanReviewDecision`; the original `ProcessingRun`, candidates, canonical evidence and prior decisions are never overwritten. `ACCEPT_CANDIDATE` is constrained to candidate IDs already attached to the issue and copies the stored candidate value/evidence. `OVERRIDE_VALUE` and `CONFIRM_VALUE` record the human-provided value together with actor, timestamp, field/row and evidence snapshot. Applying these decisions to business data is deliberately deferred to the NormalizedDeclaration stage so review cannot silently rewrite extraction history.

Declaration-scoped API:
- `GET /api/declarations/:id/idp-reviews/:runId`
- `GET /api/declarations/:id/idp-reviews/:runId/decisions`
- `POST /api/declarations/:id/idp-reviews/:runId/decisions`

Foundation 5.3 does not treat legacy/generic migration conflicts as review issues by themselves: after Foundation 5.2, legacy is audit telemetry, while canonical evidence validation is the promotion authority.

## Foundation 5.4 — NormalizedDeclaration promotion

Invoice goods lines now enter `NormalizedDeclaration` from the canonical generic candidate path instead of treating legacy extraction as ground truth. Generic candidate evidence remains immutable; the effective value layer overlays the latest append-only Human Review decision for a field when one exists. Pending review issues block normalization with HTTP 409, unresolved multi-value fields fail closed, and effective quantity/unit-price/line-total arithmetic is revalidated after review overrides.

Product-code namespace suffixes remain candidate alternatives, while the observed non-derived canonical token is the deterministic effective value unless Human Review explicitly selects or overrides it. `productCode` is now part of the normalized goods-line contract and declaration schema. Source trace entries for promoted fields preserve candidate/evidence or Human Review provenance plus processing-run and uploaded-file identity. Multiple invoice files are appended deterministically into declaration goods lines instead of silently allowing the last invoice to overwrite earlier rows.

Legacy extracted data is still used for document/header fields that have not yet migrated to generic IDP discovery; this milestone promotes the invoice goods-line domain only. ProcessingRun, canonical evidence, candidates, migration audit, and HumanReviewDecision history remain immutable inputs to normalization.

## Foundation 5.5A — Invoice shipment/package enrichment

Canonical invoice evidence now also discovers declaration-level package metadata independently from legacy parsing: `packageInfo.packageType`, `packageInfo.totalPackage`, `packageInfo.grossKg`, and `packageInfo.netKg`. Package type is read from the semantic **Eşya Kap Cinsi** table column; totals/weights are read from labeled canonical evidence. Values retain page/bbox/text provenance and normalization fails closed on ambiguous/invalid effective values. Existing completed runs can derive these document-level candidates from their persisted canonical document, so OCR/extraction is not rerun. Future runs persist the shipment candidate envelope alongside the generic goods candidate audit. Regression fixtures: VED2026000000146 → `Bin / 2 / 554 / 530`; VED2026000000110 → `Bin / 1 / 162 / 147`.

## Foundation 5.5B — Export Declaration Contract

A format-neutral `ExportDeclarationContract` now separates normalized IDP/business data from downstream customs-software adapters. The contract consumes `NormalizedDeclaration` plus explicit master-data/human supplements and never invents missing customs values. Core package metadata and goods-line fields fail closed through structured readiness issues. Optional customs fields (regime, customs office, exemptions, permits, ÜTS, brand, etc.) remain explicit supplements until their authoritative source and target requirement are configured.

Evrim-specific column names, XML tags and code translations are deliberately excluded from this layer. For example, a canonical invoice value such as `packageType = Bin` remains `Bin` in the contract; an Evrim-specific code such as `BI` may only be introduced by a verified Evrim adapter. This keeps IDP and normalized data reusable for other customs systems and prevents output-format assumptions from leaking into extraction.

## Foundation 5.5C — Evrim Excel Adapter

The first concrete customs-software adapter now consumes `ExportDeclarationContract` and emits the verified two-sheet Evrim workbook shape supplied in `CHROMYSSTEMS(2).xlsx`. `Sayfa1` preserves the 24-column order exactly (including the two distinct `SİPARİŞ NO` columns); `Sayfa2` emits the `SATIR / PART / ÜTS KAYDI` lookup table. Core normalized mappings are deterministic: product code → `MODEL`, quantity → `MİKTAR`, line total → `KIYMET`, HS code → `GTİP`, invoice description → `MAL KODU`, declaration package count → `KAP ADETİ`, invoice/delivery metadata → their corresponding columns.

Evrim-specific code translation is isolated in the adapter. The supplied workbook proves canonical package type `Bin` is represented as `BI`, so that mapping is implemented there; common piece units (`Adet`/`PCS`) are emitted as `ADET`. No unverified country/origin, exemption, permit, ÜTS, manufacturer, used-goods, order or discount code is invented. Those values can only enter through explicit adapter line overrides / already-authoritative contract fields and otherwise remain blank. Unknown package/unit values are passed through rather than guessed. The regression exports both real normalized fixtures (56 and 41 lines), round-trips the generated workbooks, verifies the exact 24-column header and two-sheet shape, and separately verifies explicit customs/master-data overrides.

## Foundation 5.5D — Production Evrim Excel Export API

The verified 5.5C adapter is now exposed through the authenticated, tenant-scoped declaration API.

- `POST /api/declarations/:id/exports/evrim-excel`
- Pipeline: Declaration -> NormalizedDeclaration -> ExportDeclarationContract -> readiness gate -> Evrim XLSX.
- The endpoint never emits a partial workbook. Missing required contract fields return HTTP `409` with `code: EXPORT_NOT_READY` and structured `issues`.
- Optional request body accepts `supplements` (format-neutral master/human customs data) and `lineOverrides` (Evrim-Excel-specific columns).
- Successful responses use the XLSX MIME type, attachment filename `<invoiceNo>-evrim.xlsx`, and `X-Export-Row-Count`.
- Tenant/declaration isolation is enforced by querying with both declaration id and `operationalCompanyId`.
- The old draft XML route remains separate and is not treated as a verified Evrim XML implementation.

Regression: `backend/scripts/declaration-exports/verifyEvrimExcelExportService.ts` verifies both real declarations (56 + 41 rows), workbook sheet structure, and fail-closed behavior.

## Foundation 5.5E.1 — Unsigned UBL-TR IHRACAT commercial XML adapter

The supplied real export e-Invoice XML examples establish a UBL 2.1 / TR1.2 / `IHRACAT` commercial structure, including invoice identity/currency, parties, invoice lines, INCOTERMS delivery terms, `RequiredCustomsID` (GTIP), `TransportModeCode`, quantities and prices. A new `ubl-ihracat` adapter maps the format-neutral `ExportDeclarationContract` into that commercial XML boundary.

This milestone is deliberately **unsigned**. It never copies or synthesizes `ds:Signature`, XAdES `SignedProperties`, `SignatureValue`, `DigestValue`, X509 certificate material or embedded XSLT from historical invoices. UUID is an explicit per-document input and invalid/missing UUID fails closed. Signing/mali-mühür integration is a separate future boundary. The old `urn:evrim:draft` generator remains legacy and is not treated as this adapter or as a verified Evrim XML import format.

Verified mappings in this adapter include `UBLVersionID=2.1`, `CustomizationID=TR1.2`, `ProfileID=IHRACAT`, INCOTERMS delivery terms, GTIP -> `RequiredCustomsID`, road transport -> `TransportModeCode=3`, and piece units (`Adet`/`PCS`) -> `C62`. Unknown transport/unit codes fail closed instead of being guessed. Regression runs against the two real normalized declarations (56 + 41 lines) and asserts that no signature/certificate/XSLT material is emitted.

## Foundation 5.5A.2 — Generic Invoice Header & Party Enrichment
- Canonical-evidence discovery for `header.invoiceNo`, `header.invoiceDate`, `parties.seller.name`, and `parties.buyer.name`.
- No supplier-specific rules and no legacy `extractedData` promotion for these fields.
- New runs persist `headerPartyCandidates`; older completed runs derive them from the persisted CanonicalDocument without rerunning OCR.
- Normalization uses the same fail-closed candidate/human-review overlay semantics as goods and shipment fields.
- This closes the required header/party gap discovered by the unsigned UBL-IHRACAT regression before XML export is allowed to proceed.


### Foundation 5.6B.1 — Evrim authority matrix + format code-table boundary

The exact 24-column Evrim workbook surface is now classified by authority: canonical invoice evidence, customs master data, explicit human input, output-format mapping, or deliberately unresolved. Unproven fields remain unresolved rather than being guessed.

Verified output translations (`Bin -> BI`, `PCS/Adet -> ADET`) were moved out of the Excel adapter into `export-code-tables`. This removes duplicated format knowledge from the adapter and establishes the boundary for future verified code lists. Customs/business values remain in master data; invoice facts remain in NormalizedDeclaration.


### Foundation 5.6B.2 — Customs master-data integrity

Customer-scoped customs profiles now have referential integrity: `customerId` must be a real customer belonging to the same tenant. HS/GTİP profile keys are canonicalized to the project's 12-digit representation (dotted/space-separated input is accepted, non-numeric or wrong-length input is rejected). Product keys remain opaque supplier/business identifiers and are only trimmed; no unproven case conversion is applied.

Deleting a customer now also deletes that customer's customs master-data records, preventing orphan profiles. Scope-aware list filtering applies the same HS key canonicalization used at write time.


### Foundation 5.6B.3 — Effective customs profile preview

`GET /api/customs-master-data/effective` exposes the effective declaration/line customs profile for a `customerId + productCode/hsCode` lookup before an export is generated. The endpoint calls the same production master-data resolver used by exports, so precedence is not duplicated. It returns both effective values and the winning `MASTER_DATA` provenance entry per field.

Inactive records are excluded by the shared resolver, HS lookup input is canonicalized with the same 12-digit rule used at write time, and customer references remain tenant-scoped.


### Foundation 5.6B — COMPLETE

Foundation 5.6B is closed with all regression gates passing together:

- Exact 24-column Evrim authority inventory is enforced in code; unproven customs semantics remain fail-closed.
- Verified Evrim output mappings are isolated under `export-code-tables`, separate from invoice evidence and tenant master data.
- Customer-scoped master data has tenant referential integrity and customer-delete cascade cleanup.
- HS/GTİP keys use one canonical 12-digit representation while product keys remain opaque business identifiers.
- The effective-profile API reuses the production resolver and exposes field-level winning master-data provenance.
- Active/inactive fallback follows the production precedence chain.
- Real 0146 production export still produces 56 rows and verifies `HUMAN_INPUT > MASTER_DATA > NORMALIZED_DECLARATION`.

Closing regression set:
`verifyEvrimAuthorityMatrix.ts`,
`verifyCustomsMasterDataIntegrity.ts`,
`verifyCustomsMasterDataEffectivePreview.ts`,
`verifyCustomsMasterDataEvrimExport.ts`.


### Foundation 5.6C.1 — Persistent append-only human customs supplements

Human customs input is now a separate audited domain from IDP Human Review. Declaration-scoped decisions are append-only `SET`/`CLEAR` events with tenant/declaration boundaries, optional actor/reason metadata, and a deterministic latest-decision projection.

Supported persistent fields are limited to the format-neutral Export Contract supplement surface: declaration fields (`declarationType`, `exportType`, `customsOffice`, `regimeCode`, `fileReference`, `declarationDate`) and proven line fields (`origin`, `brand`, `exemptionCode`, `permitCode`, `utsNo`, `usedFlag`). Unresolved Evrim-only semantics remain rejected.

5.6C.1 deliberately establishes persistence/audit only. Automatic export consumption is the next gate, so persistence can be proven independently before changing production export precedence.


### Foundation 5.6C.2 — Persistent human supplements in production exports

Both production export boundaries (Evrim Excel and unsigned UBL-TR IHRACAT) now consume the declaration's persisted human customs supplement projection before applying any explicit request-time supplements.

Effective precedence is:

`REQUEST_HUMAN > PERSISTENT_HUMAN > MASTER_DATA > NORMALIZED_DECLARATION`

`CLEAR` removes the persistent override for that field and therefore reveals the next lower authority (for example master data); it does not erase canonical/master data itself. The production export regression proves this on the real 0146 declaration / 56-line Evrim workbook.


### Foundation 5.6C.3 — Immutable export audit snapshot

Every successful production Evrim Excel or unsigned UBL export now records an immutable audit snapshot. The snapshot freezes the normalized declaration, resolved master-data supplements and trace, persistent human projection, request-time human overrides, final effective supplements, final format-neutral export contract, output metadata, and SHA-256 of the exact emitted file bytes.

Failed/not-ready exports do not create a successful export snapshot. Snapshot documents are append-only/immutable; later changes to master data or human decisions cannot rewrite the historical basis of an already emitted export.


### Foundation 5.7A — Human Review UI foundation

The existing IDP Human Review backend is now exposed to the React/Vite workflow without mixing document interpretation with customs enrichment.

- `GET /api/declarations/:id/idp-reviews/latest` resolves the latest tenant-scoped ProcessingRun for a declaration; the UI never guesses run IDs.
- Evrak Hazırlık has a `Belge İncelemesi` tab for live Mongo-backed declarations.
- Pending issues show source, field/line, canonical candidates, confidence, extractor and page/text evidence.
- Operators can append `ACCEPT_CANDIDATE` or `OVERRIDE_VALUE` decisions through the existing append-only Human Review API.
- Already-decided issues remain visible as audit history and are not silently overwritten by the UI.
- IDP review is explicitly separated from customs/master-data decisions: this screen answers “what did the document say?”
- Mock/demo Evrak Hazırlık records remain functional; they display a non-live notice rather than calling IDP APIs with fake IDs.

5.7A intentionally does not add PDF bbox highlighting yet. Evidence page/text is surfaced first against the proven backend contract; visual bbox preview is a separate UI gate.


### Foundation 5.7B — Declaration workflow integration

Human Review is now attached to the existing declaration workflow rather than behaving like an isolated route.

- Dosya Takip opens Evrak Hazırlık with the stable Mongo `declarationId` plus the human-readable ref.
- Evrak Hazırlık resolves route context by declaration ID first and keeps the selected declaration in the URL.
- `Eksik Evrakla Yaz` and `Beyanname Yazmaya Başla` now navigate to the existing Beyanname Yazım & MT Kontrol screen for the same declaration.
- Beyanname Yazım consumes `declarationId/ref/tab` route context and opens the matching live declaration directly instead of defaulting to the first row.
- The declaration detail can navigate back to Evrak Hazırlık while preserving the same declaration context.
- Evrak Hazırlık now uses the existing Beyanname capabilities through `ProtectedRoute`.
- Live empty document/declaration results are no longer silently replaced by demo Evrak records; demo fallback remains only when the live API itself is unavailable.
- Evrak summary cards are derived from the currently selected declaration's actual document/conflict rows instead of the old global mock statistics.

Workflow:
`Dosya Takip -> Evrak Hazırlık -> Belge İncelemesi -> Beyanname Yazım -> MT Kontrol`.


### Foundation 5.7C — Shared real document evidence viewer

- Tenant/declaration/document-scoped real document content and PDF page-image endpoints.
- Reusable `DocumentEvidenceViewer` backed by persisted canonical evidence.
- Canonical bbox contract aligned as normalized `{x0,y0,x1,y1}` end-to-end.
- Human Review `Belgede Göster` opens the exact uploaded file/page and overlays its bbox.
- Derived evidence is not falsely presented as a physical PDF box.
- Viewer is explicitly keyed by `uploadedFileId`, so one declaration may contain many PDFs without ambiguity.
- MT Kontrol will reuse this viewer after its current mock mapping layer is replaced with production contract provenance.


#### 5.7C runtime regression

Run inside the backend container so the test uses the same mounted storage and service DNS as production-like dev:

`docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyDocumentEvidenceViewer.ts`

The regression verifies the known real 0110 UploadedFile end-to-end: authenticated PDF bytes, page-1 PNG rendering, PDF/PNG signatures and SHA-256 values, cross-declaration isolation (`404`), and unknown-document rejection (`404`). It does not create or mutate production data.


##### 5.7C renderer binary-channel hardening

PDF page rendering writes the PNG to an isolated temporary file instead of streaming binary bytes through Python stdout. This prevents runtime/library warning text from corrupting the PNG response. The backend validates the output size and PNG signature, reads the file, and removes the temporary file in `finally`.


### Foundation 5.7D — MT Control production provenance projection

Added tenant-scoped `GET /api/declarations/:id/control-provenance`. The projection is built from the same production inputs used by export:
NormalizedDeclaration → Customs Master Data → Persistent Human Customs Supplement → ExportDeclarationContract.

Each effective field reports authority as `NORMALIZED_DECLARATION`, `MASTER_DATA`, or `PERSISTENT_HUMAN`. Normalized document-backed fields are linked to persisted ProcessingRun evidence (`uploadedFileId`, page, bbox, text); master-data and human authorities are represented as records rather than fake PDF evidence. This is the production boundary that will replace the old MT mock mapping layer.


#### 5.7D MT Control UI production provenance integration

`Beyanname Yazım > MT Kontrol` no longer uses `PAGE_IMAGES` or `MtKontrolMapping` as its active control data source. It loads the tenant-scoped production control-provenance projection for the selected declaration. The field list displays the effective contract value and its actual authority.

- `NORMALIZED_DECLARATION`: persisted document evidence is shown only when a real ProcessingRun evidence record exists; `DocumentEvidenceViewer` opens the exact `uploadedFileId`, page and bbox.
- `MASTER_DATA`: rule scope/key/id are displayed; no fake PDF evidence is created.
- `PERSISTENT_HUMAN`: append-only human decision metadata is displayed; no fake PDF evidence is created.
- Missing physical evidence remains explicit instead of being synthesized.
- The declaration preview modal may still use static declaration form images; those images are presentation-only and are no longer the MT provenance source.
- The provenance integration regression now waits for backend readiness to avoid the post-rebuild startup race observed in Compose.


#### 5.7D shared side-by-side document analysis

`DocumentEvidenceViewer` now has a production side-by-side analysis view. The left pane renders the untouched physical PDF page. The right pane renders the same page with all persisted, non-derived IDP evidence boxes from the latest completed ProcessingRun for the exact `uploadedFileId` and page; the currently selected field is emphasized separately.

The aggregate evidence endpoint is `GET /api/declarations/:id/documents/:documentId/pages/:pageNumber/evidence`. It reuses the same tenant/declaration/document authorization boundary as PDF content rendering and never merges evidence across physical files. This preserves multi-PDF declarations. No annotated derivative PDF is stored; overlays are rendered from persisted normalized bboxes at view time.


##### 5.7D viewer UX refinement

The shared viewer now has two explicit purposes instead of showing every persisted bbox for every field click:

- **Belge Parse Karşılaştır**: document-level overview. Original page is shown beside the same page with all persisted IDP evidence boxes.
- **Belgede Göster** on a selected MT field: field-level verification. Original page is shown beside only the selected field bbox, matching the earlier focused evidence behavior.

This avoids visual overload during normal MT field review while preserving a one-click full parse overview. Missing boxes in the full overview remain an extraction/provenance concern; the UI does not invent boxes for values that do not have persisted physical evidence.


##### 5.7D physical evidence coverage diagnostic

Before closing MT provenance, run:

`docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyDeclarationEvidenceCoverage.ts`

The report measures only effective fields whose authority is `NORMALIZED_DECLARATION`. `MASTER_DATA` and `PERSISTENT_HUMAN` are intentionally excluded from physical-PDF bbox coverage. The diagnostic does not invent evidence and does not require an arbitrary 100% result: missing rows must first be classified as legitimately derived/non-physical or as real extraction/provenance gaps before changing production extraction.


##### 5.7D legacy-run provenance reconstruction

The 0110 coverage diagnostic initially reported 287/336 (85.42%) with exactly 49 missing fields: 4 invoice header/commercial fields, 4 shipment fields, and 41 row origins. This was not an extraction failure. Those values were introduced by Foundation 5.5A, while the historical completed ProcessingRun predates persistence of the corresponding enrichment envelopes. Declaration normalization already reconstructs these candidates from the persisted CanonicalDocument.

MT provenance now applies the same canonical-only reconstruction for missing `headerPartyCandidates`, `commercialTermsCandidates`, `shipmentCandidates`, and `originCandidates`. It does not rerun OCR and does not synthesize evidence. The known 0110 regression now requires every effective `NORMALIZED_DECLARATION` field in this fixture to retain physical page+bbox evidence.


##### 5.7D synchronized evidence comparison

The original and parsed panes now synchronize vertical and horizontal scroll positions proportionally in both directions. Because both panes render the same physical PDF page, this keeps corresponding source locations aligned during visual comparison without changing evidence/provenance semantics.

##### 5.7E MT persistent manual customs decision

MT Control `Manuel Düzelt` is now wired to the existing append-only Customs Supplement API. Only fields allowed by the production supplement boundary are editable: declaration customs fields and line `origin`, `brand`, `exemptionCode`, `permitCode`, `utsNo`, `usedFlag`. Invoice/package/document-truth fields and non-supplement line fields remain non-editable in MT; IDP evidence is never mutated.

After a SET decision the control projection refreshes and reports `PERSISTENT_HUMAN`. A later CLEAR decision restores the lower-precedence source (master data or normalized document evidence) without mutating history. Regression: `docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/customs-master-data/verifyMtManualCustomsDecision.ts`.


#### 5.7E MT persistent manual customs decisions — closeout

MT Control exposes append-only customs decision history for the selected supplement-capable field: SET/CLEAR action, value, actor email, reason and timestamp. An active `PERSISTENT_HUMAN` decision can be removed by appending `CLEAR`, restoring the underlying authority without deleting history.

The 5.7E integration regression waits for backend readiness to avoid the Compose post-rebuild `ECONNREFUSED` startup race.

5.7E cleanup boundary at the time: `Beyanname Onay` still depended on the legacy MT mapping path. That dependency was subsequently removed in 5.7F; see the 5.7F closeout below.


### Foundation 5.7F — Beyanname Onay production provenance + legacy MT cleanup

`Beyanname Onay` no longer consumes `MtKontrolMapping`, `getMtKontrolMappings()` or the static MT declaration-image mapping path. The approval detail loads the same tenant-scoped `/api/declarations/:id/control-provenance` projection used by production MT Control and displays the effective value together with its real authority (`NORMALIZED_DECLARATION`, `MASTER_DATA`, `PERSISTENT_HUMAN`).

Document-backed fields open the shared `DocumentEvidenceViewer` against the exact `uploadedFileId`, page and persisted bbox. Master-data and persistent-human authorities are shown as non-document provenance and no fake PDF evidence is synthesized.

Cleanup performed in 5.7F:
- removed `MtKontrolMapping`, `MtKontrolStatus` and `MtKontrolSourceType`;
- removed `beyannameService.getMtKontrolMappings()`;
- removed Beyanname Onay's dependency on `PAGE_IMAGES`;
- removed the mock declaration-region/source-document mapping UI.

`PAGE_IMAGES` itself is intentionally retained because `Beyanname Yazım` still uses it only for its separate declaration-form preview presentation. It is no longer an MT/approval provenance source.


### Foundation 5.7 final closeout

5.7A–5.7F now share the same production chain: document truth is reviewed in Evrak Hazırlık, customs truth is projected in MT Control, persistent customs decisions are append-only, and Beyanname Onay consumes the same effective production provenance.

Final hardening:
- `/api/declarations/:id/control-provenance` requires a Beyanname capability;
- declaration document/evidence endpoints use read/write capability boundaries;
- IDP Human Review GET/POST uses read/write capability boundaries;
- Persistent Customs Supplement GET/POST uses read/write capability boundaries;
- `/beyanname/onay` is protected by `beyanname.approve`;
- `verifyFoundation57Closeout.ts` validates the real 0110 declaration, 336 effective fields, physical provenance for every normalized-authority field, exact uploaded-file access, cross-declaration rejection, Human Review access and supplement history access.

Generated `frontend/dist` is not an application source of truth and is excluded from legacy-source checks. `PAGE_IMAGES` remains only for the separate declaration-form preview presentation; it is not used as MT/approval provenance.


### Foundation 5.8A — Persistent approval workflow

Beyanname Onay no longer stores approval outcome, approval step or approval note in React-local maps. Approval state is persisted on the declaration as `approvalWorkflow`, including status, second-approval requirement, note, append-only transition history, actor user id and timestamp.

Production transition endpoint:
`POST /api/declarations/:id/approval-workflow/transition`

Supported actions:
- `SET_SECOND_APPROVAL_REQUIRED`
- `SAVE_NOTE`
- `APPROVE`
- `RETURN_TO_MT`

The backend owns transition validity. First approval advances to `SECOND_PENDING` only when the persisted `requiresSecondApproval` flag is true; otherwise it reaches `APPROVED`. Final approval persists `operation.fileStatus=tescil`; return persists `operation.fileStatus=ic-kontrol`. Invalid transitions fail closed with HTTP 409.

The old mock rule that alternated second-approval requirement by record index and the page-local `approvalOutcomes`, `approvalSteps`, `approvalNotes` maps were removed.


### Foundation 5.8B — Evrak Hazırlık → Beyanname Yazım persistent transition

`Beyanname Yazmaya Başla` now calls a backend-owned preparation workflow transition before navigation. The backend uses the same current live readiness boundary as Evrak Hazırlık: at least one uploaded file must exist and every uploaded file must have `extractionStatus=SUCCESS`.

Normal start fails closed with HTTP 409 when readiness is false. `Eksik Evrakla Yaz` is an explicit override and requires a non-empty reason. Both paths persist `operation.fileStatus=beyanname-yazim` and append actor/time/from/to/action/override/reason to `operation.workflowHistory`.

Production endpoint:
`POST /api/declarations/:id/preparation-workflow/transition`

The UI no longer treats navigation itself as a workflow transition. Override reason is collected in a modal and persisted before navigation.


### Foundation 5.8C — Beyanname Yazım → MT Kontrol → Onay handoff

The writing/control page no longer advances workflow with tab state or toast-only actions.

Production endpoint:
`POST /api/declarations/:id/writing-workflow/transition`

Actions:
- `SUBMIT_TO_MT`: requires `operation.fileStatus=beyanname-yazim`, persists `ic-kontrol`.
- `APPROVE_MT`: requires `operation.fileStatus=ic-kontrol`, persists declaration `status=READY` and initializes/reopens approval at `FIRST_PENDING`.

Invalid order and duplicate submissions fail closed with HTTP 409. A declaration returned from approval (`RETURNED`) may be resubmitted by MT; this appends `RESUBMIT_FROM_MT` to approval history instead of deleting prior approval history.

The UI cannot enter the MT tab merely by changing React tab state before the backend stage reaches `ic-kontrol`. `Kontrolü Onayla` now persists the MT→approval handoff and navigates to Beyanname Onay only after backend success.


### Foundation 5.8D — Approval separation, history and Tescil handoff

Second approval now enforces four-eyes separation. When a declaration requires a second approval, the user who produced the `FIRST_PENDING → SECOND_PENDING` approval cannot also produce the `SECOND_PENDING → APPROVED` approval. The backend rejects same-actor second approval with HTTP 409.

Final approval remains the only approval transition that persists `operation.fileStatus=tescil`. Return from either pending approval stage persists `approvalWorkflow.status=RETURNED` and `operation.fileStatus=ic-kontrol`; 5.8C then owns resubmission from MT without deleting prior approval history.

Beyanname Onay now renders the persisted approval transition history instead of presenting approval as page-local state. Transition failures are handled in the UI, including a specific message for the distinct-second-approver rule.

The system does not invent a business rule for when second approval is required. `requiresSecondApproval` remains an explicit persisted workflow setting until a real company approval policy/rule source is defined.


### Foundation 5.8E — Persistent registration workflow

Beyanname Tescil no longer invents a default Mavi line, a started registration state, a fake external-system refresh, or a fake customer-notification success.

Production endpoint:
`POST /api/declarations/:id/registration-workflow/transition`

Actions:
- `RECORD_REGISTRATION_STARTED`: only from `operation.fileStatus=tescil`; requires an explicit registration number and one of the supported customs line values. Persists `tescilStatus=started`.
- `COMPLETE_REGISTRATION`: requires a persisted started registration; persists `tescilStatus=completed`, second-notification state, and hands the operation to `fileStatus=kapanis-bekleyen` / `kapanisStatus=kontrol-bekliyor`.

Both transitions append to operation workflow history. Invalid order and duplicate start fail closed.

Until the real Evrim/customs callback/import contract is available, the UI labels these actions as manual notification capture. It must not claim that a customs API call or customer notification occurred when no such integration exists.


### Foundation 5.8F — Persistent closure + full declaration workflow E2E

The terminal operation state `kapandi` is now a backend-supported file status. Closing is a persisted workflow transition, not a page-local toast:

`POST /api/declarations/:id/closure-workflow/transition`
with `CLOSE_FILE`.

The backend only closes a tenant-scoped declaration that is in `kapanis-bekleyen` and has `tescilStatus=completed`. Closing persists `kapanisStatus=kapandi`, `fileStatus=kapandi`, archive state, close timestamp, last activity, and an append-only operation workflow entry. No document/cost readiness rule is invented while those company-specific sources are not yet implemented.

The closing approval UI now invokes this production transition. Fake local close/return decisions were removed from the approval surface.

The final Foundation 5.8 regression creates one temporary declaration with two distinct physical UploadedFiles (`INVOICE` and `PACKING_LIST`) and proves the complete persistent chain:
`evrak-bekleniyor → beyanname-yazim → ic-kontrol → approval → tescil → kapanis-bekleyen → kapandi`.
Both physical files remain independently associated with the same declaration throughout the test. Test records/files are deleted afterward.


### Foundation 6.1 — Logical-document materialization

A physical `UploadedFile` is no longer permanently treated as one semantic document. After deterministic segmentation and classification, the worker materializes one `LogicalDocument` per classified page range. Supported semantic types now include Invoice, Packing List, ATR, EUR.1, Certificate of Origin, Bill of Lading and CMR; unclassified ranges persist as `OTHER` rather than being guessed.

Each logical document persists exact physical-file identity, page range, deterministic confidence/evidence and the source ProcessingRun. The upload-time logical record remains only a provisional `UPLOAD_DECLARED` placeholder and is replaced by materialized ranges after classification. This establishes the multi-document boundary without yet inventing field-authority rules for customs documents; those belong to subsequent Foundation 6 steps.

Foundation 5.8 cleanup in the same patch removes the accidental list-item approval-history field, replaces browser prompts on registration with a typed modal/line selector, and removes wording that falsely implied an external customs/customer-notification API.


### Foundation 6.2 — Declaration document set + explicit cross-document authority

Declaration-level document roles can now be represented together and field conflicts are resolved only by consensus or an explicitly configured authority rule. Conflicting values without a rule, and conflicts inside the same authority tier, fail closed to review. No document type receives silent precedence.


### Foundation 6.3 — Persisted declaration document set

The declaration document set is now built from persisted `LogicalDocument` records under strict `companyId + declarationId` scope. Physical-file/page-range integrity is validated, source ProcessingRun provenance is retained, and overlapping logical-document ranges are rejected rather than silently accepted.


### Foundation 6.4 — Declaration-wide field candidate projection

Field candidates can now be projected from physical-file processing output onto the persisted logical-document boundary using their evidence page numbers. The declaration-wide candidate retains logical document id, physical UploadedFile id, semantic document type, source ProcessingRun id and original evidence.

The projection fails closed when a source file is not part of the declaration or when a candidate's evidence crosses logical-document ranges. It never assigns a candidate to the first logical document merely because it belongs to the same physical file. This establishes the provenance-safe bridge required before persisted cross-document field resolution is wired into the production pipeline.


### Foundation 6.5 — Provenance-safe declaration field resolution

The declaration-wide candidate envelope from Foundation 6.4 now feeds the explicit cross-document resolver introduced in Foundation 6.2. Resolution is performed per field and returns the complete selected declaration candidate, not only its scalar value, so logical-document id, physical UploadedFile id, source ProcessingRun and evidence remain traceable after resolution.

Consensus resolves equal values across documents. Conflicting values resolve only when an explicit field authority rule is supplied; otherwise the field is collected in `reviewRequiredFields`. A configured authority result still retains the conflicting candidates for audit/review context. Duplicate authority rules and duplicate candidate ids fail closed. No confidence score or document order creates implicit authority.


### Foundation 6.6 — Persisted declaration field resolution audit boundary

Declaration-wide resolution is now persistable instead of being an in-memory-only result. Each successful resolution creates an append-only `DeclarationFieldResolutionRun` containing the complete candidate/evidence envelope, the explicit authority rules used, the resulting per-field resolution and the contributing ProcessingRun ids. This preserves the explanation chain from a declaration value back to logical document, physical file, ProcessingRun and evidence.

The declaration stores only the current resolution snapshot/pointer (`idpResolution`) for operational reads, while the resolution-run collection remains the audit source. `REVIEW_REQUIRED` fields are persisted explicitly and are not promoted into a silent winner. Writes are tenant/declaration scoped and candidate-envelope scope mismatches fail before an audit record is created.

Foundation 6.6 acceptance includes the persisted-resolution verification plus backend and frontend TypeScript checks.


### Foundation 6.7 — RESOLVED-only normalized declaration promotion

The current persisted declaration-field resolution can now be promoted into `normalizedData` through an explicit field-to-target mapping. Promotion accepts only the declaration's current tenant-scoped `DeclarationFieldResolutionRun`; stale or foreign runs fail closed.

Only fields with `status=RESOLVED` and an intact selected-candidate provenance chain may write a normalized declaration value. `REVIEW_REQUIRED` fields never receive an automatic winner and do not overwrite an existing normalized/manual value or its trace. Resolved fields without an explicit normalized target mapping are reported as unmapped rather than written to an invented location.

Every promoted `sourceTrace` entry records the immutable resolution-run id, resolution method, selected candidate id, logical-document id, physical UploadedFile id, source ProcessingRun id and evidence. This makes the operational normalized value traceable back through the Foundation 6 audit chain without replacing the append-only resolution run as the audit source.

Foundation 6.7 acceptance includes the resolved-only promotion verification plus backend and frontend TypeScript checks.

### Foundation 6.8 — Production declaration-field orchestration boundary

Foundation 6.8 composes the persisted logical-document set, integrity validation, declaration candidate projection, cross-document resolution audit persistence and RESOLVED-only promotion behind one production-facing orchestration service. Invalid document-set integrity stops the pipeline before an audit run or normalized write is created.

Each orchestration input receives a deterministic SHA-256 key derived from declaration scope, persisted logical-document boundaries, source candidate envelopes and explicit authority rules. An exact retry reuses the current immutable resolution run instead of creating duplicate audit history. If newer input has already produced a newer current run, replaying an older orchestration is rejected rather than rolling the declaration back to stale values.

Foundation 6.8 acceptance includes backend/frontend TypeScript checks and `verifyDeclarationFieldOrchestration.ts`. The verification proves exact-retry idempotency, changed-input new-run behavior, stale-replay rejection, invalid-document-set fail-closed behavior, REVIEW_REQUIRED non-promotion and preservation of the Foundation 6 provenance chain.

### Foundation 6.9 — Processing lifecycle readiness bridge

Foundation 6.9 connects the declaration-wide Foundation 6.8 orchestration boundary to the real IDP worker completion lifecycle. After a physical-file ProcessingRun is durably completed, the worker evaluates declaration readiness from persisted LogicalDocuments and their exact source ProcessingRuns rather than assuming that one completed upload means the declaration is ready.

Declaration orchestration runs only when every persisted logical document has ProcessingRun provenance, every referenced run belongs to the same tenant/declaration, every referenced run is `COMPLETED`, and every run has a persisted field-candidate envelope. Incomplete declarations return `NOT_READY`; a failed contributing run returns `BLOCKED` and cannot produce a resolution audit run or normalized promotion. Exact duplicate completion remains safe through the Foundation 6.8 orchestration key/idempotency boundary.

The lifecycle hook is intentionally isolated from the already-durable per-file completion: an orchestration exception is logged and fails closed at declaration level without rewriting a successfully completed extraction run to `FAILED`.

Foundation 6.9 acceptance includes backend/frontend TypeScript checks and `verifyDeclarationFieldLifecycle.ts`, covering incomplete-run gating, failed-run blocking, successful all-runs-ready orchestration, duplicate-completion idempotency, REVIEW_REQUIRED non-promotion and provenance preservation.

### Foundation 6.10 — ProcessingRun-owned declaration candidate snapshot

Foundation 6.10 separates extractor audit output from the declaration-facing field-candidate contract. The worker keeps the segment-level `CandidateExtractionEnvelope` in `ProcessingRun.candidates`, while evidence-backed `fieldCandidates` are deterministically flattened into `ProcessingRun.declarationCandidates`. Declaration lifecycle orchestration consumes only this explicit snapshot boundary; it never interprets the extractor envelope as declaration candidates.

The snapshot is owned by the exact ProcessingRun referenced by each persisted LogicalDocument. Reprocessing can therefore leave older ProcessingRuns and their candidate snapshots available for audit without allowing stale candidates to participate in a newer declaration resolution. If the active run has no valid declaration candidate snapshot, orchestration returns `CANDIDATES_NOT_READY` and creates no new resolution audit record.

Foundation 6.10 acceptance includes backend/frontend TypeScript checks and `verifyProcessingRunCandidatePersistence.ts`, proving segment-candidate flattening, active-run authority, stale-run exclusion, raw-envelope non-consumption, missing-snapshot gating and ProcessingRun provenance preservation.

### Foundation 6.11 — Worker candidate persistence → lifecycle integration

The production worker and the integration verification now share `persistWorkerCandidateExtraction`, the same write boundary for the segment-level extractor audit envelope and the flattened declaration-facing candidate snapshot. Snapshot validation/flattening runs before either Mixed field is modified. The integration verification persists both through this exact boundary, gates orchestration while the active run is PROCESSING, completes it, verifies declaration promotion and full source trace, excludes a stale run, and checks duplicate completion/audit idempotency. Malformed duplicate candidate IDs fail before the persisted snapshot is overwritten.

Acceptance: backend and frontend typecheck plus `verifyWorkerCandidateLifecycleIntegration.ts`. This is a persisted worker-contract integration test, not a full PDF/OCR end-to-end test; real OCR fixtures and queue-level retry/concurrency tests remain separate.

### Foundation 6.12 — ProcessingRun / physical-document ownership guard

Declaration readiness now verifies that each LogicalDocument's `uploadedFileId` matches the physical file owned by its exact `sourceProcessingRunId`. A ProcessingRun can legitimately contribute multiple logical segments of the same PDF, but cannot be borrowed by a different UploadedFile, even inside the same tenant/declaration. Mismatches return `NOT_READY / RUN_DOCUMENT_OWNERSHIP_MISMATCH` before orchestration, audit creation, or promotion.

Acceptance: backend/frontend typecheck and `verifyProcessingRunDocumentOwnership.ts`. This is a persisted provenance-hardening test extending 6.11; a real PDF/OCR/queue end-to-end run is still outstanding.

### Foundation 6.13 — Real DIGITAL PDF → production worker E2E

Foundation 6.13 replaces hand-built candidate fixtures with a generated real digital PDF and invokes the production `processIdpJob` worker boundary. The verification exercises the real PyMuPDF analyzer, OCR skip decision for a DIGITAL page, segmentation, deterministic INVOICE classification, Python invoice parser consuming `CanonicalDocument`, worker candidate persistence, LogicalDocument materialization, lifecycle readiness, declaration-wide resolution and immutable resolution audit persistence.

The fixture contains one deterministic invoice row and is generated at test runtime, so no customer invoice is committed to the repository. The test proves the resolved GTIP/quantity/amount candidate provenance points back to the exact ProcessingRun, physical UploadedFile, LogicalDocument and native-text evidence. No synthetic `FieldCandidateEnvelope` is injected by the verification.

This E2E also records the remaining boundary honestly: Foundation 6.7 has explicit scalar declaration targets but no dynamic `goodsLines.N.*` promotion target yet. Real goods-line fields therefore reach the persisted resolution audit but are deliberately not written to an invented normalized path. `silentUnmappedPromotion=false` is an acceptance condition; dynamic goods-line promotion is the next explicit integration step rather than a hidden shortcut.

Acceptance: backend/frontend typecheck plus `verifyRealDigitalWorkerE2E.ts`. The run must report `contentKind=DIGITAL`, zero OCR use, one materialized INVOICE LogicalDocument, `CANONICAL_DOCUMENT` Python extraction, persisted declaration candidates/resolution audit, preserved provenance, and the explicit outstanding goods-line promotion boundary.

### Foundation 6.14 — Dynamic goods-line promotion

Foundation 6.14 closes the explicit boundary recorded by Foundation 6.13. Persisted `RESOLVED` declaration fields matching the allow-listed `goodsLines.N.<field>` contract can now be promoted into the corresponding `normalizedData.goodsLines[N]` entry. The dynamic mapping is deliberately constrained to the normalized goods-line schema (`hsCode`, `productCode`, `description`, `quantity`, `unit`, `unitPrice`, `lineTotal`, `origin`, `grossKg`, `netKg`); arbitrary candidate field names cannot create invented normalized paths.

Promotion still uses the current tenant-scoped immutable `DeclarationFieldResolutionRun`, so `REVIEW_REQUIRED` fields remain non-promotable and stale runs remain rejected. Every promoted goods-line value receives its own `sourceTrace` entry keyed by the exact dynamic field path and preserves resolution-run, selected-candidate, LogicalDocument, physical UploadedFile, ProcessingRun and evidence provenance.

Acceptance uses `verifyRealDigitalGoodsLinePromotion.ts`, which generates a real DIGITAL invoice PDF and runs the production worker boundary end to end. The verification requires the canonical Python parser's seven goods-line candidates to reach `normalizedData.goodsLines[0]` with their expected values and one-to-one provenance traces; no synthetic declaration candidate envelope is injected. Evidence semantics are asserted field-by-field: directly observed DIGITAL fields remain `NATIVE_TEXT`, while `unit` remains explicitly `DERIVED` because the current Python extractor infers it together with quantity and does not yet expose a dedicated unit bbox.


#### Foundation 6.14 provenance preservation note
`FieldCandidate.derived` is preserved when candidates are projected into declaration-wide candidates. Evidence source and derivation metadata are separate provenance dimensions: for example, invoice `unit` currently carries `contentSource=DERIVED` and `derived=true`. Projection must not silently discard the derivation flag. The real DIGITAL PDF verification asserts both dimensions survive extraction, projection, resolution and promotion.

### Foundation 6.15 — BullMQ queue → external worker E2E

Foundation 6.15 moves the real DIGITAL invoice verification across the actual asynchronous transport boundary. The verification creates a real PDF inside the shared upload volume, calls the production `enqueueDocumentProcessing` service, verifies that BullMQ persisted the `process-document` job in Redis with the ProcessingRun id as its job id, and waits for the separately running `idp-worker` service to consume and complete it. The test does not call `processIdpJob` directly.

After queue consumption, the same persisted outputs are checked: COMPLETED ProcessingRun with a real worker attempt, DIGITAL canonical analysis, `CANONICAL_DOCUMENT` Python extraction, LogicalDocument provenance, immutable declaration-resolution audit, and promoted goods-line values. The verification also checks the BullMQ job reaches the `completed` state before cleanup.

This step intentionally proves transport/consumer integration only. Retry failure injection and multi-job concurrency are reported as not covered rather than being implied by a single successful job; those resilience behaviors remain separate acceptance work.

Acceptance: backend/frontend typecheck, a running `redis` + `idp-worker` from `compose.dev.yaml`, and `verifyBullMqWorkerE2E.ts`. The success event is `foundation-6.15.bullmq-worker-e2e.passed` with `directProcessIdpJobInvocation=false` and `redisBullMqTransportExercised=true`.

### Foundation 6.16 — BullMQ retry/failure recovery E2E
Foundation 6.16 verifies the real BullMQ retry path without adding a production-only failure injection hook. The verification enqueues an INVOICE whose configured file path intentionally does not exist, waits for the external `idp-worker` to persist attempt 1 as `FAILED`, then creates the real DIGITAL PDF during BullMQ backoff. BullMQ must retry the same job id and the same `ProcessingRun`; attempt 2 must clear the previous error, complete the canonical pipeline, materialize exactly one LogicalDocument, persist exactly one declaration resolution audit and promote the expected goods line.

The acceptance test therefore proves that queue retry configuration is not merely present in `defaultJobOptions`: a real worker failure is persisted, BullMQ retries after backoff, checkpoint state is reusable, the successful retry recovers the same run, and declaration orchestration remains idempotent. No alternate ProcessingRun is created to simulate recovery and no test-only failure branch is added to production worker code.

Acceptance: backend/frontend typecheck plus `verifyBullMqRetryRecoveryE2E.ts` with `IDP_JOB_ATTEMPTS >= 2` and a non-trivial retry backoff. The final event is `foundation-6.16.bullmq-retry-recovery.passed`. Concurrency remains deliberately outside this boundary and is the next queue-level verification step.


#### Foundation 6.16 verification note — Mongo/BullMQ terminal-state ordering
The retry E2E treats ProcessingRun completion and BullMQ completion as two separately persisted observations. `processIdpJob` can persist `ProcessingRun=COMPLETED` immediately before the worker callback returns, while BullMQ still reports the Redis job as `active` for a brief window. The verifier therefore waits for BullMQ to publish its own terminal `completed` state after observing the recovered ProcessingRun. This is an observation-order guard only; it does not relax the requirement that the same job finishes `completed` with exactly two attempts.

### Foundation 6.17 — BullMQ concurrency + tenant/declaration isolation E2E
Foundation 6.17 verifies that the configured external BullMQ worker concurrency is exercised by two real DIGITAL invoice jobs without weakening tenant or declaration isolation. The verification creates two independent company/declaration/upload scopes, enqueues both through the production queue service, requires both ProcessingRuns to overlap in `PROCESSING`, and then requires both BullMQ jobs to reach `completed` on their first attempt.

Each scope must independently materialize exactly one LogicalDocument owned by its own UploadedFile/ProcessingRun, persist exactly one declaration-resolution audit, and promote the expected goods line. Cross-company queries against the other declaration must return no logical documents or resolution audits. The test calls no worker function directly and requires `IDP_WORKER_CONCURRENCY >= 2`.

Acceptance: backend/frontend typecheck plus `verifyBullMqConcurrencyIsolationE2E.ts`. Success is `foundation-6.17.bullmq-concurrency-isolation.passed` with `simultaneousProcessingObserved=true`, `concurrencyCovered=true`, and `crossTenantLeakageObserved=false`.

### Repository cleanup checkpoint
The Foundation 6 queue checkpoint also removes obsolete historical documentation (`README.txt`, `PROJE-YAPISI.md`, `CUSTOMS-PANEL-MIGRATION.md`) so `FOUNDATION-IDP-README.md` remains the single maintained IDP progress/design document. Python `__pycache__` and generated frontend `dist` output are local build artifacts already covered by `.gitignore`; they should not be committed. Historical Foundation verification scripts are retained because they remain executable regression evidence rather than dead runtime code.

### Foundation 6.18 — Real SCANNED PDF → PaddleOCR → production worker E2E
Foundation 6.18 moves the same deterministic invoice contract onto a genuinely image-only PDF. The fixture is authored as text only in memory, rasterized, and saved with only the raster image embedded; the persisted PDF therefore has no native text layer for the analyzer to recover. The production worker must classify it as `SCANNED`, invoke the real PaddleOCR subprocess, merge OCR words into `CanonicalDocument`, and continue through segmentation, classification, canonical Python extraction, declaration-candidate persistence, immutable resolution audit and normalized goods-line promotion.

The acceptance verifier does not inject OCR words or declaration candidates. Directly observed goods-line fields must carry `OCR` evidence through candidate projection and `sourceTrace`; `unit` remains explicitly `DERIVED` until the extractor exposes a dedicated unit bbox. The deterministic expected row remains `AG.TEST.1001 / TEST CIRCUIT BREAKER / 2 PCS / 10 EUR / 20 EUR / 853620100011` so DIGITAL and SCANNED paths can be compared against the same semantic result.

Acceptance: backend/frontend typecheck plus `verifyRealScannedWorkerE2E.ts`. Success is `foundation-6.18.real-scanned-worker-e2e.passed` with `contentKind=SCANNED`, real OCR use, one materialized INVOICE LogicalDocument, `CANONICAL_DOCUMENT` extraction, one resolution audit, promoted goods-line values and preserved OCR/DERIVED provenance. Queue transport is intentionally not re-proved in this step; Foundation 6.15–6.17 already cover the BullMQ boundary, retry and concurrency independently.

### Foundation 6.19 — MIXED multi-page OCR checkpoint/replay idempotency
Foundation 6.19 verifies selective OCR and persisted checkpoint replay on a real two-page MIXED PDF. Page 1 is a native-text DIGITAL invoice carrying the deterministic goods row; page 2 is image-only invoice continuation content. Production analysis must classify the document as `MIXED`, leave page 1 native, OCR only page 2 with PaddleOCR, persist that OCR state in the ProcessingRun canonical document, and complete the normal declaration pipeline.

The same ProcessingRun is then invoked again as a checkpoint replay. The worker must resume from the persisted canonical document rather than re-analyzing from scratch; `enrichCanonicalDocumentWithOcr` must find no unfinished OCR target pages, so persisted OCR page/word totals and the page-2 OCR word set remain unchanged. Re-running downstream segmentation/materialization/resolution must not duplicate LogicalDocuments or immutable declaration-resolution audits, and promoted declaration values/sourceTrace must remain stable.

Acceptance: backend/frontend typecheck plus `verifyMixedCheckpointReplayE2E.ts`. Success is `foundation-6.19.mixed-checkpoint-replay.passed` with `contentKind=MIXED`, exactly one OCR-applied page, the DIGITAL page retaining native evidence, `checkpointReplayAttempt=2`, unchanged OCR word count/fingerprint, one LogicalDocument, one resolution audit, and unchanged normalized goods-line promotion. This verifies successful persisted checkpoint replay/idempotency; crash-at-an-arbitrary-inference-instruction is not simulated with a production failure hook.


### Foundation 6.19 replay BSON/ObjectId correction

The first 6.19 verification exposed a real replay defect even though the outer verification reached its final event: the second declaration lifecycle logged `idp.declaration.lifecycle.failed` because `structuredClone()` converted the Mongoose-generated `normalizedData.goodsLines[*]._id` ObjectId into a plain `{ buffer: Uint8Array(...) }` object. The promotion clone is now BSON-safe and explicitly preserves ObjectId and Date values. The 6.19 verification also asserts that the persisted goods-line `_id` remains a real `mongoose.Types.ObjectId` after replay. A 6.19 run is accepted only when there is no declaration-lifecycle failure in the log and the final verification event passes.


### Foundation 6.20 closeout compatibility note

The historical Foundation 6.9 lifecycle verification fixture now persists its declaration-facing candidate snapshot in `ProcessingRun.declarationCandidates`. Foundation 6.10 deliberately separated raw/segment extraction audit data (`candidates`) from the only candidate boundary consumed by declaration lifecycle (`declarationCandidates`). The 6.20 full regression exposed that the older 6.9 fixture still populated only the pre-6.10 field. Production lifecycle behavior is unchanged; the regression fixture is aligned with the later fail-closed invariant instead of weakening `CANDIDATES_NOT_READY`.

### Foundation 7.1 — Explicit declaration document coverage profile

Foundation 7 starts the multi-document declaration-intelligence layer without hard-coding customs or company-specific document requirements. A declaration document set can now be assessed against an explicit caller-owned coverage profile containing required/optional semantic document roles and cardinality bounds.

Coverage is computed from persisted logical-document roles while preserving the distinction between physical UploadedFiles and semantic LogicalDocuments. Missing required roles and configured cardinality excesses make the assessment `INCOMPLETE`; malformed or duplicate profile rules fail closed as `INVALID_PROFILE`. A present document type that is not mentioned by the profile is reported as informational `unconfiguredPresentTypes` and is not silently rejected or treated as required.

This step deliberately does not decide that ATR, Packing List, Certificate of Origin, transport documents, or any other role is universally mandatory. Those requirements must come from an explicit company/declaration policy source in later Foundation 7 integration. Acceptance is backend/frontend TypeScript checks plus `verifyDeclarationDocumentCoverage.ts`, proving complete, missing, excess, invalid-profile, unconfigured-role and physical-vs-logical document-count behavior.

### Foundation 7.2 — Explicit cross-document consistency assessment

Foundation 7.2 adds a read-only declaration-level consistency assessment over persisted declaration candidate snapshots. Like 7.1, the rules are caller-owned: the IDP core does not invent that a particular field must appear in, or agree across, Invoice, Packing List, ATR, CMR, or another document role. Each configured rule names the field, participating document types, comparator, and whether every configured role must be present.

The first comparator contract supports exact values, case-insensitive text, and numeric absolute tolerance. A configured mismatch is reported as `CONFLICT`; missing configured evidence or fewer than two participating document roles is `INSUFFICIENT_EVIDENCE`; neither case silently selects a winner. Candidate/logical-document/upload references are preserved in the observations so later review and policy layers can explain exactly which documents disagreed.

This assessment is intentionally separate from the Foundation 6 authority resolver. Foundation 7.2 detects and explains configured cross-document consistency conditions but does not mutate normalized declaration data, create a new authority rule, or choose an authoritative document. Acceptance is backend/frontend TypeScript checks plus `verifyDeclarationCrossDocumentConsistency.ts`, proving case-insensitive agreement, numeric-tolerance agreement, explicit conflict detection, missing-role review, provenance references and invalid-profile fail-closed behavior.

### Foundation 7.3 — Declaration intelligence readiness composition

Foundation 7.3 composes the explicit document-coverage result from 7.1 and the explicit cross-document consistency result from 7.2 into one read-only declaration-intelligence readiness decision. `READY` is returned only when configured document coverage is complete and configured consistency checks are satisfied. Missing required documents, configured cardinality excesses, cross-document conflicts, and insufficient configured evidence are preserved as explicit reasons under `REVIEW_REQUIRED` rather than being collapsed into a silent boolean.

Malformed coverage or consistency profiles fail closed as `INVALID_CONFIGURATION`. Informational document roles that were never configured remain informational and do not become invented blockers. This layer does not choose an authoritative document, mutate normalized declaration data, or add customs/company requirements; it only composes the results of caller-owned policies evaluated by 7.1 and 7.2.

Acceptance is backend/frontend TypeScript checks plus `verifyDeclarationIntelligenceReadiness.ts`, proving ready, combined-review, invalid-configuration and unconfigured-role behavior while preserving the separation between consistency detection and Foundation 6 authority resolution.

### Foundation 7.4 — Persisted declaration intelligence assessment audit

Foundation 7.4 gives the 7.1–7.3 intelligence decision an append-only persistence boundary. An already evaluated coverage + consistency pair is composed into readiness, persisted as a `DeclarationIntelligenceAssessmentRun`, and the declaration receives a compact `idpIntelligence` pointer to the current assessment run, status, issues and assessment time. The audit run retains the complete coverage and consistency inputs so a later review can explain why the declaration was READY, REVIEW_REQUIRED or INVALID_CONFIGURATION.

Optional caller-owned `assessmentKey` provides idempotent replay. Reusing the current key returns the existing immutable run; once a newer assessment becomes current, replaying an older key is rejected so stale intelligence cannot replace the declaration snapshot. Company scope is fail-closed and failed scoped writes create no audit record.

This step still does not invent customs requirements, select document authority, or mutate normalized declaration data. It persists the decision boundary only; wiring coverage/consistency evaluation from persisted declaration inputs into one production orchestration path remains a later Foundation 7 step. Acceptance is backend/frontend TypeScript checks plus `verifyPersistedDeclarationIntelligenceAssessment.ts`.

### Foundation 7.5 — Production declaration-intelligence orchestration boundary

Foundation 7.5 wires the previously isolated 7.1–7.4 capabilities into one persisted production service. The orchestrator loads the tenant/declaration-scoped LogicalDocument set, validates its integrity, follows each logical document's exact `sourceProcessingRunId`, verifies physical-file ownership and completed processing state, and consumes only the persisted `declarationCandidates` snapshot introduced by Foundation 6.10. Those snapshots are projected back onto the persisted logical-document boundary before any cross-document assessment is performed.

The caller still owns both policy inputs: the document-coverage profile and cross-document consistency profile. The orchestration service evaluates coverage, evaluates configured consistency from projected persisted candidates, composes readiness, and persists the append-only `DeclarationIntelligenceAssessmentRun` plus current declaration snapshot through the 7.4 boundary. An optional caller-owned `assessmentKey` preserves exact replay idempotency; changed persisted candidate input with a new key creates a new assessment.

This boundary deliberately remains separate from Foundation 6 field authority/resolution and promotion. `READY` means the configured Foundation 7 intelligence checks are satisfied; it does not select a winning document, bypass Foundation 6 resolution, or mutate `normalizedData`. Incomplete/failed processing, missing candidate snapshots, provenance/physical-file mismatches, and invalid logical-document sets fail closed before assessment persistence.

Acceptance is backend/frontend TypeScript checks plus `verifyDeclarationIntelligenceOrchestration.ts`, proving persisted document/run/candidate loading, projection, coverage + consistency evaluation, immutable assessment persistence, exact replay reuse, changed-input review behavior, and normalized-data/authority separation.

### Foundation 7.6 — Worker/lifecycle intelligence integration

Foundation 7.6 connects the persisted declaration-intelligence orchestration from Foundation 7.5 to the production worker completion lifecycle without introducing implicit customs policy. The declaration may carry an explicit `idpIntelligencePolicy` containing the caller-owned coverage and cross-document consistency profiles. After a ProcessingRun is durably `COMPLETED`, the worker continues to run the independent Foundation 6 declaration-field lifecycle and then attempts Foundation 7 intelligence orchestration from that persisted policy.

If no intelligence policy is configured, the new lifecycle bridge returns `NOT_CONFIGURED` and creates no assessment. This is an intentional fail-closed boundary: the worker never invents required document roles or cross-document field rules. When policy is configured, the bridge derives a deterministic assessment key from the persisted policy plus the active ProcessingRun candidate snapshots, so an exact lifecycle replay reuses the same immutable assessment while changed persisted inputs produce a different key.

The worker treats declaration intelligence as an independent post-completion concern. An intelligence error cannot rewrite an already completed file ProcessingRun as failed, cannot bypass Foundation 6 authority/resolution behavior, and does not own normalized-data promotion.

Acceptance is verified by `backend/scripts/idp/verifyWorkerIntelligenceLifecycleIntegration.ts`, which runs the real production worker function against the real DIGITAL invoice fixture, proves Foundation 6 resolution remains active, proves the configured Foundation 7 assessment is persisted automatically, proves exact lifecycle replay is idempotent, and proves an unconfigured declaration is skipped without creating an assessment.

### Foundation 7.7 — Real multi-document declaration E2E

Foundation 7.7 proves the Foundation 7 intelligence path with two real physical DIGITAL PDFs processed by the production worker function: one `INVOICE` and one `PACKING_LIST`. It adds the first deliberately narrow PACKING_LIST segment extractor, `packing-list-canonical-v1`, which emits only evidence-backed quantity when an explicit `QTY`/`QUANTITY` label is present. It does not infer missing values or customs semantics.

The worker now persists segment candidate snapshots for non-INVOICE classified documents as well. Invoice resolution/validation remains invoice-owned; a PACKING_LIST is not routed through the invoice resolver or validator. This lets declaration intelligence consume persisted evidence from multiple document roles while preserving the existing Foundation 6 invoice pipeline.

Acceptance is `backend/scripts/idp/verifyRealMultiDocumentDeclarationE2E.ts`. The verifier creates real Invoice and Packing List PDFs, processes both through `processIdpJob()`, and proves the declaration transitions from `REVIEW_REQUIRED` while the required Packing List is missing to `READY` once both real documents are complete and their configured quantity observations agree. No synthetic candidate injection is used, both physical/logical document identities are preserved, and the two intelligence assessments remain append-only history.

### Foundation 7.8 — Foundation 7 closeout regression

Foundation 7.8 closes the multi-document declaration-intelligence foundation with one regression runner over Foundations 7.1 through 7.7. The closeout replays explicit document coverage, explicit cross-document consistency, readiness composition, append-only assessment persistence, persisted production orchestration, worker lifecycle integration, and the real two-physical-document Invoice + Packing List E2E.

The closeout does not introduce new customs policy, authority selection, or normalized-data promotion behavior. Foundation 6 remains the owner of field resolution and promotion; Foundation 7 remains an evidence-backed assessment layer driven only by caller-owned policy. Historical verification scripts are retained as executable regression evidence.

Acceptance is backend/frontend TypeScript checks plus `backend/scripts/idp/verifyFoundation7Closeout.ts`. A successful run emits `foundation-7.8.closeout-regression.passed` with seven passed checks and the preserved Foundation 6 authority/normalized-data boundaries. After this checkpoint, Foundation 8 may add controlled local-LLM/Qwen assistance behind these deterministic boundaries rather than replacing them.

## Foundation 8.1 — Evidence-Constrained Declaration LLM Assistance Contract (COMPLETED)

Foundation 8 starts by extending the existing Qwen/OpenAI-compatible infrastructure from document/field ambiguity to declaration-level cross-document conflicts. This stage is contract/policy only; it deliberately performs no network call and does not yet wire Qwen into the Foundation 7 production orchestration.

Rules:
- `READY` / consistent declarations never call the LLM.
- Missing-document / insufficient-evidence cases without a grounded cross-document conflict are not sent to Qwen; an LLM cannot manufacture absent evidence.
- Only explicit `CONFLICT` fields with persisted observations may be escalated.
- The request contains the existing candidate IDs and their persisted document provenance.
- The model may select only an existing candidate ID for the exact requested field. It cannot return a replacement field value.
- Hallucinated candidate IDs, unrequested fields, duplicate selections, and partial `RESOLVED` responses are rejected fail-closed.
- The model may return `REVIEW_REQUIRED` with no selections when evidence remains ambiguous.
- Foundation 8.1 does not mutate `normalizedData`, does not choose Foundation 6 authority, and does not call a provider/network endpoint.

Regression utility: `backend/scripts/idp/verifyDeclarationLlmAssistContract.ts`.

Next: Foundation 8.2 will connect this declaration-level contract to the existing local Qwen/OpenAI-compatible provider boundary with strict structured-response parsing and provider failure handling, while keeping production orchestration opt-in and fail-closed.

### Foundation 8.2 — Declaration Qwen provider integration

Foundation 8.2 connects the evidence-constrained declaration conflict contract from 8.1 to the existing OpenAI-compatible Qwen provider without changing declaration authority or normalized-data ownership.

- Declaration assistance uses the existing `QwenOpenAiProvider` transport and `/v1/chat/completions` boundary.
- Requests are deterministic (`temperature: 0`) and require JSON-object responses.
- The model may select only candidate IDs already present in the 8.1 request, or return `REVIEW_REQUIRED` with zero selections.
- Provider/network, malformed JSON, timeout, hallucinated candidate, unrequested field, and partial-resolution failures all fail closed.
- This step does not persist an LLM decision, mutate `normalizedData`, or bypass the Foundation 6 authority resolver. Production orchestration is intentionally deferred to the next Foundation 8 step.

Verification:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyDeclarationQwenProviderIntegration.ts
```

Expected event: `foundation-8.2.declaration-qwen-provider-integration.passed`.

### Foundation 8.3 — Persisted declaration LLM-assistance orchestration

Foundation 8.3 moves the evidence-constrained declaration conflict assistant behind a production persistence boundary. The orchestrator loads only the declaration's current persisted intelligence assessment, skips READY / invalid / insufficient-evidence cases before any provider call, builds the Foundation 8.1 candidate-id-only request for grounded conflicts, validates the provider response, and persists an append-only `DeclarationLlmAssistRun` plus a declaration current snapshot.

Guardrails remain fail-closed: the assistance run is scoped by company + declaration + current assessment, exact replay reuses the immutable run without another provider call, a changed current assessment creates a new run, stale replay cannot replace the current pointer, and LLM advice does not mutate `normalizedData` or bypass Foundation 6 authority/promotion. A `RESOLVED` LLM decision is therefore audited advice over existing candidate IDs, not automatic normalized-data promotion.

Verification:

```bash
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyDeclarationLlmAssistOrchestration.ts
```

Expected event: `foundation-8.3.declaration-llm-assist-orchestration.passed`.

### Foundation 8.4 — LLM candidate-authority bridge

Foundation 8.4 allows a validated `RESOLVED` declaration LLM-assistance run to influence declaration values only by re-entering the Foundation 6 resolution boundary. The bridge locates the immutable Foundation 6 `REVIEW_REQUIRED` resolution whose persisted candidates match the current LLM selections, converts those selections into explicit candidate-level authority input, creates/reuses a new append-only `DeclarationFieldResolutionRun`, and then invokes the existing Foundation 6 promotion service.

The model still cannot supply replacement values: every selection must name an existing candidate from the persisted Foundation 6 candidate envelope. `REVIEW_REQUIRED` LLM advice is rejected, company/declaration/current-assessment scope is fail-closed, the original resolution run remains immutable, exact replay reuses the derived resolution run, and `normalizedData` is written only by `promotePersistedDeclarationFieldResolution` with normal sourceTrace provenance.

Verification:

```bash
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyDeclarationLlmAuthorityBridge.ts
```

Expected event: `foundation-8.4.llm-candidate-authority-bridge.passed`.

### Foundation 8.5 — Worker LLM-assist lifecycle integration

Foundation 8.5 connects the persisted Foundation 8.1–8.4 boundaries to the production worker completion lifecycle without making LLM use implicit. A declaration must explicitly persist `idpLlmAssistPolicy.version=1` with `enabled=true`. `autoApplyResolvedAuthority` is a second, independent opt-in: when false, validated Qwen output remains append-only advice only; when true, a `RESOLVED` selection is converted to candidate authority exclusively through the Foundation 6 resolver/promotion boundary.

Lifecycle order after a completed file is therefore: Foundation 6 declaration resolution → Foundation 7 intelligence assessment → optional Foundation 8 LLM assistance → optional Foundation 6 candidate-authority re-resolution/promotion. Missing policy, READY assessments, invalid configuration, and insufficient evidence do not call the provider. LLM/provider/authority failures are isolated from the already completed per-file ProcessingRun.

Verification: `backend/scripts/idp/verifyWorkerLlmAssistLifecycleIntegration.ts` uses two real DIGITAL PDFs with conflicting quantity evidence, the production `processIdpJob()` function, and a local OpenAI-compatible mock endpoint. It proves the first incomplete document set does not call Qwen, the grounded conflict calls it once, the selected existing Packing List candidate is promoted only by Foundation 6, and exact replay reuses both immutable assist and authority resolution runs without another network call.

### Foundation 8.6 — Qwen runtime readiness and Docker configuration

Foundation 8.6 prepares the application for a real local/DGX Qwen runtime without requiring a model to be installed yet. Both the backend and the BullMQ IDP worker now receive the same explicit `LLM_*` environment contract from `compose.dev.yaml`; the default remains `LLM_ENABLED=false`.

A read-only runtime probe validates the configured HTTP(S) base URL and timeout, calls only the OpenAI-compatible `GET /v1/models` discovery endpoint, and requires `LLM_MODEL` to be advertised by that runtime. The probe never calls chat completions and never sends declaration evidence. Disabled or invalid configuration performs no network call; HTTP errors, timeouts, and model mismatches return `NOT_READY` fail-closed.

For Docker Desktop with a model server running on the Windows host, `LLM_BASE_URL` may use `http://host.docker.internal:<port>`. For DGX Spark or another machine on the company LAN, use that host's reachable LAN address. The base URL must not include `/v1`, because the provider owns the OpenAI-compatible route suffixes.

Verification:

```bash
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyQwenRuntimeReadiness.ts
```

Expected event: `foundation-8.6.qwen-runtime-readiness.passed`. This verifier uses a local mock model-discovery endpoint; installing or downloading Qwen is intentionally deferred until the runtime boundary itself is proven.

### Foundation 8.7 — Real local Qwen end-to-end

Foundation 8.7 replaces the mock declaration-conflict provider used by earlier verification with the real local OpenAI-compatible Qwen runtime. Development remains on the Windows workstation; Docker Desktop reaches the host runtime through `host.docker.internal`. DGX Spark deployment is intentionally deferred until after Foundation 10.

The verifier defaults to `http://host.docker.internal:11434` and `qwen3:8b`, matching the Windows Ollama development runtime. It first performs the Foundation 8.6 read-only `/v1/models` readiness probe, then sends real declaration-conflict evidence through the production worker and `QwenOpenAiProvider` `/v1/chat/completions` path.

The real model is allowed to return either a contract-valid `RESOLVED` decision or a fail-closed `REVIEW_REQUIRED` decision. A `RESOLVED` response is accepted only when it selects an existing candidate ID from the exact requested field and is applied exclusively through the Foundation 6 authority/promotion boundary. A `REVIEW_REQUIRED` response must contain zero selections and must not silently promote the conflicting field. This avoids turning model nondeterminism into a false test failure or, worse, an implicit authority rule.

Verification:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyRealLocalQwenE2E.ts
```

Expected event: `foundation-8.7.real-local-qwen-e2e.passed` with `realRuntimeUsed=true` and `mockServerUsed=false`. The output records the actual Qwen decision so the development evidence remains explicit.

### Foundation 8.7 — Real local Qwen E2E

Foundation 8.7 proves the declaration-assistance path against a real local Qwen runtime instead of a mock server. The Windows development host runs Ollama with `qwen3:8b`; Docker reaches its OpenAI-compatible API through `http://host.docker.internal:11434`. The verifier processes real Invoice and Packing List PDFs through the production `processIdpJob()` function until a grounded quantity conflict reaches the real model.

The model remains evidence-constrained. A real `REVIEW_REQUIRED` decision is valid and fail-closed: no candidate authority is invented, the already-promoted pre-conflict Foundation 6 value/provenance is not silently rewritten or deleted, and no direct LLM normalized-data write occurs. If the model returns `RESOLVED`, only an existing candidate ID can cross the Foundation 8.4 bridge and Foundation 6 remains the promotion owner. The OpenAI transport canonicalizes only the equivalent JSON representation `version: 1` to contract version `"1"`; missing or unsupported versions remain rejected.

Verification: `backend/scripts/idp/verifyRealLocalQwenE2E.ts`. Expected event: `foundation-8.7.real-local-qwen-e2e.passed` with `realRuntimeUsed=true`, `mockServerUsed=false`, and persisted real-Qwen assistance.

### Foundation 8.8 — Foundation 8 closeout regression

Foundation 8.8 closes the controlled local-LLM/Qwen foundation with one regression runner over Foundations 8.1 through 8.7. It replays the evidence-constrained contract, Qwen provider transport, append-only assistance orchestration, Foundation 6 candidate-authority bridge, production worker lifecycle integration, runtime readiness guardrails, and the real Windows/Ollama `qwen3:8b` E2E.

The closeout deliberately requires the real local Qwen runtime used by 8.7 to remain reachable; it does not replace the final E2E with a mock. Foundation 6 remains the only normalized-data promotion boundary, arbitrary model replacement values remain prohibited, and `REVIEW_REQUIRED` remains fail-closed.

Verification:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyFoundation8Closeout.ts
```

Expected event: `foundation-8.8.closeout-regression.passed` with seven passed checks and Foundation 8 status `COMPLETED`. After this checkpoint, Foundation 9 can build the human-review/confidence/exception workflow on the persisted deterministic + LLM audit boundaries instead of changing their ownership semantics.

## Foundation 9.1 — Human Review Domain Contract

Foundation 9 begins at the fail-closed boundary proven by Foundation 8: a declaration may remain `REVIEW_REQUIRED` after deterministic resolution, cross-document intelligence, and optional Qwen assistance. 9.1 defines the human-review contract without adding persistence, API, UI, or a direct normalized-data write path.

- A review request is built only from fields that are `REVIEW_REQUIRED` in an existing Foundation 6 resolution run.
- The request exposes the already-grounded candidate IDs and their provenance/evidence; it does not manufacture replacement values.
- A reviewer must explicitly decide every requested field: select one existing candidate, or keep that field `REVIEW_REQUIRED`.
- Every submission is bound to company, declaration, source resolution run, and actor identity. A stale source-resolution reference is rejected at the contract boundary.
- Selecting a candidate in this contract is not authority application. 9.1 performs no persistence and never writes `normalizedData`; a later Foundation 9 bridge must route an accepted human selection back through the Foundation 6 resolution/promotion boundary.

Verification:

```powershell
npm run typecheck
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyDeclarationHumanReviewContract.ts
```

Expected terminal event: `foundation-9.1.human-review-domain-contract.passed`.

### Foundation 9.2 — Persisted Human Review Audit

Human-review submissions are persisted as append-only `DeclarationHumanReviewRun` records. The persistence boundary is source-resolution-bound and fail-closed: a request whose source resolution is no longer current is rejected before persistence. Exact replay is idempotent through a deterministic review key, while a materially changed human decision creates a new immutable audit run. Company/declaration scope is part of both lookup and uniqueness. This foundation still does not mutate `normalizedData` and does not bypass Foundation 6 authority; applying a selected candidate is owned by Foundation 9.3.

### Foundation 9.3 — Human Candidate-Authority Bridge

Foundation 9.3 converts an immutable, persisted `DECIDED` human-review run into explicit candidate-level authority without creating a second normalized-data write path. The bridge loads the exact review run in company/declaration scope, reloads its exact source Foundation 6 resolution run, verifies every selected candidate still belongs to the reviewed `REVIEW_REQUIRED` field, and then re-enters `resolveAndPersistDeclarationFields` plus `promotePersistedDeclarationFieldResolution`.

`KEEP_REVIEW_REQUIRED` remains fail-closed and cannot cross the authority bridge. Human review cannot provide a replacement scalar: only an existing candidate ID from the immutable source resolution may be selected. The original Foundation 6 resolution remains immutable, the derived authority resolution is append-only and idempotent, company scope is enforced, and `normalizedData`/`sourceTrace` remain owned by the Foundation 6 promotion boundary.

Verification:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyDeclarationHumanReviewAuthorityBridge.ts
```

Expected terminal event: `foundation-9.3.human-review-authority-bridge.passed`.


## Foundation 9.4 — Human Review API

Foundation 9.4 exposes the Foundation 9.1–9.3 declaration-level human-review boundary to the frontend without allowing the client to manufacture authority.

Endpoints:

- `GET /api/declarations/:id/idp-human-review/current`
- `GET /api/declarations/:id/idp-human-review/audit`
- `POST /api/declarations/:id/idp-human-review/current`

The API derives `companyId` and `actorUserId` from the authenticated request context. Client-supplied scope/actor values are ignored. The POST endpoint is bound to the current Foundation 6 resolution run, accepts only the explicit Foundation 9.1 decisions, persists the Foundation 9.2 append-only audit, and only applies authority through the Foundation 9.3 → Foundation 6 bridge. `KEEP_REVIEW_REQUIRED` never promotes a value.

The older processing-run `/idp-reviews` API remains separate for compatibility; Foundation 9 frontend work must use `/idp-human-review` for declaration-level cross-document conflict review.


## Foundation 9.5 — Declaration Human Review UI

The Evrak Hazırlık `Belge İncelemesi` tab now consumes the declaration-level `/idp-human-review` API introduced in Foundation 9.4 rather than treating processing-run review decisions as declaration authority.

The UI:
- prominently marks current cross-document conflicts as `REVIEW REQUIRED`;
- never presents a previously promoted `normalizedData` value as final while the current resolution requires review;
- shows only grounded candidates supplied by the Foundation 9.1 contract, including document type, value, confidence, extractor, and persisted evidence;
- can open candidate evidence against the correct physical `uploadedFileId`;
- allows only candidate selection or explicit `KEEP_REVIEW_REQUIRED`; there is no arbitrary replacement-value input;
- submits all reviewed fields explicitly and lets Foundation 9.3/Foundation 6 own authority and promotion;
- shows recent append-only human-review audit runs.

The older processing-run `/idp-reviews` backend remains available for compatibility, but this declaration-level cross-document review UI does not use it.


## Foundation 9.6 — Confidence / Exception Domain Contract

Foundation 9.6 introduces an assessment-only operational exception layer over the current Foundation 6 resolution and Foundation 7 intelligence state. It does not create a second resolver or authority path.

Confidence handling is policy-driven only. A low-confidence exception is emitted only when an explicit `minimumSelectedCandidateConfidence` is configured; no hidden/default confidence threshold is invented. Existing `REVIEW_REQUIRED` fields remain review exceptions regardless of confidence. Foundation 7 `REVIEW_REQUIRED` intelligence also remains review-visible, while `INVALID_CONFIGURATION` is represented as a blocking exception.

The assessment returns `CLEAR`, `REVIEW_REQUIRED`, or `BLOCKED` plus deterministic exception records. It never selects candidates, persists human decisions, mutates `normalizedData`/`sourceTrace`, or bypasses Foundation 6.

Verification:

```powershell
npm run typecheck
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyDeclarationExceptionAssessment.ts
```

Expected event: `foundation-9.6.confidence-exception-contract.passed`.

## Foundation 9.7 — Persisted Exception Assessment + Current Snapshot

Foundation 9.7 persists the deterministic Foundation 9.6 result as an append-only `DeclarationExceptionAssessmentRun` and advances a declaration-level `idpExceptions` current snapshot. Every run is bound to the exact current Foundation 6 resolution and, when present, the exact current Foundation 7 intelligence assessment.

The assessment key is deterministic across source state, explicit exception policy, and assessment output. Exact replay reuses the immutable run only while that run is still the declaration's current exception snapshot. A changed explicit policy/result creates a new append-only run; replay of an older result is rejected instead of rolling the current snapshot backward. Company, resolution, and intelligence scope are fail-closed.

This layer remains operational state only: it does not select candidate authority and does not mutate `normalizedData` or `sourceTrace`.

Verification:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyDeclarationExceptionPersistence.ts
```

Expected event: `foundation-9.7.exception-persistence.passed`.


## Foundation 9.8 — Production Worker Exception Lifecycle

Foundation 9.8 wires the Foundation 9.6/9.7 exception workflow into the production worker lifecycle. The exception bridge loads the exact current Foundation 6 resolution and current Foundation 7 intelligence assessment, computes operational exceptions, and persists the append-only/current Foundation 9.7 state.

The bridge intentionally runs after Foundation 8 LLM assistance because validated LLM authority may create a newer Foundation 6 resolution. Exception state therefore describes the final current declaration state rather than a superseded pre-assist resolution.

An explicit persisted `idpExceptionPolicy.minimumSelectedCandidateConfidence` enables low-confidence exceptions. If that policy is absent, no confidence threshold is invented; deterministic unresolved-resolution and intelligence exceptions can still be surfaced. Exception lifecycle failure is isolated from an already completed file ProcessingRun.

Verification:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyWorkerExceptionLifecycleIntegration.ts
```

Expected event: `foundation-9.8.worker-exception-lifecycle.passed`.

## Roadmap — Foundation 9 → Foundation 10 → DGX Spark

### Foundation 9 — Human Review, Confidence, and Exception Workflow

- **9.1 — Human Review Domain Contract — COMPLETED**
  Grounded Foundation 6 review fields/candidates only; no arbitrary replacement values.
- **9.2 — Persisted Review Queue / Append-Only Audit — COMPLETED**
  Immutable human decisions, actor/source binding, replay and tenant isolation.
- **9.3 — Human Authority Bridge — COMPLETED**
  Human candidate selection enters authority only through a new Foundation 6 resolution/promotion.
- **9.4 — Human Review API — COMPLETED**
  Auth-owned actor/company scope, current review projection, append-only audit endpoints.
- **9.5 — Human Review UI — COMPLETED**
  Cross-document conflicts and provenance exposed; no free-text replacement authority.
- **9.6 — Confidence / Exception Domain Contract — COMPLETED**
  Explicit confidence policy plus deterministic REVIEW_REQUIRED/BLOCKED exception composition.
- **9.7 — Persisted Exception Assessment — COMPLETED**
  Append-only exception audit and declaration current exception snapshot.
- **9.8 — Production Worker Exception Lifecycle — COMPLETED**
  Final current resolution/intelligence → exception assessment/persistence after worker + LLM authority lifecycle.
- **9.9 — Exception API/UI + Operational Review UX — COMPLETED**
  Surface current exception state and actionable reason/provenance in the application without creating a second authority path.
- **9.10 — Real Review/Exception E2E + Foundation 9 Closeout — COMPLETED**
  Real multi-document conflict → review → human authority → updated resolution → exception state, followed by full Foundation 9 regression.

### Foundation 10 — Production Hardening / Performance / Release

Planned scope after Foundation 9 closes:
- production configuration validation and fail-closed startup/readiness;
- queue/retry/idempotency hardening under realistic load;
- OCR/IDP/LLM performance and resource controls for the expected invoice workload;
- observability, structured operational diagnostics, and recovery paths;
- security/tenant-boundary regression and release hygiene;
- full Foundation 6–10 regression and production release checklist.

### DGX Spark Migration — AFTER Foundation 10

All Foundation 9 and Foundation 10 development/testing remains on the current Windows local environment. DGX Spark is not a development dependency for these foundations. After Foundation 10 is complete, the validated Qwen runtime can be migrated to DGX Spark and benchmarked/integrated as the offline inference host without changing the IDP authority architecture.


## Foundation 9.9 — Exception API/UI + Operational Review UX

Foundation 9.9 exposes the current persisted Foundation 9.7 exception snapshot through a read-only declaration API and surfaces that operational state inside the declaration-level review UI.

Endpoints:
- `GET /api/declarations/:id/idp-exceptions/current`
- `GET /api/declarations/:id/idp-exceptions/audit`

The API is company-scoped from authenticated operational context and never accepts authority decisions. The UI displays `REVIEW_REQUIRED`/`BLOCKED`, deterministic exception reasons, and explicit confidence/threshold context where applicable. Human candidate selection remains exclusively on the Foundation 9.1–9.4 human-review path; exception state does not become a second authority mechanism.

Verification:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyDeclarationExceptionApi.ts
```

Expected event: `foundation-9.9.exception-api-ui-boundary.passed`.


## Foundation 9.10 — Foundation 9 Closeout Regression

Foundation 9.10 is the closeout gate for the human-review/confidence/exception foundation. It deliberately re-runs every executable Foundation 9 backend contract/integration boundary plus the real Foundation 7.7 multi-document declaration E2E that supplies the downstream review topology.

The closeout is intentionally a regression gate rather than a new authority mechanism. Foundation 6 remains the only candidate-resolution/promotion authority. Foundation 9 adds auditable human selection and operational exception state around that boundary.

Foundation 9.5 UI behavior is protected by frontend typecheck and the 9.9 API/UI boundary verifier; the closeout runner does not claim browser automation. A final browser smoke check remains appropriate before production release and is tracked under Foundation 10 release hardening.

Verification:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyFoundation9Closeout.ts
```

Expected final event: `foundation-9.10.closeout.passed`.

When this gate passes, mark 9.10 and Foundation 9 `COMPLETED`, create a clean git checkpoint, and begin Foundation 10 production hardening. DGX Spark migration remains after Foundation 10.


## Foundation 9 — CLOSED

Foundation 9 closeout passed all 9 executable regression gates, including the real multi-document declaration E2E. Human review remains grounded in existing candidates, human authority continues through Foundation 6, exception state remains non-authoritative, confidence thresholds remain explicit-only, and review/exception audit history remains append-only.

## Foundation 10.1 — Production Configuration / Readiness Contract

Foundation 10 begins with a fail-closed production-readiness contract rather than changing extraction or authority behavior.

Planned 10.1 checks:
- validate required production configuration before accepting IDP workload;
- distinguish required core dependencies from optional LLM assistance;
- verify MongoDB, Redis/queue, OCR runtime, upload/storage paths, and configured LLM endpoint/model readiness;
- never silently enable LLM or invent confidence policy;
- expose a deterministic readiness result suitable for startup/health diagnostics;
- avoid mutating declarations, candidates, normalized data, or authority state.

Foundation 10 roadmap:
- **10.1 — Production Configuration / Readiness — COMPLETED**
- **10.2 — Queue / Retry / Idempotency Hardening — COMPLETED**
- **10.3 — OCR / IDP / LLM Performance & Resource Controls — COMPLETED**
- **10.4 — Observability / Diagnostics / Recovery — COMPLETED**
- **10.5 — Security / Tenant / Failure Regression — COMPLETED**
- **10.6 — Production Release Checklist + Foundation 6–10 Full Regression — COMPLETED**
- **DGX Spark migration / benchmark — AFTER Foundation 10**


### Foundation 10.1 implementation — configuration gate

The API and IDP worker now execute the same deterministic readiness configuration gate before startup. Production rejects the known development JWT secret and malformed/missing core Mongo/Redis/upload configuration. OCR/parser and LLM are explicit feature gates: when disabled they are represented as `DISABLED`; when enabled their required configuration becomes fail-closed. LLM remains optional and is never silently enabled.

10.1 is deliberately split from later live dependency/performance hardening: this gate validates startup configuration without mutating declarations or introducing a second authority path. Live queue/retry/runtime stress and recovery remain Foundation 10.2+.

Verification:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyProductionReadinessContract.ts
```

Expected event: `foundation-10.1.production-readiness-contract.passed`.


## Foundation 10.2 — Queue / Retry / Idempotency Hardening

10.2 adds a durable enqueue idempotency boundary without replacing the already-verified BullMQ retry behavior from Foundation 6.15–6.17.

- `ProcessingRun.enqueueKey` is a deterministic SHA-256 key over company, declaration, physical upload, and processor version.
- A unique sparse Mongo index makes concurrent duplicate API enqueue requests converge on one ProcessingRun even across multiple API processes.
- BullMQ continues to use the ProcessingRun id as `jobId`, so exact enqueue replay cannot create a second queue identity.
- Completed/cancelled worker replay exits before attempt mutation, extraction, or downstream declaration lifecycles.
- A processor-version change creates a new idempotency boundary, preserving intentional reprocessing after a deployed processor change.
- Existing BullMQ attempts/backoff and Foundation 6.16 same-run FAILED -> retry recovery semantics are preserved.

Verification:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyQueueRetryIdempotencyHardening.ts
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyBullMqRetryRecoveryE2E.ts
```

Expected events:
- `foundation-10.2.queue-retry-idempotency-hardening.passed`
- `foundation-6.16.bullmq-retry-recovery.passed`


## Foundation 10.3 — OCR / IDP / LLM Performance & Resource Controls

10.3 formalizes the resource controls already used by the production worker without changing extraction or declaration authority.

- BullMQ worker concurrency remains explicit through `IDP_WORKER_CONCURRENCY` / `env.idpWorkerConcurrency`.
- DIGITAL documents have zero OCR budget; SCANNED/MIXED documents have a finite page-count budget.
- LLM remains explicit-only. Disabled LLM has no timeout budget; enabled LLM requires a positive timeout.
- The policy is deterministic and side-effect free, ready for later runtime metrics and DGX Spark benchmarking.

Verification:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyPerformanceResourceControls.ts
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyBullMqConcurrencyIsolationE2E.ts
```

Expected: `foundation-10.3.performance-resource-controls.passed` plus the existing Foundation 6.17 concurrency/isolation PASS event.


## Foundation 10.4 — Observability / Diagnostics / Recovery

10.4 adds a read-only operational diagnostic projection for a ProcessingRun.

- Diagnostic lookup is fail-closed on company + declaration + ProcessingRun.
- Exposes status, current stage, attempt, processor version, timestamps/duration and structured persisted failure.
- Returns a deterministic recovery recommendation (`NONE`, `WAIT_FOR_RETRY`, `RETRY_PROCESSING_RUN`, `INVESTIGATE_CONFIGURATION`).
- Diagnostics never trigger retry and never mutate ProcessingRun, declaration authority, candidates or normalized data.
- API: `GET /api/declarations/:id/idp-diagnostics/:processingRunId`.

Verification:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyObservabilityDiagnosticsRecovery.ts
```

Expected: `foundation-10.4.observability-diagnostics-recovery.passed`.


## Foundation 10.5 — Security / Tenant / Failure Regression

10.5 is a production security/regression gate, not a new authority path. It reuses the real verified boundaries accumulated across Foundations 6, 9 and 10.

The suite verifies:
- production configuration fails closed;
- ProcessingRun ↔ physical-document ownership remains enforced;
- malformed candidate snapshots fail before persisted mutation;
- human-review company/actor identity remains server-owned and stale sources fail closed;
- exception API remains tenant-isolated and read-only;
- diagnostics remain tenant + declaration scoped and cannot trigger retry.

Run:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifySecurityTenantFailureRegression.ts
```

Expected final event: `foundation-10.5.security-tenant-failure-regression.passed`.


## Foundation 10.6 — Production Release Checklist + Foundation 6–10 Full Regression

10.6 is the final Windows-local production release gate before DGX Spark migration/benchmark work.

Release checklist:
- backend and frontend TypeScript compile cleanly;
- Docker API, Redis, Mongo and external IDP worker are available for the real queue/OCR regressions;
- local Ollama/Qwen runtime is available for the Foundation 8 real-Qwen regression;
- production configuration remains fail-closed and development defaults are not treated as production-ready;
- Foundations 6, 7, 8 and 9 closeout suites all pass from the current tree;
- Foundation 10.1–10.5 readiness, idempotency, resource, diagnostics and security gates all pass;
- no new normalized-data authority exists outside the Foundation 6 resolution/promotion boundary.

Final commands:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml ps
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyFoundation10ReleaseCloseout.ts
```

The full regression is intentionally long: it includes real BullMQ transport, DIGITAL/SCANNED/MIXED processing and the real local Qwen E2E inherited from the earlier closeout suites.

Expected final event:
`foundation-10.6.production-release-full-regression.passed`

Only after that event should Foundation 10 be marked CLOSED and the DGX Spark migration/benchmark phase begin.


### Foundation 10.6 compatibility note — explicit checkpoint replay

Foundation 10.2 production duplicate-delivery protection skips a normal COMPLETED ProcessingRun before attempt mutation.
Foundation 6.19, however, intentionally re-enters the same completed run to verify persisted MIXED OCR checkpoint replay.
That regression now opts in explicitly with `allowCompletedReplay: true`; the BullMQ production worker does not set this option.
This preserves both guarantees: production terminal duplicate delivery is skipped, while the historical checkpoint/replay contract remains testable.


## Post-Foundation 10 — Windows Productization Roadmap

Foundation 10 is CLOSED after the full 9/9 production release regression.

The next Windows-local phases are deliberately separated from DGX Spark migration:

1. **Production Cleanup & Optimization**
   - generated artifacts first;
   - then evidence-backed dead/duplicate code only;
   - preserve historical Foundation regression verifiers;
   - preserve compatibility/legacy runtime paths until call-site and regression evidence proves removal is safe;
   - after each cleanup slice: typecheck + focused verifier; after the cleanup phase: full Foundation 10 release regression.

2. **Real Invoice Corpus / Product E2E**
   - build a diverse corpus across companies/layouts;
   - DIGITAL, SCANNED and MIXED; single/multi-page;
   - compare extracted declaration fields against explicit ground truth;
   - record per-field correctness, missing/extra values, review-required behavior and provenance;
   - no parser rule is accepted from a single invoice without regression against the corpus.

3. **Windows Product-Ready Hardening**
   - UI upload-to-result flow;
   - failure/retry/recovery and human-review flows;
   - operational diagnostics;
   - repeatability/idempotency;
   - performance baseline and release checklist.

4. **DGX Spark Migration / Benchmark**
   - only after the Windows product-ready checkpoint;
   - move/benchmark local AI runtime without changing declaration authority semantics.

### Cleanup 0.1 — generated artifact hygiene

Safe first slice:
- remove generated Python `__pycache__` / bytecode from the working tree;
- keep ignore rules already protecting `__pycache__`, `*.py[cod]`, `dist`, `uploads` and diagnostic outputs;
- do not delete historical Foundation verifier scripts;
- do not remove legacy runtime compatibility code in this slice.

Verification:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyProductionCleanupGeneratedArtifacts.ts
```

Expected: `production-cleanup.generated-artifact-audit.passed`.

### Cleanup 0.4 — dependency/runtime optimization evidence pass

This is an audit-only slice. Package candidates are reported from static source imports, but **no dependency is removed automatically** because CLI/build/compiler/test packages can be valid without a runtime import.

The audit includes backend/frontend source plus build-tool configuration entrypoints and explicitly protects historical Foundation regression scripts.

Run:

```powershell
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/auditProductionDependenciesAndRuntime.ts
```

The output is evidence for Cleanup 0.5. Each reported package must be checked against `package.json` scripts, build configuration, Docker/runtime entrypoints and actual call-sites before removal or replacement.

## Windows Product E2E 1.1 — First-Class LLM Invoice Extraction Contract

The productization phase treats local LLM extraction as a peer IDP path, not only as a conflict-resolution helper.

Target routing:
- strong native text -> deterministic extraction + LLM text evidence (`HYBRID_TEXT`);
- usable but imperfect text/OCR -> deterministic and LLM candidate extraction run as peer evidence paths (`HYBRID_PARALLEL`);
- weak/missing OCR with rendered page images and a vision-capable local model -> the LLM may parse the invoice directly from page images (`LLM_VISION_PRIMARY`);
- no usable evidence/provider -> fail closed to review.

`invoice-extraction-v1` is the versioned extraction skill. It defines export-invoice fields, multi-page/line rules, image-vs-OCR behavior, evidence requirements, and the rule that verified retrieval knowledge is guidance rather than authority.

Important boundary: direct LLM parsing means **direct candidate/evidence extraction**, not direct mutation of `normalizedData`. LLM-derived candidates still pass through the Foundation 6 resolution/promotion authority boundary. This preserves provenance, conflict handling, human review and append-only audit semantics.

The existing `qwen3:8b` OpenAI-compatible path is currently text-oriented. Product E2E 1.1 defines the vision route without pretending that the current text provider can consume page images. A later product slice will wire a vision-capable local provider and page-image transport before `LLM_VISION_PRIMARY` is enabled in production.

Verified knowledge will be populated only from deterministic/validated results or explicit human approval. Raw LLM output must never self-promote into long-term knowledge. Vendor/layout examples are retrieved as few-shot guidance for later invoices.

Verification:

```powershell
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyProductE2E11FirstClassLlmContract.ts
```

Expected: `product-e2e-1.1.first-class-llm-contract.passed`.


## Windows Product E2E 1.2 — Vision-capable local Qwen transport

`LLM_VISION_PRIMARY` now has a concrete, separately gated OpenAI-compatible multimodal provider. `LLM_VISION_ENABLED` and `LLM_VISION_MODEL` are intentionally independent from the existing text model so `qwen3:8b` is never misrepresented as image-capable. PDF pages are rendered to PNG and transported as data-URL image content together with the versioned `invoice-extraction-v1` skill.

The provider enforces page/image budgets, JSON-only structured extraction, requested-field allowlisting, confidence bounds and evidence on every returned field. PAGE_IMAGE-only extraction must cite PAGE_IMAGE evidence. Its output remains `InvoiceLlmExtractionResponse` candidate evidence; there is no normalized-data write path.

This slice validates transport and fail-closed capability semantics without pretending a vision model is installed. The next gate is a real local vision-model run against corpus invoices, including an OCR-weak/image-first case.

Verification:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyProductE2E12VisionProviderTransport.ts
```

Expected: `product-e2e-1.2.vision-provider-transport.passed`.

## Windows Product E2E 1.3 — Real image-only Qwen vision gate

This is the first real multimodal product gate. It is intentionally not a mock and does not provide native PDF text or OCR text to the model. A real invoice page is rendered to PNG, sent to the separately configured local vision model, and checked against explicit invoice ground truth.

The initial acceptance invoice is `AAA2026000000009.pdf` (Fiber Beton). It is useful because the single goods row is in the main table while GTIP, origin, delivery term and weights are in the general-explanations area. The verifier therefore checks both table reading and whole-page document understanding.

The invoice extraction skill now defines an exact JSON response shape and explicit `goodsLines[]` array semantics. The vision provider additionally rejects duplicate fields, scalar/array shape violations, and PAGE_IMAGE evidence that cites a page not actually supplied to the model.

Real customer invoices remain local test data under the ignored `uploads/` directory and must not be committed.

Local runtime for the first baseline:

```env
LLM_ENABLED=true
LLM_BASE_URL=http://host.docker.internal:11434
LLM_MODEL=qwen3:8b
LLM_VISION_ENABLED=true
LLM_VISION_MODEL=qwen3-vl:8b
LLM_TIMEOUT_MS=180000
```

Place the acceptance PDF at `uploads/product-e2e/AAA2026000000009.pdf`, recreate backend so Compose receives the changed environment, then run:

```powershell
docker compose -f compose.dev.yaml up -d --force-recreate backend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyProductE2E13RealImageOnlyQwenVision.ts
```

Expected: `product-e2e-1.3.real-image-only-qwen-vision.passed`.

This proves image-only extraction capability only. Production worker routing to `LLM_VISION_PRIMARY` remains a later gate and must not be claimed from this verifier alone.

### Product E2E 1.3.1 — Ollama-native vision transport compatibility

- Real Qwen3-VL image-only E2E reached the model but Ollama's OpenAI-compatible response returned an empty assistant `content` for this structured multimodal call.
- The local Qwen vision provider now uses Ollama's native `/api/chat` multimodal transport with base64 `images`, `stream: false`, `think: false`, JSON output mode, and temperature 0.
- This is a transport compatibility correction only: PAGE_IMAGE evidence validation, requested-field allowlisting, resource budgets, Foundation 6 authority, and the prohibition on direct normalized-data writes are unchanged.
- The 1.2 transport verifier is updated to assert the Ollama-native provider identity; 1.3 remains the real image-only accuracy gate.

### Product E2E 1.3.2 — Provider-Owned PAGE_IMAGE Provenance

- PAGE_IMAGE provenance is normalized from the actual rendered page inputs instead of trusting the vision model to reproduce transport metadata.
- Single-page image-only extraction safely binds evidence to that supplied page while preserving a model quote when present.
- Multi-page image extraction remains fail-closed: the model must identify a PAGE_IMAGE page that was actually supplied; ambiguous provenance is rejected.
- Extraction values/confidence remain model output. This change does not repair or substitute invoice values and does not write normalized data directly.

### Product E2E 1.3.3 — Full Vision Accuracy Report

- The real image-only verifier no longer stops at the first ground-truth mismatch.
- A single Qwen3-VL inference is evaluated against every configured field and prints expected/actual/PASS status plus aggregate accuracy before the gate fails.
- Exact identifiers such as invoice number and GTIP remain exact-match requirements; the verifier does not relax expected values to accommodate model output.
- The gate still exits non-zero when any ground-truth field fails. This is diagnostic expansion only, not an accuracy waiver.


### Product E2E 1.3.4 — Vision extraction hardening

The image-only invoice gate now separates semantic extraction from deterministic representation handling:

- identifiers are exact-transcription strings; repeated digits/zeroes must not be collapsed,
- numeric observations are requested as raw visible strings; locale normalization is application-owned,
- goods origin is explicitly distinguished from seller/buyer/address/destination country mentions,
- Unicode spelling differences such as Turkish dotted `İ` do not create false description failures in the verifier,
- the AAA fixture remains strict ground truth; expected values are not changed to match model output.

For the current Turkish AAA fixture, the verifier applies a deterministic Turkish numeric policy after extraction. This is fixture/product normalization logic, not LLM arithmetic. The gate remains image-only and still requires PAGE_IMAGE provenance.


### Product E2E 1.3.5 — Goods-row association + identifier reliability

The 8B image-only baseline improved from 4/12 (33.3%) to 8/12 (66.7%) after Product E2E 1.3.4. Remaining observed mismatches on the AAA fixture were: invoice number and GTIP each lost one repeated zero, while `4 PALET` was incorrectly associated as the commercial goods quantity/unit instead of the invoiced `2.250 KG`.

1.3.5 hardens the shared, vendor-neutral extraction skill without changing ground truth:
- commercial goods fields must be associated as one row tuple;
- packaging/logistics counts (pallet/package/box/container etc.) must not replace goods quantity/unit unless the invoice row explicitly uses them;
- visible quantity × unit-price × line-total consistency may be used only as a row-association cross-check, never to invent/correct a value;
- invoice/GTIP/product identifiers require a second independent visual transcription and character-by-character agreement; disagreement must become PARTIAL/REVIEW_REQUIRED rather than a guessed identifier.

This is still an image-only model-quality gate. Foundation 6 remains the authority boundary and no direct normalized-data write is introduced.


### Product E2E 1.3.5.1 — vision transport robustness
- Keeps Product E2E 1.3.5 extraction semantics and ground truth unchanged.
- Raises Ollama structured-output budget with `num_predict: 8192` for multi-field vision JSON.
- Keeps model output compact: short evidence quotes, no reasoning/working in the contract.
- Malformed JSON is never silently repaired. Provider now reports Ollama completion diagnostics (`done`, `done_reason`, content bytes, eval count, likely-truncated hint) instead of leaking a raw `JSON.parse` SyntaxError.
- Acceptance remains the unchanged Product E2E 1.3 verifier; 1.3.5 accuracy is still unmeasured until a complete contract response is received.

## Product E2E 1.3.6 — Compact Vision Contract + Explicit Ollama Context

Status: implementation patch prepared; local Windows verification required.

The 1.3.5 extraction rules improved row semantics but the real image-only run ended with
`done_reason=length` and malformed JSON. Product E2E 1.3.5.1 made that failure observable:
the response stopped after 787 evaluated output tokens. Increasing only `num_predict` did not
increase the model's effective context budget.

1.3.6 keeps the production-safe malformed-JSON diagnostics and changes two things without
changing ground truth:

- The vision skill is compact again. It retains the general rules that mattered: exact
  identifier transcription, raw locale-preserving numeric observation, explicit goods-origin
  semantics, same-commercial-row association, and packaging/logistics exclusion. The
  expensive "second visual pass" instruction and verbose contract guidance are removed.
- Ollama vision requests explicitly set `num_ctx: 8192` and cap output with
  `num_predict: 4096`. This gives the page image + prompt + structured response a larger
  actual context window instead of merely increasing the output cap.

The LLM still produces candidate/evidence only. It does not write normalized declaration
data, repair missing identifier digits, or silently change expected values. Identifier
format/reliability checks remain deterministic downstream concerns; an illegible or
conflicting identifier must become partial/review rather than a guessed value.

Verification:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyProductE2E13RealImageOnlyQwenVision.ts
```

Acceptance: the same AAA real-image verifier must complete with valid JSON and report the
unchanged 12-field accuracy matrix. Its result is measured, not assumed. After this run,
the next product-E2E step moves to additional real invoices to avoid single-document
prompt overfitting.

## Product E2E 1.3.6.1 — Exact Requested-Field Contract

Status: implementation patch prepared; local Windows verification required.

The compact 1.3.6 request completed without the previous truncation, but the model returned
the parent field `goodsLines[]` instead of one of the requested leaf field names. The provider
correctly rejected that schema drift.

1.3.6.1 keeps provider validation strict and adds one compact, general contract rule:
every returned `field` must match a caller-requested field name character-for-character;
parent/container aliases such as `goodsLines[]` are forbidden. No AAA-specific values,
ground-truth changes, or permissive provider remapping were added.

Verification remains:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyProductE2E13RealImageOnlyQwenVision.ts
```

Acceptance: valid structured response using only requested leaf field names, followed by the
unchanged 12-field accuracy report.

## Product E2E 1.3.7 — Natural Invoice JSON Adapter

Status: implementation patch prepared; local Windows verification required.

The 1.3.6.x experiments showed that making an 8B vision model emit the application's
internal leaf-field envelope directly is unnecessarily brittle: after truncation was fixed,
the model alternated between a parent `goodsLines[]` field and scalar values where the
internal contract expected parallel arrays.

1.3.7 separates model-facing and application-facing contracts:

- The vision model returns a simple invoice object with document scalars plus a natural
  `goodsLines: [{...}]` array.
- The TypeScript provider deterministically projects that object into the existing strict
  requested-field response: `goodsLines[].description`, `goodsLines[].quantity`, etc. become
  aligned arrays owned by application code.
- The adapter only emits caller-requested fields. It never invents missing values or repairs
  identifiers. Single-page PAGE_IMAGE provenance remains provider-owned.
- F6 authority is unchanged: this output is still candidate/evidence input and has no direct
  normalized-data write path.
- The prior strict-envelope parser remains available for compatibility with providers that
  already return the old envelope.

This is a contract-boundary refactor, not an AAA-specific prompt patch. Ground truth remains
unchanged.

Verification:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyProductE2E13RealImageOnlyQwenVision.ts
```

Acceptance: the real image-only verifier reaches its unchanged 12-field accuracy report
without requiring the model to understand internal parallel-array mechanics. After this
measurement, continue with additional real invoices instead of optimizing only for AAA.

## Product E2E 1.3.8 — Real Invoice Corpus Harness

Status: implementation patch prepared; local Windows measurement required.

The single AAA invoice is no longer used for prompt tuning. 1.3.8 introduces a
measurement-first corpus harness over three additional real invoice layouts:

- `CLK2026000001021.pdf` — Çelikel, EUR, EXW, multi-line goods table.
- `792CD3D2-CAAE-4E7B-978F-C1FE94E50709.pdf` — Textilium, EUR, CIP, textile lines.
- `IHR2026000000035_FAISAL SOUDİ~21770191.pdf` — Makro Boya, USD, EXW, larger goods table.

Real customer PDFs remain local and ignored under `/app/uploads/product-e2e/`; they are not
included in this patch or committed. Expected values are fixed from the supplied invoices
and are not rewritten from model output. This first corpus gate intentionally renders page 1
only so PAGE_IMAGE provenance stays unambiguous while measuring layout generalization.

The harness reports every field mismatch and an aggregate percentage but does not fail the
process merely because model accuracy is below 100%. Runtime, transport, missing-file and
contract failures still fail. This separates "the test infrastructure broke" from "the model
made an extraction mistake".

Copy the three PDFs into local `uploads/product-e2e/` if they are not already there, then run:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyProductE2E138RealInvoiceCorpus.ts
```

This corpus stage is a baseline measurement. Do not tune the prompt to one failing invoice.
The next steps expand coverage to multi-page/scanned invoices and then wire the proven vision
provider into production worker routing while preserving F6 authority.

## Product E2E 1.3.8.1 — Long-Running Vision Corpus Reliability

Status: implementation patch prepared; local Windows verification required.

The first 1.3.8 corpus run reached Node/Undici's independent HTTP headers timeout before
Ollama returned response headers. `LLM_TIMEOUT_MS=900000` therefore could not protect a slow
local vision inference even though the application-level AbortController allowed 15 minutes.

1.3.8.1 changes only transport/harness reliability:

- Ollama vision POST uses Node's native `http`/`https` request path instead of `fetch`, avoiding
  Undici's separate headers-timeout ceiling.
- The existing `LLM_TIMEOUT_MS` AbortController remains the authoritative request deadline.
- Model, prompt, ground truth, context budget and extraction contract are unchanged.
- Corpus runner prints a `started` event and each completed case immediately, then prints the
  aggregate report. If a later case fails, earlier measurements remain visible.

Run:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyProductE2E138RealInvoiceCorpus.ts
```

Local Windows speed is not an acceptance criterion at this stage; the goal is reliable,
observable accuracy measurement. Performance benchmarking belongs to the later deployment
target/Spark or company GPU-server phase.

## Product E2E 1.3.9 — Multi-page + Scanned Vision Corpus

Status: implementation patch prepared; local Windows verification required.

1.3.9 expands the image-only baseline without changing the model, prompt, provider contract,
Foundation 6 authority, or production worker routing.

### DIGITAL multi-page: VED2026000000146(2).pdf

- Renders all 8 pages and sends them in one vision request.
- Fixed source-PDF ground truth is used for document fields plus the first and last goods rows.
- The source PDF contains 56 goods lines. The report also records returned array lengths so
  truncation/alignment loss across pages is visible instead of hidden.
- Ground truth includes invoice `VED2026000000146`, currency `EUR`, delivery `FCA`, and
  source-backed first/last goods values.

### SCANNED multi-page: VED2026000000110(2).pdf

- Renders all 3 scanned pages and sends them image-only.
- This first pass is deliberately observational: it reports extracted fields but does not invent
  expected values that have not been source-verified.
- After the observed output is compared against the real PDF, fixed ground truth can be locked
  for the scanned regression corpus.

Place both real customer PDFs under ignored local `uploads/product-e2e/`; they are never included
in the patch or committed.

Run:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyProductE2E139MultiPageScannedCorpus.ts
```

Long local inference time is acceptable. Performance remains outside the Windows accuracy gate.

### 1.3.9.1 verifier call-signature fix

The initial 1.3.9 verifier incorrectly placed `pageImages` inside the extraction request object.
`QwenVisionInvoiceProvider.extractInvoice` accepts page images as its second argument. The verifier
now uses the same provider call signature already proven by the 1.3.8 corpus. No model, prompt,
ground truth, provider, or production behavior changed.

### 1.3.9.2 context-safe multi-page chunking

The initial all-pages request established a real model/runtime boundary: VED146 produced a
16,314-token prompt while the current Windows Qwen Vision provider intentionally uses an
8,192-token context. This is not treated as an extraction-accuracy failure.

The corpus verifier now uses bounded page chunks:

- VED146: `[1,2]`, `[3,4]`, `[5,6]`, `[7,8]`
- VED110 scanned: `[1,2]`, `[3]`

Each chunk is independently rendered and extracted through the unchanged provider/model/prompt.
The verifier deterministically concatenates goods-line arrays in page order and takes the first
non-empty document-level value for reporting. This is corpus-harness orchestration only; it does
not yet change production worker routing or Foundation 6 authority.

The provider `num_ctx=8192` is deliberately unchanged. Raising context just to force eight
high-resolution page images into one request would hide the architectural boundary and increase
local memory pressure. Production multi-page vision should use bounded chunking/checkpointing.

### 1.3.9.3 deterministic numeric verifier normalization

The first VED146 chunked run completed all four image chunks and returned 55 aligned goods rows
out of 56. Several visually correct numeric extractions were incorrectly scored as failures only
because the verifier passed raw values such as `106,800 EUR`, `1.602,00 EUR`, `73,7100 EUR`, and
`368,55 EUR` directly to `Number`.

1.3.9.3 fixes only comparison normalization:

- strips non-numeric currency/unit suffixes before parsing;
- handles mixed European thousands/decimal separators deterministically;
- treats comma-only values as decimal values for this corpus;
- removes the old ambiguous "single dot + three digits means thousands" heuristic.

Model output remains raw and unchanged. No prompt, provider, expected value, production worker,
Foundation 6 authority, or normalized-data behavior changes.

### 1.3.9.4 scanned-page checkpoint isolation

VED146 now has a corrected digital multi-page baseline of 16/18 checks (88.9%) and 55/56 aligned
goods rows. VED110's first two-page scanned chunk hit the configured inference timeout before an
extraction result was produced; this is a runtime boundary, not an accuracy result.

The scanned verifier now sends one page per bounded inference checkpoint: `[1]`, `[2]`, `[3]`.
Completed chunks are logged before the next page and the existing deterministic page-order merge
is preserved. No timeout, model, prompt, provider, ground truth, production worker, Foundation 6
authority, or normalized-data behavior changes.

## Product E2E 1.4 — Native + OCR + Vision Production Orchestration

### 1.4.1 Production candidate fusion contract

Product E2E 1.3.x established the Windows Qwen Vision baseline and its runtime boundaries. 1.4 moves from isolated Vision benchmarking into the production extraction architecture.

1.4.1 adds the authority-safe fusion boundary:

- Native/OCR deterministic extraction and Vision are peer candidate sources; neither bypasses Foundation 6.
- `PAGE_IMAGE` is now a first-class `FieldCandidate` evidence source.
- Vision `goodsLines[]` arrays are deterministically projected to indexed F6 fields such as `goodsLines.0.hsCode`.
- Vision candidates carry segment/page provenance and stable candidate IDs.
- Candidate fusion only combines evidence-backed candidates; it never selects a winner or writes normalized data.
- Production planning derives Native/OCR evidence quality from the canonical document and retains the 1.1 routing contract.
- Vision work is planned page-by-page so production can checkpoint around the context/output boundaries measured in 1.3.9.

This checkpoint intentionally does not invoke the live Vision provider from the worker yet. The next checkpoint wires bounded Vision execution into invoice segment extraction while retaining deterministic fallback and F6 resolution authority.

Verification:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyProductE2E141ProductionCandidateFusion.ts
```

### Product E2E 1.4.2 — bounded production Vision execution

1.4.2 adds the production-safe execution boundary behind the 1.4.1 plan/fusion contract.

- Vision inference is one page per provider call/checkpoint.
- A failed/timeout/truncated page is explicit and does not discard candidates from completed pages.
- Every successful page response is projected to ordinary F6 `FieldCandidate` evidence with
  `PAGE_IMAGE` provenance.
- Page results are merged as peer candidates only; no winner is selected here.
- There is still no direct `normalizedData` write path.
- Provider/model/prompt/context limits are unchanged.

This checkpoint deliberately keeps persistence/worker wiring separate. The next checkpoint wires
this bounded executor into the real invoice worker after deterministic extraction, then persists the
fused candidate snapshot through the existing worker/F6 boundary.

### Product E2E 1.4.3 — real worker Vision candidate fusion

The invoice worker now executes the production sequence:

`Native/OCR deterministic extraction -> bounded per-page Vision -> peer candidate fusion -> existing worker candidate persistence -> existing resolver/validator/F6 lifecycle`.

Important authority/reliability properties:

- Vision is enabled only through the existing LLM/Vision environment gates.
- Every invoice page is an independent Vision inference boundary.
- A failed Vision page is retained in `visionCandidateAudit.failedPages`; successful page candidates
  and deterministic Native/OCR candidates remain usable.
- Multi-page goods rows receive a cumulative page-order offset so page-local `goodsLines[0]` values
  do not collide with earlier pages.
- The fused raw extraction envelope is persisted through the existing
  `persistWorkerCandidateExtraction()` boundary; F6 remains the only declaration authority.
- No Vision code writes `normalizedData` directly.

1.4.3 intentionally does not require every Vision page to succeed. Product readiness depends on
the fused evidence/resolution/review path, not on pretending a local 8B model has unlimited context
or generation capacity.

### Product E2E 1.4.4 — real production worker fusion E2E

1.4.4 crosses the synthetic boundary. The verifier creates a real DIGITAL invoice PDF, invokes the
actual production `processIdpJob()`, renders the invoice page, calls the configured real Vision
provider, and then inspects persisted worker/F6 state.

Acceptance is architectural rather than tied to one model's exact wording:

- production worker completes;
- at least one bounded Vision page checkpoint succeeds and no page is silently lost;
- deterministic Native/OCR/derived candidates survive;
- real `PAGE_IMAGE` Vision candidates coexist in the persisted declaration snapshot;
- the fused snapshot reaches the existing Foundation 6 declaration-resolution audit;
- Vision still has no direct `normalizedData` write authority.

This verifier intentionally requires `LLM_ENABLED=true` and `LLM_VISION_ENABLED=true`. It is a
real-model E2E and may take materially longer than 1.4.1-1.4.3 contract verifiers.

### Product E2E 1.4.4.1 — Field resolver local-model contract hardening

The real 1.4.4 worker run proved both Vision inference and the text conflict resolver were invoked.
The text model returned the protocol version as JSON number `1`, while the field resolver accepted
only string `"1"`. The field response adapter now mirrors the already-established declaration
adapter behavior: string `"1"` and numeric `1` are canonicalized to protocol version `"1"`;
missing or any other version still fails closed and reports the received value.

The field resolver prompt now also states the exact evidence-constrained response contract. No
candidate authority, Foundation 6 resolution rule, or normalized-data write boundary changed.

### Product E2E 1.4.4.2 — Vision numeric candidate canonicalization

The real 1.4.4 worker reached field-level LLM resolution successfully, then deterministic invoice
validation rejected quantity, unit price, and line total because the selected Vision candidates
carried numeric values as JSON strings. Production Vision projection now canonicalizes only known
numeric invoice fields (`quantity`, `unitPrice`, `lineTotal`, `grossKg`, `netKg`) before candidate
fusion. Common invoice formats such as `10.00 USD`, `7,50`, and `1.602,00 EUR` become finite numbers.

This is representation normalization, not candidate selection: the Vision candidate and PAGE_IMAGE
evidence remain intact, F6 still chooses authority, and unrecognized numeric text remains unchanged
so validation continues to fail closed rather than guessing.

### Product E2E 1.4.4.3 — Invoice-date promotion canonicalization + lifecycle assertion

The real 1.4.4 worker completed extraction/resolution/validation, but declaration lifecycle promotion
failed because the selected invoice date `23.09.2026` was written directly to a Mongoose `Date`
path. Foundation 6 promotion now canonicalizes only the mapped `header.invoiceDate` value at the
persistence boundary. Strict `DD.MM.YYYY`/`DD/MM/YYYY` and `YYYY-MM-DD`-style calendar dates become
UTC `Date` values; impossible or unrecognized dates are left unchanged so the existing schema
continues to fail closed rather than guessing.

The immutable resolution/source provenance retains the selected candidate's original value. The
1.4.4 real-worker verifier now also requires a persisted declaration resolution plus the canonical
`2026-09-23` Date, so a swallowed declaration-lifecycle failure can no longer produce a false PASS.

### Product E2E 1.4.7 — Persisted Vision checkpoint / retry resume

- `ProcessingRun.visionCandidateCheckpoint` persists bounded PAGE_IMAGE extraction after every page.
- A retry reuses COMPLETED page candidates and invokes Vision only for missing/FAILED pages.
- Persisted page candidates reconstruct the fused envelope without direct normalized-data authority.
- Goods-line ordinal offset is reconstructed from persisted page candidates before later pages resume.
- Verification: `backend/scripts/idp/verifyProductE2E147PersistedVisionCheckpointResume.ts`.

### Product E2E 1.4.8 — Vision checkpoint compatibility / stale-reuse guard

Persisted Vision page candidates are now scoped by an execution compatibility key derived from the
invoice Vision contract, provider, configured Vision model, and requested field set. COMPLETED pages
are reused only when that key matches exactly. A model/contract/field-set change, or a legacy
checkpoint without a key, starts a fresh Vision checkpoint instead of silently reusing stale model
output. F6 remains the only normalized-data authority.

Verification: `backend/scripts/idp/verifyProductE2E148VisionCheckpointCompatibility.ts`.

### Product E2E 1.4.9 — Production fusion persisted retry boundary

The production invoice Vision fusion now exposes narrow injectable provider/renderer seams so recovery
can be verified deterministically without spending a real-model inference run. Normal worker callers
still use `QwenVisionInvoiceProvider` and the real PDF renderer by default.

The verifier persists page checkpoints on a real `ProcessingRun` in MongoDB, leaves page 1 COMPLETED
and page 2 FAILED, then reconstructs a retry from the persisted checkpoint. The retry must skip page 1,
retry page 2, recover page 1 candidates into the fused envelope, preserve goods-line ordinals, and
replace the failed page checkpoint with COMPLETED. No normalized-data authority is added.

Verification: `backend/scripts/idp/verifyProductE2E149ProductionFusionPersistedRetry.ts`.

### Product E2E 1.5.0 — Fixed real-invoice corpus ground-truth contract

The Windows product-hardening phase starts from a fixed local real-invoice corpus rather than
invoice-specific production fixes. The first corpus contract contains four heterogeneous invoices
with source-verified first-line expectations for invoice identity, currency/delivery metadata and
core goods fields. Customer PDFs remain under ignored `uploads/product-e2e/`; only the verifier's
fixed expectations are versioned.

The contract fails on missing local fixtures, duplicate corpus identities, malformed 12-digit GTIP
expectations, or non-finite numeric ground truth. It performs no LLM inference and has no declaration
write authority. Subsequent 1.5.x checkpoints use this stable corpus to measure production extraction
and classify failures by pipeline layer before any general-purpose fix is accepted.

Verification: `backend/scripts/idp/verifyProductE2E150CorpusGroundTruthContract.ts`.

### Product E2E 1.5.1 — Real corpus Vision accuracy matrix
- Uses the fixed 1.5.0 ground-truth contract as the single source of expected values.
- Measures first-page PAGE_IMAGE extraction for all four heterogeneous real invoices using the configured Vision provider.
- Measurement-first: extraction mismatches are reported per field and do not masquerade as infrastructure failures.
- `PRODUCT_E2E_CASE=<id>` can isolate one corpus case without changing production code.
- No customer PDF is committed and no normalized declaration state is written.

### Product E2E 1.5.2 — Vision invoice-number canonicalization

The fixed corpus exposed a repeated Vision-only error: three independent Turkish-style invoice identifiers lost exactly one leading zero from the numeric sequence. The provider now applies a deliberately narrow repair only to the 15-character `AAA + 20YY + 8 digits` shape, padding the sequence to nine digits. Already-canonical 16-character identifiers and arbitrary/foreign identifier shapes are preserved unchanged. This is provider-side candidate canonicalization only; it does not write `normalizedData` and does not change F6 authority.

Verifier: `backend/scripts/idp/verifyProductE2E152VisionInvoiceNumberCanonicalization.ts`.

### Product E2E 1.5.3 — GTIP source-coverage matrix

The real-invoice corpus now classifies Vision GTIP misses before any extraction rule is changed. For each fixed corpus invoice, the verifier checks whether the source PDF's native canonical text contains the expected 12-digit GTIP and whether the existing deterministic invoice candidate path already produces that GTIP. Each case is classified as deterministic peer-source coverage, source-visible parser gap, or GTIP not visible to native text. This is measurement-only, performs no model inference, and writes no normalized declaration state.

Verifier: `backend/scripts/idp/verifyProductE2E153GtipSourceCoverageMatrix.ts`.

### Product E2E 1.5.4 — source-visible GTIP association hardening
- Exact 12-digit GTIP evidence is no longer rejected only because it appears outside the legacy goods-table/right-side geometry.
- Ambiguous repaired 10/11-digit candidates remain behind the historical geometry guard; this change does not globally promote padded values.
- Corpus verifier requires all fixed DIGITAL corpus GTIPs to materialize as deterministic NATIVE_TEXT candidates without supplier-specific rules or model inference.

### Product E2E 1.5.5 — Full production corpus fusion matrix

Measurement checkpoint over the fixed real-invoice corpus. Each case runs through the real production worker (native/deterministic extraction, OCR when applicable, configured Vision fusion, persisted declaration candidate snapshot, and Foundation 6 authority). The matrix scores only values actually promoted into declaration normalizedData; REVIEW_REQUIRED remains a valid fail-closed product outcome and is reported rather than converted into a false success. Candidate evidence-source coverage is emitted beside every scored field so subsequent hardening targets general extraction/normalization/authority gaps instead of supplier-specific rules. Customer PDFs remain local under ignored `uploads/product-e2e/`.

### Product E2E 1.5.6 — Declaration authority validation gate

The 1.5.5 production corpus matrix exposed an authority-ordering problem rather than a corpus accuracy result: peer Native/Vision candidates were persisted, but the legacy segment-level invoice validator could stop the worker before Foundation 6 saw those candidates. This made every corpus case REVIEW_REQUIRED with zero promoted fields even when correct peer evidence existed.

1.5.6 keeps legacy validation and its audit result, but when a non-empty declaration-facing FieldCandidate envelope is already persisted, invoice validation REVIEW_REQUIRED becomes advisory for worker completion so Foundation 6 can make the authoritative field-level decision. Missing/empty declaration candidates and unrelated validators remain fail-closed. This does not write normalizedData directly and does not weaken Foundation 6 authority.

### Product E2E 1.5.7 — Declaration Authority Resolution Gate

- Legacy segment-level LLM resolution remains useful for validation/extractedData, but a `REVIEW_REQUIRED` result no longer blocks Foundation 6 when a non-empty persisted declaration candidate envelope already exists.
- Missing/empty declaration candidates preserve the previous fail-closed behavior.
- The deferred path carries candidate extraction forward only; it does not write `normalizedData`. Foundation 6 remains the sole declaration authority.

### Product E2E 1.5.8 — Vision → Foundation 6 Field Contract

- Maps natural Vision invoice field names onto the canonical declaration/F6 field vocabulary before candidate persistence.
- `invoiceNumber → invoiceNo`, `seller/buyer → parties.*.name`, `origin → originCountry`, and `grossKg/netKg → grossWeight/netWeight`.
- Adds explicit promotion targets for canonical seller/buyer name fields; existing header/trade/package and goods-line targets remain unchanged.
- This is a contract adapter only: Vision remains peer evidence, PAGE_IMAGE provenance is preserved, and normalizedData is still written only by Foundation 6 promotion.
- Verification: `backend/scripts/idp/verifyProductE2E158VisionFoundation6FieldContract.ts`.

### Product E2E 1.5.9 — Direct-source GTIP authority

When a goods-line HS/GTIP field contains one unambiguous exact 12-digit value backed by direct `NATIVE_TEXT` evidence, Foundation 6 may explicitly select that candidate over a conflicting `PAGE_IMAGE` interpretation. All peer candidates remain in the persisted/audited resolution envelope. Vision-only GTIPs are unchanged; conflicting native GTIPs remain `REVIEW_REQUIRED`; no authority is generalized to unrelated fields.

### Product E2E 1.5.10 — Delivery-term source coverage measurement

Before changing delivery-term authority or extraction, the fixed real-invoice corpus measures whether the existing deterministic commercial-terms discovery already exposes the source-verified Incoterm as `trade.deliveryTerm`. The verifier reports candidate values, provenance and evidence text and classifies each invoice as deterministic peer-source coverage, deterministic source conflict, or deterministic source gap. It performs no model inference and writes no declaration state. This checkpoint is measurement-only so a Vision semantic error such as `IHRACAT` versus `CIP` is not patched with invoice-specific logic.

Verification: `backend/scripts/idp/verifyProductE2E1510DeliveryTermSourceCoverage.ts`.

### Product E2E 1.5.11 — Direct-source delivery-term authority

The 1.5.10 corpus measurement proved that all four fixed DIGITAL invoices already expose the source-verified Incoterm through deterministic `NATIVE_TEXT` commercial-term discovery. Production fusion now projects that shadow `trade.deliveryTerm` evidence onto the canonical Foundation 6 `deliveryTerm` field before Vision fusion. When exactly one valid Incoterms 2020 value is unambiguously backed by native text, Foundation 6 may explicitly select it over a conflicting PAGE_IMAGE interpretation while retaining every peer candidate in the audit envelope. Conflicting native Incoterms remain REVIEW_REQUIRED, arbitrary native text such as `IHRACAT` does not gain authority, GTIP authority remains unchanged, and no normalized declaration data is written outside Foundation 6 promotion.

Verification: `backend/scripts/idp/verifyProductE2E1511DirectSourceDeliveryTermAuthority.ts`.

### Product E2E 1.5.12 — GTIP / business-identifier disambiguation
- Hardens generic source-visible GTIP discovery after the real Textilium production rerun exposed a 12-digit trade-registry identifier being treated as the first goods-line GTIP.
- A 12-digit token is rejected only when its visual line carries an explicit business-identifier label (VKN/tax id/trade registry/MERSIS/ETTN). This is semantic context, not supplier/layout coordinates.
- Exact source-visible GTIPs in goods rows or explanation text remain eligible; Foundation 6 remains the only normalized-data authority.
- Verification: `backend/scripts/idp/verifyProductE2E1512GtipIdentifierDisambiguation.ts`.

### Product E2E 1.5.13 — GTIP candidate provenance diagnostic

- Adds a measurement-only Textilium diagnostic for the remaining false `goodsLines.0.hsCode=084104695730` production result.
- Runs the real PDF analyzer and deterministic invoice extractor without LLM/Vision inference or database mutation.
- Compares the production legacy candidate enricher with generic candidate discovery and prints raw item GTIP/box/source provenance.
- Purpose: identify the exact upstream path before changing GTIP authority or adding another heuristic.

### Product E2E 1.5.14 — Legacy GTIP goods-row hardening

- Hardened the legacy Python GTIP discovery path after 1.5.13 proved that embedded 12-digit substrings from business/header identifiers were being materialized as goods rows.
- Exact GTIP authority in the legacy path now requires a standalone 12-digit token and rejects explicit business-identifier row context; repaired 10/11-digit behavior retains its existing geometry guard.
- This prevents invoice-number/registry substrings from shifting goods-line ordinals while preserving real standalone GTIP rows.
- Added a real Textilium deterministic verifier that requires the production legacy candidates to compact to `goodsLines.0=610510000000` and `goodsLines.1=610990200012`, with generic discovery unchanged. No model inference or normalized-data write is involved.

### Product E2E 1.5.15 — Goods-row alignment diagnostic

- Adds a measurement-only Textilium diagnostic after 1.5.14 corrected GTIP row ordinals but the real production rerun left quantity/unit/unitPrice in review.
- Compares complete goods-row candidates from `invoice-canonical-v1` and `invoice-generic-layout-v15`, together with normalized goods lines and legacy raw-item values.
- Purpose: determine whether the remaining mismatch originates in legacy row extraction, normalized-item mapping, or peer-candidate conflict before changing Foundation 6 authority.
- No LLM/Vision inference, database mutation, or normalized-data write is performed.

Verification: `backend/scripts/idp/verifyProductE2E1515GoodsRowAlignmentDiagnostic.ts`.

### Product E2E 1.5.16 — Legacy goods scalar association hardening
- Hardened legacy invoice goods-row scalar extraction after 1.5.15 showed that GTIP row identity was correct while row 0 quantity/unitPrice were still taken from the row number/line total.
- Quantity association now prefers a numeric token to the right of an explicit unit token before falling back to legacy nearest-neighbour behavior.
- Turkish money parsing accepts 1–4 decimal digits so source values such as `14,8` can participate in quantity × unitPrice = lineTotal validation instead of falling back to the line total as unit price.
- No supplier-specific rule, no direct normalizedData write, and no LLM inference are introduced.

### Product E2E 1.5.17 — Canonical goods-unit normalization
- Canonicalizes only `goodsLines.N.unit` string candidate values at the declaration-candidate projection boundary by trimming/collapsing whitespace and applying locale-aware uppercase normalization.
- Peer values such as `ADET`/`Adet`, `KG`/`Kg`, and `pcs`/`PCS` therefore reach Foundation 6 as the same categorical value and resolve by normal consensus rather than an extractor-specific authority rule.
- Candidate evidence is left untouched, preserving the original source text for audit; unrelated fields are unchanged.
- No supplier-specific rule, model inference, database mutation, or direct normalizedData write is introduced.

Verification: `backend/scripts/idp/verifyProductE2E1517CanonicalGoodsUnitNormalization.ts`.

### Product E2E 1.5.18 — Context-aware weight candidate canonicalization
- Canonicalizes only declaration-facing `grossWeight` / `netWeight` candidates that explicitly carry a kilogram unit, before Foundation 6 resolution.
- Turkish invoice display forms such as `2.320 Kg.` and `2.250 Kg.` become numeric kilograms `2320` and `2250`; decimal forms such as `2,320 kg` remain `2.32`.
- Unitless numeric strings and non-kilogram units remain untouched, avoiding a global numeric heuristic. Candidate evidence keeps the original source text for audit.
- Peer numeric/string representations can therefore reach Foundation 6 consensus and packageInfo receives numeric values without direct normalizedData writes.

Verification: `backend/scripts/idp/verifyProductE2E1518ContextAwareWeightCandidateCanonicalization.ts`.

### Product E2E 1.5.19 — Fiber Beton unit source coverage diagnostic
- Measurement-only diagnostic for the remaining Fiber Beton `goodsLines.0.unit` gap after weight canonicalization restored declaration lifecycle.
- Compares legacy production and generic unit candidates and records canonical KG/quantity source tokens without model inference or database mutation.
- The diagnostic classifies the gap before any unit-association rule is added; customer corpus PDFs remain local/ignored.

### Product E2E 1.5.20 — Geometry-aware goods unit association

- When a fused `goodsLines.N.quantity` is known but its unit is missing, production fusion may recover an explicit unit only from canonical source words that contain the same numeric quantity immediately followed by a recognized unit on the same visual row.
- The rule is source/layout generic: no supplier coordinates or invoice-specific literals. Conflicting explicit units are retained as peer candidates so Foundation 6 remains fail-closed; existing unit candidates are never overridden.
- Unit evidence keeps the original source token and Native/OCR provenance. No direct `normalizedData` write and no model inference are introduced.

### Product E2E 1.5.21 — Invoice date-time promotion canonicalization
- Extends the existing narrow invoice-date promotion boundary to accept a valid optional `HH:mm[:ss]` suffix (for example `24-04-2026 16:41`).
- Persists the invoice calendar date as UTC midnight; source/provenance evidence remains unchanged.
- Invalid clock/calendar values and unrelated fields remain fail-closed/unchanged.
- No supplier-specific rule, model inference, database-side mutation shortcut, or direct normalized-data authority is introduced.

### Product E2E 1.5.22 — Remaining corpus conflict diagnostic
- Measurement-only deterministic diagnostic for the five remaining fixed-corpus checks after Textilium/Fiber Beton reached 9/9.
- Compares production legacy and generic deterministic candidates for Çelikel `invoiceNo`/row-0 quantity and Makro row-0 description/quantity/unitPrice, together with normalized/raw row data and matching canonical source lines.
- Purpose: separate upstream extraction/row-association errors from peer-source/F6 conflicts before adding authority or normalization rules.
- No LLM/Vision inference, database mutation, customer-PDF commit, or direct normalized-data write is introduced.

Verification: `backend/scripts/idp/verifyProductE2E1522RemainingCorpusConflictDiagnostic.ts`.

### Product E2E 1.5.23 — source-backed header + arithmetic quantity canonicalization
- Promotes source-visible generic header/party candidates into the production F6 candidate fusion vocabulary (`header.invoiceNo` -> `invoiceNo`, date likewise) without bypassing Foundation 6.
- Resolves the otherwise ambiguous `1.600` / `1.575` quantity representation only when the same goods row's `unitPrice × quantity = lineTotal` arithmetic uniquely supports one interpretation. Genuine decimal quantities remain decimal; unresolved ambiguity fails closed.
- Source evidence remains unchanged and no normalized declaration field is written directly.

### Product E2E 1.5.24 — persisted authority conflict diagnostic

- Reads the latest persisted Product E2E ProcessingRun for CLK/Çelikel and Makro Boya without invoking OCR, Vision, or the text LLM again.
- Dumps the exact F6/declaration-facing candidates for the remaining accuracy gaps: CLK `invoiceNo`; Makro `goodsLines.0.description` and `goodsLines.0.unitPrice`.
- Includes candidate value, confidence, extractor, evidence source/text/bbox, worker-fusion snapshot, and resolver output so the next fix is based on the actual persisted conflict rather than supplier-specific assumptions.
- Measurement only: no DB mutation, no direct normalized write, no customer PDF is committed.

Verifier:

```powershell
npm run typecheck
npm run typecheck --prefix frontend
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyProductE2E1524PersistedAuthorityConflictDiagnostic.ts
```

### Product E2E 1.5.24.1 — In-run authority conflict diagnostic
- Replaces the invalid 1.5.24 assumption that product-E2E uploads/runs remain persisted after the harness completes; the 1.5.5 harness intentionally deletes its temporary declaration/upload/run records in `finally`.
- With `PRODUCT_E2E_CONFLICT_DIAGNOSTIC=true`, the existing full-production corpus harness now emits the targeted declaration-candidate values/evidence **before** cleanup for the remaining authority conflicts: Çelikel `invoiceNo`, Makro `goodsLines.0.description`, and Makro `goodsLines.0.unitPrice`.
- The diagnostic does not trigger any model call beyond the production run already requested and does not change candidate generation, Foundation 6 authority, promotion, or normalized data.
- Customer PDFs remain local/ignored; diagnostic output is measurement-only.

Verification: run `verifyProductE2E155FullProductionCorpusFusionMatrix.ts` with both `PRODUCT_E2E_CASE=<case>` and `PRODUCT_E2E_CONFLICT_DIAGNOSTIC=true`.

### Product E2E 1.5.25 — Evidence-aware declaration candidate authority
- Extends the existing Foundation 6 explicit-candidate authority boundary without changing the fail-closed declaration resolver.
- Exact native invoice-number evidence can outrank conflicting page-image header pollution only when the native evidence text directly contains the candidate value.
- Native goods-line unit price can gain authority only when the same logical row provides a unique arithmetic corroboration (`quantity × unitPrice = lineTotal` within tolerance); ambiguous arithmetic remains `REVIEW_REQUIRED`.
- Conflicting Vision candidates remain in the candidate/audit envelope; authority selection does not delete evidence or write normalized values directly.
- Missing description truth is intentionally not synthesized by resolution. If no correct description candidate exists, the field remains review-required.
- Focused verifier: `backend/scripts/idp/verifyProductE2E1525EvidenceAwareCandidateAuthority.ts`.
- Production verification (2026-09-29): Çelikel improved from 8/9 to 9/9 with `invoiceNo=CLK2026000001021`; Makro Boya improved from 7/9 to 8/9 with `goodsLines.0.unitPrice=7.75`. Existing direct-source GTIP and Incoterm authority regressions remained green.

### Product E2E 1.5.26 — Baseline-first goods description reconstruction
- The measurement-only native coverage diagnostic proved the remaining Makro Boya description miss was not a PDF/native-text, Vision, resolver, or authority failure: the source-visible raw row contains the target item tokens, while legacy normalized extraction reduced the description to a continuation fragment.
- Legacy goods description reconstruction now prefers human-readable tokens on the actual goods-row baseline before the detected quantity boundary. Nearby header/continuation text inside the broad legacy row window is therefore not allowed to replace primary row semantics.
- Product/article codes remain eligible inside the human-readable description even when independently projected to `productCode`; this preserves invoice-visible item naming without collapsing the two semantic fields.
- Only a leading short integer is treated as the row ordinal, so numeric model/article tokens inside the item text (for example `306` or `108`) remain valid description content.
- If the anchor baseline contains no meaningful description, the established continuation/fallback extraction path remains active for wrapped descriptions.
- No supplier/invoice literal, fixed supplier coordinate, model inference, declaration-resolver change, authority shortcut, or direct normalized-data write is introduced.
- Deterministic verifier: `backend/scripts/invoice_parser/verify_description_reconstruction_1526.py`.
- Real production acceptance remains the existing Makro Boya product E2E case; run it only after typecheck and the deterministic verifier pass.

### Product E2E 1.5.26.1 — Row-corroborated native description authority
- Production acceptance after 1.5.26 proved candidate generation is fixed (`TYLOSE 100000` is present in raw extraction, normalized goods lines, and the production native description candidate), while the declaration still remained review-required because the conflicting page-image description stayed a peer candidate.
- Extends the existing explicit Foundation 6 direct-source authority boundary to goods descriptions only when the description value is directly present in native evidence and at least two independent native goods-row anchors (`hsCode`, `productCode`, `quantity`, `unitPrice`, `lineTotal`) share the same deterministic production row identity.
- Authority is deliberately independent of left/right column order. A description may therefore appear before or after quantity in future layouts; row identity and source evidence, not a fixed coordinate/order rule, determine whether native evidence is authoritative.
- A description with mismatched source text, insufficient row corroboration, or anchors belonging to another row receives no authority and remains fail-closed/`REVIEW_REQUIRED` when peers conflict.
- Conflicting Vision candidates remain in the audit envelope. Foundation 6 resolver semantics are unchanged; no supplier/invoice literal, model inference, direct normalized-data write, or customer-PDF commit is introduced.
- Focused verifier: `backend/scripts/idp/verifyProductE2E15261RowCorroboratedDescriptionAuthority.ts`.
- After backend/frontend typecheck and the focused verifier pass, rerun only the Makro Boya product E2E case for real production acceptance before any full-corpus rerun.


### Product E2E 1.5.26.2 — Baseline/continuation description compatibility
- Full-corpus regression after 1.5.26/1.5.26.1 showed that absolute baseline-first return was too aggressive for wrapped goods descriptions: a valid first-line token could replace a richer multi-line description that had previously been extracted correctly.
- Description reconstruction now computes both anchor-baseline and established continuation candidates. A continuation is preferred only when it contains every normalized semantic token already established on the anchor baseline; otherwise the baseline remains authoritative.
- This keeps source-visible row semantics such as product/model tokens when the old column window misses them, while preserving legitimate wrapped descriptions instead of truncating them to one baseline fragment.
- The rule is supplier-agnostic and does not depend on customer names, GTIP values, product literals, fixed coordinates, model inference, or direct normalized-data writes.
- The existing row-corroborated declaration authority remains fail-closed and unchanged.
- Deterministic verifier: `backend/scripts/invoice_parser/verify_description_reconstruction_1526.py`.
- Full production corpus acceptance must be rerun only after deterministic/typecheck gates pass; target remains 36/36.

### Product E2E 1.5.26.4 — Vertical description continuation + structured GTIP occurrence authority

The focused native diagnostics isolated two parser-level regressions rather than declaration-authority defects:

- wrapped goods descriptions may continue vertically below the commercial row baseline (for example, a baseline fragment followed by one or more semantic description lines);
- a 12-digit GTIP may be repeated later in footer/notes, where it must not materialize a second pseudo goods row when the same page already contains a structured occurrence of that GTIP.

Production behavior now reconstructs description text from the anchor baseline plus only close vertical semantic continuation rows inside the detected description right boundary. A leading short row ordinal terminates continuation so text from the next goods row cannot bleed into the current row. Product/article tokens remain valid visible description semantics.

GTIP occurrence filtering is evidence-aware and fail-closed: for repeated page+GTIP occurrences, a weak occurrence is suppressed only when a peer occurrence has strong goods-row evidence (quantity/unit/price/amount). Multiple strong occurrences of the same GTIP are retained, preserving legitimate invoices where separate goods rows share one tariff code.

Guardrails:

- no supplier/customer names or invoice-specific literals in production logic;
- no fixed GTIP/product-code allowlists;
- no model/Vision inference added;
- no declaration resolver or Foundation 6 authority change;
- no direct normalized write;
- footer suppression requires a stronger structured peer and does not globally deduplicate equal GTIPs.

Deterministic verifier:

`backend/scripts/invoice_parser/verify_description_reconstruction_1526.py`

The verifier covers baseline/header-noise separation, visible product-code retention, multi-line vertical descriptions, next-row termination, footer GTIP suppression, and preservation of multiple strong rows sharing a GTIP.

After this deterministic gate passes, rerun the model-free native corpus regression gate before any expensive Vision corpus run. The target remains restoration of the fixed four-document Product E2E corpus to 36/36 without supplier-specific rules.

### Product E2E 1.5.26.5 — Detached GTIP / normalized row geometry hardening
- Fixed canonical DIGITAL row-neighborhood handling so normalized 0..1 PDF coordinates use tight row bands instead of legacy pixel-scale tolerances.
- Goods-row strength is derived only from structured commercial evidence (quantity, unit, unit price, amount and arithmetic corroboration); description/free text does not make a footer GTIP occurrence authoritative.
- When a GTIP is disclosed away from the goods table, it is re-anchored only if the page has exactly one arithmetic-corroborated commercial row. Multiple plausible rows remain detached/fail-closed instead of being guessed.
- Existing structured GTIP occurrences remain preferred, duplicate weak footer occurrences remain suppressed, and multiple genuine strong rows sharing the same GTIP remain preserved.
- Description reconstruction uses coordinate-system-aware vertical windows, retaining legitimate wrapped descriptions without consuming distant footer/header text.
- Deterministic regression coverage includes detached-footer GTIP re-anchoring, ambiguous multi-row fail-closed behavior, normalized DIGITAL row bands, vertical description continuation, duplicate suppression and same-GTIP multi-row preservation.
- No supplier/customer-specific production rule, additional model inference, direct normalized write, or customer PDF commit is introduced.


### Product E2E 1.5.27 — Concurrent production corpus queue + isolation

- Extends the existing Foundation 6.17 synthetic BullMQ concurrency/isolation proof to the fixed four-invoice Product E2E production corpus.
- Enqueues all four real corpus invoices together through `enqueueDocumentProcessing`; the verifier never invokes `processIdpJob` directly and therefore requires the external `idp-worker` service and Redis/BullMQ transport.
- Requires at least two configured worker slots and more corpus jobs than worker concurrency, then proves overlapping processing plus observable queue backpressure while the worker is at capacity.
- Re-validates the same 36 fixed ground-truth assertions after concurrent processing and requires every run to complete on attempt 1.
- Verifies per-company/declaration logical-document ownership, ProcessingRun ownership, resolution-audit isolation, and absence of cross-company leakage.
- Uses the real configured Vision provider. No supplier-specific production rule, direct normalized write, or customer-PDF commit is introduced.
- Verifier: `backend/scripts/idp/verifyProductE2E1527ConcurrentProductionCorpusQueue.ts`.


#### Product E2E 1.5.27.1 — Long-running concurrent queue observability

The concurrent production-corpus verifier now allows up to 90 minutes for four real Vision/LLM jobs under shared worker capacity. The previous 45-minute verifier deadline could expire while BullMQ workers were still making healthy progress under concurrent model contention. The verifier emits a progress snapshot on every state transition and at least once per minute, including elapsed time, active/waiting counts, and per-corpus ProcessingRun/BullMQ state. Timeout errors now include the final state of every corpus job. This is verifier-only observability/timing hardening; production queue concurrency, worker behavior, candidate authority, resolution semantics, and normalized writes are unchanged.

### Product E2E 1.5.27.2 — Concurrent description authority diagnostic

The concurrent production-corpus verifier now emits the persisted declaration resolution audit before cleanup when a fixed-ground-truth field diverges. For the first goods-line description it records the exact candidate IDs, values, confidence, native/page-image evidence text, and persisted field resolution. This is measurement-only and does not weaken the production assertion or mutate normalized data.

For focused reproduction, `PRODUCT_E2E_CONCURRENT_CASES` may select two or more fixed corpus IDs (for example `clk-celikel,makro-boya`). The selected jobs still travel through Redis/BullMQ and the external production worker concurrently; this avoids repeating all four expensive Vision jobs while diagnosing a concurrency-only divergence. The default remains the complete four-case corpus.

Guardrails: no supplier-specific production rule, no resolver bypass, no direct normalized write, no additional model call beyond the selected production jobs, and cleanup remains best-effort after diagnostic capture.

### Product E2E 1.5.27.3 — diagnostic assertion ordering

The concurrent production-corpus verifier now distinguishes the full queue-capacity proof from a reduced diagnostic run. Backpressure is required only when the selected corpus contains more jobs than `IDP_WORKER_CONCURRENCY`; a two-case diagnostic on a two-slot worker still requires real overlap and concurrency ceilings, but cannot logically require a waiting job. Ground-truth validation runs before the optional backpressure assertion so a description-authority divergence emits its persisted candidate/resolution diagnostic instead of being masked by a queue-shape assertion. Production extraction, authority, worker, and normalized-write behavior are unchanged.

### Product E2E 1.5.27.4 — Generic field lifecycle diagnostic

The concurrent production-corpus verifier now emits one generic lifecycle diagnostic before a fixed-ground-truth assertion fails. The diagnostic covers the nine corpus-authoritative fields (`invoiceNo`, `currency`, `deliveryTerm`, first-line `description`, `hsCode`, `quantity`, `unit`, `unitPrice`, and `lineTotal`) instead of adding one-off diagnostics for individual fields or suppliers.

For each field it records the normalized value, persisted candidate envelope, evidence provenance, field-resolution status/method/value, selected candidate, and available persisted promotion/review metadata. This is measurement-only verifier instrumentation: it does not mutate production data, weaken fixed ground truth, add supplier-specific parsing rules, invoke `processIdpJob()` directly, or write normalized declaration values.

This checkpoint is intended to distinguish extraction/candidate loss from resolution/authority/promotion loss when concurrent model workloads produce a different normalized result. Production behavior must only be changed after the persisted lifecycle evidence identifies the common failing boundary.

### Product E2E 1.5.28 — Concurrent failure isolation + retry recovery
1.5.28 extends the real BullMQ concurrency boundary with a mixed terminal-outcome checkpoint. Two independent company/declaration uploads are enqueued together through the production queue service: one valid DIGITAL synthetic control document and one deliberately missing-file upload that fails deterministically during ANALYZE before Vision/LLM work can begin. No production failure hook or supplier-specific behavior is introduced.

The verifier requires the healthy job to complete on attempt 1 while the failing peer independently traverses the configured BullMQ retry/backoff policy and reaches durable `FAILED` only after the configured attempts are exhausted. It also requires the healthy job to make progress before the failing peer becomes terminal, the queue to drain to one `completed` and one `failed` BullMQ state, logical-document ownership to remain scoped to the healthy company/declaration/run, no cross-tenant resolution/document leakage, and the failed declaration to receive no partial normalized-data promotion.

Acceptance: backend/frontend typecheck plus `verifyProductE2E1528ConcurrentFailureIsolationRecovery.ts`. Success is `product-e2e-1.5.28.concurrent-failure-isolation-recovery.passed` with `healthyCompletedWhileFailureRetried=true`, healthy `attempt=1`, failing attempts equal to `IDP_JOB_ATTEMPTS`, `partialNormalizedPromotionObserved=false`, and `crossTenantLeakageObserved=false`. This checkpoint intentionally avoids Qwen/Vision cost; Product E2E 1.5.27 already proves real configured Vision under concurrent successful production-corpus load.


### Product E2E 1.5.29 / 1.5.29.1 — terminal failure manual recovery

1.5.29 exposed a real lifecycle gap after BullMQ retry exhaustion: repairing an input and calling the normal `enqueueDocumentProcessing()` API reused the durable Mongo `ProcessingRun`, but the retained BullMQ job remained terminal `failed` and was not executable again. 1.5.29.1 fixes the production enqueue boundary without changing the durable idempotency key. For a durable `FAILED` run, a retained terminal failed BullMQ job is reactivated through BullMQ's failed-job retry mechanism; if retention has already removed that Redis job, the same durable ProcessingRun id is re-added as the BullMQ job id. Active/waiting/delayed work is never force-retried. Successful recovery preserves the ProcessingRun identity and audit lineage and clears the previous persisted error. No replacement run, direct normalized write, or production failure hook is introduced.

### Product E2E 1.5.30 — duplicate recovery race idempotency

1.5.30 stress-tests the 1.5.29.1 recovery boundary with eight concurrent normal re-enqueue requests after terminal failure and input repair. All requests must converge on the same durable ProcessingRun and exactly one additional worker execution: with three exhausted attempts, successful recovery must finish at ProcessingRun attempt four, never five or higher. The verifier also requires one logical document, no duplicate resolution audit, a cleared previous error, and no duplicate BullMQ recovery execution. It uses the lightweight non-Invoice fixture path and requires no Vision/LLM inference. No production behavior is changed by this checkpoint.

### Product E2E 1.5.31 — expired failed-job recovery

1.5.31 closes the second terminal-recovery branch introduced by 1.5.29.1: a durable Mongo `ProcessingRun` may remain `FAILED` after BullMQ's `removeOnFail` retention has already removed the Redis job. The verifier exhausts the real retry policy, removes the terminal failed BullMQ job to deterministically model retention expiry, repairs the input, and calls the normal `enqueueDocumentProcessing()` API again.

The gate requires the original ProcessingRun identity to be preserved, a BullMQ job with that same durable id to be recreated, exactly one recovery execution to complete, the previous error to clear, and exactly one logical document to be owned by the original run. It uses the lightweight ATR fixture path and requires no Vision/LLM inference. No new production behavior is introduced by this checkpoint; it verifies the retained-job-missing fallback already implemented in 1.5.29.1.


### Product E2E 1.5.32 — completed replay idempotency

1.5.32 closes the terminal-success replay boundary with a real external-worker completion rather than a manually assigned Mongo status. A lightweight ATR fixture is processed through Redis/BullMQ to durable `COMPLETED/completed`, then eight concurrent stale `enqueueDocumentProcessing()` requests are issued for the exact same upload and processor version.

The gate requires every replay to return the original ProcessingRun, the BullMQ job to remain terminal `completed`, ProcessingRun `attempt` and BullMQ `attemptsMade` to remain unchanged, and no replacement run, logical-document duplication, resolution-audit duplication, normalized-data mutation, or extracted-data mutation. The verifier requires the external `idp-worker` and real Redis/BullMQ transport but intentionally avoids Invoice Vision/LLM inference. This checkpoint is verifier-only; production behavior is unchanged.

Verifier: `backend/scripts/idp/verifyProductE2E1532CompletedReplayIdempotency.ts`.

### Product E2E 1.5.x — queue / recovery lifecycle closeout

Product E2E 1.5.27–1.5.32 closes the queue/recovery hardening scope for the current product contract. The fixed four-invoice production corpus remains 36/36 under real concurrent BullMQ execution, while the deterministic lifecycle gates cover backpressure and tenant isolation, concurrent failure isolation, retry exhaustion, terminal manual recovery, duplicate recovery races, failed-job retention expiry, and completed-job replay idempotency. Processor-version changes are already a separate durable idempotency boundary under Foundation 10.2, and persisted Vision checkpoint/restart compatibility is covered by Product E2E 1.4.7–1.4.9.

`CANCELLED` remains a terminal ProcessingRun state understood by the worker/enqueue boundary, but no user-facing cancellation service/API is part of the current product contract. Cancellation is therefore not added solely to extend this hardening series; if product requirements later introduce explicit cancellation, it must receive its own production lifecycle and BullMQ acceptance gate.

With this closeout, further 1.5.x queue checkpoints should be opened only for a newly observed production defect or a newly accepted product requirement. The next product-validation phase is unseen/generalization corpus work: freeze new supplier-independent ground truth before execution, measure DIGITAL/SCANNED/MIXED and multi-line invoice behavior without per-supplier rules, and preserve fail-closed `REVIEW_REQUIRED` behavior where evidence is genuinely ambiguous.

### Product E2E 1.6.0 — unseen/generalization corpus contract

1.6.0 opens the post-queue product-validation phase with a separate holdout corpus contract rather than extending or mutating the known four-invoice 1.5.x regression corpus. `productE2EGeneralizationGroundTruth.ts` defines supplier-independent DIGITAL, SCANNED, and MIXED cases, exact source-PDF SHA-256 identity, a human ground-truth freeze date, optional header/trade/weight expectations, multiple expected goods lines, and explicit fields that are expected to remain fail-closed for human review.

The bootstrap manifest intentionally contains zero customer cases. New invoices must be inspected by a human and their expected values plus source hash committed before that case is ever executed through the production IDP pipeline. Expected values must never be copied from or edited to match pipeline output. The 1.6.0 verifier validates this immutable manifest contract without requiring customer PDFs, invoking the IDP worker, or spending Vision/LLM inference. This preserves the existing four-invoice corpus as regression evidence while creating a clean holdout boundary for genuine generalization measurement.

Acceptance: backend typecheck plus `backend/scripts/idp/verifyProductE2E160GeneralizationCorpusContract.ts`. A bootstrap PASS reports `groundTruthFrozenBeforeExecutionRequired=true`, `exactSourceHashRequired=true`, support for DIGITAL/SCANNED/MIXED and multi-line goods ground truth, and no IDP/Vision/LLM execution.

### Product E2E 1.6.1 — unseen holdout freeze intake

1.6.1 adds a model-free intake boundary for future unseen invoices. `freezeProductE2EGeneralizationCase.ts` accepts an exact PDF plus independently human-authored ground-truth JSON, computes the PDF SHA-256 before any IDP execution, canonicalizes the frozen case artifact, and creates that artifact with exclusive-create semantics. An existing frozen artifact cannot be silently overwritten or updated after pipeline output is observed.

The intake schema supports DIGITAL/SCANNED/MIXED mode, multiple human-verified goods lines, and explicit `expectedReviewFields`. The deterministic verifier uses only a synthetic PDF-shaped fixture; it does not reuse the known four-invoice regression corpus as unseen evidence, invoke the production IDP worker, or spend Vision/LLM inference. Real holdout PDFs remain external/customer data and are added only after human ground truth has been frozen.

Acceptance: backend typecheck plus `backend/scripts/idp/verifyProductE2E161GeneralizationFreezeIntake.ts`. PASS requires exact pre-execution SHA-256 capture, immutable frozen artifact creation, multi-line/review-field preservation, and zero IDP/Vision/LLM execution.

### Product E2E 1.6.2 — frozen unseen holdout corpus

1.6.2 freezes the first real unseen cohort before any production IDP execution. Six source invoices are identified by exact SHA-256 and human-transcribed ground truth: five DIGITAL cases and one genuinely image-only SCANNED case. The cohort includes multi-line goods tables, foreign invoice layouts, 6/8-digit source tariff codes that must not be promoted as authoritative 12-digit GTIP, and explicit fail-closed review expectations. Customer PDFs remain under ignored `uploads/` storage and are never committed.

Acceptance: `verifyProductE2E162FrozenHoldoutCorpus.ts` re-hashes the staged source bytes and requires all six hashes to match the pre-execution manifest. It does not invoke IDP, OCR, Vision, or LLM inference. A PASS therefore proves corpus identity and freeze ordering, not extraction quality.

### Product E2E 1.6.3 — blind generalization baseline

1.6.3 is the first execution of the frozen 1.6.2 holdout cohort. Each selected invoice is re-hashed immediately before enqueue, then processed through the normal `enqueueDocumentProcessing` boundary, Redis/BullMQ, and the external production `idp-worker`; the verifier never calls `processIdpJob` directly. Cases are executed sequentially by default to avoid turning a generalization measurement into a model-contention benchmark. `GENERALIZATION_CASES` may select one or more frozen case IDs for focused reruns.

This checkpoint is deliberately measurement-only for extraction quality. A wrong/missing extracted field is recorded against the immutable human ground truth but does not make the harness fail. Infrastructure and lifecycle violations still fail hard: changed source bytes, missing BullMQ job/run identity, worker `FAILED`, timeout, missing logical-document materialization, or ownership mismatch. `COMPLETED` and fail-closed `REVIEW_REQUIRED` are both valid terminal worker outcomes and are reported separately.

The evaluator scores frozen scalar fields plus every preselected goods-line assertion. Expected goods rows are matched one-to-one to the best available normalized rows so repeated descriptions do not force positional assumptions. Explicit `expectedReviewFields` are measured separately as fail-closed behavior; for `goodsLines.hsCode`, any normalized tariff-code promotion is reported as a review-contract miss. Ground truth, production authority, and normalized data are never mutated by the harness.

Acceptance: backend typecheck plus `backend/scripts/idp/verifyProductE2E163BlindGeneralizationBaseline.ts`. The final event is `product-e2e-1.6.3.blind-generalization-baseline.measured`, containing extraction accuracy, fail-closed review accuracy, per-case outcomes/checks, and guardrails proving frozen hashes, real production queue/worker execution, no supplier-specific rules, and no direct normalized writes. The measured percentage is a baseline, not a threshold to tune after seeing the result.

### 1.6.4 — Generalization stage-loss diagnostic

The frozen 1.6.3 blind baseline measured final contract accuracy, but that number alone does not identify whether information was lost at source extraction/model interpretation, candidate persistence, resolution, or normalization. 1.6.4 adds a measurement-only diagnostic that replays a small representative subset (VXA, WYL, MEKAR by default) through the real production queue and inspects the persisted run/resolution artifacts before cleanup. It does not change production extraction, authority, prompts, or ground truth.

The diagnostic deliberately does not ask the model a second ground-truth-aware question. For each expected value it reports whether an equivalent value is observable in ProcessingRun persisted extraction state, declaration-resolution audit state, and final normalized output. It also reports whether any persisted run/audit document exposes raw model-response-like fields. If raw model output is not persisted, the result says so rather than inferring model correctness. This checkpoint is diagnostic only; fixes follow from the measured loss boundary.

Default representative cases are `volta-vxa-0035,ningbo-wyl-2026060501,mekar-ear-0068`. Override with `GENERALIZATION_CASES` when needed. The run remains hash-locked to the 1.6.2 frozen holdout corpus and uses the normal Redis/BullMQ external worker path with the configured Vision/LLM provider.

### Product E2E 1.6.5 — LLM-first semantic extraction architecture lock

The first frozen unseen baseline and 1.6.4 stage-loss diagnostic exposed a mismatch between the product goal and the extraction architecture: Vision was fused as a peer candidate source after deterministic invoice parsing, while the v1 model skill explicitly prohibited semantic numeric normalization. This is not the desired long-term contract for a corpus containing many suppliers, languages and layouts.

From 1.6.5 forward, invoice semantic understanding is **LLM/VLM-primary** whenever the configured local vision model and rendered page evidence are available. The model is responsible for interpreting previously unseen layouts and producing the requested typed invoice semantics, including locale-aware numeric parsing, unambiguous unit conversion for kilogram weight fields, ISO date/currency/country normalization, goods-row role association, and distinguishing tariff identifiers from product/catalog/model identifiers. Ambiguous or unsupported values remain null/review rather than guessed.

Native PDF text and PaddleOCR are retained, but their architectural role is evidence/corroboration and exact-character recovery rather than supplier/layout-specific semantic authority. OCR is therefore not removed. DIGITAL documents should prefer native text as cheap exact evidence; SCANNED/MIXED documents may use OCR as supporting evidence, while page-image VLM reasoning remains the primary semantic path. OCR failure must ultimately degrade evidence/confidence or trigger review rather than prevent an otherwise available VLM extraction from running.

The deterministic Python invoice parser and generic invoice heuristics are **cutover fallback**, not the target authority. They are not deleted in 1.6.5 because doing so before the replacement path has persisted model observability, evidence grounding and frozen-corpus regression coverage would remove the only rollback/comparison path. After the LLM-first worker path proves the frozen unseen corpus and known 36/36 regression corpus, legacy invoice-only semantic parsing modules may be removed in a dedicated cleanup checkpoint. Queue/lifecycle, canonical document analysis, segmentation/classification, LogicalDocument materialization, candidate persistence, declaration-level resolution/fusion, human review, source hashing, idempotency and audit infrastructure remain part of IDP.

`invoice-extraction-v2` changes the model contract from display-token copying to semantic parsing. Numeric commercial values are JSON numbers; dates/currencies/countries use stable normalized contracts when unambiguous; gross/net weights are kilograms; arithmetic corroborates but cannot by itself decide swapped quantity/unit-price roles; and digit length alone can never establish HS/GTIP authority.

1.6.5 intentionally does not grant the model a direct normalized-data write path and does not yet remove the deterministic parser from worker execution. The next implementation checkpoint moves model extraction to a first-class persisted artifact with raw/parsed response, model/prompt identity and evidence provenance, then changes worker authority/cutover behavior behind deterministic acceptance gates.

Acceptance: backend typecheck plus `backend/scripts/idp/verifyProductE2E165LlmFirstArchitectureContract.ts`. This gate is model-free and locks the architecture before the worker refactor.

### Product E2E 1.6.6 — First-class model extraction artifact

The LLM-first cutover requires observability before authority changes. Each successful invoice Vision page inference now carries a persisted extraction artifact through the existing `visionCandidateCheckpoint` lifecycle. The artifact records provider/model identity, `invoice-extraction-v2` skill version, document/evidence mode, requested fields, source page numbers, the exact model message content before provider adaptation, and the provider-validated semantic response before candidate projection/resolution. Rendered page-image bytes/base64 are intentionally not persisted in this artifact.

This checkpoint is observability-only: it does not change candidate authority, resolver behavior, promotion, review semantics, or normalized-data writes. It makes later frozen-corpus comparisons able to distinguish model understanding from candidate projection/resolution loss without re-prompting the model with ground truth.

Verifier:

```powershell
npm run typecheck
docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyProductE2E166FirstClassModelExtractionArtifact.ts
```

Expected event: `product-e2e-1.6.6.first-class-model-extraction-artifact.passed`.

### Product E2E 1.6.7 — LLM-first worker cutover

The architecture lock now changes the production candidate-source boundary. When configured page Vision is available, Qwen/VLM semantic extraction is primary for every field it actually extracts. Deterministic Native/OCR/Python candidates no longer compete with a VLM candidate for the same field; they remain a degraded field-level fallback only when the VLM emitted no candidate. The existing Foundation 6 resolver/validator still owns promotion and review, so the model still cannot write `normalizedData` directly.

OCR remains an evidence/corroboration subsystem. An OCR enrichment failure no longer kills an invoice job when the configured page-Vision path is available: the worker records `idp.ocr.degraded_to_vision` and continues from the canonical document/page images. If Vision is unavailable, OCR failure remains fatal rather than silently pretending that a safe extraction path exists.

This checkpoint intentionally does **not** delete the legacy Python invoice parser. Physical deletion remains gated on frozen unseen-corpus and known-corpus regression evidence after the LLM-first path is exercised end-to-end. No supplier-specific rule is introduced.

Verification:

`docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyProductE2E167LlmFirstWorkerCutover.ts`

Expected event: `product-e2e-1.6.7.llm-first-worker-cutover.passed`.

### 1.6.8 — LLM-first real holdout stage accuracy

After the 1.6.7 worker cutover, the first real measurement is intentionally limited to the frozen representative holdout subset (`volta-vxa-0035`, `ningbo-wyl-2026060501`, `mekar-ear-0068`). It executes the normal production queue/worker with the configured Vision provider and reads the persisted first-class extraction artifacts introduced in 1.6.6.

The verifier measures two separate boundaries against the already-frozen human ground truth: the provider-validated Qwen semantic response before candidate projection/resolution, and the final declaration normalized data after resolver/authority. This makes model extraction accuracy distinguishable from downstream candidate/resolution/promotion loss. No second ground-truth-aware model call is made, no customer-specific rule is introduced, and the verifier does not write normalized data.

This checkpoint is measurement-only. Its result decides the next production change: prompt/schema/provider adaptation when the semantic response is wrong or missing, versus candidate projection/resolver/authority changes when the semantic response is correct but final output is lost. OCR degradation to Vision is exercised by the scanned MEKAR case rather than special-casing that supplier.

### Product E2E 1.6.8.1 — production model-artifact wiring repair

The first 1.6.8 real holdout run correctly failed before scoring because a completed production VXA run exposed no persisted Qwen extraction artifact to the stage-accuracy verifier. The 1.6.6 isolated artifact contract had proved the provider artifact shape, but it had not established a dedicated ProcessingRun persistence boundary for the real worker call-site.

1.6.8.1 repairs that observability gap without changing extraction authority. Every successful production page-Vision inference is now upserted into `ProcessingRun.modelExtractionArtifacts` at the actual Qwen extraction/checkpoint boundary. The artifact contains the raw model message and provider-validated semantic response but never page-image bytes. The page-scoped `documentId` is the idempotency key, so a retry replaces the artifact for that page instead of accumulating duplicate responses. `visionCandidateCheckpoint` remains for resumable candidate execution; the dedicated field is the first-class model-observability record. The 1.6.8 verifier prefers this field and retains checkpoint reading only for compatibility with pre-repair runs.

This repair does not change Qwen-first candidate authority, resolver behavior, promotion/review rules, supplier handling, or normalized-data writes. After the deterministic wiring verifier passes, rerun the unchanged real 1.6.8 holdout measurement; absence of a first-class artifact on a new run remains a hard failure.

Verification:

`npm run typecheck`

`docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyProductE2E1681ProductionModelArtifactWiring.ts`

Then rerun `backend/scripts/idp/verifyProductE2E168LlmFirstRealHoldoutStageAccuracy.ts`.

### 1.6.8.2 — Primary Execution Cutover

The real-worker 1.6.8 measurement exposed a second cutover gap: Vision fusion still required the segment classifier to say `INVOICE` and required deterministic extraction to have already populated `result.data`. That made the semantic-primary path dependent on the legacy path and could produce a completed invoice without any Qwen artifact.

This checkpoint removes that dependency for an uploaded file already authoritatively typed as `INVOICE`:

- Qwen/VLM execution no longer requires deterministic invoice data to exist first.
- An `UNKNOWN` segment classification can be rescued by uploaded-file invoice authority; an explicitly different classified document type is still not coerced into an invoice.
- Qwen/VLM remains mandatory whenever the configured Vision route is available.
- First-class model artifact persistence remains mandatory at the real page-extraction boundary.
- Deterministic extraction remains missing-field/degraded fallback only; it does not regain semantic-primary authority.
- No supplier-specific rule and no direct normalized-data write is introduced.

The verifier `verifyProductE2E1682PrimaryExecutionCutover.ts` requires the container's real LLM/Vision configuration and proves that an UNKNOWN invoice segment with no deterministic data still invokes the injected Qwen provider, persists the model artifact, and produces the primary invoice candidate.

### Product E2E 1.6.8.6 — Row-matched stage diagnostic
- Status: diagnostic checkpoint; no production extraction behavior change.
- Corrects the interpretation of 1.6.8.5: holdout `expected.goodsLines` is a representative subset, not a positional prefix of the invoice. Therefore raw `goodsLines[0..N]` index comparisons cannot prove F6 row loss on invoices with additional lines.
- Re-runs the real production queue and emits the same artifact/candidate/resolution visibility with an explicit row-matching guardrail before any production fix is attempted.
- Supplier-specific rules: false. Direct normalized write: false. Ground-truth-aware second model call: false.

### 1.6.8.7 — Vision Page Execution Determinism Diagnostic

Measurement-only checkpoint for the real scanned Mekar holdout. The verifier executes the normal production queue once and reports the persisted `visionCandidateCheckpoint` page-by-page before test cleanup: status, decision, candidate count, artifact presence/field count, and exact page error. This distinguishes model/provider/page failures from downstream projection/resolution loss without supplier-specific rules or direct normalized writes. Production extraction behavior is unchanged.

### 1.6.8.8 — Vision Page Abort Recovery

- Added a bounded page-level recovery for transient Qwen Vision aborts/timeouts at the production page execution boundary.
- A page whose inference fails with an abort-class error is retried exactly once; successful pages are not repeated.
- Non-abort model/HTTP/contract failures remain fail-closed and are not retried.
- Persisted completed-page resume behavior remains authoritative, with no supplier-specific rules and no direct normalized-data write path.
- Regression verifier: `backend/scripts/idp/verifyProductE2E1688VisionPageAbortRecovery.ts`.

### 1.6.8.9 — Vision Timeout Budget & Abort Observability

Real Mekar holdout proved that the bounded abort retry from 1.6.8.8 is structurally correct but insufficient when heavy PAGE_IMAGE inference itself exceeds the generic LLM timeout. Pages 1 and 2 both exhausted their attempts while the lightweight page 3 completed.

This checkpoint separates the vision inference budget from the generic text-LLM budget with `LLM_VISION_TIMEOUT_MS`. Development defaults the vision budget to 1,800,000 ms (30 minutes) while production remains explicitly configurable. Qwen Vision abort errors now preserve model, page number(s), configured timeout and elapsed duration so a timeout can be distinguished from contract/HTTP/model failures. The existing one-retry abort recovery remains bounded; successful persisted pages are not repeated. This is an accuracy/reliability unblock, not the final throughput solution for the target invoice volume.

Guardrails remain unchanged: Qwen/VLM is primary, deterministic extraction is fallback-only, Foundation 6 remains authoritative, no supplier-specific rules are introduced, and there is no direct normalized-data write path.

### 1.6.8.10 — Actual row-matched stage diagnostic
- Replaces raw representative-ground-truth index interpretation with weighted semantic row matching.
- Reports the actual artifact row index, candidate field paths, F6 resolution field paths, and independently matched final row.
- Measurement-only: no production extraction/resolution/promotion behavior changes.
- The previous 1.6.8.7 raw-index `lossBoundary` output must not be used as proof of goods-row loss.

### 1.6.8.11 — Semantic Accuracy Scorer

- Measurement-only follow-up to the actual row-matched 1.6.8.10 diagnostic; production extraction/resolution/promotion is unchanged.
- Scores representative goods against their physically matched final rows instead of ground-truth array indices.
- Separates `EXACT`, `SEMANTIC_EQUIVALENT`, `WRONG`, and `MISSING` outcomes.
- Canonical measurement equivalence includes case-normalized units, TRY/TL currency aliases, US/ABD country aliases, ISO date-prefix equivalence, and numeric tolerance.
- Raw per-page scalar candidates are still reported so semantic equivalence cannot hide resolver conflicts such as TRY vs TL or differing invoice dates.
- Ground truth remains measurement-only; there is no second ground-truth-aware model call, supplier-specific extraction rule, or direct normalized write.

### 1.6.8.12 — Multi-page scalar canonical authority

- Added declaration-boundary invoice-currency canonicalization so equivalent display spellings (`TL` and ISO `TRY`, plus case-only ISO-code differences) form Foundation 6 consensus without changing source evidence.
- Ambiguous currency symbols are not guessed or mapped.
- Conflicting invoice dates remain fail-closed / `REVIEW_REQUIRED`; this checkpoint does not add page-, supplier-, invoice-number-, or ground-truth-specific date authority.
- The contract verifier proves canonical currency consensus and preserves unresolved genuinely conflicting dates.
- No supplier-specific rule, second ground-truth-aware model call, prompt specialization, or direct normalized-data write was introduced.

### 1.6.8.13 — Invoice-date role semantics

- Invoice extraction skill bumped to `invoice-extraction-v3`.
- `invoiceDate` is the invoice/document issue date only; order/delivery/shipment/due/payment/print/dispatch dates are excluded.
- Ambiguous continuation-page dates fail closed; no page/supplier/ground-truth authority is introduced.

### 1.6.8.14 — Invoice-date generalization guard matrix

- Invoice extraction skill bumped to `invoice-extraction-v4`.
- Page order is non-authoritative; explicit invoice-date role may appear on any page.
- Ambiguous multiple dates fail closed and supplier-specific rules remain prohibited.

### 1.6.8.15 — Critical scalar evidence capture

The first real v4 rerun showed that role semantics alone cannot protect critical scalars from visual misread/hallucination: a page-level Qwen result can still return a wrong year or currency token while remaining structurally valid. This checkpoint keeps Qwen/VLM primary and adds auditable grounding rather than restoring OCR/parser authority.

- Invoice extraction skill is versioned to `invoice-extraction-v5`.
- Non-null `invoiceDate` and `currency` now require compact `criticalScalarEvidence` containing the visible label/context and raw visible value token.
- The evidence strings must be copied from the page, not normalized, repaired, paraphrased or inferred.
- The provider carries this grounding into ordinary `PAGE_IMAGE` candidate evidence text. If a critical scalar is returned without both evidence strings, that scalar fails closed at the provider adaptation boundary instead of becoming an ungrounded primary candidate.
- This checkpoint captures/guards evidence only; it does not make OCR/native the primary extractor, add supplier-specific rules, use ground truth as authority, or write normalized data directly.
- Follow-up authority/corroboration can compare the persisted Qwen evidence against independent native/OCR evidence without changing the Qwen-first architecture.

Verification: `npm run typecheck` and `backend/scripts/idp/verifyProductE2E16815CriticalScalarEvidenceCapture.ts`. The verifier performs no Qwen inference.

### 1.6.8.16 — Versioned invoice knowledge + critical-scalar self-grounding

- Added `invoiceExtractionKnowledge.ts` as the single runtime source for verified, supplier-independent invoice extraction knowledge consumed by Qwen.
- Knowledge is versioned separately from the extraction skill and is promoted only through code review/tests; the model cannot mutate it autonomously.
- Existing verified semantics are centralized: invoice-date role, page-order non-authority, visible critical-scalar evidence, TL/TRY normalization, semantic goods-row association, HS/GTIP identifier caution, and fail-closed ambiguity.
- `invoiceDate` and `currency` candidates now require their normalized Qwen value to agree with Qwen's own raw visible evidence before entering the candidate pipeline.
- Example general guard: raw `22.09.2026` supports `2026-09-22` but not `2022-09-22`; raw `TL` supports `TRY` but not `EUR`.
- OCR/native extraction remains corroboration/fallback rather than primary authority. No supplier names, invoice-specific values, page-1 shortcut, ground-truth authority, or direct normalized write is introduced.

### 1.6.8.17 — Grounding enforcement boundary

- Critical-scalar grounding is enforced at the Qwen natural-response adapter before invoiceDate/currency can become internal extraction candidates.
- Accepted invoiceDate/currency candidates must carry visible raw evidence whose deterministic normalization agrees with the model value.
- Missing, contradictory or ambiguous critical-scalar evidence is blocked before declaration candidate projection; unrelated scalar/goods extraction is unchanged.
- This is a production-boundary contract only: Qwen remains primary, OCR is not promoted to primary authority, no supplier-specific or ground-truth-aware production rule is introduced.

### 1.6.8.18 — Real Qwen grounded corpus validation
- Added one-run production-path validation for the versioned invoice knowledge + grounded critical-scalar extraction stack.
- The verifier executes the real Qwen/VLM worker once per selected frozen holdout and reports persisted skill version, raw critical-scalar response/evidence, provider-accepted critical scalars, final scalar semantic accuracy, and row-matched goods integrity.
- Ground truth remains measurement-only; it is never passed to Qwen or used as production authority.
- Default case is the heavy scanned `mekar-ear-0068` holdout so one expensive inference run yields all relevant evidence instead of chaining older diagnostics.
- Qwen remains primary; OCR/native evidence remains fallback/corroboration only. No supplier-specific rules, autonomous knowledge mutation, or direct normalized writes are introduced.

### 1.6.8.19 — Field-local critical-scalar isolation

- Qwen extraction skill advanced to `invoice-extraction-v7`; verified knowledge remains `invoice-knowledge-v1`.
- Missing or contradicted `invoiceDate` / `currency` evidence is field-local: those critical scalars fail closed without suppressing independently supported goods lines, weights, origin, delivery term or identifiers.
- The real-Qwen scorer now compares persisted ISO datetime representations of `invoiceDate` by calendar-date semantics, avoiding a false `WRONG` classification for the same date.
- No supplier-specific authority, OCR-primary fallback, ground-truth production authority or direct normalized write was introduced.

### 1.6.8.20 — Real Qwen field-local recovery validation

- Re-runs the real Mekar scanned holdout after `invoice-extraction-v7` field-local critical-scalar isolation.
- Measures recovery of the full 42-row goods corpus and independently supported page-2 scalars while critical scalar grounding remains fail-closed.
- Invoice-date scoring uses calendar-date semantics, so persisted ISO datetime formatting does not create a false mismatch.
- Ground truth remains measurement-only; Qwen remains primary and no supplier-specific production authority is introduced.

### 1.6.8.24 — Qwen scalar-only recovery

- Keeps the successful bounded non-critical goods recovery from 1.6.8.21/22.
- When that recovery succeeds but still omits requested non-critical scalar fields, performs one additional Qwen pass on the same page image for only those missing scalar fields.
- Critical evidence-gated `invoiceDate`/`currency` and all `goodsLines[]` fields are excluded from the scalar-only pass.
- Goods and scalar Qwen candidates are merged before the existing Foundation 6 authority pipeline; no direct normalized-data write is introduced.
- The scalar-only Qwen response is retained as its own first-class extraction artifact (`:non-critical-scalar-recovery`) for auditability.
- Normal non-empty page responses do not incur the additional pass. No supplier-specific rules or ground-truth authority are introduced.

### Product E2E 1.6.8.29 — Isolated Origin Evidence Recovery

- Keeps the last real-gate baseline (`invoice-knowledge-v2` / `invoice-extraction-v8`) unchanged.
- If normal extraction plus the existing non-critical scalar recovery still leave `origin` absent, production vision may perform one bounded Qwen call for `origin` only on the same page image.
- The isolated pass accepts an explicit visible country name or an established language-specific country abbreviation only when the country meaning is unambiguous, then asks Qwen to normalize that meaning to ISO-3166-1 alpha-2.
- Seller/buyer/address/destination/dispatch/bank country, supplier identity, expected answers and prior documents are explicitly excluded as origin evidence.
- No supplier name, invoice value, page-position shortcut, OCR authority, ground-truth authority or direct normalized write is introduced.
- Isolation is deliberate: origin guidance cannot perturb already-correct goods, invoice date, currency, delivery term or weight extraction.


### 1.6.8.30 — Recovery Artifact Observability Before Further Origin Tuning

Recovery model artifacts are persisted even for fail-closed zero-field responses,
and the real diagnostic exposes a compact recoveryArtifactTrace. This changes
observability only, not extraction authority.

### 1.6.8.31 — Page-Local Text-Assisted Origin Recovery

The 1.6.8.30 real trace proved that the isolated origin calls reached Qwen and
Qwen returned origin=null. Inspection of the real invoice shows the origin in a
small dense page-2 notes block next to delivery and weight metadata.

This checkpoint keeps Qwen as semantic authority and supplies only the current
page's existing OCR/native text to the isolated origin recovery as assistive
reading context. Qwen must still verify the meaning against the same page image
and normalize an unambiguous country meaning to ISO-3166-1 alpha-2. OCR/native
text is never projected directly as an origin candidate.

The real diagnostic also treats a focused recovery containing goods as the
effective goods artifact for that page, fixing the 1.6.8.30 diagnostic-only
19/42 undercount.
