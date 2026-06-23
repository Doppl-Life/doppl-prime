# Case Study: The Pull Request No One Has Time To Read

For a decade the scarce resource in software was writing the code. Now an
engineer paired with agents can open dozens of correct-looking changes an hour,
and a team of such engineers can produce more diff in a morning than the old
review process absorbed in a week. The constraint did not disappear. It moved.
The bottleneck is no longer authorship; it is integration: review, merge, and
the human attention required to trust a change before it ships.

This is where slop accumulates. When the queue grows faster than anyone can read
it, the rational move under pressure is to approve on vibes, trust the green
check, and merge. Each rubber-stamped change is individually plausible and
collectively corrosive: subtle bugs, dead branches, drifting conventions, and
eroded architecture compounding at machine speed. The danger is not one bad PR.
It is a system that ships faster than it can form judgment, where quality decays
precisely because everyone is moving quickly and no one is the bottleneck that
used to catch things.

The obvious answer is to point more agents at the problem: agents reviewing
agents, automated approvals, bots that gate the merge queue. But agents
reviewing agents have correlated blind spots. They share training, share style,
and can converge on changes that look reviewed without being understood. An
approval with no one accountable for it is ceremony. If a reviewer cannot be
wrong in a way that costs them something, the review does not carry trust.

Partial solutions already exist. Merge queues and stacked-diff tools raise
serialization throughput. CI, type gates, and property and mutation testing turn
some judgment into machine checks. AI review bots comment, summarize, and flag
risk. Each speeds one stage. None of them answers who is allowed to be wrong, or
which changes still require a human to look.

The question is where trust should attach when humans can no longer read every
diff. Is the reviewable unit still the pull request, or should humans own the
invariants, contracts, and risk classes while agents own the line-level pass?
What must a human still hold to keep the system from slopping itself into decay,
and what can safely be delegated to machines reviewing machines?

## Synopsis

Engineers paired with agents now produce changes far faster than review and merge can absorb them, so the bottleneck moves to integration and quality decays into slop unless trust is relocated off the per-diff human read.
