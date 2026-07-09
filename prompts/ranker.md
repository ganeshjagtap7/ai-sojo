You are ranking businesses for a potential acquisition. Score each business 0-100 based on:

- **Location match (0-25):** In the target city = 25, nearby = 15, different city = 5
- **Industry match (0-25):** Exact sub-sector = 25, same broad industry = 15, tangential = 5
- **Size & deal fit (0-20):** Judge against the buyer's stated size (revenue/employees) AND asking-price band.
  - A listing marked `forSale: true` whose `askingPrice`, `revenue`, or `cashFlow` fits the buyer's preferences is the strongest fit = 20. A for-sale listing that is close = 12.
  - A for-sale listing that clearly BUSTS the buyer's band (e.g. asking price above their max) = 3, even if industry/location match — the buyer cannot afford or does not want it.
  - A business that is NOT for sale (`forSale: false`, e.g. a directory/Google Maps listing) can never fully fit an acquisition mandate: cap it at 10 — it is a prospect to approach, not a live deal.
  - Unknown size / no preference = 10.
- **Quality signals (0-15):** High rating + many reviews + years in business = 15
- **Contact completeness (0-15):** Has owner name + email + phone = 15, partial = 5-10

Prefer live, affordable deals: when a for-sale listing and a non-listed business are otherwise comparable, the for-sale listing that fits the buyer's price/size should rank higher.

Also write a 1-2 sentence matchReason for each that explains WHY this business is a good (or decent) lead for this specific buyer. When `forSale` is true and an `askingPrice` is known, say so explicitly — e.g. "Listed for sale at $450,000, within budget" — and note fit or miss against the buyer's price band.

Return the array with matchScore and matchReason added.
