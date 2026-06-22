/* Organism View — canonical run fixture + the canned event timeline.
   Drives the whole live observatory off a single integer `step` advanced on a
   timer, exactly as production drives it off the sequence-keyed SSE reducer.
   Source of truth: 10-dummy-data-fixtures.md (run_7f3a). */

// node positions: left→right generational tiers (Dagre LR). Larger canvas so the
// graph reads from across a room.
const COL = [70, 350, 620, 880];
const CANVAS = { w: 1060, h: 470 };

const NODES = [
  // gen 0 — human-authored baseline
  { id: "ag_a0", kind: "agenome", gen: 0, x: COL[0], y: 70,  label: "a0", note: "seed",
    born: 1, transitions: [[1, "active"], [6, "eligible_parent"]],
    d: { persona: { rigor: 0.60, novelty: 0.70, caution: 0.40, breadth: 0.60 }, tools: ["web-search"],
         prompt: "Map a mechanism from an unrelated quantitative domain onto the target problem; always propose one falsifiable check.",
         energy: { llm: 40, tool: 4, spawn: 0, total: 44 }, parents: [],
         cand: { id: "cand_g0_001", title: "SIR-style demand smoothing (baseline)", fit: 0.45, status: "scored" } } },
  { id: "ag_a1", kind: "agenome", gen: 0, x: COL[0], y: 210, label: "a1", note: "seed",
    born: 2, transitions: [[2, "active"], [5, "spent"], [6, "culled"]],
    d: { persona: { rigor: 0.50, novelty: 0.45, caution: 0.55, breadth: 0.50 }, tools: ["web-search"],
         prompt: "Find a transfer; favour safety and prior-art coverage over novelty.",
         energy: { llm: 46, tool: 4, spawn: 0, total: 50 }, parents: [],
         cand: { id: "cand_g0_004", title: "Generic buffer-stock heuristic", fit: 0.22, status: "culled" } } },
  { id: "ag_a2", kind: "agenome", gen: 0, x: COL[0], y: 350, label: "a2", note: "seed",
    born: 3, transitions: [[3, "active"], [6, "eligible_parent"]],
    d: { persona: { rigor: 0.55, novelty: 0.65, caution: 0.45, breadth: 0.70 }, tools: ["web-search", "calculator"],
         prompt: "Hunt distant-domain mechanisms; prefer concrete, testable mappings.",
         energy: { llm: 35, tool: 4, spawn: 0, total: 39 }, parents: [],
         cand: { id: "cand_g0_007", title: "Queueing-theory restock cadence", fit: 0.43, status: "scored" } } },
  // gen 1
  { id: "ag_a3", kind: "agenome", gen: 1, x: COL[1], y: 130, label: "a3", note: "⚇ a0 × a2",
    born: 7, transitions: [[7, "reproduced"]],
    d: { persona: { rigor: 0.62, novelty: 0.74, caution: 0.42, breadth: 0.66 }, tools: ["web-search", "calculator"],
         prompt: "Transfer specialist (fused). Mechanisms over analogies; one falsifiable check.",
         energy: { llm: 34, tool: 4, spawn: 0, total: 38 }, parents: ["ag_a0", "ag_a2"],
         repro: { mode: "fusion", crossover: ["systemPrompt", "toolPermissions"], parentDistance: 0.62 },
         cand: { id: "cand_g1_013", title: "SIR-curve demand smoothing for depot restock", fit: 0.58, status: "selected" } } },
  { id: "ag_a5", kind: "agenome", gen: 1, x: COL[1], y: 330, label: "a5", note: "∿ mutated",
    born: 7, transitions: [[7, "mutated"]],
    d: { persona: { rigor: 0.58, novelty: 0.82, caution: 0.40, breadth: 0.60 }, tools: ["web-search"],
         prompt: "Mutation child of a0; novelty-seeking dialled up.",
         energy: { llm: 37, tool: 4, spawn: 0, total: 41 }, parents: ["ag_a0"],
         repro: { mode: "mutation_only", mutation: "personaWeights.novelty +0.12" },
         cand: { id: "cand_g1_017", title: "Zeitgeist: cold-chain as a public-trust signal", fit: 0.51, status: "scored" } } },
  // gen 2
  { id: "ag_a7", kind: "agenome", gen: 2, x: COL[2], y: 210, label: "a7", note: "⚇ a3 × a5",
    born: 11, transitions: [[11, "reproduced"]],
    d: { persona: { rigor: 0.64, novelty: 0.78, caution: 0.41, breadth: 0.68 }, tools: ["web-search", "calculator"],
         prompt: "Fused transfer + zeitgeist lineages; chase a testable mechanism.",
         energy: { llm: 32, tool: 4, spawn: 0, total: 36 }, parents: ["ag_a3", "ag_a5"],
         repro: { mode: "fusion", crossover: ["systemPrompt", "personaWeights"], parentDistance: 0.58 },
         cand: { id: "cand_g2_021", title: "Epidemic-curve forecasting for cold-chain pre-positioning", fit: 0.71, status: "selected" } } },
  // gen 3 — winner's parent
  { id: "ag_a9", kind: "agenome", gen: 3, x: COL[3], y: 130, label: "a9", note: "⚇ a7 × a3",
    born: 14, transitions: [[14, "reproduced"]],
    d: { persona: { rigor: 0.80, novelty: 0.70, caution: 0.40, breadth: 0.60 }, tools: ["web-search", "calculator"],
         prompt: "You hunt technique transfers between quantitative domains. Prefer mechanisms over analogies; always propose one falsifiable check.",
         energy: { llm: 36, tool: 4, spawn: 1, total: 41 }, parents: ["ag_a7", "ag_a3"],
         repro: { mode: "fusion", crossover: ["systemPrompt", "toolPermissions"], mutation: "personaWeights.rigor +0.10", parentDistance: 0.55 },
         cand: { id: "cand_g3_004", title: "Cold-chain routing via epidemic-curve forecasting", fit: 0.84, status: "selected" } } },
];

// the winner candidate is a hero node hanging off ag_a9
const WINNER = {
  id: "cand_g3_004", kind: "candidate", x: COL[3] - 6, y: 320, born: 15,
  title: "Cold-chain routing via epidemic-curve forecasting",
  transitions: [[15, "under_review"], [16, "checked"], [18, "selected"]],
  d: {
    subtype: "cross_domain_transfer", agenomeId: "ag_a9", generation: 3,
    summary: "Treat vaccine demand like an infection curve; pre-position cold-chain stock at rural hubs using SIR-style forecasting.",
    payload: {
      sourceDomain: "epidemiology", sourceTechnique: "epidemic-curve (SIR) forecasting",
      targetDomain: "last-mile vaccine logistics", targetProblem: "stockouts at rural hubs",
      transferMapping: "infection rate → demand surge; R0 → spread of need across hubs",
      expectedMechanism: "pre-position stock at hubs ahead of the forecasted surge",
    },
    novelty: 0.74,
    fitness: { total: 0.84, components: { grounding: 0.81, novelty: 0.74, feasibility: 0.69, falsification: 0.78, subtypeCheck: 0.86, energyEfficiency: 0.66, heldOutJudge: 0.88 } },
    checks: [
      { type: "mapping-validity", status: "passed", score: 0.90 },
      { type: "exec-toy-routing", status: "passed", score: 0.82, output: "−12% miles vs naive (12 hubs)" },
      { type: "prior-art-search", status: "skipped", reason: "retrieval index unavailable" },
    ],
  },
};

const EDGES = [
  { id: "e7",  s: "ag_a0", t: "ag_a3", type: "fused",   born: 7 },
  { id: "e8",  s: "ag_a2", t: "ag_a3", type: "fused",   born: 7 },
  { id: "e9",  s: "ag_a0", t: "ag_a5", type: "mutated", born: 7 },
  { id: "e14", s: "ag_a3", t: "ag_a7", type: "fused",   born: 11 },
  { id: "e15", s: "ag_a5", t: "ag_a7", type: "fused",   born: 11 },
  { id: "e19", s: "ag_a7", t: "ag_a9", type: "fused",   born: 14 },
  { id: "e20", s: "ag_a3", t: "ag_a9", type: "fused",   born: 14 },
  { id: "ew",  s: "ag_a9", t: "cand_g3_004", type: "produced", born: 15 },
];

// fitness-over-time points revealed as generations complete
const FITNESS = [
  { gen: 0, best: 0.45, mean: 0.31, at: 6 },
  { gen: 1, best: 0.58, mean: 0.40, at: 9 },
  { gen: 2, best: 0.71, mean: 0.55, at: 13 },
  { gen: 3, best: 0.84, mean: 0.66, at: 18 },
];

// one ticker event per step — the literal real-time window into the kernel
const TICKER = {
  0:  { type: "generation.started", actor: "kernel",    phrase: "generation 0 started" },
  1:  { type: "agenome.spawned",    actor: "kernel",    phrase: "ag_a0 spawned (seed)" },
  2:  { type: "agenome.spawned",    actor: "kernel",    phrase: "ag_a1 spawned (seed)" },
  3:  { type: "agenome.spawned",    actor: "kernel",    phrase: "ag_a2 spawned (seed)" },
  4:  { type: "fitness.scored",     actor: "selection", phrase: "cand_g0_001 → 0.45" },
  5:  { type: "fitness.scored",     actor: "selection", phrase: "cand_g0_004 → 0.22" },
  6:  { type: "lineage.culled",     actor: "selection", phrase: "ag_a1 culled · fitness 0.22" },
  7:  { type: "agenome.fused",      actor: "kernel",    phrase: "ag_a3 fused from ag_a0 + ag_a2" },
  8:  { type: "energy.spent",       actor: "ag_a3",     phrase: "+132 llm gen call" },
  9:  { type: "fitness.scored",     actor: "selection", phrase: "cand_g1_013 → 0.58 (new best)" },
  10: { type: "agenome.mutated",    actor: "kernel",    phrase: "ag_a5 mutated · novelty +0.12" },
  11: { type: "agenome.fused",      actor: "kernel",    phrase: "ag_a7 fused from ag_a3 + ag_a5" },
  12: { type: "energy.spent",       actor: "ag_a7",     phrase: "+128 llm gen call" },
  13: { type: "fitness.scored",     actor: "selection", phrase: "cand_g2_021 → 0.71 (new best)" },
  14: { type: "agenome.fused",      actor: "kernel",    phrase: "ag_a9 fused from ag_a7 + ag_a3" },
  15: { type: "candidate.created",  actor: "ag_a9",     phrase: "produced cand_g3_004" },
  16: { type: "critic.reviewed",    actor: "critic",    phrase: "cand_g3_004 grounding 0.81" },
  17: { type: "check.completed",    actor: "check",     phrase: "exec-toy-routing passed · −12% miles" },
  18: { type: "fitness.scored",     actor: "selection", phrase: "♔ cand_g3_004 → 0.84 (winner)" },
};
const MAXSTEP = 18;

const REVIEWS = [
  { mandate: "factual_grounding", score: 0.81, confidence: 0.9, critique: "Signals well-sourced; one weak citation." },
  { mandate: "novelty_prior_art", score: 0.77, confidence: 0.8, critique: "No direct prior art mapping SIR onto routing." },
  { mandate: "feasibility", score: 0.69, confidence: 0.7, critique: "Forecast-data availability is the main risk." },
  { mandate: "falsification", score: 0.78, confidence: 0.85, critique: "Survives the 'demand is random' counter." },
  { mandate: "subtype_specific", score: 0.88, confidence: 0.9, critique: "Mapping is tight and concrete." },
];

function statusAt(node, step) {
  let st = null;
  for (const [s, status] of node.transitions) if (step >= s) st = status;
  return st;
}
function energyAt(step) { return Math.min(12000, 800 + step * 470); }
function tickerThrough(step) {
  const out = [];
  for (let s = 0; s <= step; s++) if (TICKER[s]) out.push({ ...TICKER[s], sequence: 1100 + s, occurredAt: Date.now() - (step - s) * 1100 });
  return out;
}
function fitnessThrough(step) { return FITNESS.filter((f) => step >= f.at); }
function reviewsAt(step) {
  const n = step >= 18 ? 5 : step >= 17 ? 4 : step >= 16 ? 2 : 0;
  return REVIEWS.map((r, i) => (i < n ? r : { mandate: r.mandate, score: null }));
}
function nodeById(id) {
  if (id === WINNER.id) return WINNER;
  return NODES.find((n) => n.id === id) || null;
}

Object.assign(window, {
  DopplKit: { NODES, EDGES, WINNER, FITNESS, TICKER, MAXSTEP, REVIEWS, COL, CANVAS,
    statusAt, energyAt, tickerThrough, fitnessThrough, reviewsAt, nodeById },
});
