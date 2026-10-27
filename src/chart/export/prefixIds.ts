/** Gives every id in a drawing a prefix, so drawings placed in one page cannot take each other's clip paths and patterns; the references follow. */
export function prefixIds(markup: string, prefix: string): string {
  const ids = new Set<string>();
  for (const m of markup.matchAll(/ id="([^"]+)"/g)) ids.add(m[1]);
  if (ids.size === 0) return markup;
  // One pass over the markup: an id attribute, a url(#id) or an href="#id" is rewritten only when the id was collected above.
  return markup.replace(/ id="([^"]+)"|url\(#([^)]*)\)|href="#([^"]*)"/g, (whole, idAttr?: string, urlRef?: string, hrefRef?: string) => {
    if (idAttr !== undefined) return ` id="${prefix}${idAttr}"`;
    if (urlRef !== undefined) return ids.has(urlRef) ? `url(#${prefix}${urlRef})` : whole;
    return hrefRef !== undefined && ids.has(hrefRef) ? `href="#${prefix}${hrefRef}"` : whole;
  });
}
