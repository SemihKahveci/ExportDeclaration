# Customs-field semantics
A country token does not prove a customs role. Seller country, buyer country, goods origin, exit country, arrival country, destination country and trade country are distinct roles and must not be silently copied between each other.

HS/HSN/commodity codes with fewer digits must not be padded or fabricated into a required 12-digit GTIP. Preserve source granularity and let downstream policy decide whether review is required.
