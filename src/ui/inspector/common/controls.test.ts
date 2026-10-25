import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Check, ColorInput, Field, NumField } from './controls';

describe('Field note', () => {
  it('renders a note under the control', () => {
    const out = renderToStaticMarkup(createElement(Field, { label: 'Fill', note: 'Bars are hidden.', children: 'x' }));
    expect(out).toContain('class="field-note"');
    expect(out).toContain('Bars are hidden.');
  });
  it('renders nothing without a note', () => {
    expect(renderToStaticMarkup(createElement(Field, { label: 'Fill', note: null, children: 'x' }))).not.toContain('field-note');
  });
  it('NumField passes its note through', () => {
    const out = renderToStaticMarkup(createElement(NumField, { label: 'Opacity', value: 1, onCommit: () => undefined, note: 'No effect.' }));
    expect(out).toContain('No effect.');
  });
});

describe('Check and ColorInput accessibility', () => {
  it('sets aria-label and title', () => {
    const c = renderToStaticMarkup(createElement(Check, { checked: true, onChange: () => undefined, ariaLabel: 'Fill with a pattern', title: 'Pattern' }));
    expect(c).toContain('aria-label="Fill with a pattern"');
    expect(c).toContain('title="Pattern"');
    const k = renderToStaticMarkup(createElement(ColorInput, { value: '#000000', onChange: () => undefined, ariaLabel: 'Pattern color' }));
    expect(k).toContain('aria-label="Pattern color"');
  });
  it('omits the attributes when not given', () => {
    expect(renderToStaticMarkup(createElement(Check, { checked: false, onChange: () => undefined }))).not.toContain('aria-label');
  });
});
