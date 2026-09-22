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
