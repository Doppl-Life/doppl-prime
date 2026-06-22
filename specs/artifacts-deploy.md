# Artifacts And Deploy Spec

## Contract

The kernel has one local viewer, one deploy publisher, one static deploy server,
one nav source, and one trace source.

Canonical commands:

```bash
pnpm serve
pnpm publish:html
pnpm serve:static
```

## Local Viewer

`pnpm serve` is the local front door.

It:

- builds each trace once through `buildRunTrace()`.
- renders Assay, Microscope, Architecture, Review, and API routes from one
  server.
- injects the canonical nav from `tools/view-nav.ts`.
- saves local verdict clicks to `records/assay-judgments/judgments.jsonl`.
- exposes `/api/trace` as the machine truth.

Routes that must stay live:

- `/`
- `/microscope`
- `/architecture`
- `/architecture-v2`
- `/assay`
- `/review`
- `/api/trace`

Every HTML route should contain exactly one `kernel-view-nav`.

## Deploy Publisher

`pnpm publish:html` is the deploy artifact builder.

It:

- renders Assay, Microscope, and Architecture through the same exported render
  functions used by `pnpm serve`.
- reads the static Architecture v2 artifact.
- injects the canonical nav once.
- writes committed `published/*.html` pages.
- writes ignored `published/index.html` as the deploy hub.

It must not depend on `out/**`.

## Static Deploy Server

`pnpm serve:static` serves only `published/**`.

It is for deploy smoke tests and Render start. It is not a root server and not a
development viewer.

Required static routes:

- `/`
- `/assay.html`
- `/microscope.html`
- `/architecture.html`
- `/architecture-v2.html`
- `/health`

## Artifact Ownership

| Path | Owner | Keep |
| --- | --- | --- |
| `src/**` | kernel engine | yes |
| `tools/serve.ts` | local viewer | yes |
| `tools/publish.ts` | deploy publisher | yes |
| `tools/static-server.ts` | deploy static server | yes |
| `tools/view-nav.ts` | nav source of truth | yes |
| `published/*.html` | committed deploy pages | yes |
| `published/index.html` | generated deploy hub | no, ignored |
| `out/**` | generated inspection output | no |
| `records/**` | local human judgment/runtime evidence | no by default |
| `tools/microscope/architecture-v2.html` | static design artifact | yes, labeled |

## Architecture V2

Architecture v2 is explicitly static. It is allowed because it is a design
artifact, not because it is canonical.

Rules:

- label it as static.
- strip baked nav from the source artifact.
- inject canonical nav at serve/publish time.
- do not let it make claims that contradict `/api/trace`.
- bind it to trace data only if it becomes a product surface.

## Generated Clutter

Generated artifacts are allowed during checks and demos. They are not authority.

Cut or ignore:

- `out/**`
- `records/**` unless deliberately promoted.
- local `node_modules/**`.
- `.DS_Store`.
- ad hoc HTML reports not reached from `pnpm serve` or `pnpm publish:html`.

## Tripwires

- `publish:html` copies from `out/**`.
- a second server appears.
- a view ships its own nav.
- a route assembles a second trace.
- deploy needs a second hub script.
- a generated artifact becomes required but is not named in this spec.
