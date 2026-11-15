import { useRef } from 'react';
import { ANNOTATION_FONT_LIMITS, ANNOTATION_FONT_STEPS, ANNOTATION_LINE_SPACING } from '../../../model/defaults';
import { FONT_FAMILIES } from '../../../model/graph/look';
import { type AnnotationPlacer, changeAnchor } from '../../../chart/shared/scene/annotationPlace';
import type { Annotation, AnnotationAlign } from '../../../model/types';
import { useHistory } from '../../../state/AppContext';
import { DeleteIcon, RedoIcon, UndoIcon } from '../../components/icons';
import { ColorInput, Field, GroupBox, NumField, SelectInput } from '../common/controls';
import { takeFocusRequest } from '../common/pendingFocus';
import { SLIDERS } from '../common/sliderRanges';
import { SymbolButton } from '../../components/SymbolButton';

/** Texts that are often written above a comparison, a row for each set of marks: one click writes them. */
const QUICK_TEXTS: ReadonlyArray<readonly string[]> = [
  ['ns', '*', '**', '***', '****'],
  ['#', '##', '###', '####'],
];

/** The quick texts as rows of buttons; the one that is the whole text now is pressed. */
export function QuickTexts({ value, onPick }: { value: string | undefined; onPick: (text: string) => void }) {
  return (
    <span className="quick-texts" role="group" aria-label="Quick text">
      {QUICK_TEXTS.map((row) => (
        <span key={row[0]} className="switch-group">
          {row.map((t) => (
            <button key={t} className={`switch${value === t ? ' on' : ''}`} aria-pressed={value === t} onClick={() => onPick(t)}>
              {t}
            </button>
          ))}
        </span>
      ))}
    </span>
  );
}

/** The next standard size up or down from a size (one that is not a standard size goes to the nearest one in that direction). */
export function stepFontSize(size: number, direction: 1 | -1): number {
  const steps = ANNOTATION_FONT_STEPS;
  if (direction > 0) return steps.find((s) => s > size + 1e-9) ?? Math.min(ANNOTATION_FONT_LIMITS.max, size);
  return [...steps].reverse().find((s) => s < size - 1e-9) ?? Math.max(ANNOTATION_FONT_LIMITS.min, size);
}

/**
 * The text with the selected part (from `start` to `end`) made a superscript (`^`) or subscript (`_`), and where the cursor goes after it.
 * With nothing selected an empty script is written and the cursor is put inside it, so the next keys are typed into it.
 */
export function wrapScript(text: string, start: number, end: number, mark: '^' | '_'): { text: string; start: number; end: number } {
  const [a, b] = [Math.min(start, end), Math.max(start, end)];
  const inner = text.slice(a, b);
  const next = `${text.slice(0, a)}${mark}{${inner}}${text.slice(b)}`;
  return inner === '' ? { text: next, start: a + 2, end: a + 2 } : { text: next, start: a + 2, end: a + 2 + inner.length };
}

/** The first line of a text, shortened to fit a heading (empty text gives ''). */
export function briefText(text: string, max = 28): string {
  const first = text.split('\n')[0];
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}

/**
 * The settings of one text annotation: the text with quick texts, its style (bold, italic, underline, superscript and subscript, with
 * undo and redo at hand), size, font, colour and opacity, alignment and line spacing, its anchor and place, and Delete.
 */
export function AnnotationEditor({ annotation: a, placer, resultHint, fontLabel, onPatch, onDelete }: {
  annotation: Annotation;
  /** Where the text is drawn, on a graph; without it (a page layout) a text is placed on the page only. */
  placer?: AnnotationPlacer;
  /** What the text box says about results written into the text (a graph's texts read them; a page's do not). */
  resultHint?: string;
  /** The name of the font a text without its own is written in. */
  fontLabel: string;
  /** Records a change of this text as one undoable step; changes with the same key merge into one step. */
  onPatch: (label: string, patch: Partial<Annotation>, key?: string) => void;
  onDelete: () => void;
}) {
  const { undo, redo, canUndo, canRedo } = useHistory();
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const set = (label: string, patch: Partial<Annotation>, key?: string) => onPatch(label, patch, key ? `ann:${a.id}:${key}` : undefined);
  const toggle = (key: 'bold' | 'italic' | 'underline', label: string) => set(label, { [key]: a[key] ? undefined : true });
  const script = (mark: '^' | '_') => {
    const box = textRef.current;
    const at = box ? { start: box.selectionStart, end: box.selectionEnd } : { start: a.text.length, end: a.text.length };
    const next = wrapScript(a.text, at.start, at.end, mark);
    set(mark === '^' ? 'Superscript' : 'Subscript', { text: next.text });
    // After the new text is drawn the cursor goes back into the box, inside the script.
    requestAnimationFrame(() => {
      const el = textRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.start, next.end);
    });
  };
  const align: AnnotationAlign = a.align ?? 'left';

  return (
    <GroupBox title={`Text: ${briefText(a.text) || '(empty)'}`}>
      <Field label="Text" hint={`${resultHint ? `${resultHint} ` : ''}Sub- and superscripts are written _{...} and ^{...} (the buttons below do it for the selected letters).`}>
        <span className="text-symbol-wrap">
        <textarea
          rows={2}
          aria-label="Annotation text"
          value={a.text}
          ref={(el) => {
            textRef.current = el;
            // A text just placed with the Text tool takes the keyboard, with "Text" selected so that typing replaces it.
            if (el && takeFocusRequest(`annotation-text:${a.id}`)) {
              el.focus();
              el.select();
            }
          }}
          onChange={(e) => set('Edit annotation text', { text: e.target.value }, 'text')}
        />
        <SymbolButton className="symbol-top" box={() => textRef.current} />
        </span>
      </Field>
      <Field label="Quick text" hint="Write one of these as the whole text">
        <QuickTexts value={a.text} onPick={(t) => set('Annotation text', { text: t })} />
      </Field>
      <Field label="Style">
        <span className="text-style-tools">
          <span className="switch-group" role="group" aria-label="Bold, italic and underline">
            <button className={`switch${a.bold ? ' on' : ''}`} aria-pressed={!!a.bold} aria-label="Bold" title="Bold: the whole text" onClick={() => toggle('bold', 'Bold')}>
              <b>B</b>
            </button>
            <button className={`switch${a.italic ? ' on' : ''}`} aria-pressed={!!a.italic} aria-label="Italic" title="Italic: the whole text" onClick={() => toggle('italic', 'Italic')}>
              <i>I</i>
            </button>
            <button className={`switch${a.underline ? ' on' : ''}`} aria-pressed={!!a.underline} aria-label="Underline" title="Underline: the whole text" onClick={() => toggle('underline', 'Underline')}>
              <u>U</u>
            </button>
          </span>
          <span className="switch-group" role="group" aria-label="Superscript and subscript">
            <button className="switch" aria-label="Superscript" title="Superscript: the selected letters, or a new superscript at the cursor (^{...})" onMouseDown={(e) => e.preventDefault()} onClick={() => script('^')}>
              x²
            </button>
            <button className="switch" aria-label="Subscript" title="Subscript: the selected letters, or a new subscript at the cursor (_{...})" onMouseDown={(e) => e.preventDefault()} onClick={() => script('_')}>
              x₂
            </button>
          </span>
          <span className="switch-group" role="group" aria-label="Undo and redo">
            <button className="switch" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
              <UndoIcon />
            </button>
            <button className="switch" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
              <RedoIcon />
            </button>
          </span>
        </span>
      </Field>
      <Field label="Font family">
        <SelectInput<string>
          value={a.fontFamily ?? ''}
          options={[{ value: '', label: `Default (${fontLabel})` }, ...FONT_FAMILIES.map((f) => ({ value: f.value, label: f.label }))]}
          onChange={(v) => set('Annotation font', { fontFamily: v === '' ? undefined : v })}
        />
      </Field>
      <Field label="Text color">
        <ColorInput value={a.color} ariaLabel="Text colour" onChange={(v) => set('Annotation colour', { color: v }, 'color')} />
      </Field>
      <NumField {...SLIDERS.fraction} label="Opacity" value={a.opacity} min={0} max={1} onCommit={(v) => set('Annotation opacity', { opacity: v }, 'opacity')} hint="0 = transparent, 1 = opaque" />
      <NumField {...SLIDERS.font} label="Font size" unit="pt" value={a.fontSizePt} min={ANNOTATION_FONT_LIMITS.min} max={ANNOTATION_FONT_LIMITS.max} onCommit={(v) => set('Annotation size', { fontSizePt: v }, 'size')} />
      <Field label="Larger or smaller" hint="Steps through the usual sizes: 6 to 12, then 14, 16, 18, 20, 24 … 40">
        <span className="switch-group" role="group" aria-label="Font size steps">
          <button className="switch" aria-label="Larger text" title="Larger" disabled={a.fontSizePt >= ANNOTATION_FONT_LIMITS.max} onClick={() => set('Annotation size', { fontSizePt: stepFontSize(a.fontSizePt, 1) }, 'size')}>
            A<sup>▲</sup>
          </button>
          <button className="switch" aria-label="Smaller text" title="Smaller" disabled={a.fontSizePt <= ANNOTATION_FONT_LIMITS.min} onClick={() => set('Annotation size', { fontSizePt: stepFontSize(a.fontSizePt, -1) }, 'size')}>
            A<sub>▼</sub>
          </button>
        </span>
      </Field>
      <Field label="Alignment" hint="How the lines of a text of several lines line up; the text keeps its place (its left edge)">
        <span className="switch-group" role="group" aria-label="Alignment">
          {(['left', 'center', 'right'] as const).map((v) => (
            <button key={v} className={`switch${align === v ? ' on' : ''}`} aria-pressed={align === v} onClick={() => set('Annotation alignment', { align: v === 'left' ? undefined : v })}>
              {v === 'left' ? 'Left' : v === 'center' ? 'Center' : 'Right'}
            </button>
          ))}
        </span>
      </Field>
      <NumField
        label="Line spacing"
        unit="×"
        step={0.1}
        slider={false}
        value={a.lineSpacing ?? ANNOTATION_LINE_SPACING.default}
        min={ANNOTATION_LINE_SPACING.min}
        max={ANNOTATION_LINE_SPACING.max}
        hint="Distance between the lines of a text of several lines, in multiples of the font size"
        onCommit={(v) => set('Line spacing', { lineSpacing: Math.abs(v - ANNOTATION_LINE_SPACING.default) < 1e-9 ? undefined : v }, 'spacing')}
      />
      {placer?.supportsData && (
        <Field label="Anchor" hint="Page: a place on the page. Data values: a place on the axes, so the text follows the axis range, a log scale and breaks.">
          <SelectInput<'page' | 'data'>
            value={a.anchor === 'data' ? 'data' : 'page'}
            options={[
              { value: 'page', label: 'Page' },
              { value: 'data', label: 'Data values' },
            ]}
            onChange={(v) => {
              const patch = changeAnchor(a, placer, v);
              if (patch && Object.keys(patch).length > 0) set('Annotation anchor', patch);
            }}
          />
        </Field>
      )}
      {placer && a.anchor === 'data' ? (
        <>
          {placer.numericX && <NumField label="X value" value={a.x ?? 0} min={-1e15} max={1e15} slider={false} hint="In the units of the X axis; the left edge of the text" onCommit={(v) => set('Annotation position', { x: v }, 'x')} />}
          <NumField label="Y value" value={a.y ?? 0} min={-1e15} max={1e15} slider={false} hint="In the units of the value axis; the top edge of the text" onCommit={(v) => set('Annotation position', { y: v }, 'y')} />
          {placer.acrossPage === 'x' && <NumField label="Left" unit="%" value={Math.round(a.xFrac * 1000) / 10} min={0} max={100} slider={false} step={0.1} hint="Percent of the chart width. Across the categories the position stays a place on the page" onCommit={(v) => set('Annotation position', { xFrac: v / 100 }, 'xf')} />}
          {placer.acrossPage === 'y' && <NumField label="Top" unit="%" value={Math.round(a.yFrac * 1000) / 10} min={0} max={100} slider={false} step={0.1} hint="Percent of the chart height. Across the categories the position stays a place on the page" onCommit={(v) => set('Annotation position', { yFrac: v / 100 }, 'yf')} />}
          {placer.skipped([a]).length > 0 && <div className="field-note">These values are outside the axis range, so the text is not drawn.</div>}
        </>
      ) : (
        <>
          <NumField label="Left" unit="%" value={Math.round(a.xFrac * 1000) / 10} min={0} max={100} slider={false} step={0.1} hint="Percent of the chart width: the position of the left edge of the text; arrow keys nudge a selected annotation (Shift 5%, Alt 0.1%)" onCommit={(v) => set('Annotation position', { xFrac: v / 100 }, 'x')} />
          <NumField label="Top" unit="%" hint="Percent of the chart height: the position of the top of the text" value={Math.round(a.yFrac * 1000) / 10} min={0} max={100} slider={false} step={0.1} onCommit={(v) => set('Annotation position', { yFrac: v / 100 }, 'y')} />
        </>
      )}
      <button
        className="danger-button"
        onClick={onDelete}
      >
        <DeleteIcon />
        Delete
      </button>
    </GroupBox>
  );
}
