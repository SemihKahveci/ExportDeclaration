---
name: invoice-logistics
description: Resolve delivery, transport, package and weight semantics without inventing customs roles.
version: 1.0.0
capabilities: [delivery-terms, transport-semantics, package-semantics, weight-semantics]
---
# Purpose
Extract source-supported delivery, transport, package-count/type and gross/net weight information.

# Rules
- Keep package count/type distinct from goods quantity/unit.
- Gross and net weight require their own semantic roles and units.
- Delivery terms and transport mode require explicit or strongly grounded document evidence.
- Do not convert seller/buyer/origin countries into exit, arrival, destination or trade countries without role evidence.
