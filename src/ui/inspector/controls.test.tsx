import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Check, Field, InspectorSearchContext, NumField, Section } from './controls';

const panel = (query: string) =>
  renderToStaticMarkup(
    <InspectorSearchContext.Provider value={query}>
      <Section title="Text" defaultOpen={false}>
        <Field label="Title size" hint="Size of the chart title">
          <Check checked onChange={() => undefined} />
        </Field>
        <Field label="Colour">
          <Check checked onChange={() => undefined} />
        </Field>
      </Section>
    </InspectorSearchContext.Provider>,
  );

describe('inspector search', () => {
  it('shows every setting for an empty search, but a folded section stays folded', () => {
    expect(panel('')).not.toContain('Title size');
  });
  it('opens folded sections and shows only the settings that match the label or the hint', () => {
    const html = panel('size');
    expect(html).toContain('Title size');
    expect(html).not.toContain('Colour');
    expect(panel('chart title')).toContain('Title size');
  });
});

describe('field accessibility', () => {
  it('ties the label, the note and the error to the control', () => {
    const html = renderToStaticMarkup(<NumField label="Line width" unit="pt" value={1} min={0} max={5} note="Why" onCommit={() => undefined} />);
    expect(html).toMatch(/aria-label="Line width"/);
    const check = renderToStaticMarkup(
      <Field label="Show title" hint="Writes the title" error="Bad" note="Note">
        <Check checked onChange={() => undefined} />
      </Field>,
    );
    const label = /id="([^"]+-label)"/.exec(check)![1];
    expect(check).toContain(`aria-labelledby="${label}"`);
    expect(check).toMatch(/aria-describedby="[^"]*-error[^"]*-note[^"]*-hint"/);
    expect(check).toContain('aria-invalid="true"');
  });
});
