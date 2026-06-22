# Case Study: The Development Folder That Is Not A Folder

Developers now move between laptops, Linux boxes, remote workstations, cloud
sandboxes, NAS storage, and agent runtimes. The code may be the same project,
but the state is rarely the same. One machine has the branch, another has the
uncommitted edit, another has the right dependency cache, another has the
credential reference, and another has the agent session that understands what
just happened.

Plain file sync sounds like the obvious answer. Consumer sync tools can make a
folder appear on multiple machines. But active development folders are not normal
folders. They contain repository metadata, generated files, lockfiles, caches,
machine-specific paths, editor state, local overlays, build outputs, credential
references, and worktree state. Syncing all bytes can create conflicts or leak
state. Syncing too little leaves every new machine half broken.

Git also does not fully solve the problem. It captures committed history, and
large-repo tooling can lazily hydrate objects. Remote development environments
can provide a persistent machine in the cloud. Secret managers can inject values
at run time. Each piece is useful, but the user still has to decide which machine
owns the dirty work and which parts of the environment follow.

Agents raise the cost of this gap. A clone that takes minutes, a missing local
setting, or a stale branch is no longer just a developer annoyance. It becomes
setup latency multiplied across many short-lived workers. The faster the agents
become, the more expensive environment friction looks.

The question is what should be synchronized. Is the product a folder of bytes, a
Git repository, a remote workspace, a handoff protocol, or something else? What
should follow the work, what should stay machine-local, and who decides when two
machines disagree?

## Synopsis

Developers work across laptops, remote boxes, sandboxes, and agent runtimes where the code matches but the state (branches, edits, caches, sessions) does not.
