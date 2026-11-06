// Features 113 + 112: chart colors come from the --color-* theme tokens at render time (no hex literals).
export function cssToken(name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();
  return raw || fallback;
}
