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
