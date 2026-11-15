import type { ExportReport } from '../../chart/export/exportReport';
import { copyText } from '../../util/download';
import { SubHeading } from '../inspector/common/controls';

const mmText = (n: number) => String(Math.round(n * 10) / 10);

/** Copies the report as JSON text and says how that went (what a panel shows under its Export button). */
export const copyReport = async (report: ExportReport): Promise<string> => ((await copyText(JSON.stringify(report, null, 2))) ? 'Report copied.' : 'The browser did not allow copying.');

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
