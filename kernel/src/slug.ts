// SlugId: a deterministic, link-safe id of the form `${slug}-${shortHash(name)}`.
// One source of truth for node/field ids across the kernel. Deterministic from the name,
// so the same headline always compiles to the same vault path (agarden-compatible).

export function shortHash(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) h = ((h << 5) + h + value.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0').slice(0, 8);
}

export function slugId(name: string): string {
  const slug =
    (name || 'untitled')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled';
  return `${slug}-${shortHash(name)}`;
}
