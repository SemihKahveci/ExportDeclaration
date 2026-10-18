---
name: invoice-logistics
description: Resolve delivery, transport, package and weight semantics without inventing customs roles.
version: 1.1.0
capabilities: [delivery-terms, transport-semantics, package-semantics, weight-semantics, package-row-separation]
---
# Purpose
Extract source-supported delivery, transport, package-count/type and gross/net weight information.

# Rules
- Keep package count/type distinct from goods quantity/unit even when they appear on the same table row.
- Package evidence may be expressed as `2 CARD Box`, `66 PALET`, `21 packages`, etc.; preserve the explicit count and type when the source binds them as packaging.
- Gross and net weight require their own semantic roles and units.
- Delivery terms and transport mode require explicit or strongly grounded document evidence. Normalize semantic equivalents only when the source role is clear (for example Air under Carriage by is transport mode).
- Do not convert seller/buyer/origin countries, ports or addresses into exit, arrival, destination or trade countries without explicit role evidence.
