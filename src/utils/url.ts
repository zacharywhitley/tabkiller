/**
 * URL normalization for stable `Page` identity in the browsing graph.
 *
 * Tracking-param allowlist below is the single source of truth for
 * strippable query keys. Extend it here — do not maintain a parallel
 * list elsewhere.
 */

const TRACKING_PARAMS: ReadonlySet<string> = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  '_ga',
  'ref',
  'ref_src',
  'igshid',
  'mkt_tok',
  'yclid',
  'vero_id',
  '_hsenc',
  '_hsmi',
  'hsCtaTracking',
]);

let fragmentAllowlist: Map<string, boolean> = new Map();

export function setFragmentAllowlist(allowlist: Map<string, boolean>): void {
  fragmentAllowlist = new Map(allowlist);
}

export function getFragmentAllowlist(): Map<string, boolean> {
  return new Map(fragmentAllowlist);
}

function lowercasePercentHex(value: string): string {
  return value.replace(/%[0-9A-Fa-f]{2}/g, (m) => m.toLowerCase());
}

export function normalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch (error) {
    console.warn('normalizeUrl: malformed URL, returning raw input', {
      raw,
      error: error instanceof Error ? error.message : String(error),
    });
    return raw;
  }

  for (const param of TRACKING_PARAMS) {
    url.searchParams.delete(param);
  }

  url.searchParams.sort();

  if (!fragmentAllowlist.get(url.hostname)) {
    url.hash = '';
  }

  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return lowercasePercentHex(url.toString());
}
