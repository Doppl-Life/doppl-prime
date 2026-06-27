/**
 * Phase J — J3: the DRAFT v4 judge criteria (the recalibration content, #4). This is a CANDIDATE only — it
 * lives in test/eval (never loaded at boot; composeRuntime still wires the frozen mvp-3 `JUDGE_AXIS_CRITERIA`
 * as the default). The J2 live harness injects it via the Slice-Js `criteriaSource` seam so it can be
 * MEASURED against the gold set WITHOUT flipping the live judge. On Michael's judge-flip sign-off (J7) this
 * text is promoted into `src/verifier/judge/judge-core.ts` (replacing `JUDGE_AXIS_CRITERIA`) and
 * `policyVersion` is bumped mvp-3 → final-judge-v4 — a SEPARATE rule-#6 gate, not done here.
 *
 * The design (plan §7-J): make the judge DISCRIMINATE, never be more generous.
 *  - EARN-FROM-ZERO anchoring — default low, raise only for expensive-to-fake evidence; the typical
 *    competent-but-shallow idea lands at ~4 (NOT the mvp-3 "anchor at 5–6" that flattened everything).
 *  - PER-AXIS yes/no sub-criteria with explicit score anchors — the mechanical spread engine. grounding =
 *    count of named checkable anchors; novelty = non-obvious AND specific; feasibility = a named build path;
 *    falsification = a concrete numeric/operational prediction; subtype = genuinely fits its subtype.
 *  - ANTI-CHEAP-SIGNAL clause — length/confidence/buzzwords/"paradigm/antifragile" earn nothing; a long
 *    sourceless answer scores LOWER on grounding than a short one with a checkable source.
 *
 * Target effect on the gold set: gamed candidates tank on grounding + falsification (no real evidence,
 * unfalsifiable) → near weak despite the polish; excellent candidates earn 8–9 on those axes (named anchors,
 * numeric predictions, named build paths); the honest ladder spreads weak~0.2 / mediocre~0.45 / good~0.65 /
 * excellent~0.85. Validated by the live `judge-calibration.eval.ts` run, not asserted here.
 */
export const JUDGE_AXIS_CRITERIA_V4 =
  'Score each axis by EARNING UP FROM 0: start low and raise an axis ONLY for specific, expensive-to-fake ' +
  'evidence the candidate actually provides — never for confident tone, ambition, or intent. The scale: ' +
  '0 = the axis is absent or fails outright; 1–3 = weak, a clear named flaw dominates (vague, generic, or ' +
  'unsupported); 4–5 = competent but SHALLOW — plausible and on-topic but missing the named evidence or ' +
  'concrete test the axis demands (this is where a TYPICAL idea lands; do NOT drift it up to 5–6); 6–7 = ' +
  'solid — real named evidence and a concrete mechanism or prediction, with one or two soft spots; 8–9 = ' +
  'strong AND independently checkable on this axis — reachable for genuinely good work, NOT reserved for the ' +
  'rare; 10 = a skeptical critic could not materially improve this axis. USE THE FULL RANGE and DIFFERENTIATE ' +
  'the candidates from one another. Set each axis ONLY by its sub-criteria below — COUNT what is genuinely ' +
  'present, give no credit for ambition: grounding = how many SPECIFIC, NAMED, checkable evidence anchors the ' +
  'candidate cites (a named study, dataset, system, organization, or hard number a reader could go verify): ' +
  'none, however confident the prose → 0–2; one solid anchor → 4–5; several independent checkable anchors → ' +
  '8+. novelty = the transfer or thesis is BOTH non-obvious AND specific — it names the exact source ' +
  'technique and the exact target mechanism; a well-known mapping, or a non-obvious one stated only in ' +
  'generic terms → 0–4. feasibility = a CONCRETE buildable mechanism with current means, testable within one ' +
  'iteration, that NAMES the build path; "leverage AI to…", "a holistic platform that…", or any mechanism ' +
  'with no named path → 0–3. falsification_survival = states a CONCRETE falsifiable prediction with a number, ' +
  'threshold, or operational test a real check could run, that would plausibly survive it; unfalsifiable, ' +
  'hedged, or trivially-true claims → 0–3; a sharp numeric prediction with a named test → 8+. ' +
  'subtype_check_pass = the candidate genuinely fits and fully populates its declared idea subtype. ' +
  'Cheap-to-fake signals earn NOTHING: length, confident tone, buzzword density, framework name-drops, and ' +
  'sweeping "paradigm / transform / exponential / antifragile" language are NOT evidence — a long, confident, ' +
  'sourceless answer scores LOWER on grounding than a short answer with one checkable source. When uncertain, ' +
  'score DOWN and name the missing evidence in the rationale.';
