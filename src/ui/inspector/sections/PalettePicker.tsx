import { useMemo } from 'react';
import { COMPARED_COLOURS, safeColours, DATAWRAPPER_CITATION, GGSCI_CITATION, PALETTE_GROUPS, paletteById, palettesInGroup } from '../../../model/graph/palettes';
import type { Chart } from '../../../model/types';
import { useCommands } from '../../../state/AppContext';
import { applyPalette } from '../../../state/commands';
import { AllColours, PickerField, SourceLine } from '../common/Picker';

const GROUPS = PALETTE_GROUPS.map((g) => ({ label: g, items: palettesInGroup(g).map((p) => ({ id: p.id, label: p.name, colors: p.colors })) }));

/** How many of the first colours of a palette stay clearly apart for colour-blind viewers (measured, see colorVision.ts). */
function SafeLine({ colors }: { colors: readonly string[] }) {
  const n = useMemo(() => safeColours(colors), [colors]);
  if (n >= COMPARED_COLOURS) return <span className="vision vision-ok">Colourblind friendly for the first {COMPARED_COLOURS} colours</span>;
  if (n < 2) return <span className="muted vision">First two colours clash</span>;
  return <span className="muted vision">Colourblind friendly for the first {n} colours</span>;
}

/** The lines at the bottom of the window about a palette: its name, all its colours, what it is, and where it comes from. */
function PaletteInfo({ id }: { id: string | null }) {
  const palette = paletteById(id);
  if (!palette) return <span className="muted small">Point at a palette to see all its colours and where it comes from.</span>;
  const source = palette.group === 'Other' ? null : palette.group === 'Published styles' ? DATAWRAPPER_CITATION : GGSCI_CITATION;
  return (
    <>
      <div><strong>{palette.name}</strong> <span className="muted small">{palette.group} · {palette.colors.length} colours</span></div>
      <AllColours colors={palette.colors} />
      <div className="small">{palette.description} <SafeLine colors={palette.colors} /></div>
      {source && <SourceLine text={source.text} url={source.url} />}
    </>
  );
}

/** The colour palette of the data sets: choosing one gives the data sets coordinated colours in order. */
export function PaletteField({ chart, hint }: { chart: Chart; hint: string }) {
  const { run } = useCommands();
  return (
    <PickerField
      fieldLabel="Colour palette"
      hint={hint}
      title="Colour palettes"
      groups={GROUPS}
      current={chart.paletteId}
      fallbackLabel="Custom colours"
      info={(id) => <PaletteInfo id={id} />}
      onPick={(id) => {
        const p = paletteById(id);
        if (p) run(`Apply ${p.name} palette`, applyPalette(chart.id, p));
      }}
    />
  );
}
