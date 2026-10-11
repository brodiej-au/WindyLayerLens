export interface PointerDragHandlers {
    start(): void;
    /** Called with the pointer's offset from where the drag started. */
    move(dx: number, dy: number): void;
    end(): void;
}

/**
 * Svelte action: reports pointer drags that start on `node`.
 *
 * The pointer is captured for the duration of the drag, so moves keep arriving even
 * while the cursor is over the PIP's iframe (which would otherwise swallow them).
 * Drags that start on a form control inside `node` are left alone.
 */
export function pointerDrag(node: HTMLElement, handlers: PointerDragHandlers) {
    const onDown = (down: PointerEvent) => {
        if (down.button !== 0 || (down.target as Element).closest('select, button, input')) {
            return;
        }
        down.preventDefault();
        node.setPointerCapture(down.pointerId);
        handlers.start();

        const onMove = (e: PointerEvent) =>
            handlers.move(e.clientX - down.clientX, e.clientY - down.clientY);
        const onUp = () => {
            node.removeEventListener('pointermove', onMove);
            node.removeEventListener('pointerup', onUp);
            node.removeEventListener('pointercancel', onUp);
            handlers.end();
        };

        node.addEventListener('pointermove', onMove);
        node.addEventListener('pointerup', onUp);
        node.addEventListener('pointercancel', onUp);
    };

    node.addEventListener('pointerdown', onDown);

    return {
        destroy() {
            node.removeEventListener('pointerdown', onDown);
        },
    };
}
