/** What loading the other tab's copy costs; shown in the confirmation before this tab's project is replaced. */
export const LOAD_OTHER_TAB_WARNING =
  "Loading the other tab's copy replaces the project in this tab. Changes made in this tab since it last matched the browser's recovery copy are lost, unless you have saved them as a file.\n\nSave this tab as a file first if you want to keep them. Load the other tab's copy?";

interface Props {
  onKeep: () => void;
  onLoad: () => void;
  onSave: () => void;
}

/** Shown when another tab of this browser has written the recovery copy: autosave in this tab is paused until one of the three actions. */
export function RecoveryConflictBanner({ onKeep, onLoad, onSave }: Props) {
  return (
    <div
      role="alert"
      style={{ position: 'fixed', top: 46, left: '50%', transform: 'translateX(-50%)', zIndex: 50, maxWidth: 'min(760px, 94vw)', padding: '10px 14px', background: 'var(--panel)', border: '1px solid var(--danger)', borderRadius: 6, boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}
    >
      <strong>Another tab has changed the browser&apos;s recovery copy of this project.</strong>
      <p style={{ margin: '4px 0 8px' }}>Autosave in this tab is paused so that neither copy is overwritten without you choosing. Until you choose, this tab&apos;s latest changes are not backed up.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button onClick={onKeep} title="Overwrite the stored copy with this tab's project; the other tab will then be told">Keep this tab&apos;s copy</button>
        <button onClick={onLoad} title="Replace this tab's project with the stored copy (asks first)">Load the other tab&apos;s copy</button>
        <button onClick={onSave} title="Save this tab's project as a .oplot file">Save this tab as a file</button>
      </div>
    </div>
  );
}
