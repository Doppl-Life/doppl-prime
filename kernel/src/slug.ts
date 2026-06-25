// SlugId: a deterministic, link-safe id of the form `${slug}-${shortHash(name)}`.
// One source of truth for node/field ids across the kernel. Deterministic from the name,
// so the same headline always compiles to the same vault path (agarden-compatible).

export function shortHash(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) h = ((h << 5) + h + value.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0').slice(0, 8);
}

// `seed` controls the hash suffix; it defaults to `name`. Pass a distinct seed to disambiguate two
// nodes that share a name — e.g. a run's case_study and problem_recovery when a weak model echoes the
// title — so each still resolves to its own stable vault path instead of overwriting the other.
export function slugId(name: string, seed: string = name): string {
  const slug =
    (name || 'untitled')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled';
  return `${slug}-${shortHash(seed)}`;
}
