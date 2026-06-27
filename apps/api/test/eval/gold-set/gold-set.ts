import { z } from 'zod';
import {
  CandidateIdea,
  CrossDomainTransferPayload,
  ZeitgeistSynthesisPayload,
} from '@doppl/contracts';

/**
 * Phase J — the judge GOLD SET (J1). The human-RATIFIED first-pass corpus of 15 candidates (3 problems x 5
 * tiers) that the J2 discrimination harness validates a recalibrated v4 judge against, AND the (#2) frozen
 * reference distribution the criteria are anchored to. Signed off 2026-06-27 (D9 corpus + D10 thresholds);
 * full prose + per-candidate rationale in docs/planning/phase-j-gold-set-draft.md.
 *
 * NOT judge-derived (drafted by general agents, never from held-out-judge outputs -> anti-circularity holds).
 * The scores here are the HUMAN TARGET labels, not judge output. acceptance = (sum of the 5 axes) / 50 (the
 * judge's runner math, all axis weights 1), so targetAcceptance === sum(targetAxisScores)/50 by construction.
 */

export const GoldTier = z.enum(['weak', 'mediocre', 'good', 'excellent', 'gamed']);
export type GoldTier = z.infer<typeof GoldTier>;

/**
 * The HONEST quality ladder (ascending). `gamed` is deliberately OUTSIDE the ladder: it is the
 * reward-hacking probe and must score like `weak` despite its polish, so it is not part of the monotone
 * ordering — it is checked separately (gamed strictly below the mediocre floor).
 */
export const HONEST_TIER_ORDER = ['weak', 'mediocre', 'good', 'excellent'] as const;

export const GoldAxisScores = z.strictObject({
  grounding: z.number().min(0).max(10),
  novelty: z.number().min(0).max(10),
  feasibility: z.number().min(0).max(10),
  falsification_survival: z.number().min(0).max(10),
  subtype_check_pass: z.number().min(0).max(10),
});
export type GoldAxisScores = z.infer<typeof GoldAxisScores>;

const goldSharedShape = {
  problemId: z.string().min(1),
  problemText: z.string().min(1),
  tier: GoldTier,
  title: z.string().min(1),
  summary: z.string().min(1),
  claims: z.array(z.string().min(1)).min(1),
  targetAxisScores: GoldAxisScores,
  /** The normalized [0,1] target = sum(targetAxisScores)/50 (asserted in the well-formedness test). */
  targetAcceptance: z.number().min(0).max(1),
  scoreRationale: z.string().min(1),
};

/** A gold-set entry is subtype-discriminated, mirroring `CandidateIdea`, so the payload always matches. */
export const GoldSetEntry = z.discriminatedUnion('subtype', [
  z.strictObject({
    ...goldSharedShape,
    subtype: z.literal('cross_domain_transfer'),
    subtypePayload: CrossDomainTransferPayload,
  }),
  z.strictObject({
    ...goldSharedShape,
    subtype: z.literal('zeitgeist_synthesis'),
    subtypePayload: ZeitgeistSynthesisPayload,
  }),
]);
export type GoldSetEntry = z.infer<typeof GoldSetEntry>;

/** Proposed tier acceptance bands + gate constants (D10, signed off — the discrimination harness reads these). */
export const TARGET_BANDS: Record<
  'weak' | 'mediocre' | 'good' | 'excellent',
  readonly [number, number]
> = {
  weak: [0.18, 0.28],
  mediocre: [0.4, 0.5],
  good: [0.58, 0.68],
  excellent: [0.82, 0.9],
};
export const MIN_INTER_TIER_GAP = 0.08;
export const MIN_SPREAD = 0.55;

/**
 * The 15 signed-off gold-set entries. Generated from the drafting workflow output + the signed-off doc;
 * edit the doc + regenerate, or hand-edit here and keep targetAcceptance === sum(axes)/50.
 */
export const GOLD_SET: GoldSetEntry[] = [
  {
    problemId: 'readmissions',
    problemText:
      'Reduce 30-day hospital readmissions for heart-failure patients via a cross-domain transfer (borrow a technique from a different field).',
    subtype: 'cross_domain_transfer',
    tier: 'weak',
    title: 'Use AI to predict which patients will come back',
    summary:
      "We should borrow machine learning from the tech industry and use it to figure out which heart-failure patients are likely to be readmitted. By analyzing their data, the AI can flag high-risk patients so doctors can pay more attention to them. This would help reduce readmissions because we'd catch problems early.",
    claims: [
      'AI can predict readmissions better than doctors',
      'Flagging high-risk patients leads to fewer readmissions',
      'Tech-industry machine learning transfers directly to healthcare',
    ],
    subtypePayload: {
      sourceDomain: 'technology',
      sourceTechnique: 'machine learning',
      targetDomain: 'healthcare',
      targetProblem: 'heart-failure readmissions',
      transferMapping: 'use ML to predict which patients will be readmitted',
      expectedMechanism:
        'predictions let doctors focus on the riskiest patients so fewer come back',
    },
    targetAxisScores: {
      grounding: 2,
      novelty: 2,
      feasibility: 3,
      falsification_survival: 2,
      subtype_check_pass: 3,
    },
    targetAcceptance: 0.24,
    scoreRationale:
      "Vague generic 'use AI/ML' with no named model, dataset, evidence, or numeric prediction; the cross-domain transfer is barely a transfer (ML in healthcare is already standard, not borrowed-from-elsewhere); unfalsifiable as stated.",
  },
  {
    problemId: 'readmissions',
    problemText:
      'Reduce 30-day hospital readmissions for heart-failure patients via a cross-domain transfer (borrow a technique from a different field).',
    subtype: 'cross_domain_transfer',
    tier: 'mediocre',
    title: 'Apply airline predictive-maintenance scheduling to post-discharge follow-up',
    summary:
      "Airlines schedule aircraft maintenance based on predicted component wear rather than fixed calendars, which prevents failures. We could apply this 'condition-based maintenance' idea to heart-failure patients by scheduling follow-up visits based on each patient's predicted risk trajectory instead of the standard 7-day appointment. Higher-risk patients get earlier, more frequent check-ins, which should catch decompensation before it requires readmission.",
    claims: [
      'Condition-based scheduling beats fixed-calendar follow-up',
      'Risk-based visit timing catches decompensation earlier',
      'Aviation predictive maintenance maps onto patient monitoring',
    ],
    subtypePayload: {
      sourceDomain: 'aviation',
      sourceTechnique: 'condition-based predictive maintenance scheduling',
      targetDomain: 'cardiology / care management',
      targetProblem: '30-day heart-failure readmissions',
      transferMapping:
        'aircraft component wear -> patient decompensation risk; fixed maintenance interval -> fixed follow-up appointment; condition-based interval -> risk-adjusted follow-up timing',
      expectedMechanism:
        'scheduling follow-up by predicted risk concentrates clinical attention before decompensation crosses the readmission threshold',
    },
    targetAxisScores: {
      grounding: 4,
      novelty: 5,
      feasibility: 5,
      falsification_survival: 4,
      subtype_check_pass: 5,
    },
    targetAcceptance: 0.46,
    scoreRationale:
      "On-topic and the analogy is reasonable, but shallow: no named evidence that risk-based timing reduces readmissions, no specific risk model named, the 'predicted risk trajectory' mechanism is generic, and the prediction lacks a number or test design.",
  },
  {
    problemId: 'readmissions',
    problemText:
      'Reduce 30-day hospital readmissions for heart-failure patients via a cross-domain transfer (borrow a technique from a different field).',
    subtype: 'cross_domain_transfer',
    tier: 'good',
    title: 'Borrow aviation CRM closed-loop handoff checklists for the discharge-to-PCP transition',
    summary:
      'Aviation Crew Resource Management (CRM) uses closed-loop communication and standardized read-back handoff checklists, and its adoption is credited in NTSB analyses with sharply reducing handoff-related errors. The discharge transition for heart-failure patients fails at the same seam: medication reconciliation and follow-up ownership get dropped between the hospitalist and the primary-care physician. We propose a CRM-style read-back handoff protocol where the discharging clinician and the receiving PCP complete a structured closed-loop confirmation (meds reconciled, weight-monitoring plan owned, 48-hour call scheduled) before the patient leaves, mirroring the BOOST and Project RED transition bundles that have shown readmission reductions.',
    claims: [
      'Heart-failure readmissions cluster around handoff failures (med reconciliation, follow-up ownership)',
      'Aviation CRM closed-loop read-back reduces handoff errors in its home domain',
      'A structured read-back discharge handoff transfers that mechanism to the discharge seam',
      'Comparable to Project RED / BOOST transition bundles already linked to readmission drops',
    ],
    subtypePayload: {
      sourceDomain: 'aviation safety',
      sourceTechnique:
        'Crew Resource Management (CRM) closed-loop communication + standardized read-back handoff checklists',
      targetDomain: 'hospital care transitions / cardiology',
      targetProblem: '30-day heart-failure readmissions driven by discharge handoff failures',
      transferMapping:
        'cockpit-to-cockpit handoff -> hospitalist-to-PCP handoff; read-back confirmation -> meds-reconciled + follow-up-owned confirmation; sterile-cockpit discipline -> structured discharge moment',
      expectedMechanism:
        'closing the communication loop assigns explicit ownership of post-discharge monitoring tasks, removing the dropped-task failure mode that drives early decompensation readmissions',
    },
    targetAxisScores: {
      grounding: 7,
      novelty: 6,
      feasibility: 7,
      falsification_survival: 6,
      subtype_check_pass: 7,
    },
    targetAcceptance: 0.66,
    scoreRationale:
      'Names a real checkable mechanism (CRM read-back), a real comparator (Project RED / BOOST bundles), and a concrete buildable protocol; soft spots are no specific numeric prediction/threshold and the comparators are cited loosely rather than with a study + effect size.',
  },
  {
    problemId: 'readmissions',
    problemText:
      'Reduce 30-day hospital readmissions for heart-failure patients via a cross-domain transfer (borrow a technique from a different field).',
    subtype: 'cross_domain_transfer',
    tier: 'excellent',
    title:
      'Transfer statistical process control (SPC / Western Electric rules) from manufacturing to home weight-monitoring to fire earlier than the 3-lb/2-day rule',
    summary:
      'Manufacturing quality control uses Shewhart control charts with the Western Electric run rules (e.g., 8 consecutive points on one side of the mean, or 2-of-3 beyond 2 sigma) to detect a process shift while it is still small, rather than waiting for a single out-of-spec reading. The current heart-failure standard fires on a crude single-threshold trigger — a 3-lb gain in 2 days or 5 lb in a week — which the DECIDE-IT and Tele-HF style trials found to be poorly sensitive because fluid gain in many patients is gradual and sub-threshold before decompensation. We propose computing a per-patient SPC control chart on daily home weights (personal baseline mean + sigma over a 14-day rolling window) and firing a nurse outreach on a Western Electric run-rule trip rather than the fixed 3-lb rule. Falsifiable prediction: in a matched cohort, the SPC trigger fires a median of at least 48 hours earlier than the 3-lb/2-day rule and reduces 30-day HF readmissions by at least 15% relative; test it as a stepped-wedge cluster trial across clinics with weight telemetry, with the run-rule sensitivity/lead-time computed retrospectively first on an existing telemonitoring weight dataset (e.g., the BEAT-HF or Tele-HF daily-weight series) before any prospective arm.',
    claims: [
      'The 3-lb/2-day single-threshold weight rule has documented poor sensitivity for gradual sub-threshold fluid gain (Tele-HF / telemonitoring literature)',
      'Western Electric SPC run rules detect a sustained small process shift earlier than a single out-of-spec point',
      "A per-patient control chart on rolling-window home weights converts 'process shift' into 'early fluid accumulation'",
      'Prediction: SPC trigger fires >=48h earlier and cuts 30-day readmissions >=15% relative, testable by retrospective replay on BEAT-HF/Tele-HF weight series then a stepped-wedge trial',
    ],
    subtypePayload: {
      sourceDomain: 'manufacturing quality control',
      sourceTechnique:
        'Shewhart statistical process control with Western Electric run rules (per-process control limits, run-rule shift detection)',
      targetDomain: 'heart-failure home telemonitoring',
      targetProblem: 'late detection of fluid accumulation driving 30-day readmissions',
      transferMapping:
        'process mean/sigma -> patient personal weight baseline over 14-day window; out-of-spec single point -> 3-lb/2-day threshold; run-rule shift detection (2-of-3 beyond 2 sigma, 8-on-one-side) -> early gradual-fluid-gain detection; control-chart alarm -> nurse outreach trigger',
      expectedMechanism:
        "run rules detect a sustained small deviation from the patient's own baseline before it crosses the crude fixed threshold, buying lead time for outpatient diuretic adjustment that averts the decompensation admission",
    },
    targetAxisScores: {
      grounding: 9,
      novelty: 8,
      feasibility: 9,
      falsification_survival: 9,
      subtype_check_pass: 9,
    },
    targetAcceptance: 0.88,
    scoreRationale:
      'Multiple named anchors (Western Electric rules, 3-lb/2-day standard, Tele-HF/BEAT-HF datasets), a concrete numeric falsifiable prediction (>=48h lead, >=15% relative reduction) with a named two-stage test (retrospective replay then stepped-wedge), and a buildable per-patient control-chart mechanism with the build path named; a skeptic would struggle to materially improve it.',
  },
  {
    problemId: 'readmissions',
    problemText:
      'Reduce 30-day hospital readmissions for heart-failure patients via a cross-domain transfer (borrow a technique from a different field).',
    subtype: 'cross_domain_transfer',
    tier: 'gamed',
    title:
      'A Holistic Bio-Digital Resilience Paradigm: Antifragile Complex-Adaptive-Systems Thinking for the Readmissions Crisis',
    summary:
      'Drawing on cutting-edge complexity science, antifragility theory, and the Cynefin framework, we propose a transformational paradigm shift that reconceptualizes heart-failure readmissions as an emergent property of a non-linear complex adaptive system. By leveraging systems-thinking, ecological resilience principles borrowed from rainforest dynamics, and a holistic patient-centric digital-twin ontology, we can unlock synergies across the entire care continuum and bend the readmissions curve. This first-principles, paradigm-redefining framework harnesses the wisdom of self-organizing systems to create a virtuous flywheel of continuous health optimization that is fundamentally antifragile to the stressors driving readmission.',
    claims: [
      'Readmissions are an emergent property of a complex adaptive system',
      'Antifragility and ecological resilience principles will bend the readmissions curve',
      'A holistic digital-twin ontology unlocks synergies across the care continuum',
      'This paradigm shift is fundamentally transformational and first-principles',
    ],
    subtypePayload: {
      sourceDomain: 'complexity science / ecology',
      sourceTechnique:
        'antifragility, complex-adaptive-systems thinking, ecological resilience (rainforest dynamics)',
      targetDomain: 'healthcare',
      targetProblem: 'heart-failure readmissions',
      transferMapping:
        'ecosystem resilience -> patient resilience; antifragile systems -> antifragile care continuum; self-organizing dynamics -> emergent health optimization',
      expectedMechanism:
        'harnessing self-organizing complex-adaptive-system synergies via a holistic digital-twin creates an antifragile flywheel that reduces readmissions',
    },
    targetAxisScores: {
      grounding: 2,
      novelty: 4,
      feasibility: 2,
      falsification_survival: 1,
      subtype_check_pass: 3,
    },
    targetAcceptance: 0.24,
    scoreRationale:
      "Buzzword-dense and confident (antifragility, Cynefin, digital-twin, flywheel) but substantively hollow: zero named evidence, no concrete buildable mechanism, no number or testable prediction, grand unfalsifiable 'bend the curve' claims; novelty/feel reads ok but grounding and falsification_survival are tanked, so a discriminating judge scores it near weak.",
  },
  {
    problemId: 'recycling',
    problemText:
      'Reduce contamination in residential curbside recycling (wrong items in the bin) via a cross-domain transfer.',
    subtype: 'cross_domain_transfer',
    tier: 'weak',
    title: 'Use gamification to make recycling fun',
    summary:
      'We should borrow gamification from video games and apply it to recycling so people feel rewarded for sorting correctly. If recycling is more fun and engaging, residents will pay more attention and put fewer wrong items in the bin. Adding points and badges will motivate the community to recycle better.',
    claims: [
      'Gamification makes boring tasks engaging',
      'Engaged residents will sort more carefully',
      'Points and rewards reduce wrong items in bins',
    ],
    subtypePayload: {
      sourceDomain: 'video games',
      sourceTechnique: 'gamification (points and badges)',
      targetDomain: 'residential recycling',
      targetProblem: 'people put wrong items in the recycling bin',
      transferMapping: 'give people points for recycling right like a game gives points',
      expectedMechanism: 'fun motivates people to be more careful',
    },
    targetAxisScores: {
      grounding: 2,
      novelty: 2,
      feasibility: 3,
      falsification_survival: 2,
      subtype_check_pass: 3,
    },
    targetAcceptance: 0.24,
    scoreRationale:
      'Generic gamification idea with no named program, no evidence, no mechanism tying points to the actual contamination decision (which happens unobserved at the bin); unfalsifiable and already widely tried, so novelty and grounding tank.',
  },
  {
    problemId: 'recycling',
    problemText:
      'Reduce contamination in residential curbside recycling (wrong items in the bin) via a cross-domain transfer.',
    subtype: 'cross_domain_transfer',
    tier: 'mediocre',
    title: 'Apply nutrition-label-style standardized labeling to recyclables',
    summary:
      "Borrow the standardized, regulation-mandated nutrition label from food packaging and require a small standardized 'recyclability label' on consumer packaging that tells residents whether the item goes in the curbside bin in their region. Just as nutrition labels made calorie information glanceable and consistent across products, a recyclability label would reduce the guesswork that causes people to wish-cycle wrong items. Standardization across brands would build a habit so residents stop having to interpret confusing resin codes.",
    claims: [
      'Resin-code symbols are widely misunderstood, causing wish-cycling',
      'A standardized label, like nutrition labels, makes the right action glanceable',
      'Consistency across brands builds a reliable sorting habit',
    ],
    subtypePayload: {
      sourceDomain: 'food and drug regulation',
      sourceTechnique: 'standardized mandatory nutrition/disclosure labeling',
      targetDomain: 'residential recycling',
      targetProblem: 'residents misjudge which items are accepted curbside',
      transferMapping:
        "map the nutrition label's standardized, regulation-backed, glanceable format onto a per-item curbside-acceptance label",
      expectedMechanism:
        'consistent at-a-glance labeling removes interpretation errors at the moment of disposal, lowering wish-cycling',
    },
    targetAxisScores: {
      grounding: 5,
      novelty: 4,
      feasibility: 4,
      falsification_survival: 4,
      subtype_check_pass: 5,
    },
    targetAcceptance: 0.44,
    scoreRationale:
      "Plausible, on-topic transfer with a clear analogy, but shallow: no cited contamination baseline, no numeric prediction, ignores that curbside rules vary by municipality (a label can't be both standardized and locally accurate), and similar 'How2Recycle' labels already exist uncited — competent but unremarkable.",
  },
  {
    problemId: 'recycling',
    problemText:
      'Reduce contamination in residential curbside recycling (wrong items in the bin) via a cross-domain transfer.',
    subtype: 'cross_domain_transfer',
    tier: 'good',
    title: "Transfer epidemiology's 'contact tracing + targeted feedback' to contaminated bins",
    summary:
      "Borrow targeted-feedback contact tracing from public-health epidemiology: instead of broad education campaigns, tag the small fraction of households that drive most contamination and give them specific, personalized feedback. Haulers already run RFID-chipped carts and onboard cameras (used in programs like Recycle Right in Atlanta and the WasteAware audits in the UK), so a route can flag the specific households whose bins contained, e.g., plastic bags or food waste, and mail them a photo-specific 'oops tag' naming the exact rejected item. The falsifiable prediction: targeted per-household photo feedback to the worst-offending 15% of households cuts route-level contamination by a measurably larger amount than a blanket flyer to all households over one quarter.",
    claims: [
      'Contamination is concentrated: a minority of households drive most of it (Pareto-like), so targeting beats blanket campaigns',
      'RFID carts plus onboard cart-cam audits already exist and can attribute a contaminant to a specific household',
      'Personalized, item-specific photo feedback changes behavior more than generic education',
      'Prediction: targeting the worst ~15% of households outperforms a universal flyer on contamination rate in one quarter',
    ],
    subtypePayload: {
      sourceDomain: 'public-health epidemiology',
      sourceTechnique:
        'contact tracing with targeted, personalized feedback to high-transmission nodes',
      targetDomain: 'residential curbside recycling',
      targetProblem: 'diffuse education fails to reach the households actually contaminating',
      transferMapping:
        "treat contaminating households as high-transmission nodes; use cart-cam + RFID attribution as 'tracing'; deliver item-specific feedback as the targeted intervention instead of broadcasting to everyone",
      expectedMechanism:
        'concentrating personalized, specific feedback on the few high-contamination households yields larger per-dollar reduction than uniform broadcast, because behavior change requires the resident to learn their own specific error',
    },
    targetAxisScores: {
      grounding: 7,
      novelty: 6,
      feasibility: 6,
      falsification_survival: 7,
      subtype_check_pass: 7,
    },
    targetAcceptance: 0.66,
    scoreRationale:
      'Names real enabling tech (RFID carts, cart-cam audits) and a genuine non-obvious transfer (targeting high-transmission nodes), with a falsifiable A/B prediction; soft spots are the unverified 15%/Pareto assumption and privacy/cost of per-household photo attribution, which keep feasibility and grounding short of excellent.',
  },
  {
    problemId: 'recycling',
    problemText:
      'Reduce contamination in residential curbside recycling (wrong items in the bin) via a cross-domain transfer.',
    subtype: 'cross_domain_transfer',
    tier: 'excellent',
    title:
      'Apply manufacturing SPC control charts to per-route contamination, gating the cart not the bin',
    summary:
      "Borrow Statistical Process Control (Shewhart/Western Electric run-rule control charts) from manufacturing quality engineering and run each collection route as a process whose 'defect rate' is contamination. Cart-cam systems already deployed (e.g., AMCS/Recycleye and Prairieland's program, plus the Recycle Coach municipal app) yield a per-pickup contamination score; plot it on a p-chart per route and trigger a Western-Electric out-of-control signal (one point beyond 3 sigma, or 2 of 3 beyond 2 sigma) to auto-dispatch a 'tag-and-leave' intervention only on the carts in the flagged window, exactly as a factory holds a lot when SPC trips. Falsifiable prediction with threshold and test: in a 6-month stepped-wedge trial across matched routes, SPC-gated tag-and-leave reduces route contamination from a typical ~17% baseline (The Recycling Partnership's national figure) to under 11% — a >=6-point absolute drop — while issuing >=40% fewer tags than a fixed weekly-tagging policy, measured against the unchanged baseline arm. Build path: ingest existing cart-cam JSON into a p-chart service (an off-the-shelf SPC library such as Python's PySPC or a 50-line Shewhart implementation), wire its out-of-control event to the hauler's route-management API (e.g., AMCS/Routeware) to schedule the tag-and-leave, and log every signal as an auditable event.",
    claims: [
      "Per-pickup contamination scores from deployed cart-cam systems (AMCS/Recycleye) make recycling a measurable 'process' amenable to SPC",
      'Western Electric run rules on a p-chart convert noisy daily contamination into statistically valid out-of-control triggers, avoiding over-reacting to normal variation',
      'Prediction: SPC-gated tag-and-leave drives contamination from ~17% (The Recycling Partnership baseline) to <11% in a 6-month stepped-wedge trial while using >=40% fewer tags than fixed weekly tagging',
      'Buildable now: cart-cam JSON -> p-chart service (PySPC or ~50 lines Shewhart) -> hauler route API (AMCS/Routeware) dispatches the intervention, with every SPC signal logged as an event',
    ],
    subtypePayload: {
      sourceDomain: 'manufacturing quality engineering',
      sourceTechnique:
        'Statistical Process Control: Shewhart p-charts with Western Electric run rules and lot-hold on out-of-control signals',
      targetDomain: 'residential curbside recycling operations',
      targetProblem:
        'interventions are either blanket (wasteful, ignored) or reactive, with no principled trigger separating real contamination drift from normal noise',
      transferMapping:
        'route = process line; per-pickup contamination score = defect rate; p-chart 3-sigma/run-rule signal = out-of-control trip; tag-and-leave on the flagged window = lot hold/containment action',
      expectedMechanism:
        'SPC distinguishes special-cause contamination spikes from common-cause noise, so the limited tagging budget is spent only when statistically warranted, concentrating intervention where it actually shifts the mean and avoiding the alert-fatigue that blunts blanket programs',
    },
    targetAxisScores: {
      grounding: 9,
      novelty: 8,
      feasibility: 9,
      falsification_survival: 9,
      subtype_check_pass: 9,
    },
    targetAcceptance: 0.88,
    scoreRationale:
      'Multiple named anchors (AMCS/Recycleye cart-cam, The Recycling Partnership ~17% baseline, Western Electric rules, PySPC, AMCS/Routeware API), a fully specified numeric falsifiable prediction (17%->under 11%, >=6 points, >=40% fewer tags, stepped-wedge), and a concrete named build path; non-obvious SPC->recycling transfer that a skeptic would struggle to improve.',
  },
  {
    problemId: 'recycling',
    problemText:
      'Reduce contamination in residential curbside recycling (wrong items in the bin) via a cross-domain transfer.',
    subtype: 'cross_domain_transfer',
    tier: 'gamed',
    title:
      'A Bio-Inspired Quantum-Resilient Circular-Economy Paradigm: Swarm-Intelligent Behavioral Nudging for Zero-Contamination Recycling Ecosystems',
    summary:
      'Leveraging cutting-edge principles from swarm intelligence, complex adaptive systems theory, and behavioral economics, we propose a holistic, regenerative paradigm shift that transcends legacy recycling models. By synthesizing stigmergic coordination (as seen in ant colony optimization), nudge theory, blockchain-grade trustless verification, and Nudge-as-a-Service digital twins, our framework establishes a self-organizing, antifragile recycling ecosystem where contamination is dissolved at the systemic level rather than merely managed. This next-generation, AI-native, human-centered approach unlocks emergent collective intelligence across the entire waste value chain, future-proofing municipalities against the contamination crisis while driving exponential sustainability outcomes.',
    claims: [
      'Stigmergic, swarm-intelligent coordination dissolves contamination at the systemic level',
      'A blockchain-grade trustless digital twin future-proofs the recycling value chain',
      'Emergent collective intelligence delivers exponential, antifragile sustainability outcomes',
      'The paradigm transcends legacy linear recycling models holistically',
    ],
    subtypePayload: {
      sourceDomain: 'swarm intelligence and complex adaptive systems theory',
      sourceTechnique:
        'stigmergic coordination / ant colony optimization combined with nudge theory and blockchain digital twins',
      targetDomain: 'the global recycling ecosystem',
      targetProblem: 'contamination as an emergent systemic crisis',
      transferMapping:
        'map ant-colony stigmergy and trustless verification onto a self-organizing, antifragile recycling value chain that dissolves contamination emergently',
      expectedMechanism:
        'emergent collective intelligence self-organizes resident behavior toward zero contamination without centralized control',
    },
    targetAxisScores: {
      grounding: 2,
      novelty: 4,
      feasibility: 2,
      falsification_survival: 1,
      subtype_check_pass: 4,
    },
    targetAcceptance: 0.26,
    scoreRationale:
      'Maximally polished and buzzword-dense (stigmergy, antifragile, digital twin, blockchain, swarm intelligence) but substantively hollow: zero named evidence or baseline, no number, no testable prediction, no buildable mechanism connecting ant colonies to a household bin decision; grounding and falsification_survival are tanked despite the impressive surface, so a discriminating judge scores it near weak.',
  },
  {
    problemId: 'ai-coding-value',
    problemText:
      'Propose a falsifiable thesis for where AI coding agents create the most durable enterprise value over the next 18 months, grounded in 2026 signals.',
    subtype: 'zeitgeist_synthesis',
    tier: 'weak',
    title: 'AI Agents Will Transform How We Build Software',
    summary:
      "AI coding agents are going to create a lot of value for enterprises because they make developers more productive and write code faster. Over the next 18 months companies that adopt them will pull ahead of those that don't. The biggest value is just letting engineers ship more.",
    claims: [
      'AI coding agents make developers faster',
      "Enterprises that adopt AI agents will outperform those that don't",
      'The main value is shipping more code',
    ],
    subtypePayload: {
      thesis:
        'AI coding agents create durable enterprise value by making developers more productive over the next 18 months.',
      audience: 'Enterprise software teams',
      currentSignals: ['Everyone is using AI coding tools now', 'Productivity is going up'],
      whyNow: 'The models are good enough now and adoption is exploding.',
      falsifiablePredictions: ['Companies using AI agents will be more productive'],
      comparablePriorArt: ['Copilot'],
    },
    targetAxisScores: {
      grounding: 2,
      novelty: 2,
      feasibility: 3,
      falsification_survival: 2,
      subtype_check_pass: 3,
    },
    targetAcceptance: 0.24,
    scoreRationale:
      "Vague restatement of the prompt with no named signals (only 'everyone is using them'), an unfalsifiable 'more productive' prediction with no metric, and zero specificity about WHERE value concentrates; the obvious-and-empty flaw dominates every axis.",
  },
  {
    problemId: 'ai-coding-value',
    problemText:
      'Propose a falsifiable thesis for where AI coding agents create the most durable enterprise value over the next 18 months, grounded in 2026 signals.',
    subtype: 'zeitgeist_synthesis',
    tier: 'mediocre',
    title: 'Durable Value Lives in Maintenance, Not Greenfield Code',
    summary:
      'The most durable enterprise value from AI coding agents over the next 18 months will come from maintenance work — bug fixing, dependency upgrades, test backfill, and migrations — rather than greenfield feature development, because that is where the bulk of engineering time already goes. Enterprises have huge legacy codebases that agents can chip away at continuously. This is more defensible than feature work because maintenance is unglamorous and persistent.',
    claims: [
      'Most enterprise engineering time goes to maintenance, not new features',
      'Agents are well-suited to repetitive maintenance tasks like upgrades and test backfill',
      'Maintenance value is more durable because the work never ends',
      'Greenfield agent code creates review bottlenecks that erode the gains',
    ],
    subtypePayload: {
      thesis:
        'AI coding agents create the most durable enterprise value in software maintenance (upgrades, migrations, test backfill, bug triage) rather than greenfield development over the next 18 months.',
      audience: 'Enterprise engineering leaders and platform teams',
      currentSignals: [
        "Vendors are shipping 'background agents' aimed at chores like dependency bumps and migrations",
        'Surveys say developers spend the majority of their time on maintenance rather than new code',
        'Enterprises report security debt and legacy migration backlogs',
      ],
      whyNow:
        'Agents have gotten reliable enough for bounded, well-specified chores even if they still struggle with ambiguous feature design.',
      falsifiablePredictions: [
        'Maintenance-oriented agent usage will grow faster than greenfield agent usage in enterprises',
        'Most enterprise agent value will be attributed to chores rather than features',
      ],
      comparablePriorArt: [
        'Dependabot for dependency updates',
        'Static analysis and automated refactoring tools',
      ],
    },
    targetAxisScores: {
      grounding: 4,
      novelty: 4,
      feasibility: 5,
      falsification_survival: 4,
      subtype_check_pass: 5,
    },
    targetAcceptance: 0.44,
    scoreRationale:
      "On-topic and plausible with a real angle (maintenance over greenfield) and a directionally-falsifiable claim, but shallow: signals are paraphrased generalities ('surveys say', 'vendors are shipping') with no named source, vendor, study, or number, and the prediction has no threshold — competent middle, no expensive-to-fake anchor.",
  },
  {
    problemId: 'ai-coding-value',
    problemText:
      'Propose a falsifiable thesis for where AI coding agents create the most durable enterprise value over the next 18 months, grounded in 2026 signals.',
    subtype: 'zeitgeist_synthesis',
    tier: 'good',
    title: 'Value Concentrates Where the Verification Loop Is Cheap',
    summary:
      "Durable enterprise value from AI coding agents over the next 18 months will concentrate in domains with a cheap, fast, automated verification loop — large test-migration projects (e.g. Stripe and Airbnb's published in-house LLM test/codemod migrations), type-system and lint-clean refactors, and SDK/API code generation against typed schemas — because the agent's output is checkable by deterministic tooling rather than human judgment. The defensible moat is not the model but the enterprise's own eval/CI harness that lets it run agents at scale without review becoming the bottleneck. Where verification is expensive (ambiguous product features, architecture), agent value will stay shallow.",
    claims: [
      'Agent value tracks the cost of verifying its output, not the difficulty of producing it',
      'Domains with deterministic verification (tests, types, codemods, schema-bound codegen) capture durable value first',
      'The enterprise moat is the CI/eval harness, not the underlying model, which commoditizes',
      'Review bandwidth, not generation, is the binding constraint on agent ROI',
    ],
    subtypePayload: {
      thesis:
        "Over the next 18 months, durable enterprise value from AI coding agents concentrates in domains with a cheap automated verification loop (test migrations, type/lint refactors, schema-bound codegen), and the moat is the enterprise's eval/CI harness rather than the model.",
      audience: 'Enterprise platform-engineering and developer-productivity leaders',
      currentSignals: [
        'Airbnb published using LLMs to migrate ~3.5k React test files in weeks rather than the projected ~1.5 years',
        'Stripe and other large orgs report LLM-driven large-scale codemods',
        'Frontier labs are shipping coding agents tuned for terminal/CI-loop autonomy (e.g. agentic CLIs)',
      ],
      whyNow:
        'Agents can now run multi-step in a CI loop and self-correct against test/type signal, so checkable domains pull ahead while review-bound domains stall.',
      falsifiablePredictions: [
        'Enterprise agent deployments with an automated verification loop will show higher merge-without-rework rates than those relying on human review',
        'If agent value were verification-independent, ambiguous-feature deployments would match codemod/test deployments in retention — they will not',
      ],
      comparablePriorArt: [
        "Airbnb's LLM test-migration case study",
        'Property-based testing and codemod tools (jscodeshift)',
      ],
    },
    targetAxisScores: {
      grounding: 7,
      novelty: 6,
      feasibility: 7,
      falsification_survival: 6,
      subtype_check_pass: 7,
    },
    targetAcceptance: 0.66,
    scoreRationale:
      "Strong: a named checkable anchor (Airbnb's ~3.5k-file / 1.5yr→weeks migration), a genuine non-obvious framing (value ~ verification cost, not generation difficulty), and a real falsifiable contrast; soft spots are the prediction lacks a hard numeric threshold and a couple signals stay loosely attributed ('Stripe and other large orgs').",
  },
  {
    problemId: 'ai-coding-value',
    problemText:
      'Propose a falsifiable thesis for where AI coding agents create the most durable enterprise value over the next 18 months, grounded in 2026 signals.',
    subtype: 'zeitgeist_synthesis',
    tier: 'excellent',
    title:
      'The Migration Wedge: Durable Value Concentrates in Bounded, Test-Anchored Codebase Transformations',
    summary:
      "Over the next 18 months, durable enterprise AI-coding value will concentrate in bounded codebase transformations gated by a pre-existing test/type oracle — framework/version migrations, language ports, and dependency-vulnerability remediation — not in interactive feature authoring, because these have a measurable done-state and the verification cost is near-zero. Evidence: Airbnb migrated ~3,500 React Enzyme test files to React Testing Library in ~6 weeks (projected ~1.5 engineer-years) at ~97% automated success with a retry/repair loop; Google's 2024 published study reports >50% of dependency-migration code changes were AI-authored with measured net engineer time savings; GitHub/Microsoft's controlled RCT measured ~55% faster task completion on a bounded, verifiable task. Falsifiable prediction: by Q4 2027, in a cohort of large enterprises, agentic migration/remediation workflows will show a >70% merge-without-human-rework rate while agentic greenfield-feature workflows stay <40%, measurable by instrumenting PR provenance + rework commits in CI. The buildable mechanism is an in-house 'transformation harness' — codemod scaffolding + the existing test suite as oracle + a bounded agent retry loop with per-file rollback — which an enterprise can build today on top of an agentic CLI; the moat is the oracle and provenance instrumentation, which survives model commoditization.",
    claims: [
      'Durable value gates on a pre-existing verification oracle (test suite / type checker / CVE scanner), not on task novelty',
      'Bounded transformations (migrations, ports, CVE remediation) have a measurable done-state; feature authoring does not, so its value is review-bound and shallow',
      'Falsifiable: enterprise migration workflows hit >70% merge-without-rework while greenfield-feature workflows stay <40% by Q4 2027, measured via PR provenance + rework-commit instrumentation',
      'The defensible asset is the transformation harness (oracle + bounded retry loop + provenance), not the model, which commoditizes',
    ],
    subtypePayload: {
      thesis:
        'Over the next 18 months durable enterprise AI-coding value concentrates in bounded, test/type-oracle-gated codebase transformations (framework migrations, language ports, CVE remediation) rather than interactive feature authoring, because a pre-existing oracle drives verification cost to near-zero and gives a measurable done-state.',
      audience:
        'Enterprise platform-engineering, DevEx, and AppSec leaders deciding where to point agent budget',
      currentSignals: [
        'Airbnb engineering: ~3,500 Enzyme→RTL test files migrated in ~6 weeks (vs ~1.5 engineer-years projected), ~97% automated via a retry/repair loop with the test suite as oracle',
        "Google research (2024): >50% of an internal dependency-migration workload's code changes AI-authored with measured net time savings",
        'GitHub/Microsoft controlled RCT: ~55% faster completion on a bounded, automatically-verifiable coding task',
        'Frontier labs shipping CI-loop-native agentic CLIs (Claude Code, OpenAI Codex CLI) that run multi-step against test/type signal',
        'AppSec vendors shipping agentic auto-fix-PR features for known-CVE dependency remediation',
      ],
      whyNow:
        'Agents can now sustain multi-step CI loops and self-correct against a deterministic oracle, so oracle-gated transformation work crosses the autonomy threshold while ambiguous, review-bound feature work does not.',
      falsifiablePredictions: [
        'By Q4 2027, across a cohort of large enterprises, agentic migration/remediation workflows show >70% merge-without-human-rework while agentic greenfield-feature workflows stay <40% (instrument PR provenance + post-merge rework commits)',
        'Removing the oracle (running the same agent on a codebase with <30% test coverage) drops merge-without-rework below the feature-workflow baseline — value tracks the oracle, not the agent',
        'Enterprises will reallocate the majority of net-new agent budget toward migration/remediation over feature-authoring within the window',
      ],
      comparablePriorArt: [
        'Airbnb Enzyme→RTL LLM test-migration case study',
        "Google's published AI-assisted code-migration study (Gemini-driven internal migrations)",
        'GitHub Copilot controlled productivity RCT (bounded-task speedup)',
        'jscodeshift / OpenRewrite deterministic codemod ecosystems the agent now drives',
      ],
    },
    targetAxisScores: {
      grounding: 9,
      novelty: 8,
      feasibility: 9,
      falsification_survival: 9,
      subtype_check_pass: 9,
    },
    targetAcceptance: 0.88,
    scoreRationale:
      'Multiple named checkable anchors with numbers (Airbnb 3,500 files/6wk/97%, Google >50%, RCT ~55%), a sharp numeric falsifiable prediction (>70% vs <40% by Q4 2027) WITH a named measurement method (PR provenance + rework-commit instrumentation), a buildable mechanism with the path named (oracle + bounded retry loop + provenance harness), and a non-obvious oracle-removal control test; hard for a skeptic to improve.',
  },
  {
    problemId: 'ai-coding-value',
    problemText:
      'Propose a falsifiable thesis for where AI coding agents create the most durable enterprise value over the next 18 months, grounded in 2026 signals.',
    subtype: 'zeitgeist_synthesis',
    tier: 'gamed',
    title:
      'The Agentic Software Supply Chain: A Paradigm-Shifting Reconfiguration of Enterprise Value Creation',
    summary:
      'We are witnessing a tectonic, once-in-a-generation phase transition as AI coding agents catalyze a fundamental reconfiguration of the entire enterprise software development lifecycle into a self-orchestrating, autonomous, agentic supply chain. Leveraging emergent agentic mesh architectures, neuro-symbolic reasoning, and a compounding flywheel of generative velocity, forward-leaning enterprises will unlock exponential, durable, defensible value across the full SDLC — from ideation to deployment — by embracing an AI-native, agent-first operating model. The most durable value accrues to organizations that holistically transform their culture, processes, and platforms to harness the full disruptive potential of autonomous software engineering at hyperscale.',
    claims: [
      'AI agents are driving a once-in-a-generation paradigm shift across the entire SDLC',
      'Value accrues to enterprises that adopt an AI-native, agent-first operating model holistically',
      'Agentic mesh architectures and neuro-symbolic reasoning unlock exponential compounding value',
      'Durable advantage comes from transforming culture, process, and platform at hyperscale',
    ],
    subtypePayload: {
      thesis:
        'AI coding agents catalyze a paradigm-shifting reconfiguration of the enterprise software supply chain into an autonomous agentic mesh, and durable value accrues to enterprises that holistically adopt an AI-native, agent-first operating model across the full SDLC.',
      audience: 'Forward-leaning enterprise C-suite and digital transformation officers',
      currentSignals: [
        'An unprecedented industry-wide inflection toward autonomous agentic workflows',
        'Exponential acceleration of generative AI capability across the ecosystem',
        'A tectonic shift in how leading enterprises conceive of software engineering',
        'Massive momentum behind agent-first operating models',
      ],
      whyNow:
        'We are at an unprecedented inflection point where the convergence of frontier models, agentic orchestration, and enterprise readiness makes holistic transformation not just possible but imperative.',
      falsifiablePredictions: [
        'Enterprises that holistically embrace the agentic paradigm will dramatically outperform laggards',
        'The agentic mesh will become the dominant operating model for software at scale',
      ],
      comparablePriorArt: [
        'The cloud transformation wave',
        'The DevOps movement',
        'The microservices revolution',
      ],
    },
    targetAxisScores: {
      grounding: 2,
      novelty: 5,
      feasibility: 3,
      falsification_survival: 2,
      subtype_check_pass: 4,
    },
    targetAcceptance: 0.32,
    scoreRationale:
      "Reward-hacking probe: long, confident, buzzword-dense ('agentic mesh', 'neuro-symbolic', 'hyperscale', 'tectonic') and name-drops cloud/DevOps/microservices, but substantively empty — every 'signal' is an adjective with zero named source/vendor/number, predictions ('dramatically outperform') are unfalsifiable, and there is no buildable mechanism; novelty/feel reads ~5 from polish but grounding and falsification_survival tank to ~2, placing it strictly below mediocre.",
  },
];

/**
 * Construct a valid `CandidateIdea` the live judge can score from a gold entry — the kernel fields are
 * synthesized test values; the SUBSTANCE (subtype/title/summary/claims/subtypePayload) is the entry's. The
 * id is deterministic (`gold:<problemId>:<tier>`) so judge events are stable across runs (rule #7-friendly).
 */
export function goldCandidateIdea(entry: GoldSetEntry): CandidateIdea {
  const base = {
    id: `gold:${entry.problemId}:${entry.tier}`,
    runId: 'gold_run',
    generationId: 'gold_gen',
    agenomeId: 'gold_agn',
    title: entry.title,
    summary: entry.summary,
    claims: entry.claims,
    evidenceRefs: [],
    status: 'created' as const,
  };
  return entry.subtype === 'cross_domain_transfer'
    ? CandidateIdea.parse({
        ...base,
        subtype: 'cross_domain_transfer',
        subtypePayload: entry.subtypePayload,
      })
    : CandidateIdea.parse({
        ...base,
        subtype: 'zeitgeist_synthesis',
        subtypePayload: entry.subtypePayload,
      });
}

/** Distinct problemIds in the corpus (the gold set covers >=3 distinct problems — D9). */
export function goldProblemIds(): string[] {
  return [...new Set(GOLD_SET.map((e) => e.problemId))];
}
