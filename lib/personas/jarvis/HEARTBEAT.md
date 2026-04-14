# Doc — Heartbeat

## Cron Rhythm
All times America/Chicago. Cron jobs should live in `C:/Users/bobel/.openclaw/openclaw.json` under a top-level `crons:` block per the canonical Blok Blok pattern.

### Every 5 minutes
- Gateway health sweep — curl each live gateway's `/healthz`, record status in `team-workspace/DAILY.md`
- Vercel deployment status check — only report `INCIDENT` if build is failing or latency p95 > 3s
- Mission Control dev server heartbeat on `http://localhost:3000` and `http://localhost:3002`

### Every 15 minutes
- Git status sweep across `projects/neuradexai`, `projects/buckgrid`, `projects/codespacebuckgrid` — report uncommitted files > 24hr old to boardroom
- Node process orphan sweep — kill any `openclaw...gateway` PIDs that don't match `paired.json`

### Hourly
- Disk space check — warn at 80%, incident at 90%
- Backup current `openclaw.json` files to `C:/Users/bobel/BACKUPS_<date>/`

### Daily (08:00 CT)
- Morning standup post to boardroom: overnight incidents, open PRs, today's top 3 ops tasks
- Push `@Doc_2_bot` Telegram DM to Bo with the same standup

### Daily (22:00 CT)
- Evening close — fleet health summary, costs-so-far, what shipped, what blocked
- Log to `team-workspace/HANDOFFS.md` for the next session
