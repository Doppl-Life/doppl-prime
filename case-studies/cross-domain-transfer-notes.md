# Cross-Domain Transfer — Working Notes

Companion to `zeitgeist-synthesis-notes.md`, for parity. The twelve imported
cases are all `cross_domain_transfer`, so this subtype was already defined *by
example* (see `subtype-index.md` rationales) rather than in prose. This note
makes that implicit definition explicit so the Subtype Check Lab (PRD 11) and the
§7 subtype checks have a typed definition for **both** subtypes, not just
zeitgeist.

## The contract this binds to

`CrossDomainTransferPayload{ sourceDomain, sourceTechnique, targetDomain,
targetProblem, transferMapping, expectedMechanism, executableCheckIdea? }`
(`ARCHITECTURE.md` §3, Appendix A). Subtype checks (`DOMAIN_MODEL.md` §6):
source-domain validity, target-problem fit, mapping quality, prior-art search,
and executable / toy checks where feasible.

## The one-line distinction

- **Transfer** answers: *"What known thing from domain A solves this problem in
  domain B?"* The leverage is the **analogy / mapping**. Timing is incidental.
- **Zeitgeist** answers: *"What is true/buildable right now because of live
  signals?"* The leverage is the **timing**. (See `zeitgeist-synthesis-notes.md`.)

## The discriminator test (timing is *not* load-bearing)

A transfer case is **timing-agnostic**: it would work essentially the same 5
years earlier or later, because the source technique is durable and the target
problem is perennial. If moving the case in time breaks it, it is probably
zeitgeist, not transfer. (This is the mirror of the zeitgeist ±5-year test.)

The airport-liquid nudge, the queue-psychology baggage walk, and the ketchup
self-authentication cue all survive the time shift unchanged — that invariance is
the signature of transfer.

## Inclusion criteria (a case should satisfy all four)

1. **A valid source technique.** A real, named mechanism that demonstrably works
   in its home domain (choice architecture, occupied-vs-idle time perception,
   sensor fusion). Maps to `sourceTechnique` + `sourceDomain`.
2. **A genuine target problem.** A real problem in a different domain that the
   technique could plausibly address. Maps to `targetProblem` + `targetDomain`.
3. **A non-obvious mapping.** The transfer should be insightful, not a
   same-domain restatement; the value is in seeing that A's mechanism fits B.
   Maps to `transferMapping` + `expectedMechanism`.
4. **A stated mechanism of action.** Why the technique should produce the effect
   in the target domain, not just that it "feels similar." Maps to
   `expectedMechanism`; ideally an `executableCheckIdea?` (toy/allowlisted test).

## Anti-patterns (reject or re-tag as zeitgeist / truism)

- **"It only works because of right now."** If correctness depends on a live
  signal/threshold and breaks under the ±5-year test, it is `zeitgeist_synthesis`.
- **"Same-domain restatement."** Source and target are effectively the same
  domain; no real transfer happened.
- **"Superficial analogy, no mechanism."** A poetic resemblance with no causal
  story for why the technique transfers.
- **"The source technique doesn't actually work."** Mapping a folk belief or an
  unvalidated mechanism fails source-domain validity.

## How Problem Recovery applies to transfer cases

For transfer, Problem Recovery is the classic symptom→cause reframe shaped by the
behavioral/operations cases in this corpus:

- `stated_problem_or_symptom` is an operational complaint ("security lanes are
  slow," "baggage wait generates complaints").
- `source_proposed_solution_or_assumption` is the obvious capacity/enforcement
  fix ("add more lanes," "make bags arrive faster").
- `hidden_variable` is the non-obvious causal factor (compliance *timing*;
  *perception* of wait, not its length).
- `actual_problem` is the reframed, smaller target the transferred technique then
  addresses.

The shared upstream Problem Recovery stage is identical in shape across both
subtypes (`ALIGNMENT.md` Decision 1); only the typical *content* of the hidden
variable differs (a causal/behavioral misread here; a why-now misread for
zeitgeist).
