import type { Project } from '../../model/types';
import type { DeletionEffects } from '../../state/deletionEffects';
import { Thumb, type ThumbItem } from '../views/FolderThumbs';
import { Modal } from './NewItemDialogs';

/** One picture of what would be deleted, with its name under it. */
function Card({ entry, name, project }: { entry: ThumbItem; name: string; project: Project }) {
  return (
    <figure className="delete-card">
      <div className="folder-thumb delete-thumb"><Thumb entry={entry} project={project} /></div>
      <figcaption title={name}>{name}</figcaption>
    </figure>
  );
}

/**
 * Asks before a deletion takes more than was asked for: the graphs and results of a deleted table, and the layouts left with no graph,
 * each shown as the small picture it has in the folder overview (the project is the one before the deletion). `what` names what was asked
 * for ("table Data 1", "3 graphs").
 */
export function ConfirmDeleteDialog({ what, effects, project, onConfirm, onClose }: { what: string; effects: DeletionEffects; project: Project; onConfirm: () => void; onClose: () => void }) {
  const charts = effects.charts.flatMap((c) => project.charts.filter((x) => x.id === c.id));
  const analyses = effects.analyses.flatMap((a) => (project.analyses ?? []).filter((x) => x.id === a.id));
  const layouts = effects.layouts.flatMap((l) => (project.layouts ?? []).filter((x) => x.id === l.id));
  return (
    <Modal title="Delete?" confirmLabel="Yes, delete" cancelLabel="No" enterConfirms={false} wide onConfirm={onConfirm} onClose={onClose}>
      <p style={{ margin: '0 0 8px' }}>Deleting {what} also deletes:</p>
      {charts.length > 0 && (
        <>
          <div className="delete-heading">{charts.length === 1 ? 'Graph' : `${charts.length} graphs`}</div>
          <div className="delete-cards">{charts.map((c) => <Card key={c.id} entry={{ kind: 'chart', item: c }} name={c.name} project={project} />)}</div>
        </>
      )}
      {analyses.length > 0 && (
        <>
          <div className="delete-heading">{analyses.length === 1 ? 'Result' : `${analyses.length} results`}</div>
          <div className="delete-cards">{analyses.map((a) => <Card key={a.id} entry={{ kind: 'analysis', item: a }} name={a.name} project={project} />)}</div>
        </>
      )}
      {layouts.length > 0 && (
        <>
          <div className="delete-heading">{layouts.length === 1 ? 'Layout' : `${layouts.length} layouts`}, left with no graph</div>
          <div className="delete-cards">{layouts.map((l) => <Card key={l.id} entry={{ kind: 'layout', item: l }} name={l.name} project={project} />)}</div>
        </>
      )}
      <p style={{ margin: '8px 0 0', color: 'var(--muted)' }}>Delete them all? Undo (Ctrl+Z) brings everything back.</p>
    </Modal>
  );
}
