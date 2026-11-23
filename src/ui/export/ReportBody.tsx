import type { ExportReport } from '../../chart/export/exportReport';
import { SubHeading } from '../inspector/common/controls';
import { useEffect, useRef, useState } from 'react';

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

/** The checks of characters to show: a page has one for each font, and the fonts that write only basic Latin are not listed one by one. */
const glyphBodies = (report: ExportReport): ExportReport['glyphs'][] => {
  if (report.glyphGroups.length === 0) return [report.glyphs];
  const withSpecials = report.glyphGroups.filter((g) => g.checked > 0);
  return withSpecials.length > 0 ? withSpecials : [report.glyphGroups[0]];
};

/**
 * The report in plain language. Separate from the dialog's controls so that it reads as the document it is. A `compact` report leaves out
 * what is only reassurance: the fonts and the characters while there is nothing to warn about, and the known limits.
 */
export function ReportBody({ report, page, compact = false }: { report: ExportReport; page?: string; compact?: boolean }) {
  const { pt, mm } = report.size;
  const { raster } = report;
  const fontProblems = report.fonts.some((f) => f.replacedBy !== null || f.used === null || f.missing.length > 0);
  const glyphProblems = glyphBodies(report).some((g) => g !== null && g.skipped === null && g.missing.length > 0);
  const showFonts = !compact || fontProblems;
  const showGlyphs = !compact || glyphProblems;
  return (
    <div>
      {!compact && <SubHeading>Size</SubHeading>}
      {/* A PNG has pixels; an SVG and a PDF have only the size of their page, in mm (the paper's name too, for a layout). */}
      {raster === null ? (
        <div>{page !== undefined && `${page} · `}{mmText(mm.width)} × {mmText(mm.height)} mm</div>
      ) : (
        <ul className="report-sizes">
          <li>{raster.width} × {raster.height} px</li>
          <li>{pt.width} × {pt.height} pt</li>
          <li>{page !== undefined && `${page} · `}{mmText(mm.width)} × {mmText(mm.height)} mm</li>
        </ul>
      )}
      {showFonts && <SubHeading>Fonts</SubHeading>}
      {showFonts && report.fonts.length === 0 && <div className="muted small">No font is asked for.</div>}
      {showFonts && report.fonts.map((f) => (
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
      {showGlyphs && <SubHeading>Characters</SubHeading>}
      {showGlyphs && glyphBodies(report).map((g, i) => <GlyphsBody key={i} glyphs={g} />)}
      {report.warnings.length > 0 && (
        <>
          <SubHeading>Warnings of the graph</SubHeading>
          <ul className="warnings">{report.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul>
        </>
      )}
      {!compact && (
        <>
          <SubHeading>Known limits</SubHeading>
          <ul className="muted small">{report.limits.map((l) => <li key={l}>{l}</li>)}</ul>
        </>
      )}
    </div>
  );
}

/** A change of the graph or the settings is waited out for this long before the file is made again. */
const DELAY_MS = 400;

/** A size in KB (ten thousand KB or more in MB), as the panels write it. */
function formatKb(bytes: number): string {
  const kb = Math.max(1, Math.round(bytes / 1024));
  return kb >= 10000 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

/**
 * "File size: 134 KB" for the file an export panel would write. `measure` makes that file in memory and returns its bytes (it must be the same
 * function while nothing changes, so keep it in useMemo); null when there is nothing to measure. The size is the real one: a PNG is
 * rendered at the chosen resolution, which takes a few seconds at a high one.
 */
export function FileSizeLine({ measure }: { measure: (() => Promise<number>) | null }) {
  const [state, setState] = useState<{ bytes: number | null; busy: boolean }>({ bytes: null, busy: true });
  // Only the latest request may set the state: a slow older one is dropped.
  const latest = useRef(0);
  useEffect(() => {
    if (!measure) {
      latest.current++;
      setState({ bytes: null, busy: false });
      return;
    }
    const mine = ++latest.current;
    setState((s) => ({ ...s, busy: true }));
    const timer = setTimeout(() => {
      const done = (bytes: number | null) => latest.current === mine && setState({ bytes, busy: false });
      measure().then(done, () => done(null));
    }, DELAY_MS);
    return () => {
      clearTimeout(timer);
      latest.current++;
    };
  }, [measure]);
  return (
    <div className="file-size" role="status">
      File size: {state.busy ? 'calculating…' : state.bytes === null ? 'not available' : formatKb(state.bytes)}
    </div>
  );
}
