import { createContext, useContext } from 'react';

/**
 * A prefix for the ids a drawing makes (the clip of the plotting region, fill patterns), and for the `url(#...)` that use them.
 * Several drawings on one page (the pictures of a folder overview) would otherwise share `plot-clip`, and a browser may apply
 * another picture's clip. Empty for a drawing that is alone on its page. The stable ids of scene elements are not changed.
 */
export const SvgIdPrefix = createContext('');

export const useSvgIdPrefix = (): string => useContext(SvgIdPrefix);

/** The id as it is written in the drawing. */
export const prefixed = (prefix: string, id: string | undefined): string | undefined => (id === undefined ? undefined : prefix + id);

/** An attribute value with the `url(#id)` references it holds following the prefix. */
export const scopeRefs = <T,>(prefix: string, value: T): T =>
  prefix !== '' && typeof value === 'string' ? (value.replace(/url\(#([^)]+)\)/g, (_, id: string) => `url(#${prefix}${id})`) as T) : value;
