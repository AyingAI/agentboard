import { useCallback, useEffect, useState } from 'react';
import { zoomAroundPoint } from '../engine/viewport';

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.4;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function useCanvasPan() {
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
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

  const handleCanvasWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!e.metaKey && !e.ctrlKey) return;

      e.preventDefault();

      const rect = e.currentTarget.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const nextZoom = clampZoom(zoom * Math.exp(-e.deltaY * 0.0015));
      if (nextZoom === zoom) return;

      const worldX = (localX - panOffset.x) / zoom;
      const worldY = (localY - panOffset.y) / zoom;

      setZoom(nextZoom);
      setPanOffset({
        x: localX - worldX * nextZoom,
        y: localY - worldY * nextZoom,
      });
    },
    [panOffset, zoom],
  );

  const setViewport = useCallback((next: { panOffset: { x: number; y: number }; zoom: number }) => {
    setPanOffset(next.panOffset);
    setZoom(clampZoom(next.zoom));
  }, []);

  const zoomAt = useCallback((nextZoom: number, point: { x: number; y: number }) => {
    const next = zoomAroundPoint({ panOffset, zoom }, clampZoom(nextZoom), point);
    setPanOffset(next.panOffset);
    setZoom(next.zoom);
  }, [panOffset, zoom]);

  const resetViewport = useCallback(() => {
    setPanOffset({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  return {
    panOffset,
    setPanOffset,
    zoom,
    setViewport,
    zoomAt,
    resetViewport,
    isSpaceHeld,
    isPanning,
    handleCanvasPointerDown,
    handleCanvasWheel,
  };
}
