import { useState } from 'react';
import { buildExportReport, type ExportReport, type ExportReportInput } from '../../chart/export/exportReport';
import { useApp } from '../../state/AppContext';
import { EXPORT_DPI_CHOICES, PNG_DPI_CHOICES, type ExportDpi, type ExportFormat, type PngDpi } from '../../state/settings';
import { Field, SelectInput, SubHeading } from '../inspector/common/controls';
import { Modal } from '../dialogs/NewItemDialogs';
import { browserFontAvailable, browserHasGlyph } from './browserFonts';
import { exportStatusText, type ExportOutcome, type ExportState } from './exportJob';

/** What the dialog says about: the drawing, the fonts it asks for and what its model warned about. The format and resolution are the dialog's own. */
type ExportSubject = Omit<ExportReportInput, 'format' | 'dpi' | 'isFontAvailable' | 'hasGlyph'>;

interface Props {
  /** A graph is PNG at its own resolution and PDF at the layout one; a layout page is both at the layout one. */
  kind: 'graph' | 'layout';
  subject: ExportSubject;
  /** The state of the export controller of the view that opened the dialog. */
  state: ExportState;
  /** Runs the export with the format and resolution now in Settings (the dialog edits those). */
  onExport: () => Promise<ExportOutcome | void>;
  onClose: () => void;
}

const FORMATS: ReadonlyArray<readonly [ExportFormat, string]> = [
  ['png', 'PNG'],
  ['svg', 'SVG'],
  ['pdf', 'PDF'],
];

const mmText = (n: number) => String(Math.round(n * 10) / 10);

/** What the font lacks of the characters in the texts, in plain language. */
function GlyphsBody({ glyphs }: { glyphs: ExportReport['glyphs'] }) {
  if (glyphs === null) return <div className="muted small">The characters of the texts were not checked for this export.</div>;
  if (glyphs.skipped !== null) return <div className="muted small">{glyphs.skipped}</div>;
  if (glyphs.missing.length === 0) return <div className="muted small">{glyphs.checked === 0 ? 'The texts hold only basic Latin characters.' : `All ${glyphs.checked} special characters (Greek letters, accents, symbols) are in ${glyphs.font}.`}</div>;
  return (
    <ul className="warnings">
      {glyphs.missing.map((m) => (
        <li key={m.codePoint}>
          ⚠ {m.char} ({m.codePoint}, {m.count}×) is not in {glyphs.font}: it is drawn with another font, or as an empty box.
        </li>
      ))}
    </ul>
  );
}

/** The report in plain language. Separate from the dialog's controls so that it reads as the document it is. */
function ReportBody({ report }: { report: ExportReport }) {
  const { px, pt, mm } = report.size;
  const { raster } = report;
  return (
    <div>
      <SubHeading>Size</SubHeading>
      <div>
        {px.width} × {px.height} px · {pt.width} × {pt.height} pt · {mmText(mm.width)} × {mmText(mm.height)} mm
      </div>
      {raster ? (
        <div>
          Picture: {raster.width} × {raster.height} px at {report.dpi} dpi ({raster.megapixels} megapixels)
        </div>
      ) : (
        <div className="muted small">SVG is vector: it has no pixels and no resolution.</div>
      )}
      <SubHeading>Fonts</SubHeading>
      {report.fonts.length === 0 && <div className="muted small">No font is asked for.</div>}
      {report.fonts.map((f) => (
        <div key={f.requested}>
          <div>{f.requested}</div>
          {f.replacedBy !== null && f.families[0] && (
            <div className="muted small">
              {f.families[0].family} is not installed on this computer: it will be replaced by {f.replacedBy}.
            </div>
          )}
          {f.used === null && <div className="muted small">None of these fonts is installed.</div>}
          {f.replacedBy === null && f.used !== null && <div className="muted small">In use: {f.used}.</div>}
          {f.missing.length > 0 && f.replacedBy === null && <div className="muted small">Not installed: {f.missing.join(', ')}.</div>}
        </div>
      ))}
      <SubHeading>Characters</SubHeading>
      <GlyphsBody glyphs={report.glyphs} />
      {report.printWidthMm !== null && (
        <>
          <SubHeading>Print width {report.printWidthMm} mm</SubHeading>
          {report.printWarnings.length === 0 ? <div className="muted small">No text or line would print too small.</div> : <ul className="warnings">{report.printWarnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}
        </>
      )}
      {report.warnings.length > 0 && (
        <>
          <SubHeading>Warnings of the graph</SubHeading>
          <ul className="warnings">{report.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul>
        </>
      )}
      <SubHeading>Known limits</SubHeading>
      <ul className="muted small">{report.limits.map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  );
}

/**
 * What an export will make and what may go wrong with it, with the format and resolution (the same settings as in Settings)
 * and the Export button. The report is also what Copy report puts on the clipboard, as JSON.
 */
export function ExportDialog({ kind, subject, state, onExport, onClose }: Props) {
  const { settings, updateSettings } = useApp();
  const [copied, setCopied] = useState<string | null>(null);
  const format = settings.exportFormat;
  // A graph's PNG has its own resolution (96 dpi is its size on screen); every PDF and a layout page use the other one.
  const ownPng = kind === 'graph' && format === 'png';
  const dpi = ownPng ? settings.pngDpi : settings.exportDpi;
  const report = buildExportReport({ ...subject, format, dpi, isFontAvailable: browserFontAvailable, hasGlyph: browserHasGlyph });
  const tooBig = report.raster?.exceedsCanvasLimit === true;
  const busy = state.phase === 'preparing' || state.phase === 'rasterizing' || state.phase === 'encoding';
  const reason = tooBig ? `${report.raster?.width} × ${report.raster?.height} px is more than the browser can make. Lower the resolution, make the graph smaller, or choose SVG.` : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopied('Report copied.');
    } catch {
      setCopied('The browser did not allow copying.');
    }
  };

  return (
    <Modal
      title={`Export ${subject.name}`}
      confirmLabel="Export"
      confirmDisabled={busy || tooBig}
      onConfirm={() => void onExport().then((outcome) => outcome && outcome.kind === 'ran' && onClose())}
      onClose={onClose}
      wide
    >
      <Field label="Format" hint="PNG is a bitmap; SVG is vector; PDF holds a picture at the resolution below.">
        <span className="switch-group" role="group" aria-label="Export format">
          {FORMATS.map(([value, label]) => (
            <button key={value} className={`switch${format === value ? ' on' : ''}`} aria-pressed={format === value} onClick={() => updateSettings({ exportFormat: value })}>
              {label}
            </button>
          ))}
        </span>
      </Field>
      <Field label="Resolution" hint={format === 'svg' ? 'SVG has no resolution.' : undefined}>
        <SelectInput<string>
          value={String(dpi)}
          disabled={format === 'svg'}
          options={(ownPng ? PNG_DPI_CHOICES : EXPORT_DPI_CHOICES).map((d) => ({ value: String(d), label: `${d} dpi` }))}
          onChange={(v) => updateSettings(ownPng ? { pngDpi: Number(v) as PngDpi } : { exportDpi: Number(v) as ExportDpi })}
        />
      </Field>
      <ReportBody report={report} />
      {reason && <div className="warnings" role="alert">⚠ {reason}</div>}
      {state.phase === 'failed' && state.error && <div className="warnings" role="alert">⚠ {state.error}</div>}
      <div className="muted small" role="status">{busy ? exportStatusText(state) : copied}</div>
      <button onClick={() => void copy()} title="Copy the report above as JSON text">Copy report</button>
    </Modal>
  );
}
