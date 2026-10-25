import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Check, Field, NumField } from './controls';

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
