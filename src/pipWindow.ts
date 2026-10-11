import type store from '@windy/store';
import type overlays from '@windy/overlays';
import type * as mapModule from '@windy/map';

/** The part of a Windy instance (its `W` global) that the PIP reads and drives. */
export interface WindyApi {
    store: typeof store;
    overlays: typeof overlays;
    map: Pick<typeof mapModule, 'map' | 'whenMapInitialized'>;
}

type PipWindow = Window & { W?: Partial<WindyApi>; Storage: typeof Storage };

const POLL_MS = 100;
const STYLE_ID = 'windy-plugin-pip-chrome';

// The second Windy is a complete app. Leave only its map on screen.
const HIDE_CHROME_CSS = 'body > *:not(#map-container) { display: none !important; }';

/** URL that starts a Windy instance on the given layer and map view. */
export function pipUrl(
    layer: { overlay: string; product?: string; level?: string },
    lat: number,
    lng: number,
    zoom: number,
): string {
    // Windy tells the three apart by their values, so the ones not given can simply be left out
    const start = [layer.product, layer.overlay, layer.level].filter(Boolean);
    const view = [lat.toFixed(3), lng.toFixed(3), Math.round(zoom)];
    return `${location.origin}/?${[...start, ...view].join(',')}`;
}

/**
 * Turns the second Windy into a map that is only for looking at: nothing but the map
 * stays on screen, and clicking it does nothing. Dragging and zooming still work.
 */
function quieten(doc: Document): void {
    if (!doc.head || doc.getElementById(STYLE_ID)) {
        return;
    }
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = HIDE_CHROME_CSS;
    doc.head.appendChild(style);

    // Windy answers a click on its map by opening the picker there, or a place's forecast
    doc.addEventListener('click', e => e.stopPropagation(), true);
}

/**
 * Both Windy instances share one origin, hence one localStorage. Windy persists user
 * settings there as `settings_*` (last position, startup overlay, ...), so without this
 * the PIP would overwrite what the main map starts with next time. The patch lives on
 * the iframe's own `Storage.prototype` and does not touch the main window.
 */
function guardSettings(win: PipWindow): void {
    const proto = win.Storage.prototype as Storage & { pipGuarded?: boolean };
    if (proto.pipGuarded) {
        return;
    }
    const isSetting = (key: string) =>
        String(key).startsWith('settings_') || key === 'lastSyncableUpdatedItem';
    const { setItem, removeItem } = proto;

    proto.setItem = function (key: string, value: string) {
        if (!isSetting(key)) {
            setItem.call(this, key, value);
        }
    };
    proto.removeItem = function (key: string) {
        if (!isSetting(key)) {
            removeItem.call(this, key);
        }
    };
    proto.pipGuarded = true;
}

function loadedApi(win: PipWindow): WindyApi | null {
    const W = win.W;
    return W?.store && W.overlays && W.map?.map ? (W as WindyApi) : null;
}

/**
 * Resolves with the API of the Windy instance loading inside `iframe`, once its map is
 * ready to be driven. Rejects if the iframe goes away or Windy does not start in time.
 *
 * Call it as soon as the iframe is in the document: the first pass then runs while the
 * iframe is still blank. Browsers keep that blank window for a same-origin page loading
 * into it, so the settings guard is in place before any of Windy's code runs. The later
 * passes cover a browser that swaps the window instead.
 */
export function connectPip(iframe: HTMLIFrameElement, timeoutMs = 60000): Promise<WindyApi> {
    return new Promise((resolve, reject) => {
        const started = Date.now();

        const fail = (message: string) => {
            clearInterval(timer);
            reject(new Error(message));
        };

        const poll = () => {
            const win = iframe.contentWindow as PipWindow | null;

            if (!iframe.isConnected || !win) {
                fail('PIP was closed');
                return;
            }

            try {
                // Both do nothing once applied to the current window and document
                guardSettings(win);
                quieten(win.document);

                const api = loadedApi(win);
                if (api) {
                    clearInterval(timer);
                    api.map.whenMapInitialized(() => resolve(api));
                    return;
                }
            } catch (e) {
                fail(`Second Windy is not reachable: ${e}`);
                return;
            }

            if (Date.now() - started > timeoutMs) {
                fail('Second Windy did not start in time');
            }
        };

        const timer = setInterval(poll, POLL_MS);
        poll();
    });
}
