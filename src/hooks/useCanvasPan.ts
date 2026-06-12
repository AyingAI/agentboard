import { useCallback, useEffect, useState } from 'react';

export function useCanvasPan() {
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isSpaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  // Space key tracking
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space' && !e.repeat) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        setSpaceHeld(true);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') {
        setSpaceHeld(false);
        setIsPanning(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent): boolean => {
      const shouldPan =
        (isSpaceHeld && e.button === 0) || e.button === 1;

      if (!shouldPan) return false;

      e.preventDefault();
      setIsPanning(true);

      const startX = e.clientX;
      const startY = e.clientY;
      const startPan = { ...panOffset };

      function onMove(ev: PointerEvent) {
        setPanOffset({
          x: startPan.x + (ev.clientX - startX),
          y: startPan.y + (ev.clientY - startY),
        });
      }

      function onUp() {
        setIsPanning(false);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      return true;
    },
    [isSpaceHeld, panOffset],
  );

  return { panOffset, isSpaceHeld, isPanning, handleCanvasPointerDown };
}
