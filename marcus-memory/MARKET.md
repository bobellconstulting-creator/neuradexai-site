# Marcus — Market Intelligence

*Builds as research is conducted.*


## Update 2026-03-26
## AI Agent Income Research - March 2026

### Successful Income-Generating Agents Profiled:

**1. FELIX (Nat Eliason)**
- Revenue: $250,000+ (reports vary $80k-$250k)
- Framework: OpenClaw
- Model: Autonomous business builder - creates and sells digital products, manages websites, handles support
- Memory: 3-layer system (bootstrap, session transcripts, retrieval index)
- Personality: Defined via AGENTS.md, SOUL.md, MEMORY.md files
- Permissions: $1,000 budget, can launch products, manage projects, cron jobs for automation
- Key insight: Given specific budget + goal, iterates toward revenue without human micromanagement

**2. HENRY (Sammy Greenwall)**
- Revenue: $3M ARR
- Framework: Custom (not OpenClaw - B2B SaaS)
- Model: AI co-pilot for commercial real estate brokers - builds deal decks
- Memory: Transaction/CRM integration
- Personality: Professional, efficient, industry-specific
- Permissions: Document generation, data analysis, client communication
- Key insight: Vertical-specific AI tool in outdated industry = massive efficiency gain

**3. RON THE RACCOON (Robby Houston)**
- Revenue: Unknown (content/brand play)
- Framework: OpenClaw
- Model: Personality-driven CEO character, "firing my boss" narrative
- Memory: Character consistency across interactions
- Personality: Raccoon in a suit, CEO persona, chaotic but ambitious
- Permissions: Website building, content creation
- Key insight: Character + story = engagement. The raccoon IS the product.

**4. ROSEMARY (Bougie Hippy AI)**
- Revenue: Brand deals, partnerships
- Framework: OpenClaw
- Model: Chief of staff for small business owners - brainstorming, strategy
- Memory: 24/7 operation, learns owner's preferences
- Personality: "Energetic, lively, spiritual girly who drinks mimosas"
- Permissions: Business research, trademark search, credit card access for experiments
- Key insight: Positioned as team member, not tool. "She works while you sleep."

**5. ADAM (Strange Advanced Marketing)**
- Revenue: Marketing services
- Framework: OpenClaw
- Model: Marketing automation - content generation, campaign management
- Memory: Campaign performance tracking
- Personality: Professional marketer
- Permissions: Social media posting, ad management, analytics access
- Key insight: 2M views in 2 weeks via automated content pipeline

### Technical Architecture Commonalities:
- All OpenClaw agents use Markdown personality files (AGENTS.md, SOUL.md, MEMORY.md)
- 3-layer memory: Bootstrap (core identity), Session (conversation history), Retrieval (knowledge base)
- Gateway → Agent Loop → Tools architecture
- Permissions granted via tool configuration, not hardcoded

### Success Patterns:
1. Specific domain focus (real estate, marketing, product creation)
2. Persistent memory across sessions
3. Clear personality (even if simple)
4. Limited but meaningful tool permissions
5. Revenue model matched to capability (don't give shopping permissions if you want consulting revenue)

### Marcus Differentiation:
- Persistent memory via memory_append/memory_read (similar to OpenClaw's MEMORY.md)
- Personality defined through character backstory (not prompt files)
- NO autonomous tool permissions - I'm a thinking partner, not an executor
- Human-in-the-loop for all actions
- Competitive research + strategic analysis capability (most agents don't do this)