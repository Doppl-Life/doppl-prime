Solution unknown as of June 22, 2026.

# Reference: When NPX Becomes A Permission Boundary

Theo suggests that npm and executable package flows should be rebuilt around
agent-era trust. The concrete direction is not just better vulnerability lists:
release diffing, provenance, maintainer-change signals, package maturity
thresholds, reversible low-exposure releases, semantic PR layering, and an `npx`
gatekeeper that can explain and block risky execution.

He thinks the timing changed because AI agents increase unattended package
execution and also make rebuilding ugly infrastructure more plausible. A blind
yes/no executable prompt is tolerable when a human rarely runs unknown tools. It
is weaker when agents can invoke fresh packages inside automated work.

Partial solutions already exist. npm has audit, provenance, trusted publishing,
staged publishing, unpublish policy, and incoming install-time controls. Socket,
Snyk, Dependabot, Renovate, `npq`, Bun trusted dependencies, Deno permissions,
and malware research all cover fragments of the trust problem.

Judgment: partial rethink. The registry does not have to be replaced first, but
the decision boundary does. A practical wedge is a compatible overlay: registry
proxy, `npx` shim, PR bot, source-to-artifact diff, capability budget, and
quarantine metadata. The hard part is proving source-to-artifact behavior and
making the tool fail closed without turning every install into noise.

Remaining uncertainty: whether an LLM audit can be robust against prompt
injection, generated artifacts, minified code, and ambiguous capability intent;
and whether developers will accept delay before executing low-trust releases.
