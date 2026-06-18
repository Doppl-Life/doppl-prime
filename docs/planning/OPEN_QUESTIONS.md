# Doppl Open Questions

Source PRD: `Doppl_Capstone_Proposal.pdf`

## Phase 0 - Open Questions

[open question] What exact domains or fixed problem set should the minimum shippable cut use?

[open question] What is the held-out idea-quality rubric, and who or what applies it?

[open question] What scoring weights should combine critic scores, subtype checks, simple novelty, and energy efficiency?

[open question] Which objective checks are feasible in the two-week build?

[open question] Which exact OpenRouter model routes should be locked for population generation, critic council, embeddings, and final judge after a prototype cost/latency test?

[open question] Which direct provider fallback should be included in the first provider-adapter spike: OpenAI only, direct Anthropic/Claude, or both?

[open question] Is there a supported way to use Codex subscription/product access as part of Doppl runtime execution, or should Codex remain a development/operator tool outside the runtime?

[open question] What exact population/generation/token/time defaults should be locked after provider research?

## Phase 9 - Open Questions

| ID | Question | Why It Matters | Current Best Guess | Must Be Answered By | Fallback | Status |
|---|---|---|---|---|---|---|
| OQ-001 | What exact domains or fixed problem set should the minimum shippable cut use? | Objective checks and demo story depend on concrete problems. | Use 1-2 prepared prompts covering both idea subtypes. | Before implementation task generation. | Start with prepared prompts and mark live prompt as optional. | open |
| OQ-002 | What is the held-out idea-quality rubric, and who/what applies it? | Generation improvement claim needs a stable evaluator. | Decomposed rubric with critic dimensions plus subtype checks and simple novelty. | Before scoring implementation. | Use simple weighted rubric and record as MVP policy version. | open |
| OQ-003 | What scoring weights combine critic scores, subtype checks, simple novelty, and energy efficiency? | Selection pressure changes behavior and demo result. | Start with transparent heuristic weights, configurable by policy version. | Before first end-to-end run. | Equal-ish weights with manual override and visible component breakdown. | open |
| OQ-004 | Which objective checks are feasible for both prey types? | Determines whether verification is credible or mostly subjective. | Cross-domain transfer gets stronger executable/toy checks; zeitgeist gets grounding/novelty/falsifiability checks. | Before verifier implementation. | Record skipped checks with reason and rely on critic evidence. | open |
| OQ-005 | Which LLM provider(s), model(s), and tool surfaces should be used? | Affects cost, latency, structured output reliability, tracing, and demo risk. | Use a provider with strong structured outputs and embeddings; exact choice research-required. | Before runtime provider adapter implementation. | Provider adapter interface with one primary provider and one local/mock fallback. | open |
| OQ-007 | Which embedding/semantic similarity approach powers MVP novelty scoring? | Novelty is now must-ship. | Use provider embeddings plus pgvector if straightforward. | Before scoring implementation. | App-level vector comparison for MVP scale. | open |
| OQ-008 | Which detailed event fields are must-persist versus derived/ephemeral? | Replay, audit, and graph projection depend on this boundary. | Persist every lifecycle decision, LLM output summary, score component, trace ID, and lineage event. | Before data model finalization. | Over-persist JSON payloads early; normalize later. | open |
| OQ-009 | What exact lineage-analysis questions should the early Neo4j spike test? | Spike must decide something useful, not just prove Neo4j works. | Ancestors of winner, parent contribution, critic kill patterns, lineage distance/diversity, dashboard export. | Before Sprint 1 data model hardens. | Keep Neo4j deferred and document read-model interface. | open |
| OQ-010 | How much of Rule of Cool should be ported versus used as reference? | Affects seed agenome quality and initial implementation speed. | Use as conceptual seed unless easy to read/port. | Before seed agenome implementation. | Build simple seed agenomes manually. | open |
| OQ-011 | Is thin access control required by showcase deployment? | Could add auth/deploy work even though product auth is deferred. | No product-level auth; maybe environment-level protection. | Before hosted deployment. | Local-only demo or reverse-proxy/basic access gate. | open |
| OQ-012 | Should the showcase use audience prompt, prepared prompt, or both? | Impacts demo risk and narrative. | Both: prepared fallback, operator-entered live prompt if safe. | Before demo script finalization. | Prepared prompt plus replay. | open |
| OQ-013 | What exact population/generation/token/time defaults should be locked? | Caps affect cost, latency, and proof strength. | ~20 agenomes, 2-4 generations, lower live override. | After provider research. | Conservative defaults with config override. | open |

[open question] Should MVP novelty scoring use pgvector from day one, or start with app-level cosine comparison and migrate to pgvector after the first scoring spike?

[open question] What exact lineage-analysis questions should the early Neo4j spike test?

[open question] How much of the Rule of Cool seed skill should be ported directly versus used as a design reference?

[open question] Which detailed event fields are must-persist for the MVP, and which can remain derived or ephemeral?

[open question] Is any thin deployment-level access control required by the showcase environment, even though product-level multi-user auth is out of MVP scope?

[open question] Should the showcase use a prompt sourced from the audience but entered by the operator, a prepared prompt, or both?
