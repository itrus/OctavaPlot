/** The parts of a keyboard event that decide whether it is the save shortcut. */
interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Ctrl+S (Windows, Linux) or Cmd+S (macOS), alone: with Alt or Shift held it is left to the browser. */
export const isSaveShortcut = (e: KeyLike): boolean => (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's';
