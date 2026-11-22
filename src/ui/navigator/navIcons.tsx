import type { ReactNode } from 'react';
import { chartFamily } from '../../model/graph/chartTypes';
import type { ChartType } from '../../model/types';

/** Small line icons for the rows of the navigator; they take the text colour and are hidden from assistive technology (the name is the label). */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block' }}>
      {children}
    </svg>
  );
}

const AXES = <path d="M2.5 2v11.5H14" />;
const Dot = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r="1.1" fill="currentColor" stroke="none" />;

/** A data table: a grid with a header row. */
export const TableNavIcon = () => (
  <Glyph>
    <rect x="2" y="2.5" width="12" height="11" rx="1.2" />
    <path d="M2 6h12M6.2 6v7.5M10.1 6v7.5" />
  </Glyph>
);

/** A page layout: a sheet with panels. */
export const LayoutNavIcon = () => (
  <Glyph>
    <rect x="2.5" y="1.8" width="11" height="12.4" rx="1.2" />
    <rect x="4.6" y="4" width="3" height="3.2" />
    <rect x="8.4" y="4" width="3" height="3.2" />
    <rect x="4.6" y="8.4" width="6.8" height="3.2" />
  </Glyph>
);

/** A graph, drawn as the kind of chart it is: points, a line, bars, boxes, a pie, steps or cells. */
export function GraphNavIcon({ type }: { type: ChartType }) {
  const family = chartFamily(type);
  if (family === 'pie') {
    return (
      <Glyph>
        <circle cx="8" cy="8" r="5.6" />
        <path d="M8 8V2.4M8 8l4.6 3.3" />
      </Glyph>
    );
  }
  if (family === 'heatmap') {
    return (
      <Glyph>
        <rect x="2" y="2" width="12" height="12" rx="1" />
        <path d="M6 2v12M10 2v12M2 6h12M2 10h12" />
        <rect x="6" y="6" width="4" height="4" fill="currentColor" stroke="none" />
        <rect x="10" y="2" width="4" height="4" fill="currentColor" stroke="none" opacity="0.45" />
      </Glyph>
    );
  }
  if (family === 'survival') {
    return (
      <Glyph>
        {AXES}
        <path d="M3.5 3.8H6v2.6h2.5v3H11v3h2.5" />
      </Glyph>
    );
  }
  if (family === 'histogram') {
    return (
      <Glyph>
        {AXES}
        <path d="M4 13.5V9h2.2v4.5M6.2 13.5V5h2.2v8.5M8.4 13.5V7.2h2.2v6.3M10.6 13.5v-3h2.2v3" />
      </Glyph>
    );
  }
  if (family === 'grouped') {
    return (
      <Glyph>
        {AXES}
        <path d="M4.6 13.5V8.5h2v5M8.6 13.5V5.5h2v8M6.6 13.5V10h0" />
        <path d="M11 13.5v-3.4h2v3.4" opacity="0.6" />
      </Glyph>
    );
  }
  if (family === 'column') {
    if (type === 'box' || type === 'violin' || type === 'floating') {
      return (
        <Glyph>
          {AXES}
          <rect x="4.4" y="6" width="3" height="4.6" />
          <path d="M5.9 3.6V6M5.9 10.6v2.2M9.8 8.4v4.4M9.8 4.4v1.6" />
          <rect x="8.6" y="6" width="2.4" height="2.4" opacity="0.6" />
        </Glyph>
      );
    }
    if (type === 'scatter' || type === 'mean' || type === 'paired') {
      return (
        <Glyph>
          {AXES}
          <Dot x={5.2} y={9} /><Dot x={6.2} y={7} /><Dot x={5.6} y={11} />
          <Dot x={10.8} y={5} /><Dot x={11.8} y={7} /><Dot x={10.4} y={9} />
          <path d="M4.2 8.8h2.8M9.8 6.9h2.8" />
        </Glyph>
      );
    }
    return (
      <Glyph>
        {AXES}
        <path d="M4.2 13.5V8.6h2.6v4.9M9 13.5V4.6h2.6v8.9" />
      </Glyph>
    );
  }
  // XY: points, a line, or both; bars at numeric X.
  if (type === 'xyBars') {
    return (
      <Glyph>
        {AXES}
        <path d="M4.5 13.5V9M7.2 13.5V5.5M9.9 13.5V7.5M12.6 13.5V4" strokeWidth="2.2" />
      </Glyph>
    );
  }
  const dots = type !== 'xyLine' && type !== 'xyArea' && type !== 'xySpikes' && type !== 'xyOffset';
  const line = type !== 'xyScatter' && type !== 'xyBubble' && type !== 'xyVolcano';
  return (
    <Glyph>
      {AXES}
      {line && <path d="M4 11.2 7 8.6l2.4 1.3 3.6-5.2" />}
      {dots && (
        <>
          <Dot x={4} y={11.2} /><Dot x={7} y={8.6} /><Dot x={9.4} y={9.9} /><Dot x={13} y={4.7} />
        </>
      )}
    </Glyph>
  );
}
