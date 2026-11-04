import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SYMBOL_SHAPES } from '../../../model/graph/look';
import { SymbolGrid, SymbolPicker } from './SymbolPicker';

describe('the symbol picker', () => {
  it('offers every shape, and marks the one in use as the checked choice', () => {
    const html = renderToStaticMarkup(<SymbolGrid shape="star" open={false} onPick={() => undefined} />);
    for (const o of SYMBOL_SHAPES) expect(html, o.value).toContain(`title="${o.label}`);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(/title="Star"[^>]*>/.exec(html)![0]).toBeTruthy();
  });
  it('shows an open shape as open, and names it on the button', () => {
    const html = renderToStaticMarkup(<SymbolPicker shape="square" fillOpacity={0} onChange={() => undefined} />);
    expect(html).toContain('Square (open)');
  });
});
