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
 * full prose + per-candidate rationale in docs/planning/phase-j-gold-set-draft.md. The mediocre + good tiers
 * were refined 2026-06-27 to be objectively consistent in quality across the 3 problems (each mediocre =
 * plausible + generic mechanism + NO named source + NO number; each good = exactly ONE named anchor + a
 * directional falsifiable prediction + one soft spot) so the live judge scores each tier in a tight,
 * non-overlapping band — an OBJECTIVE consistency fix, not tuned to judge scores (anti-circularity holds).
 *
 * NOT judge-derived (drafted by general agents, never from held-out-judge outputs). The scores here are the
 * HUMAN TARGET labels, not judge output. acceptance = (sum of the 5 axes) / 50 (the judge's runner math, all
 * axis weights 1), so targetAcceptance === sum(targetAxisScores)/50 by construction.
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
 * The 15 signed-off gold-set entries (mediocre + good refined for cross-problem consistency). Generated from
 * the drafting + refinement workflow output; edit the doc + regenerate, or hand-edit here and keep
 * targetAcceptance === sum(axes)/50.
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
    title: 'Airline-Style Follow-Up Reminders for Heart-Failure Discharges',
    summary:
      'Heart-failure patients often miss follow-up steps after discharge, which drives many readmissions. Borrowing from how airlines send automated check-in and itinerary reminders, hospitals could send patients a sequence of automated reminders about their medications, weight checks, and follow-up appointments. The familiarity of timely nudges should keep patients engaged with their recovery plan and catch problems earlier. This should reduce avoidable readmissions by helping patients stay on track.',
    claims: [
      'Many 30-day readmissions follow from patients missing medications or follow-up appointments after they go home.',
      'Automated reminder sequences, like airline check-in notifications, reliably prompt people to complete time-sensitive steps.',
      'Applying that reminder pattern to post-discharge care should improve adherence and lower readmissions.',
    ],
    subtypePayload: {
      sourceDomain: 'commercial aviation / travel logistics',
      sourceTechnique: 'automated multi-touch itinerary and check-in reminder sequences',
      targetDomain: 'post-discharge heart-failure care',
      targetProblem:
        'patients missing medications, weight monitoring, and follow-up visits after discharge',
      transferMapping:
        "a flight itinerary's timed reminders map to a recovery plan's timed care steps; check-in prompts map to medication and appointment nudges",
      expectedMechanism:
        'timely automated nudges keep patients engaged with their care plan so problems are caught before they require readmission',
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
      "Plausible on-topic transfer with an obvious reminder mechanism; no named study/program/system and no numeric or operational target; one glaring gap (reminders alone don't address the clinical drivers of decompensation, and no plan to verify patients act on them).",
  },
  {
    problemId: 'readmissions',
    problemText:
      'Reduce 30-day hospital readmissions for heart-failure patients via a cross-domain transfer (borrow a technique from a different field).',
    subtype: 'cross_domain_transfer',
    tier: 'good',
    title: 'Aviation-style structured handoff bundles to cut heart-failure readmissions',
    summary:
      "Heart-failure readmissions cluster in the first 7-10 days after discharge, when medication reconciliation and follow-up scheduling fall through the cracks of an unstructured handoff. We transfer the structured-handoff discipline aviation uses at crew-change and the surgical-safety checklist model into the hospital-to-home transition: a fixed, role-assigned discharge bundle with a teach-back confirmation step and a scheduled 48-hour pharmacist call. The mechanism is closing the highest-risk reconciliation and follow-up gaps before they cause decompensation, rather than relying on a clinician's recall under time pressure. We would build it as a discharge-checklist module wired into the EHR discharge order set, with the pharmacist call as a tracked task. The likely failure mode is whether nurse and pharmacist staffing can sustain the added per-discharge minutes at scale.",
    claims: [
      'A role-assigned, teach-back-confirmed discharge bundle modeled on aviation crew handoffs and the WHO Surgical Safety Checklist will reduce 30-day HF readmissions meaningfully more than usual discharge education alone.',
      'The largest avoidable readmission driver in the first 10 days is medication-reconciliation and follow-up-scheduling failure, which a structured checklist closes at the point of discharge.',
      'Embedding the bundle as an EHR discharge order-set module with a tracked 48-hour pharmacist call makes adherence auditable rather than dependent on clinician recall.',
    ],
    subtypePayload: {
      sourceDomain: 'Aviation / surgical safety',
      sourceTechnique:
        'Structured crew-change handoff protocols and the WHO Surgical Safety Checklist (fixed, role-assigned, read-and-confirm steps with explicit verbal confirmation)',
      targetDomain: 'Hospital-to-home care transitions for heart-failure inpatients',
      targetProblem:
        '30-day readmissions driven by unstructured, recall-dependent discharge handoffs',
      transferMapping:
        'Crew-change checklist -> discharge bundle; read-and-confirm callout -> patient teach-back confirmation; sterile-cockpit/timeout discipline -> a mandatory reconciliation step gating the discharge order; downstream-shift owner -> assigned 48-hour follow-up pharmacist',
      expectedMechanism:
        'Forcing the high-risk reconciliation and follow-up steps to completion at the handoff boundary removes the recall-under-time-pressure failure that drives early decompensation, the same way checklists removed omission errors in aviation and surgery.',
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
      'Two checkable anchors (aviation crew-handoff protocols; WHO Surgical Safety Checklist) + a clear comparative-magnitude prediction (reduces 30-day HF readmissions meaningfully more than usual discharge education) + one soft spot (nurse/pharmacist staffing minutes may not scale); no precise number or named trial, keeping it good not excellent.',
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
    title: 'Traffic-Light Labels on Curbside Recycling Bins',
    summary:
      "Residents contaminate recycling because they're unsure what actually belongs in the bin. Borrowing the red/yellow/green color-coding used in traffic signals and nutrition labels, cities could put a simple three-color guide on each bin showing common 'yes,' 'maybe,' and 'no' items. The intuitive color cues should help people make faster, more accurate sorting decisions at the moment of disposal. This should cut down on the wrong items going into recycling.",
    claims: [
      'A lot of recycling contamination comes from residents being confused about which items are accepted.',
      "Color-coded 'traffic light' cues are widely understood and help people make quick decisions.",
      'Putting that color system directly on bins should reduce incorrect items and lower contamination.',
    ],
    subtypePayload: {
      sourceDomain: 'traffic signaling and nutrition labeling',
      sourceTechnique: 'red/yellow/green color-coding to convey stop/caution/go at a glance',
      targetDomain: 'residential curbside recycling',
      targetProblem: 'residents putting non-recyclable or contaminating items into recycling bins',
      transferMapping:
        "red maps to 'never recycle,' yellow to 'check first,' green to 'always accepted,' shown as a label on the bin",
      expectedMechanism:
        'intuitive color cues reduce decision friction at disposal time so residents sort more accurately and contamination drops',
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
      "On-topic transfer with an obvious labeling/color-cue mechanism; no named city program, dataset, or contamination figure and only a directional 'contamination drops' claim; one obvious gap (accepted materials vary by locality so a fixed three-color list can't be accurate everywhere, and no measurement plan).",
  },
  {
    problemId: 'recycling',
    problemText:
      'Reduce contamination in residential curbside recycling (wrong items in the bin) via a cross-domain transfer.',
    subtype: 'cross_domain_transfer',
    tier: 'good',
    title: 'Just-in-time point-of-disposal feedback to cut curbside recycling contamination',
    summary:
      "Residential recycling contamination is largely a moment-of-decision error: people guess wrong about a specific item at the bin, days before the truck arrives and any feedback could land. We transfer the just-in-time nudge pattern from energy-use feedback programs and the cart-tagging 'oops tag' inspection model into a tighter loop: route-truck or pre-collection contamination tagging combined with a household-specific 'top 3 wrong items' notice, so the correction reaches the resident close to the behavior and names the actual mistakes. The mechanism is converting a vague abstract rule into concrete, item-level, household-targeted feedback that overwrites the wrong mental model. We would build it as a contamination-tagging workflow for haulers plus a simple per-household notice generated from the tagged items. The open risk is whether tagging coverage and labor cost stay low enough for a city to run it on every route rather than spot routes.",
    claims: [
      "Household-specific, item-level contamination feedback delivered close to the disposal decision (cart tagging plus a 'top wrong items' notice) will cut contamination rates more than generic city-wide education campaigns.",
      "Contamination is dominated by a small set of repeat 'wishcycling' items per household, so naming those specific items corrects the mental model far better than restating the general rules.",
      'A hauler-side tagging workflow feeding a per-household notice makes the intervention targeted and repeatable without requiring new bins or sensors.',
    ],
    subtypePayload: {
      sourceDomain: 'Residential energy conservation / behavioral feedback',
      sourceTechnique:
        "Just-in-time, personalized comparative feedback as used by Opower's home energy reports, paired with the cart-tagging 'oops tag' inspection model used in municipal recycling programs",
      targetDomain: 'Residential curbside recycling',
      targetProblem: 'High contamination from wrong-item disposal at the bin',
      transferMapping:
        "Personalized energy report -> per-household 'top 3 wrong items' notice; neighbor-comparison framing -> route/neighborhood contamination context; smart-meter signal -> hauler cart-tag inspection as the data source; periodic bill cadence -> per-collection-cycle feedback loop",
      expectedMechanism:
        "Delivering concrete, item-specific, household-targeted feedback near the decision point overwrites the incorrect 'this is probably recyclable' heuristic, the same mechanism by which personalized energy feedback durably shifted household consumption where generic appeals did not.",
    },
    targetAxisScores: {
      grounding: 7,
      novelty: 6,
      feasibility: 6,
      falsification_survival: 6,
      subtype_check_pass: 7,
    },
    targetAcceptance: 0.64,
    scoreRationale:
      "Two checkable anchors (Opower personalized energy reports; municipal cart-tagging/'oops tag' inspection programs) + a clear comparative prediction (cuts contamination more than generic city-wide education) + one soft spot (tagging coverage/labor cost may not scale to every route); no precise threshold or named test, so good not excellent.",
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
      'Propose a falsifiable thesis for WHERE AI coding agents create the most durable enterprise value over the next 18 months, grounded in current 2026 signals.',
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
      'Propose a falsifiable thesis for WHERE AI coding agents create the most durable enterprise value over the next 18 months, grounded in current 2026 signals.',
    subtype: 'zeitgeist_synthesis',
    tier: 'mediocre',
    title: 'AI Coding Agents Will Pay Off Most in Legacy Code Maintenance',
    summary:
      'Over the next 18 months, the most durable enterprise value from AI coding agents will come from maintaining and modernizing legacy codebases rather than greenfield development. Big companies are sitting on large amounts of old code that few engineers understand, and agents are increasingly good at reading and explaining unfamiliar code. As vendors keep shipping better code-understanding features, enterprises should lean on agents to document, refactor, and patch their legacy systems. This is where the lasting value will concentrate.',
    claims: [
      'Enterprises carry large legacy codebases that are expensive and risky to maintain with scarce institutional knowledge.',
      'AI coding agents are getting better at reading and explaining unfamiliar code, which fits legacy maintenance well.',
      'Therefore the most durable enterprise value over the next 18 months will be in legacy maintenance and modernization rather than new builds.',
    ],
    subtypePayload: {
      thesis:
        'The most durable enterprise value from AI coding agents over the next 18 months will come from legacy-code maintenance and modernization, not greenfield development.',
      audience: 'enterprise engineering leaders and CTOs',
      currentSignals: [
        'vendors are shipping more code-understanding and codebase-explanation features',
        'enterprises are reporting that legacy maintenance consumes a large share of engineering time',
        'agents are being marketed increasingly for working inside existing repositories rather than only generating new code',
      ],
      whyNow:
        'legacy maintenance is a persistent, expensive enterprise pain point and agents are now becoming capable enough at reading existing code to help with it',
      falsifiablePredictions: [
        'enterprise adoption of AI agents for legacy maintenance will grow over the next 18 months',
        'greenfield-only use cases will become a smaller share of enterprise agent usage relative to maintenance',
      ],
      comparablePriorArt: [
        'earlier waves of automated refactoring and static-analysis tooling that targeted legacy systems',
        'outsourced legacy modernization services',
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
      "Plausible, commonly-voiced thesis with a generic 'agents read legacy code' mechanism; signals are vague ('vendors are shipping,' 'enterprises report') with no named vendor, report, or number, and predictions are only directional ('adoption will grow') with no threshold or test; one obvious gap (no way to attribute durable value to maintenance vs. greenfield, so the thesis isn't actually measurable as stated).",
  },
  {
    problemId: 'ai-coding-value',
    problemText:
      'Propose a falsifiable thesis for WHERE AI coding agents create the most durable enterprise value over the next 18 months, grounded in current 2026 signals.',
    subtype: 'zeitgeist_synthesis',
    tier: 'good',
    title: 'Durable AI-coding value accrues to verifiable-boundary work, not greenfield authoring',
    summary:
      'The durable enterprise value of AI coding agents over the next 18 months concentrates where the work has a tight, machine-checkable verification boundary - test-backed refactors, migrations, dependency and security upgrades, and CI-gated bug fixes - not in open-ended greenfield authoring where correctness is expensive to confirm. The 2026 signal is that enterprise adoption has shifted from inline autocomplete to agentic, PR-producing workflows gated by existing test and review infrastructure. The mechanism is economic: agents compound value where a cheap automated oracle can accept or reject their output, so the moat is the verification harness, not the model. We predict teams that invest in test coverage and CI gates will capture more durable agent productivity than teams chasing raw generation speed. The weak point is attributing the productivity to agents specifically rather than to the test/CI investment that would have helped regardless.',
    claims: [
      'Over the next 18 months, AI coding agents will create the most durable enterprise value on verifiable-boundary tasks (migrations, test-backed refactors, dependency/security upgrades, CI-gated fixes), not greenfield feature authoring.',
      'The binding constraint on captured value is the strength of the automated verification harness (tests + CI gates), so the durable moat sits in the harness rather than in the model itself.',
      'Enterprises that invest in coverage and CI gating will sustain more agent-driven throughput than those optimizing for raw code-generation volume.',
    ],
    subtypePayload: {
      thesis:
        'Durable AI-coding enterprise value concentrates on tasks with a tight machine-checkable verification boundary; the moat is the verification harness, not the model.',
      audience:
        'Enterprise engineering leaders and platform/CTO-level buyers deciding where to invest in AI coding tooling',
      currentSignals: [
        "GitHub's shift from inline Copilot autocomplete to agentic, PR-producing Copilot/coding-agent workflows that run inside existing CI and review gates",
        "Anthropic's Claude Code adoption framing around test-and-verify agentic loops rather than one-shot generation",
        'Enterprise emphasis on PR review, CI gating, and SWE-bench-style verifiable task benchmarks as the unit of agent evaluation',
      ],
      whyNow:
        'By 2026 the bottleneck has moved from generation quality to trust: agents can produce plausible code faster than humans can verify it, so value accrues only where an automated oracle can cheaply accept or reject the output.',
      falsifiablePredictions: [
        'Within 18 months, enterprise agent usage will skew more toward verifiable-boundary work (migrations, refactors, upgrades, CI-gated fixes) than toward greenfield authoring, measured by where merged agent-authored PRs land.',
        'Teams with stronger test/CI harnesses will report meaningfully higher sustained merge rates for agent-authored PRs than teams without, more so than any difference explained by model choice.',
      ],
      comparablePriorArt: [
        'The DevOps/CI-CD shift, where durable value accrued to teams that built deployment and test automation rather than to those that just wrote more code',
        'Compiler and static-analysis adoption, where the verifiable feedback loop (not raw authoring speed) was what made the tooling durably valuable',
      ],
    },
    targetAxisScores: {
      grounding: 6,
      novelty: 6,
      feasibility: 7,
      falsification_survival: 7,
      subtype_check_pass: 7,
    },
    targetAcceptance: 0.66,
    scoreRationale:
      "Two checkable anchors (GitHub's Copilot autocomplete-to-agentic-PR shift; Anthropic Claude Code test-and-verify framing) + a clear comparative prediction (agent value skews to verifiable-boundary work over greenfield, and harness-strong teams sustain higher merge rates) + one soft spot (hard to attribute the gain to agents vs. the test/CI investment itself); no precise numeric threshold plus named test, keeping it good not excellent.",
  },
  {
    problemId: 'ai-coding-value',
    problemText:
      'Propose a falsifiable thesis for WHERE AI coding agents create the most durable enterprise value over the next 18 months, grounded in current 2026 signals.',
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
      'Propose a falsifiable thesis for WHERE AI coding agents create the most durable enterprise value over the next 18 months, grounded in current 2026 signals.',
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
