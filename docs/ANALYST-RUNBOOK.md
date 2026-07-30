# Sojo Searcher — Analyst Runbook (v1 internal)

*For in-house analysts using the product on live client mandates. One page — read it once.*

## What this product does

You describe an acquisition mandate in plain language; the AI asks follow-ups to sharpen it into criteria (industry, location, size); then the system **live-scrapes** the most relevant sources for that mandate — local business directories, business-for-sale marketplaces, niche industry directories — and returns one ranked lead board. Nothing is pre-stored: every search hits the sources at that moment, so results are as fresh as the sites themselves.

## How to run a mandate

1. **Log in** and start a new thesis. Write the mandate the way the client gave it, but include the three things routing depends on: **industry, geography, size** (e.g., "HVAC services businesses around Dallas, $1–3M revenue, owner looking to exit" — not just "HVAC").
2. Answer the AI's follow-up questions — they directly become search filters.
3. Run the search. **Expect 1–2 minutes.** The progress panel shows each source as it completes; some sources failing is normal (the search continues without them).
4. Work the board: match score + match reason per lead, save the good ones — **Saved leads live in the Saved page**, which is your working list for the mandate.
5. Different mandate = different sources searched. A Texas HVAC mandate and an India D2C mandate hit almost entirely different sites — that's the router doing its job. You can see which sources ran in the results metadata.

## Rules for client work (non-negotiable)

- **Verify before it reaches the client.** Phone numbers, emails, and websites come from live scrapes and can be stale or wrong. Check the business's site / call before a lead enters any client deliverable.
- **AI text stays internal.** Match reasons and enrichment summaries are AI-generated and directional — never paste them into client-facing material as facts.
- **This is one channel, not the only channel.** Keep your manual sourcing running in parallel; the product's job is to add leads and save you hours. Track what it finds that you wouldn't have, and vice versa.

## Limits (v1)

- **Daily search quota per user** — searches cost real scraping + AI money; batch your thinking before you run one. You'll get a clear message when you hit the cap.
- **Not covered yet:** the big for-sale marketplaces (BizBuySell, Flippa, Acquire, Empire Flippers — coming as a separate track), several broker sites pending infrastructure, and any source requiring a login.
- **No results ≠ broken.** Very narrow mandates (tiny niche + small town) can legitimately return little; broaden the geography or industry and rerun.

## Feedback — this is how the product gets good

After each real mandate search, log (in the team channel, 30 seconds):
1. The mandate you ran
2. Were the top ~10 results relevant? (yes / mixed / garbage)
3. **Name one business you know should have appeared but didn't**, if any

That third answer is the most valuable data anyone gives this product. Bugs/errors: screenshot + the search you ran → straight to the engineer.
