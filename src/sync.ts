import type { WindyApi } from './pipWindow';

type Side = 'main' | 'pip';
type WindyMap = WindyApi['map']['map'];

// User input that can start a map movement. Whichever map received it last leads.
const INPUT_EVENTS = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const;
const MAP_EVENTS = ['move', 'moveend'] as const;

const SAME_DEG = 1e-7;
const SAME_ZOOM = 1e-3;

export interface MapLink {
    /** Re-applies the main map's view to the lens. Call it whenever the zoom shift has changed. */
    push(): void;
    dispose(): void;
}

/**
 * Keeps two Windy instances on the same map centre and forecast time.
 *
 * Position follows in both directions, with the lens zoomed by `zoomShift()` relative to
 * the main map. Each move of one map triggers a move event on the other, so only the
 * side the user last touched is allowed to lead; that stops them chasing each other.
 * Time is one-way: the lens has no timeline of its own.
 */
export function linkMaps(
    main: WindyApi,
    pip: WindyApi,
    pipDoc: Document,
    zoomShift: () => number,
): MapLink {
    const maps: Record<Side, WindyMap> = { main: main.map.map, pip: pip.map.map };
    let leader: Side = 'main';

    const follow = (from: Side) => {
        const source = maps[from];
        const target = maps[from === 'main' ? 'pip' : 'main'];

        const { lat, lng } = source.getCenter();
        const shift = from === 'main' ? zoomShift() : -zoomShift();
        const zoom = Math.min(
            target.getMaxZoom(),
            Math.max(target.getMinZoom(), source.getZoom() + shift),
        );

        const current = target.getCenter();
        const inPlace =
            Math.abs(current.lat - lat) < SAME_DEG &&
            Math.abs(current.lng - lng) < SAME_DEG &&
            Math.abs(target.getZoom() - zoom) < SAME_ZOOM;

        if (!inPlace) {
            // Plain array: a LatLng object from one window is not a LatLng in the other
            target.setView([lat, lng], zoom, { animate: false });
        }
    };

    const onMapMove: Record<Side, () => void> = {
        main: () => leader === 'main' && follow('main'),
        pip: () => leader === 'pip' && follow('pip'),
    };
    const lead: Record<Side, () => void> = {
        main: () => (leader = 'main'),
        pip: () => (leader = 'pip'),
    };
    const docs: Record<Side, Document> = { main: document, pip: pipDoc };
    const listenerOpts = { capture: true, passive: true };

    for (const side of ['main', 'pip'] as const) {
        INPUT_EVENTS.forEach(e => docs[side].addEventListener(e, lead[side], listenerOpts));
        MAP_EVENTS.forEach(e => maps[side].on(e, onMapMove[side]));
    }

    const onTimestamp = (ts: number) => pip.store.set('timestamp', ts);
    main.store.on('timestamp', onTimestamp);
    onTimestamp(main.store.get('timestamp'));

    const push = () => {
        leader = 'main';
        follow('main');
    };
    push();

    return {
        push,
        dispose() {
            main.store.off('timestamp', onTimestamp);
            for (const side of ['main', 'pip'] as const) {
                INPUT_EVENTS.forEach(e =>
                    docs[side].removeEventListener(e, lead[side], listenerOpts),
                );
                MAP_EVENTS.forEach(e => maps[side].off(e, onMapMove[side]));
            }
        },
    };
}
