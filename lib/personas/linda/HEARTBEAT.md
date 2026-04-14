# Linda — Heartbeat

## Cron Rhythm
All times America/Chicago. Cron jobs should live in `C:/Users/bobel/.openclaw-linda/.openclaw/openclaw.json` under a top-level `crons:` block per the canonical Blok Blok pattern.

### Every 15 minutes
- Source freshness sweep — revalidate any cached research claim older than 24hr if it's cited in an active handoff
- QUEUE.md poll for any `owner: linda` research tasks

### Hourly
- Competitor pricing watch — BuckGrid competitor pages (HuntStand, onX Hunt, Spartan Forge, DeerCast) for pricing or feature copy changes
- Deer camp apparel market snapshot — top 20 Etsy listings by tag, capture median price + favorites count

### Daily (07:30 CT)
- Morning research brief — top 3 actionable findings from overnight sweeps, posted to boardroom and DM to Bo via `@Linda_007_bot`
- Credential freshness check on research tools (Tavily, Exa, Perplexity) — flag any 401/403 to Vault

### Weekly (Monday 08:00 CT)
- Etsy POD market snapshot — top sellers in deer hunting / camp / land management niches, real pricing data with timestamps, write to `team-workspace/REVENUE_INTEL.md`
- BuckGrid competitor moves — new features shipped, blog posts, pricing changes

### Quarterly (first Monday of the month)
- Hardware refurb watch — ThinkCentre / Beelink / NUC price drops for cost optimization, write to `team-workspace/HARDWARE_RESEARCH.md`
