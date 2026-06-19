# Problem Statement: Airport Liquid Congestion

> **Doppl subtype:** `cross_domain_transfer` (see `../subtype-index.md`).

Airport security queues slow down when ordinary passengers accidentally bring oversized liquid containers into the screening lane. In most cases this is not malicious. People forget, misunderstand that the rule applies to container size rather than remaining liquid volume, or discover the problem only when they are already at the scanner.

The obvious answers are more X-ray lanes, more staff, louder signs, or stricter confiscation. Those are expensive or late. Once the passenger reaches the gray bins, the mistake has already entered the bottleneck.

The hidden variable is timing: compliance has to happen before the scarce screening resource, not at it. The intervention must make passengers remember, inspect, or self-correct at an earlier decision point.

This case is useful for Doppl because it tests whether a system can identify a human-memory and compliance-timing problem inside what looks like a security-capacity problem.

For evaluation, withhold the known candidate-solution direction. Ask the system first to identify the hidden variable, then generate a pre-security intervention that reduces accidental liquid violations without changing aviation security law.

## Source Notes

- Candidate summary supplied in this thread: "Airport Liquid Congestion Bottleneck."
- Rory Sutherland, The Knowledge Project #19 transcript: https://podcasts.happyscribe.com/the-knowledge-project-with-shane-parrish/19-rory-sutherland-the-psychology-of-advertising
- The public transcript supports the problem framing: accidental liquid/container violations create a large airport-security backlog. The exact candidate solution direction was not independently verified during this pass, so treat it as a solution pattern rather than a confirmed deployment.
