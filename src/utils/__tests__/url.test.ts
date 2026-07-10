import {
  normalizeUrl,
  setFragmentAllowlist,
  getFragmentAllowlist,
} from '../url';

describe('normalizeUrl', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    setFragmentAllowlist(new Map());
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('case folding', () => {
    it('lowercases uppercase scheme', () => {
      const out = normalizeUrl('HTTPS://example.com/path');
      expect(out).toBe('https://example.com/path');
    });

    it('lowercases uppercase host', () => {
      const out = normalizeUrl('https://EXAMPLE.COM/path');
      expect(out).toBe('https://example.com/path');
    });

    it('lowercases mixed-case host while preserving path case', () => {
      const out = normalizeUrl('https://ExAmPlE.CoM/PATH/Segment');
      expect(out).toBe('https://example.com/PATH/Segment');
    });
  });

  describe('IDN hosts', () => {
    it('converts unicode host to punycode for stable identity', () => {
      const out = normalizeUrl('https://例え.jp/path');
      expect(out).toBe('https://xn--r8jz45g.jp/path');
    });

    it('lowercases punycode host that was uppercase in input', () => {
      const out = normalizeUrl('https://XN--R8JZ45G.JP/path');
      expect(out).toBe('https://xn--r8jz45g.jp/path');
    });
  });

  describe('tracking-param stripping', () => {
    const stripped: [string, string][] = [
      ['utm_source', 'google'],
      ['utm_medium', 'cpc'],
      ['utm_campaign', 'launch'],
      ['utm_term', 'browser'],
      ['utm_content', 'ad1'],
      ['fbclid', 'IwABC123'],
      ['gclid', 'CjwK'],
      ['mc_cid', 'abc'],
      ['mc_eid', 'def'],
      ['_ga', 'GA1.2.1'],
      ['ref', 'newsletter'],
      ['ref_src', 'twsrc'],
      ['igshid', 'MzR'],
      ['mkt_tok', 'eyJ'],
      ['yclid', '123'],
      ['vero_id', 'abc'],
      ['_hsenc', 'p2ANq'],
      ['_hsmi', '87'],
      ['hsCtaTracking', 'x-y'],
    ];

    it.each(stripped)('strips %s from the query', (key, value) => {
      const out = normalizeUrl(`https://example.com/p?${key}=${value}`);
      expect(out).toBe('https://example.com/p');
    });

    it('strips every tracking param in a single URL and preserves others', () => {
      const trackers = stripped.map(([k, v]) => `${k}=${v}`).join('&');
      const out = normalizeUrl(
        `https://example.com/p?keep=1&${trackers}&also=2`
      );
      expect(out).toBe('https://example.com/p?also=2&keep=1');
    });

    it('preserves unknown query params that superficially resemble trackers', () => {
      const out = normalizeUrl(
        'https://example.com/p?utm_customfield=x&reference=y'
      );
      expect(out).toBe('https://example.com/p?reference=y&utm_customfield=x');
    });

    it('is case-sensitive on param keys — UTM_SOURCE is preserved (not in allowlist)', () => {
      const out = normalizeUrl('https://example.com/p?UTM_SOURCE=x');
      expect(out).toBe('https://example.com/p?UTM_SOURCE=x');
    });
  });

  describe('query params — preservation and sorting', () => {
    it('preserves empty-value params', () => {
      const out = normalizeUrl('https://example.com/p?a=&b=1');
      expect(out).toBe('https://example.com/p?a=&b=1');
    });

    it('sorts params by key alphabetically', () => {
      const out = normalizeUrl('https://example.com/p?zebra=1&apple=2&mango=3');
      expect(out).toBe('https://example.com/p?apple=2&mango=3&zebra=1');
    });

    it('preserves relative order of repeated keys after sort', () => {
      const out = normalizeUrl('https://example.com/p?a=1&b=x&a=2');
      expect(out).toBe('https://example.com/p?a=1&a=2&b=x');
    });

    it('preserves value case in query params', () => {
      const out = normalizeUrl('https://example.com/p?Name=Alice');
      expect(out).toBe('https://example.com/p?Name=Alice');
    });
  });

  describe('fragment handling', () => {
    it('strips fragment by default', () => {
      const out = normalizeUrl('https://example.com/p#section-2');
      expect(out).toBe('https://example.com/p');
    });

    it('strips empty fragment (bare #) by default', () => {
      const out = normalizeUrl('https://example.com/p#');
      expect(out).toBe('https://example.com/p');
    });

    it('keeps fragment when host is in per-domain allowlist', () => {
      setFragmentAllowlist(new Map([['app.example.com', true]]));
      const out = normalizeUrl('https://app.example.com/path#/dashboard');
      expect(out).toBe('https://app.example.com/path#/dashboard');
    });

    it('strips fragment when allowlist entry is present but false', () => {
      setFragmentAllowlist(new Map([['app.example.com', false]]));
      const out = normalizeUrl('https://app.example.com/path#/dashboard');
      expect(out).toBe('https://app.example.com/path');
    });

    it('allowlist match is exact hostname — subdomain not implied', () => {
      setFragmentAllowlist(new Map([['example.com', true]]));
      const out = normalizeUrl('https://app.example.com/p#kept');
      expect(out).toBe('https://app.example.com/p');
    });

    it('setFragmentAllowlist replaces the entire allowlist', () => {
      setFragmentAllowlist(new Map([['a.com', true]]));
      setFragmentAllowlist(new Map([['b.com', true]]));
      expect(normalizeUrl('https://a.com/p#x')).toBe('https://a.com/p');
      expect(normalizeUrl('https://b.com/p#x')).toBe('https://b.com/p#x');
    });

    it('getFragmentAllowlist returns a defensive copy — mutating it does not affect internal state', () => {
      setFragmentAllowlist(new Map([['a.com', true]]));
      const snapshot = getFragmentAllowlist();
      snapshot.set('rogue.com', true);
      expect(normalizeUrl('https://rogue.com/p#kept')).toBe(
        'https://rogue.com/p'
      );
    });
  });

  describe('path handling', () => {
    it('strips trailing slash from non-root path', () => {
      const out = normalizeUrl('https://example.com/path/');
      expect(out).toBe('https://example.com/path');
    });

    it('preserves root slash when path is exactly "/"', () => {
      const out = normalizeUrl('https://example.com/');
      expect(out).toBe('https://example.com/');
    });

    it('inserts root slash for URL with no path', () => {
      const out = normalizeUrl('https://example.com');
      expect(out).toBe('https://example.com/');
    });

    it('strips trailing slash from nested path', () => {
      const out = normalizeUrl('https://example.com/a/b/c/');
      expect(out).toBe('https://example.com/a/b/c');
    });
  });

  describe('percent-encoding', () => {
    it('lowercases uppercase hex in path', () => {
      const out = normalizeUrl('https://example.com/%7Euser');
      expect(out).toBe('https://example.com/%7euser');
    });

    it('lowercases uppercase hex in query values', () => {
      const out = normalizeUrl('https://example.com/p?q=a%2Bb');
      expect(out).toBe('https://example.com/p?q=a%2bb');
    });

    it('leaves already-lowercase hex untouched', () => {
      const out = normalizeUrl('https://example.com/%7euser');
      expect(out).toBe('https://example.com/%7euser');
    });
  });

  describe('malformed input', () => {
    it('returns raw input unchanged when URL is unparseable', () => {
      const raw = 'not a real url';
      const out = normalizeUrl(raw);
      expect(out).toBe(raw);
    });

    it('logs a warning when URL is unparseable', () => {
      normalizeUrl('not a real url');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('malformed URL'),
        expect.objectContaining({ raw: 'not a real url' })
      );
    });

    it('does not throw on malformed input', () => {
      expect(() => normalizeUrl('http://')).not.toThrow();
      expect(() => normalizeUrl('')).not.toThrow();
      expect(() => normalizeUrl('://missing-scheme')).not.toThrow();
    });

    it('returns empty string unchanged for empty input', () => {
      const out = normalizeUrl('');
      expect(out).toBe('');
    });
  });

  describe('miscellaneous shapes', () => {
    it('preserves port when non-default', () => {
      const out = normalizeUrl('https://example.com:8443/api');
      expect(out).toBe('https://example.com:8443/api');
    });

    it('preserves userinfo (user:pass@) in the URL', () => {
      const out = normalizeUrl('https://alice:secret@example.com/p');
      expect(out).toBe('https://alice:secret@example.com/p');
    });

    it('handles combined normalization end-to-end', () => {
      setFragmentAllowlist(new Map());
      const out = normalizeUrl(
        'HTTPS://Example.COM/API/%7Efoo/?utm_source=x&z=1&a=2&fbclid=y#hash'
      );
      expect(out).toBe('https://example.com/API/%7efoo?a=2&z=1');
    });
  });
});
