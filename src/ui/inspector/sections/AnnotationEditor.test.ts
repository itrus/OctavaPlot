import { describe, expect, it } from 'vitest';
import { chartTextLook, createAnnotation, createChart } from '../../../model/defaults';
import { stepFontSize, wrapScript } from './AnnotationEditor';

describe('text annotation helpers', () => {
  it('makes a new text "Text" as large as the axis numbers, in the chart text colour and bold, kept on the page', () => {
    const chart = createChart('t');
    const a = createAnnotation(chartTextLook({ ...chart, textColor: '#333333' }), 1.4, -0.2, 'n1');
    expect(a).toEqual({ id: 'n1', text: 'Text', xFrac: 0.98, yFrac: 0, fontSizePt: chart.xAxis.tickFontSizePt, color: '#333333', opacity: 1, bold: true });
  });
  it('steps the font size through the usual sizes', () => {
    expect(stepFontSize(12, 1)).toBe(14);
    expect(stepFontSize(12, -1)).toBe(11);
    expect(stepFontSize(13, 1)).toBe(14);
    expect(stepFontSize(13, -1)).toBe(12);
    expect(stepFontSize(40, 1)).toBe(40);
    expect(stepFontSize(6, -1)).toBe(6);
  });
  it('wraps the selected letters in a script, or writes an empty one with the cursor inside', () => {
    expect(wrapScript('m2', 1, 2, '^')).toEqual({ text: 'm^{2}', start: 3, end: 4 });
    expect(wrapScript('H2O', 1, 2, '_')).toEqual({ text: 'H_{2}O', start: 3, end: 4 });
    expect(wrapScript('x', 1, 1, '^')).toEqual({ text: 'x^{}', start: 3, end: 3 });
  });
});
