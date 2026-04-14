# Linda — Persistent Memory

## Infrastructure Facts (stable — update only when changed)
- OpenClaw gateway port: `18790`
- OpenClaw workspace: `C:/Users/bobel/.openclaw-linda/`
- Device identity: `C:/Users/bobel/.openclaw-linda/.openclaw/identity/device.json`
- Gateway auth token: `OPENCLAW_GATEWAY_TOKEN` env var
- Telegram bot: `@Linda_007_bot` (token in `C:/Users/bobel/.secrets/telegram-bots.env`)
- Mission Control HUD: `http://localhost:3000/mission-control` (dev) / `http://localhost:3002/mission-control` (alt dev)
- Backups directory: `C:/Users/bobel/BACKUPS_2026-04-11/`
- Research reports (2026-04-11): `C:/Users/bobel/AUDIT_2026-04-11.md`, `C:/Users/bobel/CHASE_HAYNES_ARCHITECTURE_SPEC_2026-04-11.md`, `C:/Users/bobel/TEAM_ARCHITECTURE_RESEARCH_2026-04-11.md`, `C:/Users/bobel/OPENCLAW_DIAGNOSIS_2026-04-11.md`, `C:/Users/bobel/NEURADEX_REAL_BUILD_2026-04-11.md`

## Stack Ground Truth (as of 2026-04-11)
- Mission Control: Next.js 14.2.5 at `C:/Users/bobel/projects/neuradexai/`
- Dispatch order (new tier inversion): Haiku-with-tools → Gemini → OpenClaw gateway → Haiku-plain
- Live products: BuckGrid Pro at `https://codespacebuckgrid.vercel.app` (0 paying users as of last audit)
- BuckGrid v2 dev: `C:/Users/bobel/projects/buckgrid/` on localhost:3005

## Fleet Peer Awareness
- **Doc**: Chief of Ops, port 18789, `@Doc_2_bot`
- **Marcus**: Builder / CTO, port 18791, `@Marcus_2bot`
- **Vault**: Security / credentials, port 18792, `@Vault9_bot`

## Persistent Incidents / Open Loops
_Updated by the nightly cron job. This section is machine-edited, don't manually append._

- [2026-04-11] Tavily key active, Exa key active — verified via test call.
- [2026-04-11] Gmail SMTP (`bobellconstulting@gmail.com`) rejected by Google. Outbound email is `BLOCKED` until Resend key is provisioned or app password is regenerated.
- [2026-04-11] ElevenLabs API key `ER8IxTJm...` returns 401. Not in Linda's lane but flagged for awareness.
- [2026-04-11] BuckGrid real user count: 0. Hard rule: no fabricated social proof, no invented testimonials, no "thousands of hunters use" — see `project_buckgrid_honesty_fix.md`.

## What Linda Has Learned About Bo
_Updated when Bo gives durable feedback. Append-only._

- Bo caught a fabrication on 2026-04-09: invented `$3.20-$8.50 POD cost ranges` with no source. New hard rule: every number in a research output must come from a tool call this turn.
- Bo wants outbound comms that sound like a senior engineer who also understands business. No buzzword soup.
- Bo hates "great question" openers and corporate padding.
- Bo's real external email is `bobellconsulting@gmail.com` (not `bobellconstulting` — that's the misspelled Gmail used for fleet ops).
- Bo tolerates profanity in responses when it fits the register.
