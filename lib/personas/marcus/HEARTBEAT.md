# Marcus — Heartbeat

## Cron Rhythm
All times America/Chicago. Cron jobs should live in `C:/Users/bobel/.openclaw-marcus/.openclaw/openclaw.json` under a top-level `crons:` block per the canonical Blok Blok pattern.

### Every 15 minutes
- QUEUE.md poll for any `owner: marcus` build tasks
- ACP session health — if a `marcus-build-<date>` session is running, check last output timestamp; restart if stalled > 10 min

### Hourly
- Build drift check — run `tsc --noEmit` on `neuradexai` and `buckgrid`, report new type errors to boardroom
- Git status sweep across `projects/neuradexai`, `projects/buckgrid`, `projects/codespacebuckgrid` — list any uncommitted files older than 4hr

### Daily (09:00 CT)
- Morning build report — overnight commits, open branches, failing builds, today's top 3 build tasks
- Push to Bo via `@Marcus_2bot`

### Daily (20:00 CT)
- Evening wrap — what shipped, what's in progress, what's blocked, what needs Bo to deploy
- Log to `team-workspace/HANDOFFS.md` for Doc to pick up at nightly cron

### Weekly (Monday 09:30 CT)
- `npm audit` across `neuradexai` and `buckgrid` — flag any HIGH or CRITICAL, file them as issues in `team-workspace/QUEUE.md`

### Monthly (first day of month, 10:00 CT)
- Dependency freshness report — outdated packages, breaking-change risk, upgrade plan in `team-workspace/MARCUS_UPGRADE_PLAN.md`
