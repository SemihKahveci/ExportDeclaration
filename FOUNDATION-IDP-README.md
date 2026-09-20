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


## Foundation 5.5A.4 — Row-level Origin / Menşe
Canonical goods-row geometry now discovers per-line origin with evidence, promotes it through human-review-aware normalization, and carries it through the export contract to Evrim Excel `MENŞE`. Missing/ambiguous origin fails closed into review/export readiness; no supplier names, country-name list, or fixed x coordinate is used.
