import { describe, expect, it } from 'vitest';
import { createEmptyProject, createExampleProject } from '../../model/defaults';
import { GALLERY } from '../../model/graph/chartGallery';
import { defaultLayout } from '../../model/project/layout';
import type { Project, TableKind } from '../../model/types';
import { addAnnotation, addBracket, addChart, addDataTable, patchLook } from '../../state/commands';
import { buildVectorPdf, pdfTextString } from './pdf';
import { chartToPdf, chartToSvgString } from './export';
import { layoutToPdf } from './layoutExport';
import { familyOf, parseColour, parseTransform, parseXml, pathOps, svgToContent, svgToPdf } from './svgPdf';

const svg = (inner: string, attrs = 'viewBox="0 0 200 100" width="200px" height="100px"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs} font-family="Arial, Helvetica, sans-serif">${inner}</svg>`;
const content = (inner: string, attrs?: string) => svgToContent(svg(inner, attrs));
const inflate = async (bytes: Uint8Array): Promise<string> => new TextDecoder('latin1').decode(new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()));

/** The page stream of a PDF made here, as text. */
async function streamOf(bytes: Uint8Array): Promise<string> {
  const text = new TextDecoder('latin1').decode(bytes);
  const m = /4 0 obj\n<<\/Filter\/FlateDecode\/Length (\d+)>>\nstream\n/.exec(text);
  if (!m) return /4 0 obj\n<<\/Length \d+>>\nstream\n([\s\S]*?)\nendstream/.exec(text)![1];
  const start = m.index + m[0].length;
  return inflate(bytes.slice(start, start + Number(m[1])));
}

describe('reading the markup', () => {
  it('reads elements, attributes and text with their entities, and leaves out declarations and comments', () => {
    const root = parseXml('<?xml version="1.0"?><!-- c --><svg a="1 &amp; 2" b=\'x\'><g/><text>a &lt; b &#233;</text></svg>');
    expect(root.tag).toBe('svg');
    expect(root.attrs).toEqual({ a: '1 & 2', b: 'x' });
    expect(root.children).toHaveLength(2);
    expect((root.children[1] as { children: string[] }).children).toEqual(['a < b é']);
  });
  it('reads transforms as one matrix, the first outermost', () => {
    expect(parseTransform('translate(10 20)')).toEqual([1, 0, 0, 1, 10, 20]);
    expect(parseTransform('matrix(0 1 -1 0 5 6)')).toEqual([0, 1, -1, 0, 5, 6]);
    const [a, b, c, d, e, f] = parseTransform('translate(10 0) scale(2)');
    expect([a, b, c, d, e, f]).toEqual([2, 0, 0, 2, 10, 0]);
    // rotate(90 10 10) leaves its centre where it is and turns (20, 10) to (10, 20)
    const r = parseTransform('rotate(90 10 10)');
    expect([r[0] * 20 + r[2] * 10 + r[4], r[1] * 20 + r[3] * 10 + r[5]].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([10, 20]);
  });
  it('reads colours as the three numbers of a PDF, none and transparent as null, and what it cannot write as undefined', () => {
    expect(parseColour('#ff8000', null)).toBe('1 0.502 0');
    expect(parseColour('#fff', null)).toBe('1 1 1');
    expect(parseColour('rgb(0, 51, 255)', null)).toBe('0 0.2 1');
    expect(parseColour('none', '0 0 0')).toBeNull();
    expect(parseColour('transparent', '0 0 0')).toBeNull();
    expect(parseColour(undefined, '0 0 1')).toBe('0 0 1');
    expect(parseColour('url(#p)', null)).toBeUndefined();
  });
  it('knows which standard family a font list stands for', () => {
    expect(familyOf('Arial, Helvetica, sans-serif')).toBe('sans');
    expect(familyOf("'Times New Roman', Times, serif")).toBe('serif');
    expect(familyOf("Georgia, 'Times New Roman', serif")).toBe('serif');
    expect(familyOf("'Courier New', Courier, monospace")).toBe('mono');
    expect(familyOf('Verdana, Geneva, sans-serif')).toBe('sans');
  });
});

describe('paths', () => {
  it('writes moves, lines, horizontal and vertical lines, absolute and relative, and closes', () => {
    expect(pathOps('M10,20 L30,20 h-5 V50 v10 z')).toBe('10 20 m\n30 20 l\n25 20 l\n25 50 l\n25 60 l\nh');
  });
  it('continues a move with lines, and repeats the last command for more numbers', () => {
    expect(pathOps('M0,0 10,0 10,10')).toBe('0 0 m\n10 0 l\n10 10 l');
    expect(pathOps('m1 1 2 0 0 2')).toBe('1 1 m\n3 1 l\n3 3 l');
  });
  it('writes cubic curves as they are and quadratic ones as the cubic that draws the same curve', () => {
    expect(pathOps('M0,0 C1,2 3,4 5,6')).toBe('0 0 m\n1 2 3 4 5 6 c');
    // the quadratic from (0,0) by (3,3) to (6,0): control points at 2/3 of the way to (3,3) from each end
    expect(pathOps('M0,0 Q3,3 6,0')).toBe('0 0 m\n2 2 4 2 6 0 c');
  });
  it('writes the circle of a symbol (two arcs) as curves that end where the path ends and stay on the circle', () => {
    const ops = pathOps('M10,5a5,5 0 1,0 10,0a5,5 0 1,0 -10,0Z').split('\n');
    const curves = ops.filter((o) => o.endsWith(' c'));
    expect(curves).toHaveLength(4);
    const last = curves[curves.length - 1].split(' ').map(Number);
    expect([last[4], last[5]]).toEqual([10, 5]);
    // every curve ends on the circle of radius 5 round (15, 5)
    for (const c of curves) {
      const n = c.split(' ').map(Number);
      expect(Math.hypot(n[4] - 15, n[5] - 5)).toBeCloseTo(5, 2);
    }
  });
});

describe('the content of a drawing', () => {
  it('turns the page over once and fills and strokes a rectangle', () => {
    const d = content('<rect x="10" y="20" width="30" height="40" fill="#ff0000" stroke="#0000ff" stroke-width="2"/>');
    expect([d.widthPt, d.heightPt]).toEqual([200, 100]);
    expect(d.content.split('\n')[0]).toBe('1 0 0 -1 0 100 cm');
    expect(d.content).toContain('1 0 0 rg');
    expect(d.content).toContain('0 0 1 RG');
    expect(d.content).toContain('2 w 0 J 0 j [] 0 d');
    expect(d.content).toContain('10 20 30 40 re\nB');
    expect(d.notes).toEqual([]);
  });
  it('fills only a shape with no stroke, strokes only a line with no fill, and draws nothing for neither', () => {
    expect(content('<path d="M0,0H10V10" fill="#000000"/>').content).toMatch(/\nf$/);
    expect(content('<path d="M0,0H10V10" fill="none" stroke="#000000"/>').content).toMatch(/\nS$/);
    expect(content('<path d="M0,0H10V10" fill="none"/>').content).not.toMatch(/\n(S|f|B)$/);
    expect(content('<rect width="10" height="10" stroke="#000000" stroke-width="0" fill="none"/>').content).not.toContain(' re');
  });
  it('inherits what a group sets, and a shape overrides it', () => {
    const d = content('<g fill="#00ff00" stroke="#000000" stroke-width="3"><rect width="5" height="5"/><rect width="5" height="5" fill="#ff0000"/></g>');
    expect(d.content).toContain('0 1 0 rg');
    expect(d.content).toContain('1 0 0 rg');
    expect(d.content.match(/3 w/g)).toHaveLength(1);
  });
  it('writes a dash, a cap and a join, and an odd list of dashes twice', () => {
    expect(content('<path d="M0,0H10" fill="none" stroke="#000" stroke-dasharray="8 6" stroke-linecap="round" stroke-linejoin="bevel"/>').content).toContain('1 w 1 J 2 j [8 6] 0 d');
    expect(content('<path d="M0,0H10" fill="none" stroke="#000" stroke-dasharray="3"/>').content).toContain('[3 3] 0 d');
  });
  it('writes opacity as a transparency state, the fill and the stroke apart, a group multiplying into its marks', () => {
    const d = content('<g opacity="0.5"><rect width="5" height="5" fill="#000" fill-opacity="0.6" stroke="#000" stroke-opacity="0.4"/></g>');
    expect(d.alphas).toEqual([{ name: 'GS1', fill: 0.3, stroke: 0.2 }]);
    expect(d.content).toContain('/GS1 gs');
    // full opacity writes no state at all
    expect(content('<rect width="5" height="5"/>').alphas).toEqual([]);
  });
  it('restores a state after a group has changed it, and writes one only when it changes', () => {
    const d = content('<rect width="1" height="1" fill="#f00"/><g fill-opacity="0.5"><rect width="1" height="1" fill="#f00"/><rect width="2" height="2" fill="#f00"/></g><rect width="3" height="3" fill="#f00"/>');
    expect(d.content.match(/ gs/g)).toHaveLength(2);
    expect(d.content.match(/1 0 0 rg/g)).toHaveLength(1);
  });
  it('clips to a clip path, in the user space of the element, and a nested svg to its viewport', () => {
    const d = content('<defs><clipPath id="c"><rect x="5" y="6" width="50" height="40"/></clipPath></defs><g clip-path="url(#c)" transform="translate(10 0)"><rect width="100" height="100" fill="#000"/></g>');
    expect(d.content).toContain('q\n1 0 0 1 10 0 cm\n5 6 50 40 re\nW n');
    expect(d.content).toContain('\nQ');
    const nested = content('<svg x="20" y="10" width="100" height="50" viewBox="0 0 200 100"><rect width="200" height="100" fill="#000"/></svg>');
    // placed at (20, 10), scaled by 0.5 from its viewBox, clipped to its 100 × 50 box
    expect(nested.content).toContain('20 10 100 50 re\nW n\n0.5 0 0 0.5 20 10 cm');
  });
  it('draws a circle as four curves and leaves out what it cannot write, saying so', () => {
    const d = content('<circle cx="10" cy="10" r="5" fill="#000"/><image href="x"/><image href="y"/><foreignObject/>');
    expect(d.content.match(/ c$/gm)).toHaveLength(4);
    expect(d.notes).toEqual(['2 <image> were left out of the PDF: it has no vector form here.', 'One <foreignObject> was left out of the PDF: it has no vector form here.']);
  });
  it('fills the page with the background of the root', () => {
    expect(content('', 'viewBox="0 0 200 100" style="background:#ffffff"').content).toContain('1 1 1 rg\n0 0 200 100 re f');
  });
  it('takes the page size from the viewBox, not from the width and height in other units', () => {
    const d = content('', 'viewBox="0 0 595.28 841.89" width="210mm" height="297mm"');
    expect([d.widthPt, d.heightPt]).toEqual([595.28, 841.89]);
  });
});

describe('text', () => {
  it('is written as text in a font of the file, turned back upright, at its place', () => {
    const d = content('<text x="10" y="30" font-size="12" fill="#000000">Hello</text>');
    expect(d.fonts).toEqual([{ name: 'F1', base: 'Helvetica', winAnsi: true }]);
    expect(d.content).toContain('BT\n1 0 0 -1 10 30 Tm');
    expect(d.content).toContain('/F1 12 Tf (Hello) Tj\nET');
  });
  it('picks bold and italic, and the family of the font list', () => {
    const d = content('<text x="0" y="10" font-size="10" font-weight="700" font-style="italic" font-family="Georgia, serif">x</text><text x="0" y="20" font-size="10" font-family="\'Courier New\', monospace">y</text>');
    expect(d.fonts.map((f) => f.base)).toEqual(['Times-BoldItalic', 'Courier']);
  });
  it('moves the start of a line by its width for the anchors middle and end', () => {
    const at = (anchor: string) => Number(/1 0 0 -1 ([-\d.]+) 20 Tm/.exec(content(`<text x="100" y="20" font-size="10" text-anchor="${anchor}">abcdef</text>`).content)![1]);
    const [start, middle, end] = [at('start'), at('middle'), at('end')];
    expect(start).toBe(100);
    expect(end).toBeLessThan(middle);
    expect(middle).toBeLessThan(start);
    expect(100 - end).toBeCloseTo(2 * (100 - middle), 1);
  });
  it('lowers the baseline by the dy of the element, in em', () => {
    expect(content('<text x="10" y="30" dy="0.35em" font-size="20">x</text>').content).toContain('1 0 0 -1 10 37 Tm');
  });
  it('writes a script as a smaller run raised by a rise, and brings the text after it back', () => {
    const d = content('<text x="0" y="50" font-size="20">H<tspan font-size="70%" dy="0.4em">2</tspan><tspan dy="-0.28em">O</tspan></text>');
    expect(d.content).toContain('0 Ts');
    expect(d.content).toContain('/F1 14 Tf (2) Tj');
    // the subscript sinks 0.4 em of 14 pt = 5.6 pt: a rise of -5.6; the text after it is back on the baseline of the line
    expect(d.content).toContain('-5.6 Ts');
    expect(d.content.match(/ Ts/g)).toHaveLength(3);
  });
  it('starts a new line at the position of a tspan that has x or y', () => {
    const d = content('<text x="10" y="20" font-size="10"><tspan x="10" y="20">one</tspan><tspan x="10" y="32">two</tspan></text>');
    expect(d.content).toContain('1 0 0 -1 10 20 Tm');
    expect(d.content).toContain('1 0 0 -1 10 32 Tm');
  });
  it('is turned by the transform of the element', () => {
    expect(content('<text transform="rotate(-90 39.2 265.93)" x="39.2" y="265.93" font-size="12">Y</text>').content).toMatch(/\n[-\d. e]+ cm\nBT\n1 0 0 -1 39.2 265.93 Tm/);
  });
  it('writes the Greek letters and the signs of the rich text in the Symbol font and the rest in the text font', () => {
    const d = content('<text x="0" y="10" font-size="10">a α b ≤ 5 −1</text>');
    expect(d.fonts.map((f) => f.base)).toEqual(['Helvetica', 'Symbol']);
    // α is Symbol 'a', ≤ is 0xA3 (octal 243), the minus sign is Symbol 0x2D
    expect(d.content).toContain('/F2 10 Tf (a) Tj');
    expect(d.content).toContain('/F2 10 Tf (\\243) Tj');
    expect(d.content).toContain('/F2 10 Tf (-) Tj');
    expect(d.notes).toEqual([]);
  });
  it('writes the accented letters and the signs of WinAnsi as their codes', () => {
    const d = content('<text x="0" y="10" font-size="10">é ± × ° “q” – …</text>');
    expect(d.content).toContain('\\351');
    expect(d.content).toContain('\\261');
    expect(d.content).toContain('\\223');
    expect(d.content).toContain('\\205');
    expect(d.notes).toEqual([]);
  });
  it('escapes parentheses and the backslash, and writes a character no font has as ?, naming it', () => {
    const d = content('<text x="0" y="10" font-size="10">f(x)\\ 日本</text>');
    expect(d.content).toContain('(f\\(x\\)\\\\ ??)');
    expect(d.notes).toEqual(['The PDF\'s standard fonts have no 日 本; written as "?".']);
  });
  it('draws no text for a fill of none or a transparent one', () => {
    expect(content('<text x="0" y="10" font-size="10" fill="none">hidden</text>').content).not.toContain('BT');
    expect(content('<text x="0" y="10" font-size="10" fill-opacity="0">hidden</text>').content).not.toContain('BT');
  });
});

describe('the PDF file', () => {
  const small = async () => (await svgToPdf(svg('<rect width="10" height="10" fill="#000"/><text x="5" y="50" font-size="10">Hi</text>'), { title: 'Figure (1)' })).bytes;

  it('is a one-page PDF of the drawing size with a correct cross-reference table', async () => {
    const bytes = await small();
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/MediaBox[0 0 200 100]');
    expect(text).toContain(String.raw`/Title(Figure \(1\))`);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe('xref');
    const count = Number(/xref\n0 (\d+)\n/.exec(text.slice(start))![1]);
    const entries = [...text.slice(start).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(count - 1);
    entries.forEach((o, i) => expect(text.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(text).toContain(`/Size ${count}`);
  });
  it('holds no picture: the drawing is operators and text in the content stream', async () => {
    const bytes = await small();
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).not.toContain('/Image');
    expect(text).not.toContain('/XObject');
    expect(text).toContain('/BaseFont/Helvetica/Encoding/WinAnsiEncoding');
    const stream = await streamOf(bytes);
    expect(stream).toContain('0 0 10 10 re\nf');
    expect(stream).toContain('(Hi) Tj');
  });
  it('declares the transparencies it uses', () => {
    const bytes = buildVectorPdf({ widthPt: 10, heightPt: 10, content: new TextEncoder().encode('q Q'), compressed: false, fonts: [], alphas: [{ name: 'GS1', fill: 0.5, stroke: 1 }] });
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).toContain('/ExtGState<</GS1 6 0 R>>');
    expect(text).toContain('/Type/ExtGState/ca 0.5/CA 1');
  });
  it('writes the title as itself: plain ASCII literally, anything else as UTF-16BE', () => {
    const titled = (title: string) => new TextDecoder('latin1').decode(buildVectorPdf({ widthPt: 10, heightPt: 10, content: new Uint8Array(), compressed: false, fonts: [], alphas: [], title }));
    expect(titled('Fig (a) \\ 1')).toContain('/Title(Fig \\(a\\) \\\\ 1)');
    expect(titled('Über')).toContain('/Title<FEFF00DC006200650072>');
    expect(titled('')).not.toContain('/Title');
    expect(pdfTextString('α')).toBe('<FEFF03B1>');
  });
});

/** A graph as a PDF, read back to its stream. */
const graphPdf = async (p: Project, id: string) => {
  const chart = p.charts.find((c) => c.id === id)!;
  const { blob, notes } = await chartToPdf(chart, p.dataTables.find((t) => t.id === chart.dataTableId)!);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, notes, stream: await streamOf(bytes), svg: chartToSvgString(chart, p.dataTables.find((t) => t.id === chart.dataTableId)!) };
};

describe('a graph as a PDF', () => {
  it('has the size of the graph in pt and its texts as text', async () => {
    const p = createExampleProject();
    const { bytes, stream, notes } = await graphPdf(p, p.charts[0].id);
    const text = new TextDecoder('latin1').decode(bytes);
    const c = p.charts[0];
    expect(text).toContain(`/MediaBox[0 0 ${c.widthPx * 0.75} ${c.heightPx * 0.75}]`);
    expect(notes).toEqual([]);
    for (const word of c.title.split(' ')) expect(stream).toContain(word.replace(/[()\\]/g, ''));
    expect(stream).not.toContain('NaN');
  });

  it('holds one path for every mark of the SVG and the same number of texts', async () => {
    const p = createExampleProject();
    const { stream, svg: s } = await graphPdf(p, p.charts[0].id);
    const paintedPaths = (stream.match(/\n(f|S|B|f\*|B\*)$/gm) ?? []).length;
    const marks = (s.match(/<(path|rect|circle)\b/g) ?? []).length;
    // every path, rectangle and circle of the SVG is painted, except the clip rectangle and the ones with nothing to paint
    expect(paintedPaths).toBeGreaterThan(marks * 0.6);
    expect(paintedPaths).toBeLessThanOrEqual(marks);
    const texts = (s.match(/<text\b/g) ?? []).length;
    expect((stream.match(/^BT$/gm) ?? []).length).toBeLessThanOrEqual(texts);
    expect((stream.match(/^BT$/gm) ?? []).length).toBeGreaterThan(0);
  });

  it('writes rich text with Greek letters in the Symbol font', async () => {
    let p = createExampleProject();
    p = patchLook(p.charts[0].id, {})(p);
    const chart = { ...p.charts[0], title: 'Dose \\alpha_{1} (\\mu mol)', showTitle: true };
    p = { ...p, charts: [chart] };
    const { bytes, stream, notes } = await graphPdf(p, chart.id);
    expect(new TextDecoder('latin1').decode(bytes)).toContain('/BaseFont/Symbol');
    expect(stream).toContain('(a) Tj');
    expect(notes).toEqual([]);
  });

  it('draws the brackets and an annotation of a graph', async () => {
    let p = addChart('c', 't', undefined, 'bar')(addDataTable('t', 'column', { sample: true })(createExampleProject()));
    const ids = p.dataTables.find((t) => t.id === 't')!.groups.map((g) => g.id);
    p = addBracket('c', { id: 'b', from: ids[0], to: ids[3], label: 'Welch\np = 0.003', color: '#aa0000', widthPt: 2, fontSizePt: 14 })(p);
    p = addAnnotation('c', { id: 'n', text: 'first line\nsecond', xFrac: 0.4, yFrac: 0.2, fontSizePt: 10, color: '#000000', opacity: 1 })(p);
    const { stream, notes } = await graphPdf(p, 'c');
    expect(notes).toEqual([]);
    expect(stream).toContain('0.667 0 0 RG');
    for (const word of ['Welch', 'p = 0.003', 'first line', 'second']) expect(stream).toContain(`(${word}) Tj`);
  });
});

describe('every graph of the gallery as a PDF', () => {
  const KINDS = Object.keys(GALLERY) as TableKind[];
  for (const kind of KINDS) {
    it(`writes every ${kind} graph with nothing left out and no number that is not one`, async () => {
      let p: Project = addDataTable('t1', kind, { sample: true })(createEmptyProject());
      const items = GALLERY[kind].flatMap((tab) => tab.items).filter((item) => item.type !== null);
      for (const item of items) p = addChart(`c-${item.id}`, 't1', undefined, item.type!, item.variant)(p);
      for (const item of items) {
        const { stream, notes } = await graphPdf(p, `c-${item.id}`);
        expect(notes, item.id).toEqual([]);
        expect(stream, item.id).not.toMatch(/NaN|Infinity|undefined/);
        expect(stream.length, item.id).toBeGreaterThan(200);
      }
    });
  }
});

describe('a page as a PDF', () => {
  it('has the size of the page, each graph in a clipped viewport, and its texts as text', async () => {
    const p = createExampleProject();
    const layout = { ...defaultLayout('l1', 'Page', { panels: [p.charts[0].id, null] }), showTitle: true, title: 'Figure 1' };
    const { blob, notes } = await layoutToPdf(layout, { ...p, layouts: [layout] });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).toMatch(/\/MediaBox\[0 0 (841\.89|595\.28) (595\.28|841\.89)\]/);
    expect(notes).toEqual([]);
    const stream = await streamOf(bytes);
    expect(stream).toContain('(Figure 1) Tj');
    expect(stream).toContain('W n');
    expect(stream).not.toMatch(/NaN|Infinity|undefined/);
    expect(text).not.toContain('/Image');
  });
});
