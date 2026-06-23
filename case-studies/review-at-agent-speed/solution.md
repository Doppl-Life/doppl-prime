Solution unknown as of June 22, 2026.

# Reference: The Pull Request No One Has Time To Read

Theo suggests moving the human off the per-diff review path and onto the
invariants. Agents do the line-level pass at the speed they generate; humans own
the contracts, risk classes, and architectural boundaries that say which changes
are allowed to merge on machine judgment and which still demand a person. The
reviewable unit becomes the verifiable property, not the diff.

He thinks the timing changed because generation went cheap and review became the
bottleneck. When authorship was the constraint, per-PR human review was nearly
free relative to writing the code. Now it is the scarce step, and the unit
economics of a team are set by how fast changes can be trusted, not produced.

Partial solutions already exist. Graphite, Mergify, and GitHub merge queues
raise serialization throughput. Stacked diffs make dependent work reviewable.
CodeRabbit, Greptile, and Diamond add automated review. Property testing,
mutation testing, fuzzing, and strong type and CI gates convert judgment into
checks. Each speeds a stage without relocating the trust boundary.

Judgment: full rethink. Scaling reviewers, human or agent, against an
exponential change rate is a losing race, and agent-on-agent approval has
correlated blind spots that manufacture the appearance of review. The durable
object is a typed change carrying its risk class, the invariants it claims to
preserve, machine evidence for them, and an accountable owner for the class,
sampled rather than read line by line.

Remaining uncertainty: how to prevent reviewer collusion and shared blind spots
when the reviewers are agents, and what minimal human touch keeps real
accountability. Get it wrong and you get either a merge queue that rubber-stamps
slop at machine speed, or a human gate that re-becomes the bottleneck it was
supposed to remove.
