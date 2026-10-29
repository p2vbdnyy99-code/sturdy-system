// Where to go after signing in, from the login page's ?next= parameter.
// Only a path on this site is accepted: it must start with one "/" and not
// "//" or "/\" (which browsers treat as another site), so a link to the login
// page can never send someone elsewhere after they sign in.
export function safeNextPath(search: string, fallback = '/dashboard'): string {
  const next = new URLSearchParams(search).get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  // Control characters (a newline can turn into //example.com once removed).
  if ([...next].some((c) => c.charCodeAt(0) < 0x20)) return fallback;
  return next;
}
