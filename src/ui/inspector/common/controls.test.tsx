import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Check, ColorInput, Field, FieldInput, NumField, OptionalNumField, SectionBar, SelectInput, TabBar, TextInput } from './controls';

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

/** Every input, select, textarea and button in the markup, with what names it. */
function unnamed(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<(input|select|textarea|button)\b([^>]*)>/g)) {
    const attrs = m[2];
    if (/type="hidden"/.test(attrs)) continue;
    const labelled = /aria-labelledby="([^"]+)"/.exec(attrs);
    const id = /\bid="([^"]+)"/.exec(attrs);
    const named =
      /aria-label="[^"]+"/.test(attrs) ||
      (labelled !== null && labelled[1].split(' ').every((l) => html.includes(`id="${l}"`))) ||
      (id !== null && html.includes(`for="${id[1]}"`));
    if (!named) out.push(m[0]);
  }
  return out;
}

const none = () => undefined;

describe('every control has an accessible name', () => {
  it('names the field components inside a Field', () => {
    const html = renderToStaticMarkup(
      <>
        <Field label="Colour"><ColorInput value="#000000" onChange={none} /></Field>
        <Field label="Shape"><SelectInput value="a" options={[{ value: 'a', label: 'A' }]} onChange={none} /></Field>
        <Field label="Title"><TextInput value="" onChange={none} /></Field>
        <Field label="Show"><Check checked onChange={none} /></Field>
        <NumField label="Width" value={1} min={0} max={5} onCommit={none} />
        <NumField label="Gap" value={1} min={0} max={5} slider={false} onCommit={none} />
      </>,
    );
    expect(unnamed(html)).toEqual([]);
    expect(html).toContain('aria-label="Width slider"');
  });

  it('a slider covers the range given for it, not the whole limit, and moves in the step given', () => {
    const html = renderToStaticMarkup(<NumField label="Thickness" value={1} min={0.2} max={20} sliderMax={10} step={0.2} onCommit={none} />);
    expect(html).toMatch(/<input[^>]*type="range"[^>]*>/);
    const range = /<input[^>]*type="range"[^>]*>/.exec(html)![0];
    expect(range).toContain('min="0.2"');
    expect(range).toContain('max="10"');
    expect(range).toContain('step="0.2"');
    // The box still takes a value up to the limit.
    expect(html).not.toContain('Must be at most');
  });

  it('names the optional number box and its Auto toggle after what they belong to', () => {
    const html = renderToStaticMarkup(<OptionalNumField label="Y minimum" value={null} onCommit={none} />);
    expect(unnamed(html)).toEqual([]);
    expect(html).toContain('aria-label="Y minimum"');
    expect(html).toContain('aria-label="Automatic Y minimum"');
  });

  it('names a control outside a Field through ariaLabel', () => {
    const html = renderToStaticMarkup(
      <>
        <SelectInput ariaLabel="Delimiter" value="a" options={[{ value: 'a', label: 'A' }]} onChange={none} />
        <TextInput ariaLabel="Unit" value="" onChange={none} />
      </>,
    );
    expect(unnamed(html)).toEqual([]);
  });

  it('flags a control that has no name (the check itself works)', () => {
    expect(unnamed('<input type="text"/>')).toHaveLength(1);
  });
});

describe('field messages', () => {
  it('points the control at an error and a note that exist, and marks it invalid', () => {
    const html = renderToStaticMarkup(
      <Field label="Level" error="Too big" note="A percentage">
        <FieldInput value="" onChange={none} />
      </Field>,
    );
    const described = /aria-describedby="([^"]+)"/.exec(html)![1].split(' ');
    expect(described).toHaveLength(2);
    for (const id of described) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(/role="alert"[^>]*>Too big|id="[^"]+-error" role="alert">Too big/);
  });

  it('adds no description or invalid mark, and no alert, without an error', () => {
    const html = renderToStaticMarkup(
      <Field label="Level">
        <FieldInput value="" onChange={none} />
      </Field>,
    );
    expect(html).not.toContain('aria-invalid');
    expect(html).not.toContain('aria-describedby');
    expect(html).not.toContain('role="alert"');
  });

  it('keeps ids unique when two fields share a page', () => {
    const html = renderToStaticMarkup(
      <>
        <Field label="A" error="e" note="n" hint="h"><FieldInput value="" onChange={none} /></Field>
        <Field label="B" error="e" note="n" hint="h"><FieldInput value="" onChange={none} /></Field>
        <OptionalNumField label="C" value={1} onCommit={none} />
        <OptionalNumField label="D" value={1} onCommit={none} />
      </>,
    );
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(8);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('tab lists', () => {
  const tabs = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }];

  it('makes only the selected tab a tab stop', () => {
    const html = renderToStaticMarkup(<TabBar tabs={tabs} value="b" onChange={none} />);
    expect(html).toContain('role="tablist"');
    const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    expect(buttons.map((b) => /tabindex="(-?\d)"/.exec(b)![1])).toEqual(['-1', '0', '-1']);
    expect(buttons.map((b) => /aria-selected="(\w+)"/.exec(b)![1])).toEqual(['false', 'true', 'false']);
    expect(unnamed(html.replace(/<button\b/g, '<button aria-label="x"'))).toEqual([]);
  });

  it('does the same for the section bar', () => {
    const html = renderToStaticMarkup(<SectionBar sections={tabs} value="a" onChange={none} />);
    expect([...html.matchAll(/tabindex="(-?\d)"/g)].map((m) => m[1])).toEqual(['0', '-1', '-1']);
  });
});

describe('Field note', () => {
  it('renders a note under the control', () => {
    const out = renderToStaticMarkup(<Field label="Fill" note="Bars are hidden.">x</Field>);
    expect(out).toContain('class="field-note"');
    expect(out).toContain('Bars are hidden.');
  });
  it('renders nothing without a note', () => {
    expect(renderToStaticMarkup(<Field label="Fill" note={null}>x</Field>)).not.toContain('field-note');
  });
  it('NumField passes its note through', () => {
    const out = renderToStaticMarkup(<NumField label="Opacity" value={1} onCommit={() => undefined} note="No effect." />);
    expect(out).toContain('No effect.');
  });
});

describe('Check and ColorInput accessibility', () => {
  it('sets aria-label and title', () => {
    const c = renderToStaticMarkup(<Check checked onChange={() => undefined} ariaLabel="Fill with a pattern" title="Pattern" />);
    expect(c).toContain('aria-label="Fill with a pattern"');
    expect(c).toContain('title="Pattern"');
    const k = renderToStaticMarkup(<ColorInput value="#000000" onChange={() => undefined} ariaLabel="Pattern color" />);
    expect(k).toContain('aria-label="Pattern color"');
  });
  it('omits the attributes when not given', () => {
    expect(renderToStaticMarkup(<Check checked={false} onChange={() => undefined} />)).not.toContain('aria-label');
  });
});
