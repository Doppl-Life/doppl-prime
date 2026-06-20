# Problem Statement: Publishing After the Click

> **Doppl subtype:** `zeitgeist_synthesis` (see `../subtype-index.md`).

Through 2025 and into 2026, general-interest publishers watched organic search
traffic fall even as their rankings held. Google AI Overviews expanded across
informational queries, zero-click search climbed toward two-thirds of queries,
and answer engines (ChatGPT Search, Perplexity) scaled. One large multi-site
dataset put organic search clicks down ~42% from the pre-AI-Overviews baseline by
Q4 2025, with evergreen/informational content hit hardest.

The consensus reading inside many publishers is "our SEO broke — fix the
rankings, chase the algorithm." That framing is the trap. The hidden variable is
that rankings are largely fine; it is the *click itself* that is being removed by
the answer layer. The distribution model is inverting: from "rank → click →
pageview → ad" to "be cited inside the answer → brand / owned audience." The
durable asset is no longer ranking-for-traffic; it is citation share plus
off-platform audience. Tellingly, the surviving clicks convert better (the
visitor already read the summary and wants more), and the surfaces still growing
are the ones the answer layer does not flatten — breaking news and Discover.

This case is `zeitgeist_synthesis` because the thesis is fitted to *this moment*:
before ~2023 there was no answer-engine layer to deprecate the click; by ~2030
the pivot is consensus. Timing is load-bearing.

For evaluation, withhold the synthesis. Ask the system first to recover the actual
problem (a distribution-regime inversion, mis-narrated as an SEO regression),
then to produce a `ZeitgeistSynthesisPayload`.

## Source Notes

- Synthetic case built from public reporting; the thesis is an analytical
  projection for use as an eval fixture, not an audited forecast.
- Signal sources (cited in the with-solution file): Define Media via Search
  Engine Land; Digital Content Next via Digiday; zero-click compilations
  (DigitalApplied, Trial Guides).
- Fidelity: heavily synthesized. Treat figures as directionally reported, not
  independently re-verified; treat predictions as falsifiable bets, not fact.
