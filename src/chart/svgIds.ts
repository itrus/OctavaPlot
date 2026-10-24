/**
 * Identifiers in the drawing. An id is made from the ID of the thing it draws (a layer, an observation, an annotation) and
 * what part of it it is, so it stays the same when the chart is restyled, resized, saved and opened again. Characters an XML
 * id cannot hold (the colon between an object and the kind of layer) become hyphens.
 */
export const svgId = (...parts: ReadonlyArray<string | number>): string => parts.join('-').replace(/[^A-Za-z0-9_.-]/g, '-');
