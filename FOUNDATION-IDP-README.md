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
