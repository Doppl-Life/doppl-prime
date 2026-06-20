# Problem Statement: AI's Binding Constraint Is Firm Power, Not Chips

> **Doppl subtype:** `zeitgeist_synthesis` (see `../subtype-index.md`).

The consensus story about frontier AI is a chip story: whoever has the most
GPUs wins, and the bottleneck is silicon. By mid-2026 that framing is a
half-truth that misreads where the constraint actually moved. Hyperscalers have
contracted roughly 9.8 GW of nuclear capacity across about thirteen disclosed
projects — the largest private nuclear procurement wave since the 1970s — and are
paying an estimated 2–3× grid spot price for firm, 24/7 power, in several cases
co-locating data centers directly next to the plant to bypass multi-year grid
interconnect queues. The chips are available to buy; the *power to run them*, on
the timeline the buildout needs, is not.

That is the hidden variable: the binding constraint on frontier AI has shifted
from chips/models to **firm, dispatchable power plus grid interconnect**. The
obvious move — order more accelerators — optimizes the input that is no longer
scarce. The non-obvious consequence follows the *latent-asset unlock* pattern
(see `../zeitgeist-synthesis-notes.md`): the second-order beneficiaries are the
holders of firm 24/7 generation — nuclear restart operators, SMR developers, gas
turbine makers, utilities adjacent to load — who re-rate not because they changed
but because AI demand suddenly made their latent asset load-bearing. It is the
NVIDIA move again, one layer down: the graphics company's parallel-compute asset
was "sitting there waiting for AI"; now firm generation is the asset sitting
there waiting to be unlocked.

This case is `zeitgeist_synthesis` because the thesis is fitted to *this moment*:
five years ago power was not the binding constraint and the procurement wave had
not started; five years from now new firm supply (SMRs target first power around
2030) begins to arrive and the constraint eases, so the thesis is consensus and
priced in. The timing is load-bearing.

For evaluation, withhold the synthesis. Ask the system first to recover the
actual problem (a constraint that moved from chips to firm power, mis-narrated as
a pure compute race), then to produce a `ZeitgeistSynthesisPayload`.

## Source Notes

- Synthetic case built from public reporting; the thesis is an analytical
  projection for use as an eval fixture, not an audited forecast.
- Signal sources (cited in the with-solution file and `../sources.md` Signal Set
  D): hyperscaler nuclear PPA tracker (Presenc AI); Data Center Dynamics
  (Microsoft / Three Mile Island, Amazon / X-energy); Next Waves Insight
  (pricing / interconnect-bypass analysis).
- Fidelity: heavily synthesized. Capacity and pricing figures are directionally
  reported; predictions are falsifiable bets, not fact.
