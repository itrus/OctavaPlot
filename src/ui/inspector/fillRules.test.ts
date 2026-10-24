import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../../model/defaults';
import type { ChartStyle } from '../../model/types';
import {
  DEFAULT_PATTERN_BACKGROUND,
  backgroundDisplay,
  backgroundNonePatch,
  datasetSwatch,
  fillRowNote,
  followBorderPatch,
  opacityNote,
  patternColorDisplay,
  spacingError,
  togglePatternPatch,
  widthError,
  widthLabel,
} from './fillRules';

const style = (patch: Partial<ChartStyle> = {}): ChartStyle => ({ ...DEFAULT_STYLE, showBars: true, ...patch });

describe('spacing and width rules', () => {
  it('accepts values inside the limits and the cross rule', () => {
    expect(spacingError(8, 1)).toBeNull();
    expect(widthError(1, 8, 'horizontal')).toBeNull();
    expect(spacingError(2, 2)).toBeNull();
  });
  it('labels the P limit', () => {
    expect(spacingError(1, 0.2)).toContain('P limit');
    expect(spacingError(120, 1)).toContain('P limit');
    expect(widthError(12, 100, 'horizontal')).toContain('P limit');
    expect(widthError(0.1, 8, 'horizontal')).toContain('P limit');
  });
  it('rejects non-positive and non-finite values', () => {
    expect(spacingError(0, 1)).toContain('positive');
    expect(widthError(Number.NaN, 8, 'dots')).toContain('positive');
  });
  it('enforces the spacing and width cross rule both ways', () => {
    expect(spacingError(4, 6)).toContain('at least');
    expect(widthError(6, 4, 'horizontal')).toContain('Line width must not exceed');
    expect(widthError(6, 4, 'dots')).toContain('Dot diameter must not exceed');
  });
  it('labels the width control by pattern', () => {
    expect(widthLabel('dots')).toBe('Dot diameter');
    expect(widthLabel('crosshatch')).toBe('Line width');
  });
});

describe('patches', () => {
  it('toggles the pattern mode', () => {
    expect(togglePatternPatch(true)).toEqual({ barFillMode: 'pattern' });
    expect(togglePatternPatch(false)).toEqual({ barFillMode: 'solid' });
  });
  it('follows or freezes the border colour', () => {
    expect(followBorderPatch(true, '#112233')).toEqual({ barPatternColor: null });
    expect(followBorderPatch(false, '#112233')).toEqual({ barPatternColor: '#112233' });
  });
  it('switches the background to None and back to white', () => {
    expect(backgroundNonePatch(true)).toEqual({ barPatternBackground: null });
    expect(backgroundNonePatch(false)).toEqual({ barPatternBackground: DEFAULT_PATTERN_BACKGROUND });
  });
});

describe('display helpers', () => {
  it('shows the border colour while the pattern colour follows it', () => {
    expect(patternColorDisplay(style({ barBorderColor: '#336699', barPatternColor: null }))).toBe('#336699');
    expect(patternColorDisplay(style({ barBorderColor: '#336699', barPatternColor: '#ff0000' }))).toBe('#ff0000');
  });
  it('shows the default background when transparent', () => {
    expect(backgroundDisplay({ barPatternBackground: null })).toBe('#ffffff');
    expect(backgroundDisplay({ barPatternBackground: '#eeeeee' })).toBe('#eeeeee');
  });
  it('explains disabled controls and invisible patterns', () => {
    expect(fillRowNote(style({ showBars: false }))).toBe('Bars are hidden.');
    expect(fillRowNote(style({ barFillMode: 'solid' }))).toContain('Choose Pattern');
    expect(fillRowNote(style({ barFillMode: 'pattern' }))).toBeNull();
    expect(fillRowNote(style({ barFillMode: 'pattern', barBorderColor: '#ffffff', barPatternBackground: '#ffffff' }))).toContain('not visible');
  });
  it('explains what opacity acts on', () => {
    expect(opacityNote(style({ barFillMode: 'solid' }))).toBeNull();
    expect(opacityNote(style({ barFillMode: 'none' }))).toContain('no effect');
    expect(opacityNote(style({ barFillMode: 'pattern' }))).toContain('not to the border');
    expect(opacityNote(style({ showBars: false, barFillMode: 'pattern' }))).toBeNull();
  });
});

describe('datasetSwatch', () => {
  it('keeps the solid fill for solid bars', () => {
    const sw = datasetSwatch(style({ barFill: '#abcdef' }));
    expect(sw).toMatchObject({ background: '#abcdef', backgroundImage: null, title: null });
  });
  it('uses the symbol colour when bars are hidden', () => {
    expect(datasetSwatch(style({ showBars: false, symbolColor: '#123456' })).background).toBe('#123456');
  });
  it('hints the hatch for pattern fills', () => {
    const sw = datasetSwatch(style({ barFillMode: 'pattern', barPattern: 'dots', barPatternBackground: null, barBorderColor: '#222222' }));
    expect(sw.background).toBe('transparent');
    expect(sw.backgroundImage).toContain('#222222');
    expect(sw.title).toBe('Pattern fill: Dots');
  });
  it('shows no fill as transparent', () => {
    expect(datasetSwatch(style({ barFillMode: 'none' }))).toMatchObject({ background: 'transparent', title: 'No fill' });
  });
});

describe('legacy and placement', () => {
  it('treats a style without fill keys as a solid fill', () => {
    const legacy: Record<string, unknown> = { ...style() };
    for (const k of ['barFillMode', 'barPattern', 'barPatternSpacingPt', 'barPatternWidthPt', 'barPatternColor', 'barPatternBackground']) delete legacy[k];
    const s = legacy as unknown as ChartStyle;
    expect(fillRowNote(s)).toContain('Choose Pattern');
    expect(datasetSwatch(s)).toMatchObject({ background: s.barFill, backgroundImage: null });
    expect(patternColorDisplay(s)).toBe(s.barBorderColor);
  });
  it('keeps the pattern controls in the Bars (box, violin) box only', () => {
    const src = readFileSync(new URL('./Inspector.tsx', import.meta.url), 'utf8');
    const start = src.indexOf('<GroupBox title={bodyTitle}');
    const end = src.indexOf('<GroupBox', start + 1);
    expect(start).toBeGreaterThan(0);
    const outside = (src.slice(0, start) + src.slice(end)).replace(/^import[\s\S]*?from '[^']+';$/gm, '');
    expect(outside).not.toMatch(/barPattern\w*:/);
    expect(outside).not.toContain('Fill pattern');
    expect(src.slice(start, end)).toContain('Fill pattern');
  });
});
