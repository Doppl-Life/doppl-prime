# MarkScript

MarkScript is a framework for typing markdown files without killing the markdown.

The premise: the markdown file is the authored artifact. A human reads it directly; a service parses it into a typed shape. The TypeScript does not replace the markdown — it states what must be recoverable from it. A MarkScript contract is the meeting point of three readers: a human reading prose, a parser finding headings and payloads, and a validator rejecting drift.

## The standard library

The structural types every contract builds from are defined here. This file owns them; a contract uses them by importing `@markscript.md` (see [Ownership and references](#ownership-and-references)), never by redeclaring them.

```ts
type MarkdownFile<Frontmatter, Body> = { frontmatter: Frontmatter; body: Body };
type MarkdownSection<Heading extends string, Body> = { heading: Heading; body: Body };
type MarkdownSubsection<Heading extends string, Body> = MarkdownSection<Heading, Body>;
type NonEmptyArray<T> = [T, ...T[]];
type SlugId = string; // `{slug}-{shortId}`; a stable, link-safe id
type Iso8601 = string;
```

`MarkdownFile`, `MarkdownSection`, and `MarkdownSubsection` are the backbone. Everything a contract describes is a file decomposed into sections, decomposed into subsections, bottoming out in typed payloads.

### Headings are the parse key

The `Heading` parameter is a string-literal type carrying the **exact heading text** the parser matches on, including its `#` level:

```ts
type Summary = MarkdownSection<'## Summary', SummaryBody>;
type Takeaway = MarkdownSubsection<'### Takeaway', string>;
```

Two rules follow:

- **Heading text is load-bearing.** `'### Takeaway'` is not documentation — it is the literal a parser scans for and a validator checks. Renaming the heading changes the contract.
- **Heading level encodes depth.** `#` to `######` map to nesting depth. A `MarkdownSection` at `##` contains `MarkdownSubsection`s at `###`; the level is how a parser knows where a section ends and a child begins.

Template-literal headings type a family of headings whose text varies but whose shape is fixed:

```ts
type StepHeading = `#### Step ${number}`;
type Entry = MarkdownSubsection<`### ${string}`, EntryBody>;
```

## Section forms

A MarkScript section comes in two forms. Use the form that matches whether the artifact is rendered for a human.

**Three-layer** — for a rendered markdown artifact a human reads. Three parts, in order:

- *meaning*: what the section is for, in prose;
- *markdown shape*: what the rendered artifact looks like, in a fenced example;
- *type contract*: what a parser or validator must recover.

````markdown
## Summary

Summary states the one-line takeaway, then any supporting detail.

### Markdown shape

```markdown
## Summary

### Takeaway

Ship the smallest reversible change first.
```

### Type contract

```ts
type SummaryBody = {
  takeaway: MarkdownSubsection<'### Takeaway', string>;
};
```
````

**Two-layer** — for a machine shape that is never rendered as a markdown artifact (a config blob, an API response, an internal message passed between steps). Drop the markdown-shape layer; keep meaning and type contract. A two-layer section still names a real parsed shape — it just has no human-facing rendering to show.

Pick by the artifact: if a human opens the file and reads it, it is three-layer; if only a machine ever holds it, it is two-layer.

## Composition vocabulary

How to type the payloads markdown actually carries:

- **Prose** → `string`. One subsection of explanatory text is one `string`.
- **List** → `string[]` for a homogeneous bullet list; `NonEmptyArray<T>` when at least one item is required; `T[]` of a structured type when each bullet has internal shape.
- **Optional field** → `?:`. A subsection that may be absent is optional; one that must render is required. This distinction is the contract.
- **Enum** → a union of string literals: `type Severity = 'info' | 'warning' | 'error'`.
- **Variant** → a **discriminated union on a literal field**. When an artifact takes several shapes selected by one value, make that value a literal-typed field and union the variants:

```ts
type BlockKind = 'paragraph' | 'list' | 'code';

type BaseBlock<K extends BlockKind, Body> = {
  kind: K;
  body: Body;
};

type ParagraphBlock = BaseBlock<'paragraph', string>;
type ListBlock = BaseBlock<'list', string[]>;
type CodeBlock = BaseBlock<'code', { lang: string; source: string }>;

type Block = ParagraphBlock | ListBlock | CodeBlock;
```

The `kind` field discriminates; a parser reads it once and knows which variant to expect.

## Information vs definition

Every sentence in a contract earns its place as either information or definition.

Definition names a thing: `Block` is the union of paragraph, list, and code blocks.

Information explains behavior: a parser reads a block's `kind` once and knows which body shape follows.

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

## Ownership and references

One concept gets one owner. A type is declared in exactly one file; every other file imports it.

An import in MarkScript is an `@`-reference to the owning file: a soft link the reader follows, not a compiled resolution — the same way one instruction file pulls in another with an `@`-mention. To use a type another contract owns, `@` its file and use the type by name. The structural standard library above is owned by this file, reached with `@markscript.md`.

Imports live in an **External contracts** section near the top of the consuming file. It lists each `@`-referenced file and what the contract uses from it; the body then uses those names without redeclaring them.

```markdown
## External contracts

This contract imports shapes owned elsewhere. It does not redefine them.

- [@markscript.md](./markscript.md) — the structural standard library.
- [@blocks.md](./blocks.md) owns `Block` and `BlockKind`.
- [@frontmatter.md](./frontmatter.md) owns the frontmatter shape.
```

When two files declare the same type with different shapes, that is drift. Collapse it to one owner.

## The test

A MarkScript section is working when three readers can use it without asking for the rest of the conversation:

- a human can read the markdown and understand the artifact;
- a parser can find the required headings and payloads;
- a validator can reject drift without interpreting vibes.

If it only helps one of those readers, it is not MarkScript yet.

---

## Authoring conventions

These are optional house style, not part of the framework. A project can adopt its own or none; the two below are a sane default and are kept separate so the framework above stays portable.

**Build down.** Put primitives and precursors first, then base forms, then concrete variants, then the final union or exported shape at the bottom. The reader should feel the thing being assembled. Do not open with a negation like `NonCodeBlock` when the real concept is `BaseBlock` plus concrete blocks.

**Soft wrap, not hard wrap.** One paragraph is one source line unless there is a semantic reason to break it. Markdown already wraps visually; hard-wrapped prose makes the source artifact worse.

Good:

```markdown
A section's heading is part of its contract because the parser and the validator both key on the exact text.
```

Bad:

```markdown
A section's heading is part of its contract because the parser and the validator
both key on the exact text.
```
