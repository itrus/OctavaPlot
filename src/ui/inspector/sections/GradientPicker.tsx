import { DATAWRAPPER_CITATION, GGSCI_CITATION } from '../../../model/graph/palettes';
import { HEAT_GRADIENTS } from '../../../model/options/heatGradients';
import { HEAT_PALETTE_GROUPS } from '../../../model/options/heatmapOptions';
import type { HeatPalette } from '../../../model/types';
import { AllColours, GradientBar, PickerField, SourceLine } from '../common/Picker';

/** Relative luminance of a #rrggbb colour, to tell which end of a scale is the darker. */
const lum = (hex: string): number => [1, 3, 5].reduce((s, i, n) => s + [0.2126, 0.7152, 0.0722][n] * (parseInt(hex.slice(i, i + 2), 16) / 255) ** 2.2, 0);

/** The lines at the bottom of the window about a gradient: its bar, the colours it is made of, whether it is diverging, and where it comes from. */
function GradientInfo({ value, colours }: { value: HeatPalette; colours: readonly string[] }) {
  const g = HEAT_GRADIENTS.find((x) => x.value === value);
  if (!g) {
    return (
      <>
        <div><strong>Custom</strong> <span className="muted small">Your own scale</span></div>
        <GradientBar colors={colours} />
        <div className="small">A low and a high colour, and optionally a middle one (then the scale is diverging, centred on the centre value). Choosing it from a gradient copies the scale on screen.</div>
      </>
    );
  }
  const published = g.family === 'Published';
  // The viridis family and ColorBrewer maps are named colour maps whose stops were supplied as they are; no source is cited for them.
  const named = g.family === 'Viridis family' || g.family === 'ColorBrewer';
  const source = published ? DATAWRAPPER_CITATION : named ? null : GGSCI_CITATION;
  const direction = lum(g.colors[0]) < lum(g.colors.at(-1)!) ? 'dark to light' : 'light to dark';
  return (
    <>
      <div><strong>{g.family}: {g.name}</strong> <span className="muted small">{g.diverging ? 'Diverging, the middle is the centre value' : 'Sequential'} · {g.colors.length} colours</span></div>
      <GradientBar colors={colours} />
      <AllColours colors={g.colors} />
      <div className="small">Joined in RGB{g.diverging ? '' : `, from ${direction}`} (Reverse the colours flips it).{published ? ' Sampled from the gradients pictured in the article, so the values are approximate.' : ''}{named ? ' A named colour map, 11 stops as supplied.' : ''}</div>
      {source && <SourceLine text={source.text} url={source.url} />}
    </>
  );
}

/** The scale of a heat map: a button with the gradient in use that opens the window of gradients. `colours` samples a scale as the cells draw it. */
export function GradientField({ value, colours, onChoose }: { value: HeatPalette; colours: (p: HeatPalette) => string[]; onChoose: (p: HeatPalette) => void }) {
  const groups = HEAT_PALETTE_GROUPS.map((g) => ({ label: g.label, items: g.options.map((o) => ({ id: o.value, label: o.label, colors: colours(o.value) })) }));
  return (
    <PickerField<HeatPalette>
      fieldLabel="Scale"
      title="Heat-map gradients"
      windowHint="Click a gradient to colour the cells with it. Point at one to see it in full below."
      bar
      groups={groups}
      current={value}
      fallbackLabel="Custom"
      info={(id) => <GradientInfo value={id ?? value} colours={colours(id ?? value)} />}
      onPick={onChoose}
    />
  );
}
