# Case Study: When NPX Becomes A Permission Boundary

Package registries grew up around dependency records. A maintainer publishes a
version, projects declare ranges, installers fetch tarballs, and downstream
tools check for known vulnerable versions. That model fits a world where humans
mostly install packages during deliberate development work.

The boundary is changing. A developer, agent, or remote sandbox can run an
unfamiliar package as an executable command with a single prompt. The approval
surface is often little more than a package name and version. It does not
explain whether the package is new, whether maintainership changed, whether the
tarball matches its repository, whether install scripts will run, or whether the
command expects filesystem, network, credential, or subprocess access.

The registry has started to add more trust signals. Package provenance, trusted
publishing, staged publishing, install-time controls, vulnerability scanning,
and dependency update bots all reduce parts of the problem. Security vendors can
also flag suspicious package behavior faster than a public vulnerability record
appears. But the execution decision is still fragmented across registry
metadata, local installer flags, human review, dependency PRs, and third-party
alerts.

The harder case is an untrusted or newly changed version before the ecosystem has
absorbed it. A release with low downloads and short lifetime may be reversible in
practice, but after it gains dependents, build cache entries, lockfile pins, and
automation trust, removal becomes more expensive. The same window is when an
agent is most likely to treat the package as a tool rather than a dependency.

The question is what the new permission boundary should be. If package execution
is remote code execution by default, what evidence should be assembled before a
command runs? Which low-exposure releases should stay reversible? Which signals
are strong enough to block an agent without making every install a manual
security review?
