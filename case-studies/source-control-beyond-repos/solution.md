Solution unknown as of June 22, 2026.

# Reference: Source Control Beyond The Repository Flag

Theo suggests source control should move past repo-level public/private
visibility. He wants private branches, private files, in-flight PRs, and hidden
security fixes inside otherwise open collaboration.

He thinks the timing changed because agents multiply unfinished work and make
branch ceremony less natural. The working state becomes a continuous stream of
snapshots, stacks, and machine-authored changes rather than a small set of human
branches.

Partial solutions already exist. GitHub roles, branch protection, and security
advisories solve pieces. Temporary private forks support coordinated security
fixes but break normal CI and protections. Perforce and Subversion have path ACL
prior art. Jujutsu changes the snapshot model. Sapling rethinks scale, stacks,
and commit cloud. Graphite, ReviewStack, and GitHub `gh-stack` improve stacked
diff ergonomics.

Judgment: full rethink. Stacked PR tooling is a tweak. Private code objects need
policy-aware storage, transport, review, tests, search, logs, artifacts, caches,
and agent context. Otherwise hidden means hidden from the UI, not hidden from the
system.

Remaining uncertainty: whether this can be built as a Git-compatible hosted
layer, or whether true change-level secrecy requires a new storage and execution
substrate.
