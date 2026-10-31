import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** Dismiss without consuming the outside action or moving its focus. */
export function useDismissibleLayer({ open, root, onDismiss, returnFocus }: {
  open: boolean;
  root: RefObject<HTMLElement>;
  onDismiss: () => void;
  returnFocus?: RefObject<HTMLElement>;
}) {
  const latest = useRef({ root, onDismiss, returnFocus });
  latest.current = { root, onDismiss, returnFocus };
  useEffect(() => {
    if (!open) return;
    function outside(event: Event) {
      const container = latest.current.root.current;
      if (container && (event.composedPath().includes(container) || event.target instanceof Node && container.contains(event.target))) return;
      latest.current.onDismiss();
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault(); event.stopImmediatePropagation();
      latest.current.onDismiss();
      latest.current.returnFocus?.current?.focus({ preventScroll: true });
    }
    const blur = () => latest.current.onDismiss();
    // Focus inside an iframe does not bubble a pointer event into the host document.
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    document.addEventListener('wheel', outside, { capture: true, passive: true });
    window.addEventListener('keydown', escape, true);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
      document.removeEventListener('wheel', outside, true);
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', blur);
    };
  }, [open]);
}
