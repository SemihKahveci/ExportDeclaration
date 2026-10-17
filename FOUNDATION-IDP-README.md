# Foundation IDP checkpoint 1.8.32.1

## Source Authority Matrix diagnostic runtime fix

- Corrects the diagnostic import to use the existing `declarationFieldResolution.model.ts` module.
- No production extraction/resolution/promotion behavior is changed.
- Diagnostic remains persisted-evidence-only: no OCR/model inference and no database mutation.
- The declaration-field ownership reference supplied for this checkpoint is treated as the business authority for subsequent matrix interpretation: only fields marked `Dokümandan Parse` should be judged as document-owned extraction responsibilities; user/settings/Evrim/calculated fields must not be reported as IDP misses.

# Foundation IDP checkpoint 1.8.33

## Current authority + declaration ownership acceptance

- Replays the latest completed invoice entirely from persisted canonical evidence using the current deterministic header/party, commercial, shipment, generic-goods and row-origin readers.
- Applies the current payment/bank Vision sanitizers in-memory so an older persisted run is evaluated as the current production pipeline would evaluate it; no OCR/Qwen call and no database mutation occurs.
- Distinguishes raw country tokens from role-bound customs-country evidence. Buyer/seller address countries and line-level goods origins are not silently reused as exit, arrival, destination or trade country.
- Extends acceptance to the declaration-field ownership specification: User / Settings / Evrim / Calculated fields are not counted as IDP misses; document-owned scalar and goods evidence is reported separately.
- Adds goods acceptance for 56 rows x 7 core fields plus row-origin evidence coverage, while keeping Foundation 6 as resolution authority.
- No supplier-specific rule, invoice-specific production constant or direct normalized write is introduced.

### 1.8.34 — Validated native row-origin authority

The 1.8.33 persisted acceptance proved that all 56 goods rows have deterministic row-local origin evidence while the 56x7 core goods fields already resolve cleanly. This checkpoint bridges that existing native row-origin evidence into Foundation 6 without conflating it with declaration-wide customs-country roles.

- `genericCandidateAudit.originCandidates` remains the source of row-local origin evidence.
- A `goodsLines.N.origin` candidate enters direct source authority only when the matching generic goods row is `VALID`, issue-free, non-derived, and backed by `NATIVE_TEXT` evidence.
- The authority suffix is `:f6-native-origin`; it is accepted only for `goodsLines.N.origin`.
- `originCountry`, `exitCountry`, `arrivalCountry`, `destinationCountry`, and `tradeCountry` remain independent customs roles and cannot inherit goods-line origin.
- No supplier rules, invoice constants, model inference, or direct normalized writes are introduced.

### 1.8.35 — Persisted row-origin authority replay

- Replays the latest completed invoice from persisted canonical evidence after the 1.8.34 production bridge; no OCR/Qwen call and no database mutation occurs.
- Requires all 56 deterministic `goodsLines.N.origin` fields to resolve through Foundation 6 and to have direct native authority selected.
- Keeps declaration-wide customs-country roles fail-closed; row-local origin cannot authorize `originCountry`, exit, arrival, destination, or trade country.
- Reclassifies stale persisted Vision-only bank poison as non-actionable when the current sanitizer leaves no current source candidate.
- Retains the 56x7 core goods acceptance and current commercial/header/shipment acceptance.
- No supplier-specific rule, invoice-specific production constant, or direct normalized write is introduced.

### 1.8.36 — Declaration Goods Ownership Coverage Diagnostic
- Expands acceptance from the existing 56x7 goods core plus row-origin to the document-owned goods fields in the supplied Beyanname Alanlari specification.
- Distinguishes **candidate-schema unsupported** from **source-present parser miss**; declaration ownership alone never authorizes inventing a value when an invoice omits that field.
- Reports canonical semantic-label presence for regime, row weights, package and supplementary measure before any new production authority is added.
- Persisted canonical evidence only; no OCR/model inference, DB mutation, supplier rule, invoice constant or direct normalized write.

### 1.8.37 — Row-local Declaration Evidence Diagnostic
- Resolves the ambiguity left by 1.8.36: a semantic label existing somewhere in the invoice is not proof that a declaration goods-row value exists.
- Uses persisted canonical geometry and existing generic HS anchors to classify regime, gross weight, net weight, package and supplementary-measure labels as row-local, goods-header/nearby, or outside the goods table.
- Only a row-local semantic anchor can justify a later production row parser; invoice-level totals are never divided/copied across goods rows.
- `packageUnit` remains dependent on proven row-local package evidence.
- Diagnostic only: no OCR/Qwen, DB mutation, supplier/invoice-specific rule, derived distribution, authority change or normalized write.

### 1.8.38 — Declaration goods fail-closed acceptance
- Converts the 1.8.37 geometry diagnostic into a persisted-evidence acceptance gate for this invoice without adding production parsing behavior.
- Requires regime and supplementary measure to remain source-absent, gross/net weight to remain invoice-summary-only, and package/package-unit to remain non-row-local unless row-local evidence actually exists.
- Prevents declaration ownership from becoming permission to distribute invoice totals or package counts across goods rows.
- No OCR/Qwen, DB mutation, supplier rule, invoice-specific production constant, derived distribution, authority change or direct normalized write.

### 1.8.39 — Document-owned scalar / transport / party coverage

- Audits the supplied Beyanname Alanlari `Dokümandan Parse` ownership outside goods rows against persisted canonical evidence and current deterministic candidate discovery.
- Separates `CURRENT_CANDIDATE_COVERED`, role-local `SOURCE_HINT_PRESENT_NEEDS_ROLE_LOCAL_DIAGNOSTIC`, schema gaps, and legitimate source absence.
- A semantic word hit is diagnostic only and never grants Foundation 6 authority. Country/address/row-origin tokens remain forbidden as implicit customs-role evidence.
- Runs on persisted canonical evidence only; no OCR/model inference, database mutation, supplier-specific rules, invoice-specific production constants, or direct normalized writes.

### 1.8.40 — Current role-bound authority coverage

- Corrects the 1.8.39 diagnostic boundary: declaration field names are mapped to the current deterministic parser vocabulary before coverage is judged (`trade.deliveryTerm`, `header.totalAmount`, `finance.exchangeRate`, `trade.paymentType`, `packageInfo.*`).
- Acceptance-gates the known source-backed scalar values on the persisted VED invoice without OCR/model reruns or database mutation.
- Broad text hints (especially BANK-like text) are not treated as authority; a semantic parser candidate is required.
- Customs-country, vehicle and container fields remain fail-closed when exact role evidence is absent.
- Schema-only gaps remain distinct from extraction bugs when the invoice does not prove a role-specific source.

### 1.8.41 — Pre-full-run declaration authority acceptance

- Consolidates the persisted-evidence gates before the next expensive full 32B + VL30B production run.
- Requires current deterministic authority for seller/buyer, commercial totals/currency/rate/payment/delivery/transport, package/weights, all 56 x 7 goods-core fields, and all 56 row-local origins.
- Requires stale Vision payment/bank poison to remain rejected and source-absent customs-country, vehicle and container roles to remain fail-closed.
- This is an acceptance replay only: no OCR/Qwen call, database mutation, supplier-specific production rule, invoice-specific production constant, or direct normalized write.

### 1.8.42 — Fresh production boundary diagnostic

After the pre-full-run persisted replay gate, a fresh 32B + VL30B production run is inspected at the persisted worker-candidate, Foundation 6 resolution, and final normalized declaration boundaries. The diagnostic is intentionally read-only and determines whether monetary Vision poison (`0,00 EUR`) is still persisted for payment/bank fields or whether corruption occurs later during F6 selection/promotion. It also records the fresh goods/GTIP/origin counts without invoking OCR or model inference.

### 1.8.43 — Fresh production commercial persistence boundary

- Fixes the fresh 32B + VL30B production regression isolated by 1.8.42: Vision monetary values such as `0,00 EUR` are removed from `paymentType` and `bankInfo` at the worker/F6 candidate boundary, including resumed persisted page checkpoints and alternate Vision-provider paths.
- Provider-level sanitization remains in place as the first defense; the new fusion-boundary sanitizer is defense-in-depth immediately before candidate persistence/resolution.
- Extends generic native payment-term discovery to explicit standalone payment phrases such as `PEŞİN ÖDEME`, so a source-backed term does not require an adjacent `Ödeme Şekli` label to enter Foundation 6 authority.
- Monetary values still cannot become payment/bank semantics, and bank information still requires bank/account/IBAN/SWIFT/BIC evidence.
- No supplier-specific rule, invoice-specific production constant, model-derived authority, or direct normalized write is introduced.

### 1.8.44 — Fresh-boundary replay acceptance

Replays the latest persisted invoice from canonical evidence with the current production semantic boundary and deterministic authority bridges, without OCR/model inference or database mutation. The gate requires the standalone explicit payment term to resolve through current native authority, monetary Vision poison to disappear from payment/bank semantics, all 56 goods rows and row-local origins to remain resolved, and ambiguous declaration-wide customs-country roles to remain fail-closed. This checkpoint intentionally validates the current interpretation against the already persisted fresh run before paying for another full 32B/VL30B production execution.

### 1.8.45 — Adaptive recovery persistence boundary

Fresh 32B/VL30B production exposed a second commercial-semantic ingress after the 1.8.43 primary Vision guard: adaptive recovery could reintroduce a monetary PAGE_IMAGE value as `paymentType` / `bankInfo`, and the final worker boundary applied document-role authority without reapplying the commercial semantic sanitizer. The final adaptive-recovery envelope is now sanitized immediately before the last role guard and F6 persistence. This is provider/model/supplier agnostic and does not write normalized declaration data directly.

Contract: `verifyProductE2E1845AdaptiveRecoveryPersistenceBoundaryContract.ts` proves both the primary Vision boundary and the final adaptive-recovery persistence boundary apply the monetary semantic sanitizer, while unrelated candidates remain intact.

### 1.8.46 — Commercial persistence boundary closure

- Closes the cheap pre-Spark regression gate for the commercial semantic persistence boundary after the adaptive-recovery ingress fixed in 1.8.45.
- Verifies mixed candidate behavior: monetary payment/bank poison is removed while valid payment/bank semantics and unrelated candidates survive unchanged.
- Verifies sanitizer idempotence and statically gates both production persistence ingresses (primary Vision and final adaptive-recovery output) so a later refactor cannot silently bypass the boundary.
- This is contract-only: no OCR/Qwen call, database mutation, supplier-specific rule, invoice-specific production constant, or direct normalized write.

### 1.8.48 — Goods semantic boundary

- Hardens GTIP discovery so a bare 12-digit token is no longer sufficient authority. Native GTIP anchors now require an explicit HS/HSN/GTIP/tariff/customs semantic role on the same visual line or a document-local customs-code header aligned with that column.
- Prevents 12-digit phone, registry, EPCG/LUT and similar identifiers from becoming goods GTIP solely because their shape matches the Turkish 12-digit declaration format.
- Adds a final PAGE_IMAGE goods-row boundary: when canonical native evidence proves a contiguous goods table, Vision/adaptive recovery cannot append synthetic rows after the proven native table. This closes the Çelikel-style amount-in-words / package-summary phantom row without inventing or deleting rows on invoices where native evidence proves no goods table.
- Keeps short HS/HSN documents fail-closed for declaration GTIP; an 8-digit HSN is not padded/fabricated into 12 digits, while the rest of a legitimate Vision goods row may remain available.
- Regression intent is explicitly conservative: VED-style native GTIP columns remain authoritative; no supplier/invoice-specific rule, fixed supplier coordinate, direct normalized write, or model-only authority is introduced.
- Contract: `verifyProductE2E1848GoodsSemanticBoundaryContract.ts` covers semantic GTIP-column preservation, 12-digit phone/EPCG rejection, phantom fourth-row rejection, and non-destructive behavior when no native goods table is proven.


#### 1.8.48.1 — Conflicting identifier locality hardening

The goods semantic boundary now rejects a PAGE_IMAGE 12-digit HS/GTIP candidate when the same value is locally bound to an explicit non-customs identifier role (for example telephone, EPCG/LUT, IBAN/SWIFT, tax or registry identifiers), even if an HSN/GTIP label exists elsewhere on the same dense page. This keeps the rule document-generic and value-local: a 12-digit shape alone never becomes customs-code authority, while legitimate native GTIP authority remains unchanged. The 1.8.48 contract covers the PML-style HSN/EPCG collision and the existing native-row phantom-row boundary.

#### 1.8.48.2 — Validated native goods-field authority regression

- Makes validated row-local Native/OCR goods evidence authoritative for the exact goods field it proves (`hsCode`, description, quantity, unit, unit price, line total and origin). PAGE_IMAGE candidates remain available only where deterministic row evidence does not prove that field.
- Prevents package counts, monetary amounts and neighbouring numeric columns from replacing a proven goods quantity/amount, covering the general YEM/Volta class without supplier names, invoice IDs or fixed coordinates.
- Keeps the 1.8.48 fail-closed behavior for short-HSN documents: an 8-digit HSN is never padded/fabricated into a 12-digit declaration GTIP, and unproven invoices are not destructively trimmed.
- Adds a cheap regression suite that preserves a 56-row VED-style native goods table, rejects a trailing PAGE_IMAGE summary row, protects proven quantity/amount fields, and leaves source-unproven rows untouched.
- No OCR/Qwen invocation, database mutation, supplier-specific rule, invoice-specific production constant, fixed column coordinate or direct normalized write is introduced.

### 1.8.49 — Scalar semantic authority

- Extended deterministic, role-bound scalar discovery without supplier/invoice constants: `Kur Bilgisi` is accepted as exchange-rate evidence; explicit English invoice-total labels bind amount+currency; English month-name invoice dates are supported.
- Shipment summaries now accept explicit `BRUT KG` / `GROSS WT`, `NET KG` / `NET WT` labels and can recover package type from combined summaries such as `TOPLAM KAP: 66 PALET`.
- Payment semantics stay field-local: customs/reference-value phrases cannot become payment terms, while combined Incoterm/payment values such as `DAP-30 DAYS` are split so the Incoterm does not pollute payment type.
- Existing explicit payment terms, bank semantics, goods authority and Foundation 6 promotion remain unchanged. No supplier-specific rules, invoice-specific constants, fixed coordinates, or direct normalized writes were added.
- Contract: `backend/scripts/idp/verifyProductE2E1849ScalarSemanticAuthorityContract.ts`.

### 1.8.49.1 — Source-absent scalar fail-closed

- High-risk numeric commercial scalars (`exchangeRate`, `freight`, `insurance`) now require role-bound canonical native/OCR corroboration before PAGE_IMAGE-only evidence can enter Foundation 6.
- A bare unit price can no longer become an exchange rate merely because it is numeric, and unrelated zero amounts can no longer fabricate zero freight/insurance when the document does not state those roles.
- Explicit source-backed zero freight/insurance remains valid, and explicit exchange-rate evidence remains eligible; the boundary compares semantic numeric values rather than supplier/layout constants.
- The same boundary is applied to both primary Vision fusion and the final adaptive-recovery persistence path.
- No supplier-specific rules, invoice constants, fixed coordinates, direct normalized-data writes, OCR/model reruns, or model-size assumptions are introduced.

### 1.8.49.2 — Bank semantic authority

- Explicit native-text bank semantics (`BANK/BANKA`, `IBAN`, `SWIFT/BIC`, `ACCOUNT/HESAP`) now receive narrow Foundation 6 direct-source authority through the existing commercial candidate bridge.
- A conflicting PAGE_IMAGE interpretation cannot outrank a role-bound native bank block.
- Pure monetary text such as `0,00 EUR` cannot opt into bank authority.
- The rule is document-generic and adds no supplier/invoice-specific constants or direct normalized-data writes.

### 1.8.49.3 — Party/address semantic authority
- Added document-generic explicit party-role blocks for seller/exporter and buyer/customer semantics, including common German invoice labels.
- `Firma / Adresse` is treated as an explicit recipient block; seller/exporter blocks require their own semantic role. Unlabelled multi-party layouts remain fail-closed.
- Name, address and terminal country evidence stays native/OCR-backed and enters the existing Foundation 6 header-party authority path; no direct normalized write was added.
- Existing Turkish `SAYIN` invoice layout remains a regression gate, so broader party knowledge cannot replace the already-working VED path.

### 1.8.49.3.1 — Party structural-label boundary

- Treat standalone party-block address labels (`ADDRESS`, `ADRESSE`, `ADRES`, `ADRESI`, `ANSCHRIFT`) as structural metadata, never as a party name.
- Do not interpret `/` inside a compound semantic role such as `Firma / Adresse` as an inline role/value separator.
- Skip structural address labels while continuing to collect the following address rows.
- Preserve explicit seller/buyer role authority, legacy `SAYIN` behavior, and fail-closed handling for unlabeled party blocks.
- No supplier-specific rules, invoice-specific constants, fixed coordinates, model inference requirement, or direct normalized writes.

### 1.8.50 — Persisted semantic authority coverage
- Replays the current deterministic header/party, shipment, commercial, goods and origin readers against persisted canonical evidence for the six problem invoices plus the VED control invoice.
- Re-applies the current production candidate persistence guards in memory before Foundation 6 authority selection/resolution; no OCR/Qwen call and no database mutation occurs.
- Reports scalar authority/resolution plus promotion eligibility and goods row coverage. Missing or old persisted evidence is classified as `REPLAY_SOURCE_MISSING` / `REPLAY_SOURCE_STALE`, not misreported as a semantic parser failure.
- This checkpoint decides which documents genuinely require a fresh production run before the next seven-document acceptance pass.

### 1.8.50.1 — Persisted semantic discrepancy diagnostic
- 1.8.50 proved all seven target documents have replayable persisted canonical evidence, so a fresh model/OCR run is not yet required.
- Added a read-only diagnostic for the five documents whose replay exposed unresolved or semantically suspicious fields.
- The diagnostic emits current deterministic candidates beside canonical source anchor lines and frozen corpus expectations, allowing the next parser fix to be source-grounded rather than supplier/invoice-specific.
- No OCR/Qwen call, database mutation, normalized-data write, or production rule change is performed by this checkpoint.

### 1.8.50.2 — Persisted semantic parser fixes
- Source-grounded fixes from the 1.8.50.1 discrepancy diagnostic: explicit international invoice-number/date roles, two-digit English month dates, compact `NET WT.KGS` / `GR.WT.KGS` weights, and same-row role/value party blocks.
- Stops legacy party-address collection at goods-table semantic headers so table labels such as `Sıra` / `Miktar` cannot leak into buyer addresses.
- Extends commercial semantics for `TERM OF PAYMENT`, currency-before-amount totals, unique amount-column currency binding, and bank-name morphology while keeping unrelated reference dates fail-closed.
- Vision payment sanitization rejects amount-in-words currency lines without payment semantics, preventing written totals from becoming payment terms.
- No supplier-specific rules, invoice-specific constants, fixed coordinates, OCR/Qwen requirement, database mutation, or direct normalized-data write.

### 1.8.50.2.1 — Role-bound bare Total boundary
- Allows a bare `Total` label only when exactly one explicit `Amount/Unit Price/Rate (CURRENCY)` table header establishes currency authority and the same visual row contains exactly one numeric total.
- Keeps generic bare totals fail-closed when currency context is ambiguous or absent; no supplier/invoice constants, fixed coordinates, model inference, or direct normalized writes.

### 1.8.50.2.2 — Same-row monetary Total boundary
- Allows a bare `Total` label when the same visual row contains exactly one explicit amount+currency pair such as `EURO 21\`000.00`; the currency and amount remain bound to the same source evidence.
- Multiple same-row monetary pairs remain ambiguous and fail closed, preventing local-currency equivalents or mixed totals from being selected arbitrarily.
- Preserves the 1.8.50.2.1 unique table-currency path for layouts such as `Amount(USD) ... Total ... 4835`.
- No supplier-specific rules, invoice-specific constants, fixed coordinates, model inference, database mutation, or direct normalized-data writes.

### 1.8.50.3 — Current-parser replay precedence

Persisted semantic coverage replay now gives the freshly rebuilt deterministic envelope precedence when an older persisted deterministic candidate has the same stable candidateId. This fixes a replay-only stale-value shadowing bug: current parser results were visible in deterministicEvidence but could be discarded during candidate merge, causing the scalar matrix to report an older value. Unrelated persisted/Vision evidence remains in the replay; no OCR/model call, database mutation, supplier rule, invoice constant, or normalized-data write is introduced.

### 1.8.50.4 — Role-bound scalar safety
- Adds a geometry-bound fallback for explicit `NET WT.KGS` / `GR.WT.KGS` headers whose numeric values are rendered on the following visual row; ambiguous multiple numeric values remain fail-closed.
- Recognizes invoice-date labels separated by encoded/non-breaking-space artifacts while still requiring an explicit invoice-date semantic role.
- Tightens explicit party-block terminal-country inference so company/legal/registry text such as `LIMITED SIRKETI` or `Handelsregister` cannot be promoted as a country; genuine short terminal country rows remain eligible.
- No supplier-specific rules, invoice-specific constants, fixed coordinates, OCR/Qwen requirement, database mutation, or direct normalized-data writes were added.


#### 1.8.50.4.1 — Role-bound scalar contract fixture correction
- Corrected the synthetic ambiguous-weight contract fixture so both numeric candidates genuinely overlap the NET WT column.
- No production runtime/parser behavior changed; this only fixes the regression test geometry.

### 1.8.50.4.2 — Same-line weight boundary
- Gross/net text-label extraction no longer lets `\s*` cross a line break from a compact weight label into the first numeric line below it.
- Separated compact labels are therefore delegated to the geometry authority added in 1.8.50.4; ambiguous values in the same label column remain fail-closed instead of being preempted by page-text regex matching.
- No supplier/invoice-specific rule, fixed coordinate, OCR/model inference, database mutation, or direct normalized write was added.

### 1.8.50.4.3 — Line-preserving weight authority

- Gross/net direct label parsing now preserves canonical line boundaries instead of using flattened page text.
- A weight label cannot silently consume a numeric value from the following line; separated label/value layouts are delegated to the ambiguity-aware geometry resolver.
- Ambiguous same-column values remain fail-closed while unambiguous PML-style separated NET/GR weight layouts remain recoverable.
- No supplier/invoice-specific constants, fixed coordinates, OCR/model inference, database mutation, or direct normalized write were introduced.

### 1.8.50.5 — Semantic neighborhood diagnostic
- Adds a read-only persisted-canonical probe for the remaining PML, Dermeternal, and Ningbo scalar discrepancies after the 1.8.50.4.x safety boundary passed.
- Emits current deterministic candidates together with canonical visual-line neighborhoods around invoice/date, weight, party/address/country, payment, bank, and total semantics so the next production fix is based on the actual persisted geometry/text rather than another inferred fixture.
- No OCR/Qwen call, database mutation, production parser change, supplier-specific production rule, invoice-specific production constant, or normalized-data write is performed.


### 1.8.50.5.1 — Semantic neighborhood diagnostic DB config fix

- Diagnostic-only fix: use the project-standard `env.mongoUri` key instead of the nonexistent `env.MONGO_URI`.
- No production parser, OCR/model, database mutation, or normalized declaration behavior changes.

### 1.8.50.5.2 — Source-grounded semantic boundary
- Binds compact NET/GR weight labels to a unique numeric value on the same visual row as well as the existing below-column layout; ambiguity still fails closed.
- Normalizes punctuation/mojibake only for semantic label recognition, allowing encoded `INVOICE DATE` and `TERM OF PAYMENT` roles to bind their source values without weakening value evidence.
- Treats a nearby legal-suffix-only row as continuation of the party name rather than an address/country, and makes inferred country authority terminal-only so administrative/address text cannot be recovered by scanning backwards.
- Adds a source-shaped contract for same-row weights, encoded English invoice date, administrative party tails, legal suffix continuation, separated payment value, and genuine terminal country preservation.
- No supplier-specific rules, invoice-specific constants, fixed coordinates, OCR/Qwen inference, database mutation, or direct normalized-data write.

#### 1.8.50.5.2.1 — TypeScript narrowing correction
- Preserves the 1.8.50.5.2 source-grounded party-name continuation behavior while snapshotting the already-validated party name before callback-based filtering.
- Removes the TS18048 false narrowing loss inside Array.filter callbacks; no runtime extraction semantics or authority rules changed.

### 1.8.50.5.3 — Colon-prefixed weight value boundary
- Canonical weight value fragments such as `: 20.190` / `: 24.000` are accepted by the existing role-and-geometry-bound weight resolver.
- The colon remains only punctuation attached to the numeric value; the value still requires a recognized NET/GROSS label and the existing unique spatial binding.
- Ambiguous spatial matches continue to fail closed; no supplier/invoice-specific constants or fixed coordinates were added.

### 1.8.51 — Portable Docker release packaging
- Release builder packages backend, frontend, MongoDB and Redis runtime images for offline/portable startup.
- Release `.env` carries the current superadmin/installation identity and Spark/Ollama runtime configuration while MongoDB application data is intentionally not copied.
- Release startup helpers load the bundled images before Docker Compose startup; ARM64 1.0.2 was prepared for the target Apple Silicon Mac.
- This release-packaging checkpoint is operational only and does not change IDP extraction behavior.

### Foundation 8.0 — Golden corpus baseline
- Freezes the seven current invoice proofs as **evaluation-only** machine-readable ground truth under `backend/scripts/idp/foundation8/evals/`; these files are never runtime extraction knowledge and must not be supplied to Qwen/VL.
- Adds a generic scorer for scalar correctness, exact goods-row count, source-grounded sentinel rows, and—critically—required-field **complete-row rate**. A document with 56 GTIP tokens but only a handful of complete commercial rows now fails even when the raw row count is 56.
- Adds explicit regression contracts for the three fresh-production failure classes that exposed the old metric gap: VED GTIP-only skeleton rows, YEM package-count→quantity swap, and Volta amount→quantity/product-code swap.
- Adds a human-reviewed current-proof baseline plus an impact manifest. Future corpus growth must use layered regression: cheap contracts/cached canonical replay broadly, impacted-skill subsets for focused inference, small fresh canaries, and full fresh corpus only for release/model/major-skill gates—not every new invoice.
- No production extraction, candidate discovery, resolver, OCR/Qwen runtime, database, or normalized declaration behavior changes in this checkpoint.

### Foundation 8.1 — Portable skill layer
- Adds model-independent `backend/idp-skills/*/SKILL.md` packages for invoice understanding, goods tables, parties, commercial terms, logistics and reconciliation, with progressive reference material for domain/evidence/row semantics.
- Adds a generic filesystem skill registry/loader under production source. The loader validates skill metadata and can render a bounded skill context for any future model/agent adapter; Foundation 8.1 intentionally does **not** replace the current production extraction prompt yet.
- Goods knowledge makes row identity atomic: an isolated HS/GTIP token cannot materialize a row, packaging quantity is distinct from commercial quantity, and arithmetic validates rather than manufactures extraction.
- Portable skills contain no golden-corpus invoice/supplier identities or expected answers. Foundation 8 evaluation fixtures remain test-only and are not loaded by the skill registry or runtime extraction.
- No current Qwen/VL extraction, candidate fusion, resolver, database, OCR, or normalized declaration behavior changes in this checkpoint.

### Foundation 8.2 — Atomic InvoiceUnderstanding contract

Foundation 8.2 adds the model-independent semantic object that the portable skills will eventually produce. It is deliberately **not wired into production extraction yet**.

- Added `InvoiceUnderstanding` v1 with document identity, parties, commercial terms, logistics, package summary and an atomic goods table.
- Goods rows have their own `rowId`, `rowEvidence` and `pageNumbers`; field index alone is not row identity.
- A HS/GTIP-only skeleton may exist as partial evidence, but it cannot satisfy goods-row completeness.
- `expectedRowCount` is optional metadata and cannot be manufactured from the number of HS/GTIP tokens.
- Every populated goods field must carry evidence and must overlap the row evidence neighborhood at minimum.
- Arithmetic is a corroboration check only. It never fills a missing quantity, unit price or line total.
- This checkpoint changes no production extraction, candidate projection, Foundation 6 promotion, OCR/model execution or database writes.

Contract:
`docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyFoundation820InvoiceUnderstandingContract.ts`

### Foundation 8.3 — Bounded specialist orchestration
- Adds bounded PARTIES, COMMERCIAL, GOODS and LOGISTICS specialist contracts over the same source evidence.
- Each specialist has explicit ownership and forbidden domains; the manager assembles specialist results structurally rather than allowing cross-domain rewrites.
- No production model call, normalized-data write, database mutation or Foundation 6 behavior change is introduced.

### Foundation 8.4 — Reconciliation and targeted recovery
- Adds reconciliation decisions for ACCEPT, TARGETED_RECOVERY and REVIEW_REQUIRED.
- Incomplete goods or arithmetic conflicts can request narrowly scoped rereads without manufacturing or repairing values; genuine source ambiguity fails closed to review.
- Recovery scope cannot rewrite unrelated party/logistics/package domains.
- No production model/recovery cutover, database mutation or direct normalized-data write is introduced.

### Foundation 8.5 — Deterministic authority demotion
- Defines specialist understanding as semantic primary authority.
- Role-bound native evidence, validated native goods rows and native HS tokens are corroboration only; OCR/Vision are recovery evidence and legacy deterministic extraction is fallback-only.
- Deterministic evidence cannot create/overwrite atomic semantic rows; conflicts may trigger recovery instead.
- This checkpoint changes no production fusion or Foundation 6 promotion behavior.

### Foundation 8.6 — Foundation 6 write-authority boundary

Foundation 8.6 closes the second-writer hole for document-owned fields already promoted by Foundation 6.

- `runNormalize()` may continue rebuilding compatibility/non-F6 data during migration.
- Before save, paths whose persisted `sourceTrace` provenance is `DECLARATION_FIELD_RESOLUTION` are restored from the current declaration.
- Ownership is provenance-driven rather than supplier-, invoice-, or hard-coded field-value driven.
- This protects F6-resolved scalar, party, package and per-row goods values from a later legacy normalize rewrite.
- Non-F6/user/settings/calculated data is not blanket-frozen by this boundary.
- Foundation 8 itself still does not write directly to `normalizedData`.

Contract:
`docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyFoundation860F6WriteAuthorityBoundaryContract.ts`

#### Foundation 8.6.1 — SourceTrace typing correction

The 8.6 ownership behavior is unchanged. The write boundary now returns the declaration model-compatible concrete `sourceTrace` record shape instead of `Record<string, unknown>`, so TypeScript enforces the save boundary without an `any` cast.

#### Foundation 8.6.2 — Flat sourceTrace ownership lookup

The F6 ownership boundary now reads persisted `sourceTrace` using its real flat path-keyed representation (for example `header.invoiceNo`) while continuing to traverse nested `normalizedData` by path. This fixes the contract failure where F6-owned paths were detected but skipped during restoration.

### Foundation 8.7 — Seven-invoice zero-regression gate

Foundation 8.7 turns the frozen seven-invoice corpus into a release gate for the failure classes that motivated Foundation 8.

- All seven golden cases are mandatory: Çelikel, Dermeternal, Ningbo, PML, VED146, Volta and YEM.
- VED146 requires 56 atomic complete goods rows; 56 isolated HS/GTIP tokens cannot pass row completeness.
- YEM rejects package-count/commercial-quantity swaps and the resulting arithmetically coherent wrong amount.
- Volta rejects amount-as-quantity and description-token-as-product-code swaps.
- PML requires the source-backed 281.50 EUR total and rejects fabricated HS/GTIP values.
- Dermeternal and Ningbo enforce fail-closed unsupported HS; Ningbo also enforces fail-closed unsupported unit.
- Çelikel rejects unsupported Hungary origin promotion.
- The scorer now enforces row-level `expectedAbsentOrReview` paths, including wildcard goods paths, instead of silently skipping them.
- This checkpoint is cached/contract-only: no Qwen/VL/OCR execution, database mutation or production normalized-data write occurs.

Contract:
`docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyFoundation870SevenInvoiceZeroRegressionGate.ts`

### Foundation 8.8 — Capability-impact corpus scaling
- Adds a typed impact selector over the Foundation 8 capability manifest so focused regression runs select the deterministic union of only the golden cases affected by changed capabilities.
- Unknown capability tags are surfaced explicitly and never silently widened to the full corpus.
- Adds a corpus-admission rule: a production invoice does not enter the golden corpus merely because it exists; admission is justified when it contributes a novel capability or failure-class tag.
- Existing covered behavior stays protected by the representative golden cases and cheap broad contracts; fresh model inference can remain limited to impacted canaries/release gates.
- This checkpoint does not add supplier/invoice-specific runtime knowledge, call Qwen/VL/OCR, mutate the database, or change production extraction.

Contract:
`docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyFoundation880CapabilityImpactCorpusScalingContract.ts`

### Foundation 8.9 — Production shadow runtime wiring
- Wires Foundation 8 into the real invoice worker **after** the existing Vision/adaptive-recovery candidate boundary, but keeps it strictly shadow-only: the production `fieldCandidates` returned to Foundation 6 are unchanged.
- Loads the portable specialist plan (PARTIES, COMMERCIAL, GOODS, LOGISTICS) in the production path and records only bounded plan metadata in the shadow audit; this checkpoint does not add a second model/OCR call yet.
- Projects source-backed final candidates into the atomic `InvoiceUnderstanding` contract and runs Foundation 8 reconciliation, making GTIP-only skeleton rows and row arithmetic/completeness problems visible as shadow recovery/review decisions.
- Package summary and commercial goods quantity remain separate semantic sections; shadow projection never repairs values with arithmetic or copies package counts into goods rows.
- Persists the shadow artifact inside the existing processing result data as `foundation8ShadowAudit` for later real-PDF/Spark comparison. It does not write `normalizedData`, alter Foundation 6 promotion, or import golden expected answers into runtime.
- This is the migration bridge before specialist model execution/cutover: production truth remains the existing candidate→F6 path until shadow evaluation proves the new path safe.

Contract:
`docker compose -f compose.dev.yaml exec backend npx tsx backend/scripts/idp/verifyFoundation890ShadowRuntimeWiringContract.ts`

#### Foundation 8.9.1 — CJS-compatible shadow contract runner

The 8.9 production shadow wiring is unchanged. The verification script now performs its asynchronous source check inside an explicit `async main()` entry point so `tsx` can execute the contract under the project's CommonJS output mode without top-level `await`.
