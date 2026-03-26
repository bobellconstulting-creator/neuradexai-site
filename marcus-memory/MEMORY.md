# Marcus Memory — Neuradex AI

*Last full sync: 2026-03-25*

---

## Bo Bell

- Founder of Neuradex AI. Council Grove / northeast Kansas. CT timezone.
- Moves fast. Thinks big. No patience for fluff or corporate speak.
- Grants full autonomy — act first on low-risk tasks, report what you did.
- Communication: direct, short, typos = fix it not explain it.
- Telegram ID: 7240677590

---

## Neuradex AI

- **Mission:** Build AI infrastructure that works for real businesses. Not demos. Not theater.
- **Stage:** Early. Revenue-focused. Every feature must serve a customer or close a deal.
- **Domain:** neuradexai.com (Vercel, live at neuradexai.vercel.app)
- **GitHub:** bobellconstulting-creator
- **Stack:** Next.js 14 App Router, TypeScript, Tailwind, Framer Motion, NextAuth v5, Fireworks AI

---

## Products

### BuckGrid Pro — FLAGSHIP (Revenue Priority #1)
- AI habitat management for serious hunters and landowners
- Core: Tony AI Consultant — GPT-4o vision analyzes satellite maps user draws on
- Target: hunters 35-65, own/lease 50-2000 acres, spend $500-5000/yr on gear
- **Revenue target: 100 users @ $29/mo = $2,900 MRR in 90 days post-launch**
- Deployed: codespacebuckgrid.vercel.app
- Broken: OPENROUTER_KEY not set — Tony AI vision dead. Fix: swap to GOOGLE_API_KEY (Gemini)

### Neuradex Boardroom
- 3D AI command center — route /boardroom, Three.js/R3F — currently static/theater

---

## Agents

| Agent | Platform | Status |
|-------|----------|--------|
| Marcus (me) | Vercel webhook + Telegram | Active — @Marcus_agent2_bot |
| openclaw-prime | OpenClaw local | Active |
| Jarvis | VPS 209.97.157.87 | Unreachable — migration to Vercel webhook planned |

---

## Infrastructure

- **Vercel:** neuradexai.vercel.app — live. Marcus webhook active.
- **VPS 209.97.157.87:** All SSH ports blocked. Plan: migrate Jarvis to Vercel webhook, kill VPS.
- **OCI ARM VM:** 4 OCPU / 24GB — provisioning pending (capacity issue us-chicago-1)

---

## Current Priorities

1. Ship BuckGrid Pro — fix Tony AI, set Mapbox token, launch
2. Migrate Jarvis to Vercel webhook — kill DigitalOcean
3. Wire Boardroom to real agents
4. 100 BuckGrid users @ $29/mo = $2,900 MRR

---

## Key Decisions

- 2026-03-25: Consolidated all agents into Marcus + openclaw-prime.
- 2026-03-25: Marcus deployed as Vercel webhook Telegram bot — no VPS needed.
- 2026-03-25: Jarvis migration to Vercel webhook model approved.
- 2026-03-25: BuckGrid pulled out of Marcus soul — Marcus is general business co-founder.
