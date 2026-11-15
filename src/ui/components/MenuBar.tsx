import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useDismiss } from './useDismiss';

/** One row of a menu: an action, a switch (`checked` given), or a line between groups. */
export type MenuEntry =
  | { kind?: 'item'; hidden?: boolean; label: string; shortcut?: string; title?: string; disabled?: boolean; checked?: boolean; icon?: ReactNode; onSelect: () => void }
  | { kind: 'separator' };

export interface MenuSpec {
  label: string;
  /** True: the title is greyed out (nothing to offer here); `title` says why. */
  disabled?: boolean;
  title?: string;
  entries: MenuEntry[];
}

/**
 * The menu bar: File, Edit, View ... Click opens a menu, and with one open, moving to another title switches to it. Keyboard: Enter,
 * Space or Down opens a menu on its first item; Up and Down, Home and End move in it; Left and Right go to the next menu; Enter or
 * Space picks; Escape closes it and the focus goes back to its title.
 */
/** The entries that are shown: an entry marked hidden is left out (it belongs to another page), and no line is left at the top, at the foot or doubled. */
function visibleEntries(entries: MenuEntry[]): MenuEntry[] {
  const shown = entries.filter((e) => e.kind === 'separator' || !(e as { hidden?: boolean }).hidden);
  return shown.filter((e, i) => e.kind !== 'separator' || (i > 0 && i < shown.length - 1 && shown[i - 1].kind !== 'separator'));
}

export function MenuBar({ menus }: { menus: MenuSpec[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [at, setAt] = useState({ left: 0, top: 0 });
  const root = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const titles = useRef<Array<HTMLButtonElement | null>>([]);

  const enabled = () => [...(pop.current?.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]:not([disabled])') ?? [])];
  const show = (i: number) => {
    const r = titles.current[i]?.getBoundingClientRect();
    if (r) setAt({ left: r.left, top: r.bottom });
    setOpen(i);
  };
  const close = (refocus: boolean) => {
    const was = open;
    setOpen(null);
    if (refocus && was !== null) titles.current[was]?.focus();
  };
  useDismiss(open !== null, [root, pop], () => setOpen(null));

  // The first item takes the focus when a menu opens by keyboard (a pointer opens it without moving the focus).
  const byKey = useRef(false);
  useEffect(() => {
    if (open !== null && byKey.current) enabled()[0]?.focus();
    byKey.current = false;
  }, [open]);

  // The menu is pushed back inside the window when it would run past the right edge.
  const [shift, setShift] = useState(0);
  useEffect(() => {
    const el = pop.current;
    if (open === null || !el) return setShift(0);
    const overflow = at.left + el.offsetWidth - (window.innerWidth - 4);
    setShift(overflow > 0 ? overflow : 0);
  }, [open, at]);

  const onMenuKey = (e: KeyboardEvent) => {
    const list = enabled();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (k: number) => {
      e.preventDefault();
      list[(k + list.length) % list.length]?.focus();
    };
    const sideways = (d: number) => {
      e.preventDefault();
      byKey.current = true;
      const next = ((open ?? 0) + d + menus.length) % menus.length;
      show(next);
      titles.current[next]?.focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i < 0 ? list.length - 1 : i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if (e.key === 'ArrowRight') sideways(1);
    else if (e.key === 'ArrowLeft') sideways(-1);
    else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
  };

  const spec = open !== null && !menus[open].disabled ? { ...menus[open], entries: visibleEntries(menus[open].entries) } : null;
  return (
    <div className="menubar" role="menubar" aria-label="Menu" ref={root}>
      {menus.map((m, i) => (
        <button
          key={m.label}
          ref={(el) => {
            titles.current[i] = el;
          }}
          disabled={m.disabled}
          title={m.disabled ? m.title : undefined}
          className={`menubar-title${open === i ? ' open' : ''}`}
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={open === i}
          onClick={() => (open === i ? setOpen(null) : show(i))}
          onMouseEnter={() => open !== null && open !== i && !m.disabled && show(i)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              byKey.current = true;
              show(i);
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              titles.current[(i + (e.key === 'ArrowRight' ? 1 : menus.length - 1)) % menus.length]?.focus();
            }
          }}
        >
          {m.label}
        </button>
      ))}
      {spec && (
        <div ref={pop} className="menu-pop" role="menu" aria-label={spec.label} onKeyDown={onMenuKey} style={{ left: at.left - shift, top: at.top }}>
          {spec.entries.map((e, k) =>
            e.kind === 'separator' ? (
              <div key={k} className="menu-sep" role="separator" />
            ) : (
              <button
                key={k}
                role={e.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
                aria-checked={e.checked}
                tabIndex={-1}
                disabled={e.disabled}
                title={e.title}
                className="menu-item"
                onClick={() => {
                  close(false);
                  e.onSelect();
                }}
              >
                <span className="menu-mark" aria-hidden="true">{e.checked ? '✓' : (e.icon ?? '')}</span>
                <span className="menu-label">{e.label}</span>
                {e.shortcut && <span className="menu-shortcut">{e.shortcut}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
