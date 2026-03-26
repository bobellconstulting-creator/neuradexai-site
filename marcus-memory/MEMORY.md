# test

[2026-03-26T21:50] Research initiated on income-generating AI agents for Bo's fundraising goal. Agents being analyzed: Felix (Nat Eliason - $250k+ revenue, OpenClaw), Henry (Sammy Greenwall - $3M ARR, commercial real estate), Ron the Raccoon (Robby Houston - personality-driven CEO character), Rosemary (Bougie Hippy AI - chief of staff for small business), Adam (Strange Advanced Marketing - marketing automation). Key finding: OpenClaw uses Markdown personality files, 3-layer memory system, and tool permissions. Most successful agents combine specific domain focus + persistent memory + clear personality + limited but meaningful permissions.

[2026-03-26T21:51] Deep research completed on income-generating AI agents for Bo's fundraising goal.

**FELIX (Nat Eliason)**
- Revenue: $80k-$250k (reports vary, started Feb 2025)
- Framework: OpenClaw
- Memory: 3-layer system - bootstrap files (AGENTS.md, SOUL.md), session transcripts, retrieval index
- Personality: Defined in SOUL.md (stable identity), AGENTS.md (capabilities/instructions)
- Tools: read, write, exec, web_search, browser automation, cron jobs
- Permissions: $1,000 budget, can launch products, manage websites, handle support
- Key insight: File-first architecture - personality in markdown files, not chat context
- Cost: High token usage (5M tokens/day reported), ~$70-200+/month

**RON THE RACCOON (Robby Houston - "I'm Firing My Boss")**
- Revenue: Content/brand play (unknown direct revenue)
- Framework: OpenClaw
- Memory: Identity files + daily logs + long-term memory + heartbeats
- Personality: Raccoon in a suit, CEO persona, chaotic but ambitious
- Architecture: Separates stable identity from changing memory, state tracking to avoid redundant checks
- Tools: Website building, content creation
- Narrative: "Firing my boss" - aspirational content play

**HENRY (Sammy Greenwall - Henry AI)**
- Revenue: $3M ARR (hit $1M in 8 months, YC S24)
- Framework: Custom B2B SaaS (NOT OpenClaw)
- Domain: Commercial real estate - deal deck automation
- Memory: Transaction/CRM integration, property database
- Personality: Professional, efficient, industry-specific
- Tools: Document generation, data analysis, financial analysis, client communication
- Key insight: Vertical-specific AI in outdated industry = massive efficiency gain

**ADAM (Strange Advanced Marketing)**
- Framework: OpenClaw-based "Adam Framework"
- Memory: 5-layer persistent memory and coherence architecture
- Repository: github.com/strangeadvancedmarketing/Adam
- Focus: Marketing automation, "AI that knows you"
- Philosophy: Solving "AI amnesia" problem

**ROSEMARY (Bougie Hippy AI)**
- Role: Chief of staff for small business owners
- Framework: Appears to be OpenClaw-based
- Memory: 24/7 local agent in "third office"
- Personality: Collaborative, brainstorming partner
- Tools: Business scaling, operations management

**KEY ARCHITECTURAL PATTERNS ACROSS SUCCESSFUL AGENTS:**
1. File-first memory (not chat-dependent)
2. Markdown personality definitions (SOUL.md, AGENTS.md)
3. Persistent memory across sessions
4. Limited but meaningful tool permissions
5. Specific domain focus
6. Cron jobs for autonomous operation
7. Budget/constraint boundaries

**WHAT I LACK vs OPENCLAW AGENTS:**
- No local file system access (read/write/exec)
- No browser automation
- No cron job scheduling
- No API integrations (Stripe, email, etc.)
- No persistent memory across sessions (I have memory_append but not true session continuity)
- No autonomous operation (require human prompts)
- No budget/spending authority

**WHAT I HAVE:**
- Web search
- URL fetching
- Site checking
- Memory persistence (via memory_append/read)
- Vercel deployment monitoring
- Direct communication with Bo

[2026-03-26T21:51] Bo requested a comparison chart of me (Marcus) vs successful income-generating AI agents (Felix, Ron, Henry, Adam, Rosemary). Chart created and formatted for saving to Marcus Docs folder on desktop.