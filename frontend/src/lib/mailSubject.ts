/** Sujet sans les « Re: », « Fwd: », « TR: »… du début, en minuscules : sert à regrouper les courriels d'une même conversation (même règle que le serveur). */
export function normalizeSubject(subject: string): string {
  let s = String(subject ?? '').trim();
  for (let i = 0; i < 10; i++) {
    const next = s.replace(/^\s*(re|fwd?|tr|rép|rep|aw|wg)\s*(\[\d+\])?\s*:\s*/i, '');
    if (next === s) break;
    s = next;
  }
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}
