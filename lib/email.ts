export function parseEmail(input: string): { local: string; domain: string } | null {
  const email = input.trim();
  // Basic RFC 5322 compliant-ish email regex (still not perfect, but practical)
  const re = /^(?:[a-zA-Z0-9_!#$%&'*+\-/=?^`{|}~.]+)@([a-zA-Z0-9.-]+)$/;
  const match = email.match(re);
  if (!match) return null;
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain) return null;
  // Disallow leading/trailing dots or double dots in local and domain for practicality
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  if (domain.startsWith('-') || domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return null;
  return { local, domain: domain.toLowerCase() };
}

