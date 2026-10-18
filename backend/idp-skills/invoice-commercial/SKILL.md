---
name: invoice-commercial
description: Resolve invoice identity, currency, totals, payment and banking terms from explicit commercial evidence.
version: 1.1.0
capabilities: [invoice-identity, monetary-semantics, payment-semantics, banking-semantics, total-semantics]
---
# Purpose
Understand document-level commercial terms while separating them from line-item values and unrelated references.

# Rules
- Invoice number/date require invoice-role evidence; unrelated license/reference dates are not invoice dates.
- Document total and currency require document-total semantics, not merely the largest monetary number. Accept equivalent total roles such as Invoice Total, Grand Total, Total Amount, Amount Chargeable, Payable/Ödenecek Tutar or an unambiguous final `Total` row in the invoice summary.
- Do not drop a document total merely because it equals the only line amount; semantic total labeling still makes it a document total.
- Payment terms require payment semantics. When one source phrase combines delivery and payment (for example an Incoterm plus a day term), keep the delivery term in logistics and the payment condition in paymentTerm without inventing a payment method.
- Banking information requires bank/account/IBAN/SWIFT/BIC or equivalent banking evidence. Return useful values, not a concatenation of empty labels.
- Explicit zero freight/insurance is different from source-absent freight/insurance.
