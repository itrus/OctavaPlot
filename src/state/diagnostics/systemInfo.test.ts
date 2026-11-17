import { describe, expect, it } from 'vitest';
import { detectBrowser } from './systemInfo';

describe('detectBrowser', () => {
  it('prefers the specific brand over Chromium, ignores the decoy brand, and judges Edge by its row', () => {
    const brands = [{ brand: 'Not.A/Brand', version: '99' }, { brand: 'Chromium', version: '131' }, { brand: 'Microsoft Edge', version: '131' }];
    expect(detectBrowser({ userAgentData: { brands } })).toEqual({ text: 'Microsoft Edge 131', family: 'Edge', supported: true });
  });
  it('judges another Chromium-based browser by its engine', () => {
    const brands = [{ brand: 'Chromium', version: '110' }, { brand: 'Brave', version: '1' }];
    expect(detectBrowser({ userAgentData: { brands } })).toEqual({ text: 'Brave 1', family: 'Chromium', supported: false });
  });
  it('falls back to the user-agent text', () => {
    expect(detectBrowser({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0' })).toEqual({ text: 'Firefox 130', family: 'Firefox', supported: true });
    expect(detectBrowser({ userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/605 Version/17.4 Safari/605' })).toEqual({ text: 'Safari 17.4', family: 'Safari', supported: true });
    expect(detectBrowser({ userAgent: 'Mozilla/5.0 Chrome/131.0.0.0 Safari/537 Edg/131.0.0.0' }).family).toBe('Edge');
    expect(detectBrowser({ userAgent: 'Mozilla/5.0 Chrome/131.0.0.0 Safari/537' }).family).toBe('Chrome');
  });
  it('compares the minor version of Safari and rejects an old browser', () => {
    expect(detectBrowser({ userAgent: 'Mozilla/5.0 Version/16.3 Safari/605' }).supported).toBe(false);
    expect(detectBrowser({ userAgent: 'Mozilla/5.0 Version/16.4 Safari/605' }).supported).toBe(true);
    expect(detectBrowser({ userAgent: 'Mozilla/5.0 Firefox/113.0' }).supported).toBe(false);
  });
  it('says unknown when nothing matches', () => {
    expect(detectBrowser({})).toEqual({ text: 'unknown', family: null, supported: null });
  });
});
