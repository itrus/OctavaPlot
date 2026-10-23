import type { Id } from '../model/types';

/**
 * Hit testing. Marks rendered in editor mode carry `data-hit*` attributes;
 * these helpers turn a DOM event target into a typed target. Nothing here is
 * emitted in exported SVG.
 */

type HitKind = 'bar' | 'point' | 'error' | 'line' | 'meanLine' | 'legend' | 'label' | 'annotation' | 'axis' | 'title' | 'background';

export interface HitTarget {
  kind: HitKind;
  groupId?: Id;
  /** Observation ID for points (the labelled point for labels), otherwise the mark's own ID. */
  objectId?: Id;
  annotationId?: Id;
}

export function hitAttrs(kind: HitKind, groupId?: Id, objectId?: Id, annotationId?: Id): Record<string, string> {
  const attrs: Record<string, string> = { 'data-hit': kind };
  if (groupId) attrs['data-group-id'] = groupId;
  if (objectId) attrs['data-object-id'] = objectId;
  if (annotationId) attrs['data-annotation-id'] = annotationId;
  return attrs;
}

/** Walk up from the event target to the nearest marked element; unmarked = background. */
export function hitFromTarget(target: EventTarget | null, root: Element | null): HitTarget {
  let el = target instanceof Element ? target : null;
  while (el && el !== root) {
    const kind = el.getAttribute('data-hit') as HitKind | null;
    if (kind) {
      return {
        kind,
        groupId: el.getAttribute('data-group-id') ?? undefined,
        objectId: el.getAttribute('data-object-id') ?? undefined,
        annotationId: el.getAttribute('data-annotation-id') ?? undefined,
      };
    }
    el = el.parentElement;
  }
  return { kind: 'background' };
}

/** Pointer position in chart pt coordinates (the SVG viewBox space). */
export function pointerToChartPt(svg: SVGSVGElement, clientX: number, clientY: number, widthPt: number, heightPt: number) {
  const r = svg.getBoundingClientRect();
  return {
    x: ((clientX - r.left) / r.width) * widthPt,
    y: ((clientY - r.top) / r.height) * heightPt,
  };
}
