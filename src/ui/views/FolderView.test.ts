import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import type { FolderKey, Project } from '../../model/types';
import { AppProvider } from '../../state/AppContext';
import { addAnalysis, addChart, addDataTable, addLayout, renameItem } from '../../state/commands';
import { AUTOSAVE_KEY, stringifyProject } from '../../state/serialize';
import { FolderView } from './FolderView';
import { Navigator } from '../navigator/Navigator';

/** The app opens the autosaved project: give it one that has pages in every folder. */
function project(): Project {
  let p = createExampleProject();
  p = addDataTable('t2', 'xy', { sample: true })(p);
  p = addChart('g2', 't2')(p);
  p = addAnalysis('r1', 't2', 'descriptive')(p);
  p = addLayout('l1')(p);
  p = renameItem('chart', 'g2', 'Time course <b>')(p);
  return p;
}

// Node has an experimental localStorage global that warns when it is read: keep what is there as a descriptor, never read it.
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
beforeEach(() => {
  const text = stringifyProject(project());
  const stub = { getItem: (k: string) => (k === AUTOSAVE_KEY ? text : null), setItem: () => undefined, removeItem: () => undefined };
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true, writable: true });
});
afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
});

const html = (folder: FolderKey) => renderToStaticMarkup(createElement(AppProvider, null, createElement(FolderView, { folder })));
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

describe('the overview of a folder', () => {
  it('shows every page of the folder with a picture, a check box, its name and its number', () => {
    const p = project();
    for (const [folder, items] of [['tables', p.dataTables], ['graphs', p.charts], ['results', p.analyses ?? []], ['layouts', p.layouts ?? []]] as const) {
      const out = html(folder);
      expect(out.split('class="folder-card').length - 1).toBe(items.length);
      expect(out.split('type="checkbox"').length - 1).toBe(items.length);
      expect(out.split('class="folder-thumb"').length - 1).toBe(items.length);
      items.forEach((item, i) => {
        expect(out).toContain(`aria-label="Select ${escape(item.name)}"`);
        expect(out).toContain(`aria-label="Number ${i + 1}"`);
      });
    }
  });

  it('draws the tables as sheets with their values, and the graphs as drawings', () => {
    expect(html('tables')).toContain('thumb-sheet');
    expect(html('tables')).toContain('Group A');
    expect(html('graphs')).toContain('<svg');
    expect(html('layouts')).toContain('thumb-page');
    expect(html('results')).toContain('Descriptive statistics');
  });

  it('tags the tables and the graphs with their kind, as the navigator does', () => {
    expect(html('tables')).toContain('<span class="nav-badge" title="Column table">COL</span>');
    expect(html('tables')).toContain('<span class="nav-badge" title="XY table">XY</span>');
    expect(html('graphs')).toContain('<span class="nav-badge" title="Bar chart">BAR</span>');
    expect(html('graphs')).toContain('<span class="nav-badge" title="XY scatter">SCAT</span>');
    expect(html('results')).not.toContain('nav-badge');
  });

  it('writes a name as text, never as markup', () => {
    expect(html('graphs')).not.toContain('<b>');
    expect(html('graphs')).toContain('Time course &lt;b&gt;');
  });

  it('offers the actions, with the ones that need a selection switched off', () => {
    const out = html('graphs');
    for (const label of ['Select all', 'Open', 'Rename', 'Duplicate', 'Earlier', 'Later', 'Sort A–Z', 'Delete']) expect(out).toContain(label);
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Open/);
    expect(out).toMatch(/<button disabled=""[^>]*><svg[\s\S]*?<\/svg> Delete/);
  });
});

describe('the navigator folders', () => {
  const nav = () => renderToStaticMarkup(createElement(AppProvider, null, createElement(Navigator)));

  it('have a triangle that folds the list and a name that opens the overview, as two controls', () => {
    const out = nav();
    for (const title of ['Data Tables', 'Results', 'Graphs', 'Layouts']) {
      expect(out).toContain(`aria-label="Fold ${title}"`);
      expect(out).toMatch(new RegExp(`<button class="nav-folder"[^>]*>${title}</button>`));
    }
    expect(out.split('aria-expanded="true"').length - 1).toBe(4);
  });

  it('tag the graphs by type beside the tables by kind', () => {
    const out = nav();
    expect(out).toContain('title="Column table">COL</span>');
    expect(out).toContain('title="Bar chart">BAR</span>');
    expect(out).toContain('title="XY scatter">SCAT</span>');
  });
});
