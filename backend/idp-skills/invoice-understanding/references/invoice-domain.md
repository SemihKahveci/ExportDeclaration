# Invoice domain model
An invoice commonly contains document identity, seller/buyer parties, commercial terms, logistics/package summaries and one or more goods rows. Labels and layout vary by language and supplier, so semantic role is more important than literal wording or fixed position.

Goods rows are commercial entities. Package summaries, totals, amount-in-words text, banking blocks and footer/legal text are not goods rows merely because they contain numbers or product-like tokens.
