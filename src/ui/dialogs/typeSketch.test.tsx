import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { availableItems, galleryItems } from '../../model/graph/chartGallery';
import { CHART_TYPES } from '../../model/graph/chartTypes';
import { GallerySketch, TypeSketch } from './GallerySketches';

describe('the thumbnails of the chart types', () => {
  const markup = (type: (typeof CHART_TYPES)[number]['type']) => renderToStaticMarkup(<TypeSketch type={type} />);

  it('draw every chart type in a way of its own: none falls back to the sketch of another', () => {
    const seen = new Map<string, string>();
    // Stacked bars of a grouped and of a contingency table are the same picture.
    for (const t of CHART_TYPES.filter((c) => c.type !== 'contingencyStacked')) {
      const svg = markup(t.type);
      expect(svg, t.type).toContain('<svg');
      expect(seen.get(svg), `${t.type} is drawn like ${seen.get(svg)}`).toBeUndefined();
      seen.set(svg, t.type);
    }
    expect(seen.size).toBe(CHART_TYPES.length - 1);
  });

  it('are the ones the New Graph gallery shows for the plain entry of the type', () => {
    for (const kind of ['column', 'xy', 'grouped', 'contingency', 'survival'] as const) {
      // The first plain entry of each type (the gallery has a second one for three-way bars, which is a look of the same type).
      const plain = galleryItems(kind).filter((i) => i.type !== null && !i.variant);
      for (const item of plain.filter((i, n) => plain.findIndex((j) => j.type === i.type) === n)) {
        expect(markup(item.type!), item.id).toBe(renderToStaticMarkup(<GallerySketch item={item} />));
      }
    }
  });

  it('give a heat map the sketch of its first colour scale, and the first graph of every table type has one', () => {
    expect(markup('heatmap')).toBe(renderToStaticMarkup(<GallerySketch item={galleryItems('grouped').find((i) => i.id === 'heat.blue')!} />));
    for (const kind of ['column', 'xy', 'grouped', 'contingency', 'survival'] as const) expect(renderToStaticMarkup(<GallerySketch item={availableItems(kind)[0]} />)).toContain('<svg');
  });
});
