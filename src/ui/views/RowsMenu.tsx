import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface RowsMenuItem {
  label: string;
  /** The keyboard shortcut, shown at the right of the item. */
  shortcut?: string;
  title?: string;
  disabled?: boolean;
  onSelect: () => void;
}

/**
 * A toolbar button that opens a menu of actions. Keyboard: Enter, Space or Down opens it on the first item; Up and Down,
 * Home and End move; Enter or Space picks; Escape or Tab closes it and the focus goes back to the button.
 */
export function RowsMenu({ label, icon, title, items }: { label: string; icon?: ReactNode; title?: string; items: RowsMenuItem[] }) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const open = at !== null;

  const enabled = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not([disabled])') ?? [])];
  const close = (refocus: boolean) => {
    setAt(null);
    if (refocus) button.current?.focus();
  };
  const show = () => {
    const r = button.current?.getBoundingClientRect();
    if (r) setAt({ left: r.left, top: r.bottom + 2 });
  };

  // The first item takes the focus when the menu opens.
  useEffect(() => {
    if (open) enabled()[0]?.focus();
  }, [open]);

  // A click anywhere else closes the menu.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (e.target instanceof Node && (menu.current?.contains(e.target) || button.current?.contains(e.target))) return;
      setAt(null);
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [open]);

  const onMenuKey = (e: KeyboardEvent) => {
    const list = enabled();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (k: number) => {
      e.preventDefault();
      list[(k + list.length) % list.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i < 0 ? list.length - 1 : i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
  };

  return (
    <>
      <button
        ref={button}
        className="icon-text"
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) show();
          }
        }}
      >
        {icon} {label} ▾
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          style={{ position: 'fixed', left: at.left, top: at.top, zIndex: 50, minWidth: 240, background: '#fff', border: '1px solid var(--border)', borderRadius: 4, boxShadow: '0 6px 18px rgba(0, 0, 0, 0.2)', padding: 4, display: 'grid' }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              title={item.title}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 16, textAlign: 'left', border: 'none', background: 'transparent' }}
              onClick={() => {
                close(false);
                item.onSelect();
              }}
            >
              <span>{item.label}</span>
              {item.shortcut && <span style={{ color: 'var(--muted)' }}>{item.shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
