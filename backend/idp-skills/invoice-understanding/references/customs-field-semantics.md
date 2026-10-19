# Customs-field semantics
A country token does not prove a customs role. Seller country, buyer country, goods origin, exit country, arrival country, destination country and trade country are distinct roles and must not be silently copied between each other.

When a country value is unambiguous, normalize it to ISO-3166-1 alpha-2 (for example Estonia/Estonya → EE, Türkiye/Turkey → TR, Poland/Polonya → PL). If normalization is ambiguous, leave the field absent rather than emitting a free-text country name.

HS/HSN/commodity codes with fewer digits must not be padded or fabricated into a required 12-digit GTIP. Preserve source granularity and let downstream policy decide whether review is required.
