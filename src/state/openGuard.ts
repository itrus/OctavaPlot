/**
 * What to do with a file that has been read for Open. "drop": a later Open started meanwhile, which now owns the screen. "ask":
 * the project was edited after the discard was confirmed, so the discard must be confirmed again. "replace": nothing came between.
 */
export function openDecision(s: { token: number; latest: number; base: unknown; present: unknown }): 'drop' | 'ask' | 'replace' {
  if (s.token !== s.latest) return 'drop';
  return s.present !== s.base ? 'ask' : 'replace';
}
