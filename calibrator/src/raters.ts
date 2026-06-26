export function normalizeRaterEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAllowedRater(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeRaterEmail(email));
}
