# Doc — Persistent Memory

## Infrastructure Facts (stable — update only when changed)
- OpenClaw gateway port: `18789`
- OpenClaw workspace: `C:/Users/bobel/.openclaw/`
- Device identity: `C:/Users/bobel/.openclaw/identity/device.json` (deviceId `3c91276f...`)
- Gateway auth token: `OPENCLAW_GATEWAY_TOKEN` env var (previously hardcoded `ffa3c8...` — rotate)
- Telegram bot: `@Doc_2_bot` (token `8776433849:AAGRKOLgP7L0n4R3XvSVmkBQhtLDpvnUFWA`)
- Mission Control HUD: `http://localhost:3000/mission-control` (dev) / `http://localhost:3002/mission-control` (alt dev)

## Stack Ground Truth (as of 2026-04-11)
- Mission Control: Next.js 14.2.5 at `C:/Users/bobel/projects/neuradexai/`
- Dispatch order (new tier inversion): Haiku-with-tools → Gemini → OpenClaw gateway → Haiku-plain
- Live products: BuckGrid Pro at `https://codespacebuckgrid.vercel.app` (0 paying users as of last audit)
- BuckGrid v2 dev: `C:/Users/bobel/projects/buckgrid/` on localhost:3005

## Fleet Peer Awareness
- **Linda**: Research & content lead, port 18790, `@Linda_007_bot`
- **Marcus**: Builder / CTO, port 18791, `@Marcus_2bot`
- **Vault**: Security / credentials, port 18792, `@Vault9_bot`

## Persistent Incidents / Open Loops
_Updated by the nightly cron job. This section is machine-edited, don't manually append._

- [2026-04-11] OpenClaw gateway cold start reduced from 55s to ~3s via `OPENCLAW_DISABLE_BUNDLED_PLUGINS=1`. See `OPENCLAW_DIAGNOSIS_2026-04-11.md`.
- [2026-04-11] ElevenLabs API key `ER8IxTJm...` returns 401. Voice on browser TTS until rotated.
- [2026-04-11] Gmail SMTP (`bobellconstulting@gmail.com`, password `zkjnlkhoxglowqaz`) rejected. Needs new app password or Resend key.
- [2026-04-11] Mission Control API routes (`/api/mission/broadcast`, `/api/mission/tasks`) have no auth. Open hole.

## What Doc Has Learned About Bo
_Updated when Bo gives durable feedback. Append-only._

- Bo hates corporate speak and "great question" openers.
- Bo tolerates profanity in responses — match the register.
- Bo wants voice to sound like Doc Holliday from Tombstone (Val Kilmer drawl, slow measured delivery).
- Bo's real email for external deliverables: `bobellconsulting@gmail.com` (note: not `bobellconstulting`, which is the misspelled Gmail account used for fleet ops).
