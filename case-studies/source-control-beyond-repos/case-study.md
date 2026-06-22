# Case Study: Source Control Beyond The Repository Flag

Git hosting usually treats visibility as a repository property. A project is
public or private, and teams add branch rules, review rules, and access roles on
top. That model works when the important question is who can read or write the
whole codebase.

Modern software work has smaller secrecy boundaries. An open project may need a
private security fix before disclosure. A maintainer may need a private branch
inside a public repository. A company may want public source with private
deployment overlays. A team may want generated or experimental agent patches to
be reviewable without immediately exposing the entire work stream.

The work shape has also changed. AI agents can produce many speculative edits,
partial stacks, and snapshots. Human branch ceremony becomes expensive when the
working state changes faster than the review queue. Newer tools show the
pressure: stacked-change systems make dependent work easier to review, while
snapshot-oriented systems reduce the cost of saving unfinished state.

But visibility is not just a user-interface flag. If hidden code exists, search,
review, tests, caches, logs, artifacts, dependency metadata, and agent context
can all leak it. A temporary private fork for a security advisory is useful, but
it is a special-purpose shelter, not the normal shape of source control.

The question is which object should carry trust and visibility. Is the repository
still the right boundary, or should policies attach to changes, files, snapshots,
branches, and disclosure state? What would it take to run review and automation
over hidden code without making secrecy a cosmetic layer?

## Synopsis

Git hosting treats visibility as a whole-repository property, but modern work needs finer secrecy boundaries, like a private security fix inside a public project.
