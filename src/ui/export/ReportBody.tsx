import type { ExportReport } from '../../chart/export/exportReport';
import { SubHeading } from '../inspector/common/controls';

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

/** The report in plain language. Separate from the dialog's controls so that it reads as the document it is. */
export function ReportBody({ report, page }: { report: ExportReport; page?: string }) {
  const { px, pt, mm } = report.size;
  const { raster } = report;
  // The pixels of a PNG are those of the picture, so they follow the resolution of a page layout; the other sizes do not change with it.
  const pixels = raster ?? px;
  return (
    <div>
      <SubHeading>Size</SubHeading>
      {page !== undefined && raster === null ? (
        // A vector page keeps the size of its paper whatever is exported: its name and its size in mm are all there is to say.
        <div>{page} · {mmText(mm.width)} × {mmText(mm.height)} mm</div>
      ) : (
        <>
          <ul className="report-sizes">
            <li>{pixels.width} × {pixels.height} px</li>
            <li>{pt.width} × {pt.height} pt</li>
            <li>{page !== undefined && `${page} · `}{mmText(mm.width)} × {mmText(mm.height)} mm</li>
          </ul>
          {raster === null && <div className="muted small">{report.format === 'pdf' ? 'PDF' : 'SVG'} is vector: it has no pixels and no resolution.</div>}
        </>
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
      {glyphBodies(report).map((g, i) => <GlyphsBody key={i} glyphs={g} />)}
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
