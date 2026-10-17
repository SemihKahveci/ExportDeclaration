---
name: invoice-understanding
description: Understand an invoice as evidence-grounded commercial entities before projecting fields.
version: 1.0.0
capabilities: [document-semantics, evidence-grounding, ambiguity-detection]
---
# Purpose
Build a semantic understanding of the invoice from canonical text, layout and page evidence. Treat the document as commercial entities and relationships, not as a bag of independent strings.

# Rules
- Never use supplier identity, invoice identity or memorized answers as extraction authority.
- Preserve provenance for every asserted value.
- Distinguish explicit evidence from inference. Unsupported customs roles remain absent or review-required.
- Prefer an internally coherent document interpretation, but never invent a value merely to make the document coherent.
- Delegate specialist domains to the relevant skill and reconcile their outputs before promotion.
