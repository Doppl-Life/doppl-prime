Solution unknown as of June 22, 2026.

# Reference: The Development Folder That Is Not A Folder

Theo suggests a "Dropbox for devs": one code namespace across local machines,
cloud machines, and agent runtimes, with lazy file hydration and state that
follows the work.

He thinks the timing changed because agents turn clone and setup latency into
unit economics. Remote development is now normal, secret managers are mature,
and lazy Git hydration is proven. The gap is continuity across local, remote,
and agent execution.

Partial solutions already exist. Dropbox, Syncthing, and Unison sync files.
Mutagen handles low-latency development sync. Git partial clone, sparse checkout,
Scalar, VFS for Git, and Cloudflare ArtifactFS prove lazy hydration. Codespaces,
Coder, DevPod, VS Code Server, Tunnels, and Daytona cover remote workspaces.
Doppler, 1Password, Infisical, direnv, and Codespaces secrets cover pieces of
credential-safe environment setup.

Judgment: full rethink. Raw file sync preserves the wrong invariant. The product
should be typed development state: canonical Git objects, uncommitted overlay,
generated/cache layer, machine-local layer, agent-session layer, and
secret-reference layer, each with different hydration and authority rules.

Remaining uncertainty: which narrow wedge earns trust first. The best candidate
is not "sync every repo forever"; it is secret-safe handoff of one active project
between a local machine and a cloud agent.
