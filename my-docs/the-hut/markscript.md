# MarkScript

MarkScript is a framework for typing markdown files without killing the markdown.

The premise: the markdown file is the authored artifact. A human should be able to read it directly, and a service should be able to parse it into a typed shape. The TypeScript does not replace the markdown; it states what must be recoverable from it.

## The shape

A MarkScript section has three layers:

- meaning: what this section is for;
- markdown shape: what the rendered artifact looks like;
- TypeScript contract: what a parser or validator must recover.

````markdown
## Growth

Growth is the current stage at full fidelity: what the node concluded.

### Markdown shape

```markdown
## Growth — Doppl

### Claim

Own the refining bottleneck, not the lithium.
```

### Type contract

```ts
type DopplGrowth = {
  claim: MarkdownSubsection<'### Claim', string>;
};
```
````

## Build down

MarkScript builds down, not up. Put primitives and precursors first, then base forms, then concrete variants, then the final union or exported shape at the bottom.

```ts
type Stage = 'case_study' | 'problem_recovery' | 'doppl';

type BaseStage<S extends Stage, Next extends Stage | null> = {
  stage: S;
  next: Next;
};

type CaseStudyStage = BaseStage<'case_study', 'problem_recovery'>;
type ProblemRecoveryStage = BaseStage<'problem_recovery', 'doppl'>;
type DopplStage = BaseStage<'doppl', null>;

type StageContract = CaseStudyStage | ProblemRecoveryStage | DopplStage;
```

The reader should feel the thing being assembled. Do not start with a negation like `NonSeedBody` when the actual concept is `BaseBody` plus concrete bodies.

## Information vs definition

Every sentence in a contract doc should earn its place as either information or definition.

Definition names a thing: `GrowthStage` is the subset of stages that render `## Growth`.

Information explains behavior: Trace copies prior synopses verbatim in spine order.

History is neither. A contract is not the place for retired terms, rejected approaches, old names, or paths not taken.

## Type discipline

If a type does not constrain anything, connect anything, or name a real parsed shape, delete it.

Bad:

```ts
type ContractAttempt = unknown;
```

Good:

```ts
type MarkdownSection<Heading extends string, Body> = {
  heading: Heading;
  body: Body;
};
```

`never` is allowed only when it does real type work. It is not a gravestone for things the contract refuses to store.

## Source shape matters

Prose uses soft wrap, not hard wrap. One paragraph is one source line unless there is a semantic reason to break it.

Good:

```markdown
The judge axis names are primitive because the measurement bridge and the rendered Evaluation section both build from them.
```

Bad:

```markdown
The judge axis names are primitive because the measurement bridge and the rendered
Evaluation section both build from them.
```

Markdown already wraps visually. Hard-wrapped prose makes the source artifact worse.

## Ownership

One concept gets one owner.

If `rating.md` owns `Rating`, `RatingLabel`, and `EvaluationSection`, then `node.md` should reference those contracts instead of restating them. If `node.md` owns `Stage` and file shape, rating should not silently fork those ideas.

Duplication is allowed only while prototyping, and it should be treated as debt to collapse once the owner is clear.

## The test

A MarkScript section is working when three readers can use it without asking for the rest of the conversation:

- a human can read the markdown and understand the artifact;
- a parser can find the required headings and payloads;
- a validator can reject drift without interpreting vibes.

If it only helps one of those readers, it is not MarkScript yet.
