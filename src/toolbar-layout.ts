import { setToolbarPosition, type ToolbarPosition } from './settings';

const margin = 8;

function viewport() {
  const visual = window.visualViewport;
  return {
    left: visual?.offsetLeft ?? 0,
    top: visual?.offsetTop ?? 0,
    width: visual?.width ?? document.documentElement.clientWidth,
    height: visual?.height ?? document.documentElement.clientHeight,
  };
}

// Menus and feedback follow the dock, including when it is near the top or left edge.
export function alignDockPanel(host: HTMLElement, panel: HTMLElement): void {
  const box = host.getBoundingClientRect();
  const view = viewport();
  const above = Math.max(0, box.top - view.top - 2 * margin);
  const below = Math.max(0, view.top + view.height - box.bottom - 2 * margin);
  panel.style.maxWidth = `${Math.max(1, view.width - 2 * margin)}px`;
  panel.style.maxHeight = `${Math.max(above, below)}px`;
  const panelBox = panel.getBoundingClientRect();
  const openAbove = above >= panelBox.height || above >= below;
  panel.style.bottom = openAbove ? 'calc(100% + 8px)' : 'auto';
  panel.style.top = openAbove ? 'auto' : 'calc(100% + 8px)';
  panel.style.right = 'auto';
  const left = Math.max(view.left + margin, Math.min(box.right - panelBox.width, view.left + view.width - margin - panelBox.width));
  panel.style.left = `${left - box.left}px`;
}

export function attachDockMovement(host: HTMLElement, grip: HTMLElement, link: HTMLAnchorElement, onMove: () => void, onLayout: () => void) {
  let saved: ToolbarPosition | null = null;
  let drag: { id: number; x: number; y: number; left: number; top: number; moved: boolean } | null = null;
  let suppressClick = false;

  function place(left: number, top: number): void {
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
    host.style.right = 'auto';
    host.style.bottom = 'auto';
  }

  function refresh(): void {
    if (!host.isConnected || drag?.moved) return;
    if (saved) {
      const area = dockBounds(viewport(), host.getBoundingClientRect());
      place(area.left + saved.x * area.travelX, area.top + saved.y * area.travelY);
    } else {
      for (const edge of ['left', 'top', 'right', 'bottom']) host.style.removeProperty(edge);
    }
    onLayout();
  }

  function move(left: number, top: number): ToolbarPosition {
    const area = dockBounds(viewport(), host.getBoundingClientRect());
    const dx = Math.max(0, Math.min(area.travelX, left - area.left));
    const dy = Math.max(0, Math.min(area.travelY, top - area.top));
    place(area.left + dx, area.top + dy);
    return { x: area.travelX ? dx / area.travelX : saved?.x ?? 0, y: area.travelY ? dy / area.travelY : saved?.y ?? 0 };
  }

  function remember(position: ToolbarPosition): void {
    saved = position;
    void setToolbarPosition(position).catch((error: unknown) => console.info('Back to arXiv: could not save toolbar position', error));
  }

  for (const target of [grip, link]) {
    target.addEventListener('pointerdown', (event) => {
      if (!event.isTrusted || !event.isPrimary || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      suppressClick = false;
      const { left, top } = host.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left, top, moved: false };
      target.setPointerCapture(event.pointerId);
    });
    target.addEventListener('pointermove', (event) => {
      if (!event.isTrusted || !drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < 6) return;
        drag.moved = true;
        host.setAttribute('data-dragging', '');
        onMove();
      }
      move(drag.left + dx, drag.top + dy);
    });
    target.addEventListener('pointerup', (event) => {
      if (!event.isTrusted || !drag || event.pointerId !== drag.id) return;
      if (drag.moved) {
        suppressClick = true;
        remember(move(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y));
      }
      drag = null;
      host.removeAttribute('data-dragging');
    });
    target.addEventListener('click', (event) => {
      if (suppressClick && event.detail > 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressClick = false;
      }
    }, true);
  }
  // When an SPA removes the captured element, the document receives this event.
  document.addEventListener('lostpointercapture', (event) => {
    if (event.pointerId === drag?.id) {
      drag = null;
      host.removeAttribute('data-dragging');
      refresh();
    }
  });
  link.draggable = false;

  grip.addEventListener('keydown', (event) => {
    if (!event.isTrusted) return;
    const step = event.shiftKey ? 48 : 12;
    const keys: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = keys[event.key];
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    const { left, top } = host.getBoundingClientRect();
    onMove();
    remember(move(left + delta[0], top + delta[1]));
  });

  new ResizeObserver(refresh).observe(host);
  window.addEventListener('resize', refresh);
  window.visualViewport?.addEventListener('resize', refresh);
  window.visualViewport?.addEventListener('scroll', refresh);
  return {
    refresh,
    setPosition(position: ToolbarPosition | null) { saved = position; refresh(); },
  };
}

/** The saved fractions use available travel, so the whole dock fits after a resize. */
export function dockBounds(view: { left: number; top: number; width: number; height: number }, dock: { width: number; height: number }) {
  return {
    left: view.left + margin, top: view.top + margin,
    travelX: Math.max(0, view.width - 2 * margin - dock.width),
    travelY: Math.max(0, view.height - 2 * margin - dock.height),
  };
}
