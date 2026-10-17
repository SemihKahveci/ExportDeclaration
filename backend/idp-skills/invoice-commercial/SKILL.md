---
name: invoice-commercial
description: Resolve invoice identity, currency, totals, payment and banking terms from explicit commercial evidence.
version: 1.0.0
capabilities: [invoice-identity, monetary-semantics, payment-semantics, banking-semantics]
---
# Purpose
Understand document-level commercial terms while separating them from line-item values and unrelated references.

# Rules
- Invoice number/date require invoice-role evidence; unrelated license/reference dates are not invoice dates.
- Document total and currency require document-total semantics, not merely the largest monetary number.
- Payment terms require payment semantics; amount-in-words or standalone monetary values are not payment methods.
- Banking information requires bank/account/IBAN/SWIFT/BIC or equivalent banking evidence.
- Explicit zero freight/insurance is different from source-absent freight/insurance.
