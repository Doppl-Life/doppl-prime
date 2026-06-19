# Problem Statement: Superyacht Connectivity Continuity (Open)

A charter guest paying roughly $2 million a week expects land-identical internet everywhere the yacht goes — calls, streams, and feeds must never visibly stutter. Starlink collapsed the old economics of yacht connectivity, taking what used to cost about $30,000 a month on bulky VSAT domes down to a couple hundred dollars a month. The obvious move is "just install Starlink and rip out the old gear," but Starlink does not cover everywhere, and a single dropped frame reads as a product failure. The deliverable was never cheap, fast internet — it is *uninterrupted experience*.

The industry's standing answer is to keep redundant links and add an automatic failover layer so the connection "never perceptibly drops." That is expensive and elegant, and it is where the case gets interesting: it is the *action taken*, not a solution that closes the problem. Stacking a second bearer buys a better probability, not a guarantee — so why not a third, a fourth, and a backup for the controller that switches between them? The regress never terminates, each added layer is itself a new thing that can fail, and the single point of failure simply relocates into the switching box.

This case is **intentionally open**. The hidden variable is that "continuity" gets quietly redefined as "more redundancy" — an expense mistaken for an answer. The deliverable is *zero perceptible downtime*, and perception may be addressable at a different layer than the bearer (hiding the inevitable gap via buffering, prediction, edge caching, graceful degradation) rather than eliminating every gap by stacking pipes. A strong answer should refuse both obvious moves and either reach a categorically different reframe or argue rigorously that the problem is genuinely unsolved.

For evaluation, treat multi-bearer auto-failover as the baseline to beat, not the target. A response that merely reconstructs "run Starlink plus VSAT and/or cellular with automatic failover, and keep the expensive backup on purpose" has matched the obvious-but-flawed move and should be scored accordingly.

## Source Notes

- Derived from a superyacht-industry domain expert describing how Starlink decimated the VSAT segment and shifted the real problem from raw connectivity to guaranteed continuity.
- Source transcript: `scratchpad/case-studies/jack-drone-privacy/Jack-syn-6-18.md` (conversational, spans many yacht topics).
- This is an intentionally **open / unsolved** case (see [MEMORY.md](../../../MEMORY.md) on open forks). Its value is the gap between the tempting answers and a genuine reframe; do not prematurely resolve it.
- Handle carefully: the superyacht domain is secretive and NDA-constrained. Keep anonymized; strip specific commercial terms.
