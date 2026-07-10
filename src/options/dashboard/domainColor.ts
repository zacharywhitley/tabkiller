/**
 * Deterministic domain -> color mapping.
 *
 * Extracted from `src/options/debug/tabTreeLayout.ts` so the dashboard's
 * timeline and node-graph views can share the same palette. Same domain
 * always draws the same color across views, and colors are stable across
 * reloads because the underlying hash is deterministic.
 */

export interface DomainColor {
  fill: string;
  border: string;
  text: string;
}

// 8 muted category colors: blue, teal, green, yellow, orange, pink,
// purple, grey. Chosen so no single domain visually dominates a dense
// session and 12-14px title text stays legible against `fill`.
export const DOMAIN_PALETTE: readonly DomainColor[] = [
  { fill: '#dbe7f5', border: '#5b7fa3', text: '#1a2a3d' }, // blue
  { fill: '#d3ebe6', border: '#4f8a80', text: '#173730' }, // teal
  { fill: '#dbe9d1', border: '#6a8a55', text: '#2a361b' }, // green
  { fill: '#f0e5c2', border: '#a08a3f', text: '#3d3311' }, // yellow
  { fill: '#f2d9c1', border: '#a8703a', text: '#3d200f' }, // orange
  { fill: '#efd5df', border: '#a35d78', text: '#3d1a26' }, // pink
  { fill: '#e2d5ef', border: '#7b5aa3', text: '#25153d' }, // purple
  { fill: '#dedede', border: '#6f6f6f', text: '#2b2b2b' }, // grey
] as const;

// FNV-1a 32-bit. Same input -> same 32-bit index every time.
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

export function colorForDomain(hostname: string): DomainColor {
  const idx = fnv1a(hostname.toLowerCase()) % DOMAIN_PALETTE.length;
  return DOMAIN_PALETTE[idx]!;
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
