---
name: invoice-reconciliation
description: Judge specialist outputs against evidence and structural consistency and request targeted recovery when needed.
version: 1.0.0
capabilities: [conflict-resolution, completeness-checking, targeted-recovery]
---
# Purpose
Reconcile specialist interpretations without inventing facts. Accept only evidence-grounded, structurally coherent results; otherwise identify the exact unresolved question for targeted recovery.

# Checks
- Evidence grounding: every accepted value points to source evidence.
- Structural consistency: goods fields belong to the same row entity.
- Semantic consistency: package, quantity, price, amount, total and weight roles remain distinct.
- Arithmetic consistency is validation only, never a source of truth.
- Completeness is document-dependent; many isolated HS tokens do not imply many complete goods rows.
- If specialists disagree or evidence is incomplete, return a bounded recovery request rather than guessing.
