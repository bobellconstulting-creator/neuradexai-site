# Vault — Heartbeat

## Cron Rhythm
All times America/Chicago. Cron jobs should live in `C:/Users/bobel/.openclaw-vault/.openclaw/openclaw.json` under a top-level `crons:` block per the canonical Blok Blok pattern.

### Hourly
- `.env` integrity check — read `C:/Users/bobel/projects/neuradexai/.env.local` and `C:/Users/bobel/projects/buckgrid/.env.local`, verify expected keys present, report any drift to `team-workspace/INCIDENTS.md`
- `CREDENTIALS.md` freshness pass — scan for `Rotate by` dates within 14 days, flag to Bo via `@Vault9_bot`

### Every 15 minutes
- QUEUE.md poll for any `owner: vault` credential or audit tasks
- Handoff inbox scan: `team-workspace/handoffs/*-vault-*`

### Daily (07:00 CT)
- Secret rotation reminder — morning Telegram DM to Bo listing every credential inside the 14-day rotation window with proposed rotation order
- Audit log sweep — append yesterday's credential reads/writes to `team-workspace/memory/vault/credential-audit.md`

### Daily (23:00 CT)
- Nightly `.env` snapshot (redacted, first-4-chars only) to `C:/Users/bobel/BACKUPS_2026-04-11/vault-env-snapshot.md` for audit trail

### Weekly (Sunday 10:00 CT)
- Pwned-password check on known fleet accounts — query HIBP with `fetch_url` against the k-anonymity API, report any hits
- Orphan secret sweep — find keys in `.env` files not referenced by any file in the repo, propose removal
