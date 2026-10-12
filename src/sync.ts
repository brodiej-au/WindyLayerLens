import type { WindyApi } from './pipWindow';

type Side = 'main' | 'pip';
type WindyMap = WindyApi['map']['map'];

// User input that can start a map movement. Whichever map received it last leads.
const INPUT_EVENTS = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const;
const MAP_EVENTS = ['move', 'moveend'] as const;

// Layers whose time is not the forecast time
const OWN_CLOCK_LAYERS = ['radar', 'satellite'];

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

    // The lens has no timeline of its own, so its time is pinned to the main map's.
    //
    // Radar and satellite run on a clock of their own. Windy copies that clock into `timestamp`,
    // so the main map's time can always be read there, but only the clock itself moves the
    // radar or satellite picture.
    const lensClock = () =>
        OWN_CLOCK_LAYERS.includes(pip.store.get('overlay')) ? 'radsatTimestamp' : 'timestamp';

    // A time the lens's layer has turned down, such as tomorrow for radar. Asking again for
    // the same time would only be turned down again.
    let refused: number | null = null;
    let settingTime = false;

    const showMainTime = () => {
        const wanted = main.store.get('timestamp');
        const clock = lensClock();

        // Setting the time makes Windy report changes of its own. Those are not news.
        if (settingTime || wanted === refused || pip.store.get(clock) === wanted) {
            return;
        }
        settingTime = true;
        try {
            pip.store.set(clock, wanted);
        } finally {
            settingTime = false;
        }
        refused = pip.store.get(clock) === wanted ? null : wanted;
    };

    main.store.on('timestamp', showMainTime);
    // Windy also moves the lens's time itself: it resets it when the layer changes, some of
    // that after the change has been announced, and it keeps live radar up to date
    pip.store.on('timestamp', showMainTime);
    pip.store.on('radsatTimestamp', showMainTime);
    const onLensLayer = () => {
        // Another layer may accept a time the last one turned down
        refused = null;
        showMainTime();
    };
    pip.store.on('overlay', onLensLayer);
    showMainTime();

    const push = () => {
        leader = 'main';
        follow('main');
    };
    push();

    return {
        push,
        dispose() {
            main.store.off('timestamp', showMainTime);
            pip.store.off('timestamp', showMainTime);
            pip.store.off('radsatTimestamp', showMainTime);
            pip.store.off('overlay', onLensLayer);
            for (const side of ['main', 'pip'] as const) {
                INPUT_EVENTS.forEach(e =>
                    docs[side].removeEventListener(e, lead[side], listenerOpts),
                );
                MAP_EVENTS.forEach(e => maps[side].off(e, onMapMove[side]));
            }
        },
    };
}
