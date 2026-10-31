/** Reserve only the floating composer's height when explicitly framing content. */
export function canvasReadingSize(canvas: HTMLElement) {
  const rect = canvas.getBoundingClientRect();
  const dock = canvas.parentElement?.querySelector('.conversation-dock')?.getBoundingClientRect();
  return {
    width: rect.width,
    height: dock ? Math.max(1, Math.min(rect.height, dock.top - rect.top - 16)) : rect.height,
  };
}
