import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** Dismiss without consuming the outside action or moving its focus. */
export function useDismissibleLayer({ open, root, popup, onDismiss, returnFocus }: {
  open: boolean;
  root: RefObject<HTMLElement>;
  popup?: RefObject<HTMLElement>;
  onDismiss: () => void;
  returnFocus?: RefObject<HTMLElement>;
}) {
  const latest = useRef({ root, popup, onDismiss, returnFocus });
  latest.current = { root, popup, onDismiss, returnFocus };
  useEffect(() => {
    if (!open) return;
    function outside(event: Event) {
      const path = event.composedPath();
      const { root, popup } = latest.current;
      if ([root.current, popup?.current].some(container =>
        container && (path.includes(container) || event.target instanceof Node && container.contains(event.target)),
      )) return;
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
