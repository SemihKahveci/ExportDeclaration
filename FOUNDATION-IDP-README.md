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
- **9.10 — Real Review/Exception E2E + Foundation 9 Closeout — ACTIVE**
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
