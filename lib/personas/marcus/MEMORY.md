# Marcus — Persistent Memory

## Infrastructure Facts (stable — update only when changed)
- OpenClaw gateway port: `18791`
- OpenClaw workspace: `C:/Users/bobel/.openclaw-marcus/`
- Device identity: `C:/Users/bobel/.openclaw-marcus/.openclaw/identity/device.json`
- Gateway auth token: `OPENCLAW_GATEWAY_TOKEN` env var
- Telegram bot: `@Marcus_2bot` (token in `C:/Users/bobel/.secrets/telegram-bots.env`)
- Mission Control HUD: `http://localhost:3000/mission-control` (dev) / `http://localhost:3002/mission-control` (alt dev)
- Backups directory: `C:/Users/bobel/BACKUPS_2026-04-11/`
- Research reports (2026-04-11): `C:/Users/bobel/AUDIT_2026-04-11.md`, `C:/Users/bobel/CHASE_HAYNES_ARCHITECTURE_SPEC_2026-04-11.md`, `C:/Users/bobel/TEAM_ARCHITECTURE_RESEARCH_2026-04-11.md`, `C:/Users/bobel/OPENCLAW_DIAGNOSIS_2026-04-11.md`, `C:/Users/bobel/NEURADEX_REAL_BUILD_2026-04-11.md`

## Stack Ground Truth (as of 2026-04-11)
- Mission Control: Next.js 14.2.5 at `C:/Users/bobel/projects/neuradexai/`
- Dispatch order (new tier inversion): Haiku-with-tools → Gemini → OpenClaw gateway → Haiku-plain
- Live products: BuckGrid Pro at `https://codespacebuckgrid.vercel.app` (0 paying users as of last audit)
- BuckGrid v2 dev: `C:/Users/bobel/projects/buckgrid/` on localhost:3005
- Use `--legacy-peer-deps` for R3F and Three.js packages (R3F v8 pinned)

## Fleet Peer Awareness
- **Doc**: Chief of Ops, port 18789, `@Doc_2_bot`
- **Linda**: Research & Verification, port 18790, `@Linda_007_bot`
- **Vault**: Security / credentials, port 18792, `@Vault9_bot`

## Persistent Incidents / Open Loops
_Updated by the nightly cron job. This section is machine-edited, don't manually append._

- [2026-04-11] OpenClaw gateway cold start reduced from 55s to ~3s via `OPENCLAW_DISABLE_BUNDLED_PLUGINS=1`. See `OPENCLAW_DIAGNOSIS_2026-04-11.md`.
- [2026-04-11] Mission Control API routes (`/api/mission/broadcast`, `/api/mission/tasks`) have no auth. Open hole. Candidate build task for Marcus.
- [2026-04-11] BuckGrid real user count: 0. No fabricated testimonials, no invented social proof. Any copy Marcus ships must stay honest.
- [2026-04-11] Build-to-earn mandate PAUSED. All cycles to Neuradex / BuckGrid priorities until 100 paying users.

## What Marcus Has Learned About Bo
_Updated when Bo gives durable feedback. Append-only._

- Bo hates corporate speak. Contractions always. Profanity when it fits.
- Bo wants real artifacts on disk, not summaries of intended artifacts.
- Bo expects "dude that's the wrong call" when he's wrong. Say it once, clearly, then execute his call if he still wants to.
- Bo's real external email is `bobellconsulting@gmail.com` (not `bobellconstulting` — that's the misspelled Gmail used for fleet ops).
- Marcus's verified artifact pattern: `C:/Users/bobel/ETSY_PLAN.md` written with a real `write_file` call on 2026-04-10. That's the bar. Repeat it.
- Bo will not authorize production pushes without an explicit ask. Do not surprise him with a deploy.
