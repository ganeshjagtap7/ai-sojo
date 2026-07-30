# End-to-End UAT Checklist (v1 internal handover)

Run this top-to-bottom on **production** after PR #3 Phase 1 deploys, before analysts get access.
Anything that fails is either a fix-before-handover item or a written known-issue in `ANALYST-RUNBOOK.md` — no third option.
Estimated time: ~2 hours. Re-run the **Golden Queries** section after every significant merge.

## 1. Auth & access

- [ ] Sign up with a fresh email → account created, lands in the product
- [ ] Log out → log back in
- [ ] Wrong password → clear error, no crash
- [ ] Password reset email arrives and works
- [ ] Signup with an already-registered email → clear message, not a crash
- [ ] Logged-out visit to `/app` → redirected to login, not an error page
- [ ] Session expiry: leave a tab open >1h, then run a search → either works (refreshed token) or cleanly asks to re-login

## 2. Onboarding / thesis chat

- [ ] Complete the full wizard as a brand-new user without help — note anywhere you hesitated
- [ ] Vague mandate ("I want to buy a business") → AI asks sensible follow-ups, doesn't guess
- [ ] Refresh mid-conversation → state survives or restarts cleanly (no half-broken screen)
- [ ] Criteria-extraction spot check — run the 5 mandates below through the chat and confirm the confirmed criteria match:

| Mandate as typed | Must extract |
|---|---|
| "Plumbing businesses around Atlanta doing $1–3M revenue" | industry=plumbing · city=Atlanta · state=GA · revenue 1M–3M |
| "B2B SaaS, doesn't matter where, up to $500k profit" | digital industry · no location constraint |
| "Retail chains in Pune, India" | industry=retail · city=Pune · country=India |
| "HVAC or electrical services in Texas, owner retiring" | industry=hvac/electrical · state=TX · owner-operated signal |
| "Something under $200k I can run on weekends" | budget constraint captured · follow-up asked for industry |

## 3. Search execution

- [ ] Routed sources logged match expectations for each golden query (see §5)
- [ ] Progress UI counts through sources; label matches the number actually run (not "of 5" hardcoded)
- [ ] One source failing (watch logs) → search still completes with remaining sources
- [ ] Hit the daily quota deliberately → polite 429 message in UI, not raw error
- [ ] Second user account can search while first is mid-search
- [ ] Refresh the page mid-search → app recovers to a sane state (documented behavior, no zombie spinner)
- [ ] Absurdly narrow mandate ("alpaca grooming in Reykjavik") → friendly no-results message, not a stack trace

## 4. Results, saving, viewing

- [ ] 30-lead board renders on a 13" laptop without layout breakage
- [ ] Lead card → detail view shows source badge + source URL that opens the real listing/site
- [ ] Save a lead → appears on Saved page; unsave → disappears
- [ ] Saved leads survive logout/login
- [ ] Empty Saved page shows an empty state, not a blank screen
- [ ] Whole journey once on a phone browser — note breakages (cosmetic OK, broken-flow not)
- [ ] Spot-verify 3 leads' contact info by hand (call/site) — record hit rate; this sets the verification expectation in the runbook

## 5. Golden queries (repeat after every significant merge)

Run each; record routed sources, lead count, and top-10 relevance (good / mixed / garbage) in a shared sheet with the date.

| # | Query | Expected routing (v1) |
|---|---|---|
| G1 | Plumbing businesses, Atlanta GA, $1–3M revenue | core + yellowpages/manta + businessesforsale + serviceexperts |
| G2 | B2B SaaS, no location, ≤$500k profit | core + trustmrr + sideprojectors (+ quietlight once its actor ships) |
| G3 | Retail, Pune, India | core + smedealz/buybiz/businessex |
| G4 | HVAC services, Dallas TX | core + yellowpages/manta + businessesforsale + hvacinformed/serviceexperts |
| G5 | Franchise resales, Florida | core + franchisegator + businessesforsale |

Pass bar per query: ≥1 marketplace/deal source contributed leads · top-10 majority relevant · no source errored silently (0 leads + no log line).

## 6. Ops sanity (once, before handover)

- [ ] Vercel prod env vars present: `APIFY_API_TOKEN`, LLM keys, Supabase URL/keys, `MAX_EXTRA_SOURCES`, `SCRAPER_MAX_PAGES`
- [ ] All 3 Supabase migrations applied to prod (`profiles/theses/searches/saved_leads` + rate-limit tables exist)
- [ ] Daily quota set to the agreed number and verified (see §3)
- [ ] Billing alerts set: Apify console + LLM provider console
- [ ] `[Pipeline] Routed sources:` and per-source lead counts visible in Vercel logs — this is the weekly health check; calendar reminder created for it
