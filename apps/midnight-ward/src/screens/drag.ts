export interface DragHandlers {
  /** Called once, when the pointer has moved far enough for this to be a drag and not a tap. */
  onStart: (x: number, y: number) => void;
  onMove: (x: number, y: number) => void;
  /** The pointer was released after a drag. */
  onEnd: (x: number, y: number) => void;
  /** The browser cancelled the gesture (a scroll took over, say). */
  onCancel: () => void;
  /** Decides whether a press may start a drag. Default: any press with the main button. */
  canStart?: (event: PointerEvent) => boolean;
  /** Makes the element that follows the pointer. Without it nothing follows. */
  ghost?: () => HTMLElement | null;
}

/** Pixels the pointer must move before a press becomes a drag. */
export const DRAG_THRESHOLD = 6;

/**
 * Drag with pointer events, so that mouse, pen and touch all work. A press that does not move is left to the
 * element's own click. After a drag, the click that follows the release is swallowed.
 */
export function makeDraggable(element: HTMLElement, handlers: DragHandlers): () => void {
  let start: { x: number; y: number; id: number } | null = null;
  let dragging = false;
  let ghost: HTMLElement | null = null;
  let swallow = false;

  const end = (): void => {
    ghost?.remove();
    ghost = null;
    start = null;
    dragging = false;
  };
  const down = (e: PointerEvent): void => {
    if (e.button > 0 || start) return;
    if (handlers.canStart && !handlers.canStart(e)) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    element.setPointerCapture?.(e.pointerId);
  };
  const move = (e: PointerEvent): void => {
    if (!start || e.pointerId !== start.id) return;
    if (!dragging) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD) return;
      dragging = true;
      ghost = handlers.ghost?.() ?? null;
      if (ghost) element.ownerDocument.body.append(ghost);
      handlers.onStart(e.clientX, e.clientY);
    }
    if (ghost) {
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
    }
    handlers.onMove(e.clientX, e.clientY);
    e.preventDefault();
  };
  const up = (e: PointerEvent): void => {
    if (!start || e.pointerId !== start.id) return;
    const was = dragging;
    end();
    if (was) {
      swallow = true;
      setTimeout(() => (swallow = false), 0);
      handlers.onEnd(e.clientX, e.clientY);
    }
  };
  const cancel = (e: PointerEvent): void => {
    if (!start || e.pointerId !== start.id) return;
    const was = dragging;
    end();
    if (was) handlers.onCancel();
  };
  const click = (e: Event): void => {
    if (swallow) {
      e.stopImmediatePropagation();
      e.preventDefault();
      swallow = false;
    }
  };

  element.addEventListener('pointerdown', down);
  element.addEventListener('pointermove', move);
  element.addEventListener('pointerup', up);
  element.addEventListener('pointercancel', cancel);
  element.addEventListener('click', click, true);
  return () => {
    end();
    element.removeEventListener('pointerdown', down);
    element.removeEventListener('pointermove', move);
    element.removeEventListener('pointerup', up);
    element.removeEventListener('pointercancel', cancel);
    element.removeEventListener('click', click, true);
  };
}
