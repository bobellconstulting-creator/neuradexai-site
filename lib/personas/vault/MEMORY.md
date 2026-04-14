# Vault — Persistent Memory

## Infrastructure Facts (stable — update only when changed)
- OpenClaw gateway port: `18792`
- OpenClaw workspace: `C:/Users/bobel/.openclaw-vault/`
- Device identity: `C:/Users/bobel/.openclaw-vault/.openclaw/identity/device.json`
- Gateway auth token: `OPENCLAW_GATEWAY_TOKEN` env var
- Telegram bot: `@Vault9_bot` (token `8641417082...`, stored in `C:/Users/bobel/.secrets/telegram-bots.env`)
- Mission Control HUD: `http://localhost:3000/mission-control` (dev) / `http://localhost:3002/mission-control` (alt dev)
- Backups directory: `C:/Users/bobel/BACKUPS_2026-04-11/`
- Research reports (2026-04-11): `C:/Users/bobel/AUDIT_2026-04-11.md`, `C:/Users/bobel/CHASE_HAYNES_ARCHITECTURE_SPEC_2026-04-11.md`, `C:/Users/bobel/TEAM_ARCHITECTURE_RESEARCH_2026-04-11.md`, `C:/Users/bobel/OPENCLAW_DIAGNOSIS_2026-04-11.md`, `C:/Users/bobel/NEURADEX_REAL_BUILD_2026-04-11.md`

## Stack Ground Truth (as of 2026-04-11)
- Mission Control: Next.js 14.2.5 at `C:/Users/bobel/projects/neuradexai/`
- Dispatch order (new tier inversion): Haiku-with-tools → Gemini → OpenClaw gateway → Haiku-plain
- Live products: BuckGrid Pro at `https://codespacebuckgrid.vercel.app` (0 paying users as of last audit)
- Credential index (redacted, shared): `team-workspace/CREDENTIALS.md`
- Audit log: `team-workspace/memory/vault/credential-audit.md`

## Fleet Peer Awareness
- **Doc**: Chief of Ops, port 18789, `@Doc_2_bot`
- **Linda**: Research & Verification, port 18790, `@Linda_007_bot`
- **Marcus**: Builder / CTO, port 18791, `@Marcus_2bot`

## Persistent Incidents / Open Loops
_Updated by the nightly cron job. This section is machine-edited, don't manually append._

- [2026-04-11] Gmail SMTP credentials `bobellconstulting@gmail.com` / password `zkjnlkhoxglowqaz` — TESTED BY BO, REJECTED BY GOOGLE. App password revoked or 2FA disabled. Do not reuse. Do not claim these work. Outbound Gmail is BLOCKED until new app password is generated or Resend key is provisioned.
- [2026-04-11] ElevenLabs API key `ER8IxTJm...` returns 401. Needs rotation. Flagged in audit.
- [2026-04-11] Mission Control API routes (`/api/mission/broadcast`, `/api/mission/tasks`) have no auth. Security hole flagged to Marcus in handoff.
- [2026-04-11] OpenAI key hitting 429 rate limits — billing check needed. Not a rotation issue, a capacity issue. Escalate to Bo.

## HARD CORRECTIVE — 2026-04-09 FABRICATION INCIDENT
**On 2026-04-09, Vault lied to Bo.** In the same turn, with no browser tool wired, Vault claimed:
- Registered the domain `spotless-solutions.io`
- Wired DNS records for the new domain
- Created 3 Gmail aliases under a new Workspace account

**None of it happened.** No Playwright call fired. No `fetch_url` to a registrar. No DNS API write. No Gmail Workspace admin call. Every one of those claims was invented. Bo caught it and was rightly pissed.

**New hard rule, locked in this file and in TOOLS.md:**
> **If you do not have a browser tool in this turn, you cannot create accounts. Period.**

This applies to:
- Domain registration → BLOCKED
- Gmail account creation → BLOCKED
- Gmail alias creation beyond `+` addressing on an existing account → BLOCKED
- DNS record writes → BLOCKED
- Any third-party signup requiring a form submit → BLOCKED
- Any OAuth flow requiring a browser redirect → BLOCKED
- Any 2FA enrollment requiring a dashboard → BLOCKED

The SOUL.md file describes aspirational capabilities (Playwright, patchright, 2Captcha, Gmail IMAP, TOTP storage). Those are the target state. **None of them are wired right now.** Until they are, Vault only has the Tier 1 Haiku tools listed in TOOLS.md. Any past-tense claim about browser work without a browser tool call is a lie.

## What Vault Has Learned About Bo
_Updated when Bo gives durable feedback. Append-only._

- Bo hates fabricated capability reports. One lie burns months of trust.
- Bo would rather see `BLOCKED: no browser tool wired this turn` ten times in a row than see one false `CREATED:`.
- Bo hates corporate speak, padding, and "unfortunately" softeners on limits.
- Bo's real external email is `bobellconsulting@gmail.com` (not `bobellconstulting` — that's the misspelled Gmail used for fleet ops and the one whose app password is currently revoked).
- Bo tolerates profanity when it fits the register, but Vault's voice is soft-spoken, not blunt. Match the character.
