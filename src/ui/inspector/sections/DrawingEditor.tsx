import { useRef } from 'react';
import { type AnnotationPlacer } from '../../../chart/shared/scene/annotationPlace';
import { skippedDrawings } from '../../../chart/shared/scene/drawings';
import { DRAWING_LIMITS, drawingName, endSizeOf } from '../../../model/graph/drawingPresets';
import { FONT_FAMILIES, LINE_STYLES } from '../../../model/graph/look';
import type { Drawing, LineEnd, LineRoute, LineStyle } from '../../../model/types';
import { DeleteIcon } from '../../components/icons';
import { Check, ColorInput, Field, GroupBox, NumField, SelectInput } from '../common/controls';
import { takeFocusRequest } from '../common/pendingFocus';
import { SLIDERS } from '../common/sliderRanges';
import { briefText, QuickTexts } from './AnnotationEditor';

const ENDS: ReadonlyArray<{ value: LineEnd; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'arrow', label: 'Arrowhead' },
  { value: 'bar', label: 'Bar across' },
  { value: 'tick', label: 'Tick below (left)' },
  { value: 'tickFlip', label: 'Tick above (right)' },
];

const ROUTES: ReadonlyArray<{ value: LineRoute; label: string }> = [
  { value: 'straight', label: 'Straight' },
  { value: 'hv', label: 'Across, then up or down' },
  { value: 'vh', label: 'Up or down, then across' },
];

/**
 * The settings of one drawing object (its name is the entry of the list above it): the text of a line (quick texts, style, font, colour, size, side and distance), the
 * line (pattern, colour, opacity, width), the ends and the route of a line, the corners of a rectangle, the fill of a closed shape, its
 * anchor on a chart with axes, and Delete.
 */
function DrawingEditor({ drawing: d, placer, fontLabel, onPatch, onDelete }: {
  drawing: Drawing;
  /** Where the object is drawn, on a graph; without it (a page layout) it is placed on the page only. */
  placer?: AnnotationPlacer;
  /** The name of the font a text without its own is written in. */
  fontLabel: string;
  /** Records a change of this object as one undoable step; changes with the same key merge into one step. */
  onPatch: (label: string, patch: Partial<Drawing>, key?: string) => void;
  onDelete: () => void;
}) {
  const textRef = useRef<HTMLInputElement | null>(null);
  const set = (label: string, patch: Partial<Drawing>, key?: string) => onPatch(label, patch, key ? `drw:${d.id}:${key}` : undefined);
  const line = d.shape === 'line';
  const closed = d.shape === 'ellipse' || d.shape === 'rect';
  const hasText = d.text !== undefined;
  const usesEnds = (d.start ?? 'none') !== 'none' || (d.end ?? 'none') !== 'none';
  return (
    <>
      {line && hasText && (
        <GroupBox title={`Text: ${briefText(d.text ?? '')}`}>
          <Field label="Quick text" hint="Write one of these as the whole text">
            <QuickTexts value={d.text} onPick={(t) => set('Shape text', { text: t })} />
          </Field>
          <Field label="Text">
            <input
              type="text"
              aria-label="Text of the line"
              value={d.text}
              ref={(el) => {
                textRef.current = el;
                // A line with text just drawn takes the keyboard, with its text selected so that typing replaces it.
                if (el && takeFocusRequest(`drawing-text:${d.id}`)) {
                  el.focus();
                  el.select();
                }
              }}
              onChange={(e) => set('Edit shape text', { text: e.target.value }, 'text')}
            />
          </Field>
          <Field label="Style">
            <span className="switch-group" role="group" aria-label="Bold and italic">
              <button className={`switch${d.bold ? ' on' : ''}`} aria-pressed={!!d.bold} aria-label="Bold" onClick={() => set('Bold', { bold: d.bold ? undefined : true })}>
                <b>B</b>
              </button>
              <button className={`switch${d.italic ? ' on' : ''}`} aria-pressed={!!d.italic} aria-label="Italic" onClick={() => set('Italic', { italic: d.italic ? undefined : true })}>
                <i>I</i>
              </button>
            </span>
          </Field>
          <Field label="Font family">
            <SelectInput<string>
              value={d.fontFamily ?? ''}
              options={[{ value: '', label: `Default (${fontLabel})` }, ...FONT_FAMILIES.map((f) => ({ value: f.value, label: f.label }))]}
              onChange={(v) => set('Shape font', { fontFamily: v === '' ? undefined : v })}
            />
          </Field>
          <Field label="Text color" hint="Unless one is chosen, the text has the colour of the line">
            <ColorInput value={d.textColor ?? d.color} ariaLabel="Text colour" onChange={(v) => set('Shape text colour', { textColor: v === d.color ? undefined : v }, 'textColor')} />
          </Field>
          <NumField {...SLIDERS.font} label="Font size" unit="pt" value={d.fontSizePt ?? 12} min={DRAWING_LIMITS.fontSizePt.min} max={DRAWING_LIMITS.fontSizePt.max} onCommit={(v) => set('Shape text size', { fontSizePt: v }, 'size')} />
          <Field label="Text position" hint="Which side of the line the text is on; a line that runs up or down has it to the right or to the left">
            <SelectInput<'above' | 'below'> value={d.textSide ?? 'above'} options={[{ value: 'above', label: 'Above / right' }, { value: 'below', label: 'Below / left' }]} onChange={(v) => set('Text position', { textSide: v === 'above' ? undefined : v })} />
          </Field>
          <NumField label="Distance from line" unit="pt" value={d.textGapPt ?? 3} min={DRAWING_LIMITS.textGapPt.min} max={DRAWING_LIMITS.textGapPt.max} step={0.5} onCommit={(v) => set('Text distance', { textGapPt: v }, 'gap')} />
          <div className="button-row">
            <button className="small-btn" onClick={() => set('Remove text', { text: undefined, fontSizePt: undefined, textColor: undefined, fontFamily: undefined, bold: undefined, italic: undefined, textSide: undefined, textGapPt: undefined })}>
              Remove the text
            </button>
          </div>
        </GroupBox>
      )}
      <GroupBox title={drawingName(d)}>
        <Field label="Pattern">
          <SelectInput<LineStyle> value={d.lineStyle} options={LINE_STYLES.map((o) => ({ value: o.value, label: o.label }))} onChange={(v) => set('Shape pattern', { lineStyle: v })} />
        </Field>
        <Field label="Line color">
          <ColorInput value={d.color} ariaLabel="Line colour" onChange={(v) => set('Shape colour', { color: v }, 'color')} />
        </Field>
        <NumField {...SLIDERS.fraction} label="Opacity" value={d.opacity} min={0} max={1} onCommit={(v) => set('Shape opacity', { opacity: v }, 'opacity')} hint="0 = transparent, 1 = opaque" />
        <NumField {...SLIDERS.line} label="Line width" unit="pt" value={d.widthPt} min={DRAWING_LIMITS.widthPt.min} max={DRAWING_LIMITS.widthPt.max} onCommit={(v) => set('Shape line width', { widthPt: v }, 'width')} />
        {closed && (
          <>
            <Field label="Fill">
              <Check checked={d.fill !== undefined} ariaLabel="Fill the shape" onChange={(v) => set('Shape fill', v ? { fill: '#ffffff', fillOpacity: undefined } : { fill: undefined, fillOpacity: undefined })} />
              {d.fill !== undefined && <ColorInput value={d.fill} ariaLabel="Fill colour" onChange={(v) => set('Shape fill colour', { fill: v }, 'fill')} />}
            </Field>
            {d.fill !== undefined && <NumField {...SLIDERS.fraction} label="Fill opacity" value={d.fillOpacity ?? 1} min={0} max={1} onCommit={(v) => set('Shape fill opacity', { fillOpacity: v >= 1 ? undefined : v }, 'fillOpacity')} hint="0 = transparent, 1 = opaque" />}
          </>
        )}
        {d.shape === 'rect' && <NumField label="Corner radius" unit="pt" value={d.cornerPt ?? 0} min={DRAWING_LIMITS.cornerPt.min} max={DRAWING_LIMITS.cornerPt.max} step={1} onCommit={(v) => set('Corner radius', { cornerPt: v > 0 ? v : undefined }, 'corner')} />}
      </GroupBox>
      {line && (
        <GroupBox title="Ends">
          <Field label="Start">
            <SelectInput<LineEnd> dropdown value={d.start ?? 'none'} options={[...ENDS]} onChange={(v) => set('Line start', { start: v === 'none' ? undefined : v })} />
          </Field>
          <Field label="End">
            <SelectInput<LineEnd> dropdown value={d.end ?? 'none'} options={[...ENDS]} onChange={(v) => set('Line end', { end: v === 'none' ? undefined : v })} />
          </Field>
          {usesEnds && (
            <NumField
              label="Size of the ends"
              unit="pt"
              hint="The length of an arrowhead, of a bar across an end or of a tick"
              value={d.endSizePt ?? endSizeOf(d, d.end && d.end !== 'none' ? d.end : (d.start ?? 'none'))}
              min={DRAWING_LIMITS.endSizePt.min}
              max={DRAWING_LIMITS.endSizePt.max}
              step={0.5}
              onCommit={(v) => set('Size of the ends', { endSizePt: v }, 'ends')}
            />
          )}
          <Field label="Route">
            <SelectInput<LineRoute> dropdown value={d.route ?? 'straight'} options={[...ROUTES]} onChange={(v) => set('Line route', { route: v === 'straight' ? undefined : v })} />
          </Field>
          {!hasText && (
            <div className="button-row">
              <button className="small-btn" onClick={() => set('Add text', { text: 'ns', fontSizePt: 12, bold: true })}>
                Add a text
              </button>
            </div>
          )}
        </GroupBox>
      )}
      {placer && skippedDrawings([d], placer).length > 0 && <div className="field-note">A point of this object is outside the axis range, so it is not drawn.</div>}
      <button className="danger-button" onClick={onDelete}>
        <DeleteIcon />
        Delete
      </button>
    </>
  );
}

/**
 * The drawing objects of a chart or page as a list, with the settings of the selected one under it. Several selected together share a
 * box with their line colour, width and Delete. Ctrl, Cmd or Shift on an entry takes it in or out of the selection.
 */
export function DrawingList({ drawings, picked, onPick, onPatch, onRemove, placer, fontLabel }: {
  drawings: readonly Drawing[];
  picked: readonly string[];
  /** Select one object; `toggle` adds it to the selection or takes it out. */
  onPick: (id: string, toggle: boolean) => void;
  onPatch: (ids: readonly string[], label: string, patch: Partial<Drawing>, key?: string) => void;
  onRemove: (ids: readonly string[]) => void;
  placer?: AnnotationPlacer;
  fontLabel: string;
}) {
  const chosen = drawings.filter((d) => picked.includes(d.id));
  const differ = (k: keyof Drawing) => chosen.some((d) => d[k] !== chosen[0][k]);
  return (
    <>
      {drawings.length === 0 && <div className="muted small">No shapes or lines. Choose one under Graphics on the toolbar and drag where it should go.</div>}
      {chosen.length > 1 && (
        <GroupBox title={`Selected shapes and lines (${chosen.length})`}>
          <div className="muted small">These objects are edited together. Ctrl or Shift on an object, on the page or in the list, takes it in or out; dragging one or the arrow keys move them together.</div>
          <Field label="Line color" overridden={{ mixed: differ('color') }}>
            <ColorInput value={chosen[0].color} ariaLabel="Line colour" onChange={(v) => onPatch(chosen.map((d) => d.id), 'Shape colour', { color: v }, `drw:${chosen.map((d) => d.id).join()}:color`)} />
          </Field>
          <NumField {...SLIDERS.line} label="Line width" unit="pt" value={chosen[0].widthPt} min={DRAWING_LIMITS.widthPt.min} max={DRAWING_LIMITS.widthPt.max} overridden={{ mixed: differ('widthPt') }} onCommit={(v) => onPatch(chosen.map((d) => d.id), 'Shape line width', { widthPt: v }, `drw:${chosen.map((d) => d.id).join()}:width`)} />
          <Field label="Pattern" overridden={{ mixed: differ('lineStyle') }}>
            <SelectInput<LineStyle> value={chosen[0].lineStyle} options={LINE_STYLES.map((o) => ({ value: o.value, label: o.label }))} onChange={(v) => onPatch(chosen.map((d) => d.id), 'Shape pattern', { lineStyle: v })} />
          </Field>
          <button className="danger-button" onClick={() => onRemove(chosen.map((d) => d.id))}>
            <DeleteIcon />
            Delete selected
          </button>
        </GroupBox>
      )}
      {drawings.map((d) => {
        const on = picked.includes(d.id);
        return (
          <div key={d.id} className={`annotation-card${on ? ' selected' : ''}`}>
            {!(on && chosen.length === 1) && (
              <button className="list-item" onClick={(e) => onPick(d.id, e.ctrlKey || e.metaKey || e.shiftKey)}>
                {drawingName(d)}
                {d.text ? `: ${d.text}` : ''}
              </button>
            )}
            {on && chosen.length === 1 && <DrawingEditor drawing={d} placer={placer} fontLabel={fontLabel} onPatch={(label, patch, key) => onPatch([d.id], label, patch, key)} onDelete={() => onRemove([d.id])} />}
          </div>
        );
      })}
    </>
  );
}
