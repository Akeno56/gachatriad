'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { LocaleView } from './i18n';

export function Button({
  variant = 'outline',
  busy = false,
  disabled,
  type = 'button',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost';
  busy?: boolean;
}) {
  const style = variant === 'ghost' ? 'text-button' : `${variant}-button`;
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`${style} ${className}`}
    >
      {busy && <span className="ui-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Tabs({
  items,
  value,
  onChange,
  label,
  className = '',
  panelId,
}: {
  items: readonly { value: string; label: string; disabled?: boolean }[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
  panelId?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  return (
    <div ref={root} className={`ui-tabs ${className}`} role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          aria-controls={panelId}
          tabIndex={value === item.value ? 0 : -1}
          disabled={item.disabled}
          onClick={() => onChange(item.value)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const enabled = items.filter((item) => !item.disabled);
            const index = enabled.findIndex((item) => item.value === value);
            const next =
              event.key === 'Home'
                ? enabled[0]
                : event.key === 'End'
                  ? enabled.at(-1)
                  : enabled[
                      (index + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) %
                        enabled.length
                    ];
            if (!next) return;
            onChange(next.value);
            root.current
              ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
              [items.indexOf(next)]?.focus();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const [dismissed, setDismissed] = useState(false);
  return (
    <span
      className="ui-help"
      data-dismissed={dismissed || undefined}
      onPointerEnter={() => setDismissed(false)}
    >
      <button
        type="button"
        className="ui-help-trigger"
        aria-label={label}
        aria-describedby={id}
        onFocus={() => setDismissed(false)}
        onBlur={() => setDismissed(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setDismissed(true);
          }
        }}
      >
        ?
      </button>
      <span id={id} role="tooltip" className="ui-tooltip">
        {children}
      </span>
    </span>
  );
}

export function GameDialog({
  open,
  onClose,
  labelledBy,
  describedBy,
  className = '',
  children,
  initialFocus,
  dismissible = true,
  closeLabel = 'Close dialog',
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  className?: string;
  children: ReactNode;
  initialFocus?: RefObject<HTMLElement | null>;
  dismissible?: boolean;
  closeLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted || !open || !ref.current) return;
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    initialFocus?.current?.focus({ preventScroll: true });
    dialog.scrollTop = 0;
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [mounted, open, initialFocus]);
  if (!mounted || !open) return null;
  return createPortal(
    <LocaleView>
      <dialog
        ref={ref}
        className={`game-dialog menu-window ui-dialog ${className}`}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onCancel={(event) => {
          event.preventDefault();
          if (dismissible) onClose();
        }}
      >
        <button
          type="button"
          className="dialog-close"
          aria-label={closeLabel}
          disabled={!dismissible}
          onClick={onClose}
        >
          ×
        </button>
        {children}
      </dialog>
    </LocaleView>,
    document.querySelector('.game-shell') ?? document.body,
  );
}
