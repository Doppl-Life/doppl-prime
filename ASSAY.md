# Outcome Assay

The kernel is past the "does water move through the pipes?" stage. The next
question is whether a run makes cases more fertile for a human.

## Stages

### Discovery

Discovery asks: what did the run notice that was not already obvious?

Good discovery surfaces a new substrate, hidden dependent, disappearing event,
timing shift, latent asset, adoption boundary, or weird but plausible branch. It
does not need to solve the case. It should make the human want to inspect the
case differently.

### Problem Surface

Problem surface asks: what is the actual pressure point?

Good problem surfacing recovers or sharpens the hidden variable. It turns "the
drone is here" into "the footage is the target," or "add guards" into "the
perimeter excludes the waterline." If the problem surface is wrong, clever
solutions should be capped.

### Collaborative Solution

Collaborative solution asks: what should someone do now?

Good solutions are constraint-aware interventions, strategies, warnings,
products, protocols, or falsification tests. They come after discovery and
problem surfacing, not before them.

## Current Assay

The Assay view behind `pnpm serve` is discovery-first. It defaults to six rows:

- one first-row control case for the drone paparazzi scenario
- five kernel case runs

- `jack-drone-privacy`
- `jack-yacht-perimeter-intrusion`
- `fsd-accident-economy`
- `starship-launch-cost-collapse`
- `glp1-snack-demand-destruction`

The control row is not a kernel run. It is the isolated clean-context sub-agent
answer, shown immediately before the paired drone kernel run. Use `--count=<n>`
to run fewer or more kernel cases; counts above five random-fill from the
remaining registry by default. Use `--deterministic` for a sorted fill,
`--seed=<value>` to replay a random selection, `--cases=a,b,c` to choose exact
cases, and `--all` to run the full registry.

Rows in the Assay view are collapsed by default. The headline is the
scan surface: row type, kernel conclusion or control framing, convergence, and
generation-2 movement. The first viewport also shows local save status and the
Review Digest shape, so the human can see where judgments will land before
opening any row. Expand only the rows worth inspecting.

For real local judging, use `pnpm serve`, then open the printed localhost URL.
The local server renders Assay, Microscope, Architecture, and the static
Architecture v2 artifact together, and saves every verdict click to an
append-only judgment ledger automatically. The Review Digest link in the assay
first viewport stays live against the same ledger.

## Control Lane

The clean-agent control is a baseline answer from a single clean-context agent
with no knowledge of the kernel, assay, or surrounding machinery.

Use it to keep the kernel honest:

- Did the kernel surface anything the clean agent missed?
- Did the kernel make the case easier to judge?
- Did generation 2 sharpen anything the clean agent only gestured at?
- Did the clean agent simply beat the machinery?

The first control is shown as its own row before `jack-drone-privacy`.

## Win Condition

The first outcome gate is simple:

After five cases, did the run surface at least three to five entries a human
would mark `interesting`, `investigate`, or `keeper`?

Kernel scores nominate. Human verdicts are bedrock.

## Feedback Scale

- `dead` - not useful, not worth revisiting.
- `obvious` - true or plausible but already in the visible case.
- `interesting` - worth thinking about.
- `investigate` - worth a follow-up search, case split, or falsification test.
  The button marks intent; it does not start investigation work.
- `keeper` - strong enough to preserve as a candidate insight.

When served by `pnpm serve`, verdict buttons append events to
`records/assay-judgments/judgments.jsonl`. The JSONL is local judgment data and
is ignored by git unless deliberately promoted. The local Review Digest collapses
repeated clicks to the latest verdict per reviewer and target. Run `pnpm serve`
and use `/review`; the digest generator is an implementation detail behind that
route.
