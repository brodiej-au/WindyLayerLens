<svelte:window
    on:resize={onViewportResize}
    on:keydown|capture={onKeyDown}
    on:pointerdown|capture={onPointerDown}
/>

{#if !nested}
    <div
        class="pip dark-content"
        class:pip--floating={floating}
        class:pip--circle={round}
        class:pip--cover={covering}
        class:pip--dragging={dragging}
        style={windowStyle}
        bind:this={root}
    >
        <div class="pip__bar" use:pointerDrag={moveDrag} bind:this={bar}>
            <span class="pip__title">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                    <circle cx="6.75" cy="6.75" r="4.75" />
                    <path d="M10.3 10.3 14.5 14.5" />
                </svg>
                <span>{titleStart} <b>{titleEnd}</b></span>
                {#if introOn}
                    <svg
                        class="pip__pointer"
                        viewBox="0 0 16 20"
                        aria-hidden="true"
                        transition:fade={{ duration: 250 }}
                    >
                        <path d="M1.5 1.2v14.6l3.9-3.6 2.6 6 2.4-1-2.5-5.9h5.3z" />
                    </svg>
                {/if}
            </span>
            <button
                class="pip__layer"
                class:on={openPanel === 'layers'}
                disabled={!layer}
                title="Choose the layer shown in the lens"
                bind:this={layerButton}
                on:click={() => openPanelNamed(openPanel === 'layers' ? null : 'layers')}
            >
                {#if layer}
                    <img src={layerItem(layer.overlay).image} alt="" />
                    <span class="pip__layer-name">{overlays[layer.overlay].getName()}</span>
                    <small>{modelName(layer.product)}</small>
                {:else}
                    <span class="pip__layer-name">Layer</span>
                {/if}
                <span class="pip__caret">▾</span>
            </button>
            {#if floating}
                <button
                    class="pip__icon pip__cover"
                    class:on={covering}
                    title={covering ? 'Back to a lens' : 'Cover the whole map'}
                    on:click={() => setCovering(!covering)}
                >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                        {#if covering}
                            <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
                        {:else}
                            <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
                        {/if}
                    </svg>
                </button>
            {/if}
            <button
                class="pip__icon pip__options"
                class:on={openPanel === 'options'}
                title="View, shape, opacity and about"
                bind:this={optionsButton}
                on:click={() => openPanelNamed(openPanel === 'options' ? null : 'options')}
            >
                ⋯
            </button>
            <button class="pip__icon" title="Close" on:click={close}>✕</button>
        </div>
        <div class="pip__view" bind:this={view}>
            <iframe
                bind:this={iframe}
                {src}
                title={config.title}
                style:opacity={floating ? shownOpacity : null}
            ></iframe>
            {#if status}
                <div class="pip__status">{status}</div>
            {/if}
            {#if introOn}
                <div class="pip__hint" transition:fade={{ duration: 250 }}>
                    <b>Drag this lens around the map</b>
                    It shows the same place in another layer
                </div>
            {/if}
        </div>
        {#if round}
            <div class="pip__knob" title="Resize" use:pointerDrag={lensResizeDrag}>
                <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M4 8 8 4M8 4H5.2M8 4v2.8M4 8h2.8M4 8V5.2" />
                </svg>
            </div>
        {:else if floating && !covering}
            {#each RESIZE_GRIPS as edges}
                <div class="pip__grip pip__grip--{edges}" use:pointerDrag={resizeDrag(edges)}>
                    {#if edges === 'se'}
                        <svg viewBox="0 0 12 12" aria-hidden="true">
                            <path d="M9.5 3.5 3.5 9.5M9.5 7 7 9.5" />
                        </svg>
                    {/if}
                </div>
            {/each}
        {/if}
        {#if openPanel === 'layers' && layer}
            <div class="pip__panel dark-content" style={panelStyle} bind:this={panel} use:toBody>
                <LayerPicker {layer} set={setLayer} compact={!floating} />
            </div>
        {:else if openPanel === 'options'}
            <div class="pip__panel dark-content" style={panelStyle} bind:this={panel} use:toBody>
                <OptionsMenu
                    title={config.title}
                    version={config.version}
                    {mode}
                    {shape}
                    {floating}
                    {covering}
                    opacity={shownOpacity}
                    {setMode}
                    {setShape}
                    {setOpacity}
                    about={() => openPanelNamed('about')}
                />
            </div>
        {:else if openPanel === 'about'}
            <div class="pip__panel pip__panel--about dark-content" bind:this={panel} use:toBody>
                <About title={config.title} close={closePanel} />
            </div>
        {/if}
    </div>
{/if}

<script lang="ts">
    import bcast from '@windy/broadcast';
    import store from '@windy/store';
    import overlays from '@windy/overlays';
    import { map, whenMapInitialized } from '@windy/map';
    import { isMobileOrTablet } from '@windy/rootScope';
    import { afterUpdate, onDestroy, onMount } from 'svelte';
    import { fade } from 'svelte/transition';

    import About from './About.svelte';
    import LayerPicker from './LayerPicker.svelte';
    import OptionsMenu from './OptionsMenu.svelte';
    import config from './pluginConfig';
    import { layerItem, modelName, readLayerState, watchLayerState } from './layers';
    import { connectPip, pipUrl, releasePip } from './pipWindow';
    import { linkMaps } from './sync';
    import { watchMapBox } from './mapBox';
    import { pointerDrag } from './pointerDrag';

    import type { LayerState } from './layers';
    import type { Mode, Shape } from './options';
    import type { WindyApi } from './pipWindow';
    import type { MapLink } from './sync';
    import type { PointerDragHandlers } from './pointerDrag';
    import type { Levels, Overlays, Products } from './windyTypes';

    interface Box {
        left: number;
        top: number;
        width: number;
        height: number;
    }

    type Size = Pick<Box, 'width' | 'height'>;

    type Panel = 'layers' | 'options' | 'about' | null;

    /** How much of the lens's map shows, from 0.1 to 1. The rest is the main map underneath. */
    interface Opacity {
        lens: number;
        cover: number;
    }

    interface Saved {
        overlay: Overlays;
        product: Products;
        level: Levels;
        mode: Mode;
        shape: Shape;
        box: Box;
        cover: boolean;
        opacity: Opacity;
    }

    // Keep in step with the bar's height in the styles below
    const BAR_HEIGHT = 32;
    const DEFAULT_SIZE: Record<Shape, Size> = {
        rectangle: { width: 480, height: 320 },
        circle: { width: 300, height: 300 + BAR_HEIGHT },
    };
    const MIN_SIZE: Record<Shape, Size> = {
        rectangle: { width: 320, height: 200 },
        circle: { width: 160, height: 160 + BAR_HEIGHT },
    };

    const PICKER_WIDTH = 360;
    const PICKER_HEIGHT = 480;
    // On a phone the picker leaves more of the map in view
    const PICKER_HEIGHT_COMPACT = 420;
    const OPTIONS_WIDTH = 230;
    const OPTIONS_HEIGHT = 144;

    const DEFAULT_OPACITY: Opacity = { lens: 1, cover: 1 };
    const MIN_OPACITY = 0.1;
    const PANEL_GAP = 8;

    // The intro: how long after the lens is up it starts, how long the pointer is shown
    // before anything moves, how long the move out and back takes, and how far it goes
    const INTRO_START = 1200;
    const INTRO_LEAD = 700;
    const INTRO_MOVE = 2600;
    const INTRO_REACH = { x: 160, y: 90 };

    // One grip per edge and corner, named by the edges it moves
    const RESIZE_GRIPS = ['n', 'e', 's', 'w', 'nw', 'ne', 'sw', 'se'];

    // The title is set as a wordmark: its last word carries the weight
    const titleWords = config.title.split(' ');
    const titleEnd = titleWords.pop();
    const titleStart = titleWords.join(' ');

    // The lens's Windy has this plugin available too. Never open a lens inside the lens.
    const nested = window.top !== window.self;
    const floating = !isMobileOrTablet;

    const main: WindyApi = { store, overlays, map: { map, whenMapInitialized } };

    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

    const loadSaved = (): Partial<Saved> => {
        try {
            return JSON.parse(localStorage.getItem(config.name) || '{}');
        } catch (e) {
            return {};
        }
    };

    const saved = loadSaved();

    // What the lens starts on: the layer it had last time, or one that stands out
    // against what the main map is showing
    const startLayer = {
        overlay: saved.overlay ?? (store.get('overlay') === 'temp' ? 'wind' : 'temp'),
        product: saved.product,
        level: saved.level,
    };

    let mode: Mode = saved.mode ?? 'seamless';
    let shape: Shape = saved.shape ?? 'circle';
    /** Whether the lens is spread over the whole map. Only a lens that floats can be. */
    let covering = floating && (saved.cover ?? false);
    let opacity: Opacity = { ...DEFAULT_OPACITY, ...saved.opacity };

    const fitToViewport = ({ left, top, width, height }: Box): Box => {
        const min = MIN_SIZE[shape];
        width = clamp(width, min.width, window.innerWidth);
        height = clamp(height, min.height, window.innerHeight);
        return {
            width,
            height,
            left: clamp(left, 0, window.innerWidth - width),
            top: clamp(top, 0, window.innerHeight - height),
        };
    };

    // Bottom left by default: the one corner Windy's desktop UI leaves free
    let box = fitToViewport(
        saved.box ?? {
            left: 16,
            top: window.innerHeight - DEFAULT_SIZE[shape].height - 60,
            ...DEFAULT_SIZE[shape],
        },
    );
    // The size to go back to when a round lens is made rectangular again
    let rectangleSize = DEFAULT_SIZE.rectangle;

    const { lat, lng } = map.getCenter();
    // The view is only a starting point: it is put in place once the second Windy is up
    const src = pipUrl(startLayer, lat, lng, map.getZoom());

    let root: HTMLDivElement;
    let bar: HTMLDivElement;
    let view: HTMLDivElement;
    let iframe: HTMLIFrameElement;
    let layerButton: HTMLButtonElement;
    let optionsButton: HTMLButtonElement;
    let panel: HTMLDivElement;
    let mounted = false;
    let destroyed = false;
    let pip: WindyApi | null = null;
    let link: MapLink | null = null;
    /** Undoes what was attached to the second Windy once it was up. */
    let detachFromLens: (() => void) | null = null;
    let stopWatchingMap: (() => void) | null = null;
    /** What the lens shows. Unknown until the second Windy is up. */
    let layer: LayerState | null = null;
    let status = 'Starting second Windy…';
    let dragging = false;
    let openPanel: Panel = null;
    let panelStyle = '';
    /** Whether the user has pressed anything yet. Once they have, the intro is not wanted. */
    let userActed = false;
    let introOn = false;
    let introFrom = box;
    let introFrame = 0;
    let introTimer = 0;

    $: round = floating && shape === 'circle' && !covering;
    $: shownOpacity = covering ? opacity.cover : opacity.lens;

    /** Diameter of the round lens that fits a window of this size. */
    const lensSize = ({ width, height }: Size) => Math.min(width, height - BAR_HEIGHT);

    const save = () => {
        try {
            const { overlay, product, level } = layer ?? startLayer;
            const state: Partial<Saved> = {
                overlay,
                product,
                level,
                mode,
                shape,
                box,
                cover: covering,
                opacity,
            };
            localStorage.setItem(config.name, JSON.stringify(state));
        } catch (e) {
            // Storage unavailable: the lens just starts from defaults next time
        }
    };

    const setLayer = (key: 'overlay' | 'product' | 'level', value: string) => {
        // Windy checks the value itself and keeps the old one if this user cannot have it
        pip?.store.set(key, value as never);
    };

    // A lens over the whole map is seamless whichever view is chosen: it is as big as the map
    const seamless = () => mode === 'seamless' || covering;

    /** How much further out than the main map the lens is zoomed. */
    const zoomShift = (): number => {
        if (seamless()) {
            return 0;
        }
        // Full: zoomed out until the whole main view fits in the lens
        const lens = iframe.getBoundingClientRect();
        const mainView = map.getContainer().getBoundingClientRect();
        return Math.log2(Math.min(lens.width / mainView.width, lens.height / mainView.height));
    };

    /**
     * Sizes the second map for the current mode, then lines its view up with the main map's.
     * Both maps always share one centre; what differs is how big the second one is.
     *
     * Seamless: it is as big as the main map and lies exactly over it, so every pixel shows
     * the same place, and the window reveals the part it covers. Moving the window then
     * moves nothing on that map, so its wind animation carries on undisturbed.
     * Full: it is the size of the window's view, and zoomed out to fit the main map's.
     */
    const arrange = () => {
        const place = { left: '0', top: '0', width: '100%', height: '100%' };

        if (seamless()) {
            const mainView = map.getContainer().getBoundingClientRect();
            const lens = view.getBoundingClientRect();
            Object.assign(place, {
                left: `${mainView.left - lens.left}px`,
                top: `${mainView.top - lens.top}px`,
                width: `${mainView.width}px`,
                height: `${mainView.height}px`,
            });
        }
        Object.assign(iframe.style, place);
        link?.push();
    };

    const setMode = (next: Mode) => {
        mode = next;
        save();
    };

    const setShape = (next: Shape) => {
        if (next === shape) {
            return;
        }
        let size = rectangleSize;
        if (next === 'circle') {
            rectangleSize = { width: box.width, height: box.height };
            size = { width: lensSize(box), height: lensSize(box) + BAR_HEIGHT };
        }
        shape = next;
        // The lens changes shape around its middle
        box = fitToViewport({
            ...size,
            left: box.left + (box.width - size.width) / 2,
            top: box.top + (box.height - size.height) / 2,
        });
        save();
    };

    /**
     * Spreads the lens over the whole map, or gathers it back into its window. Over the whole
     * map it lies under Windy's own UI and lets every press through to the main map, which the
     * lens then follows; its bar floats on its own where the window's bar was.
     */
    const setCovering = (next: boolean) => {
        covering = next;
        save();
    };

    const setOpacity = (value: number) => {
        opacity = { ...opacity, [covering ? 'cover' : 'lens']: clamp(value, MIN_OPACITY, 1) };
        save();
    };

    const close = () => bcast.emit('rqstClose', config.name);

    const closePanel = () => (openPanel = null);

    /** Svelte action: moves a panel to the end of the page, clear of whatever would cover or clip it. */
    const toBody = (node: HTMLElement) => {
        document.body.appendChild(node);
        return {
            // Svelte takes away only the window when the lens closes, and the panel is no longer in it
            destroy: () => node.remove(),
        };
    };

    const placeOptions = (): string => {
        const button = optionsButton.getBoundingClientRect();
        const x = clamp(
            button.right - OPTIONS_WIDTH,
            PANEL_GAP,
            window.innerWidth - OPTIONS_WIDTH - PANEL_GAP,
        );
        // Under the button, or over it when the lens sits at the bottom of the screen
        const under = button.bottom + 6;
        const y =
            under + OPTIONS_HEIGHT <= window.innerHeight
                ? `top:${under}px`
                : `bottom:${window.innerHeight - button.top + 6}px`;
        return `left:${x}px;${y};width:${OPTIONS_WIDTH}px`;
    };

    /**
     * Puts the layer picker beside the window, so the lens stays in view while layers are
     * tried out. With no room on either side it drops down from the bar instead.
     */
    const placePicker = (): string => {
        const { innerWidth, innerHeight } = window;
        const w = Math.min(PICKER_WIDTH, innerWidth - 2 * PANEL_GAP);

        if (!floating) {
            // The lens sits in Windy's strip at the foot of the screen: the picker goes right above it
            const lensTop = root.getBoundingClientRect().top;
            const h = Math.min(PICKER_HEIGHT_COMPACT, lensTop - 2 * PANEL_GAP);
            const y = lensTop - PANEL_GAP - h;
            return `left:${(innerWidth - w) / 2}px;top:${y}px;width:${w}px;height:${h}px`;
        }

        const h = Math.min(PICKER_HEIGHT, innerHeight - 2 * PANEL_GAP);

        if (covering) {
            // Only the bar is left of the window: the picker drops from it, or rises from it
            // when the bar sits low on the screen
            const { left, top, bottom } = bar.getBoundingClientRect();
            const below = bottom + PANEL_GAP;
            const y = below + h + PANEL_GAP <= innerHeight ? below : top - PANEL_GAP - h;
            const x = clamp(left, PANEL_GAP, innerWidth - w - PANEL_GAP);
            return `left:${x}px;top:${clamp(y, PANEL_GAP, innerHeight - h - PANEL_GAP)}px;width:${w}px;height:${h}px`;
        }

        const { left, top, width } = box;
        const onRight = left + width + PANEL_GAP;
        const onLeft = left - PANEL_GAP - w;

        let x = left;
        let y = top + BAR_HEIGHT + PANEL_GAP;

        if (onRight + w + PANEL_GAP <= innerWidth) {
            [x, y] = [onRight, top];
        } else if (onLeft >= PANEL_GAP) {
            [x, y] = [onLeft, top];
        }

        x = clamp(x, PANEL_GAP, innerWidth - w - PANEL_GAP);
        y = clamp(y, PANEL_GAP, innerHeight - h - PANEL_GAP);
        return `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
    };

    /** Works out where the open panel goes. The about card needs nothing: it is centred. */
    const placePanel = () => {
        const place = { layers: placePicker, options: placeOptions };
        panelStyle = openPanel && openPanel !== 'about' ? place[openPanel]() : '';
    };

    const openPanelNamed = (which: Panel) => {
        openPanel = which;
        placePanel();
    };

    /** Ends the intro. Unless the user took hold of the lens itself, it goes back where it was. */
    const endIntro = (keepPlace: boolean) => {
        if (!introOn) {
            return;
        }
        cancelAnimationFrame(introFrame);
        introOn = false;
        if (!keepPlace) {
            box = introFrom;
        }
    };

    /**
     * Shows what the lens is for: with a pointer drawn on its bar, the window glides a short
     * way towards the middle of the map and back, as if someone were dragging it.
     */
    const playIntro = () => {
        const from = box;
        const towardsMiddle = (middle: number, start: number, size: number, reach: number) =>
            clamp(middle - (start + size / 2), -reach, reach);
        const dx = towardsMiddle(window.innerWidth / 2, from.left, from.width, INTRO_REACH.x);
        const dy = towardsMiddle(window.innerHeight / 2, from.top, from.height, INTRO_REACH.y);
        const started = performance.now();

        const step = (now: number) => {
            const progress = (now - started - INTRO_LEAD) / INTRO_MOVE;
            if (progress >= 1) {
                endIntro(false);
                return;
            }
            if (progress > 0) {
                // Out to the far point and back in one smooth sweep
                const reach = (1 - Math.cos(2 * Math.PI * progress)) / 2;
                box = { ...from, left: from.left + dx * reach, top: from.top + dy * reach };
            }
            introFrame = requestAnimationFrame(step);
        };

        introFrom = from;
        introOn = true;
        introFrame = requestAnimationFrame(step);
    };

    const onPointerDown = (e: PointerEvent) => {
        const path = e.composedPath();

        userActed = true;
        endIntro(path.includes(root));

        if (openPanel && ![panel, layerButton, optionsButton].some(el => path.includes(el))) {
            closePanel();
        }
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && openPanel) {
            // Windy closes its own windows on Escape; this one only closes the open panel
            e.stopPropagation();
            closePanel();
        }
    };

    let boxAtDragStart = box;

    const boxDrag = (apply: (start: Box, dx: number, dy: number) => Box): PointerDragHandlers => ({
        start() {
            dragging = true;
            boxAtDragStart = box;
        },
        move(dx, dy) {
            box = fitToViewport(apply(boxAtDragStart, dx, dy));
        },
        end() {
            dragging = false;
            save();
        },
    });

    const moveDrag = boxDrag((b, dx, dy) => ({ ...b, left: b.left + dx, top: b.top + dy }));

    // A grip moves the edges it is named after, as far as the viewport allows.
    // The opposite edges stay where they are.
    const resizeDrag = (edges: string) =>
        boxDrag((b, dx, dy) => {
            const min = MIN_SIZE.rectangle;
            let { left, top, width, height } = b;

            if (edges.includes('e')) {
                width = clamp(b.width + dx, min.width, window.innerWidth - b.left);
            }
            if (edges.includes('w')) {
                width = clamp(b.width - dx, min.width, b.left + b.width);
                left = b.left + b.width - width;
            }
            if (edges.includes('s')) {
                height = clamp(b.height + dy, min.height, window.innerHeight - b.top);
            }
            if (edges.includes('n')) {
                height = clamp(b.height - dy, min.height, b.top + b.height);
                top = b.top + b.height - height;
            }
            return { left, top, width, height };
        });

    // The round lens keeps its top left where it is and stays round
    const lensResizeDrag = boxDrag((b, dx, dy) => {
        const size = clamp(
            lensSize(b) + (dx + dy) / 2,
            MIN_SIZE.circle.width,
            Math.min(window.innerWidth - b.left, window.innerHeight - b.top - BAR_HEIGHT),
        );
        return { ...b, width: size, height: size + BAR_HEIGHT };
    });

    const onViewportResize = () => {
        box = fitToViewport(box);
        // On a phone this also fires when the keyboard comes up for the picker's search box
        placePanel();
    };

    // The window follows `box`. `--lens` is the diameter of the round lens that fits in it.
    // Over the whole map only the bar follows it, centred where the window's bar was.
    $: windowStyle = !floating
        ? ''
        : covering
          ? `--bar-x:${box.left + box.width / 2}px;--bar-y:${box.top}px`
          : `left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;` +
            `--lens:${lensSize(box)}px`;

    // Runs once the page shows the current state, so the second map is always measured against
    // the lens as it really is: after a move, a resize, or a change of shape or mode
    afterUpdate(() => {
        if (mounted) {
            arrange();
        }
    });

    onMount(() => {
        if (nested) {
            close();
            return;
        }

        // Windy's own container for this plugin
        const host = root.parentElement as HTMLElement;
        host.classList.add(floating ? 'pip-host--floating' : 'pip-host--inline');

        if (floating) {
            // Parts of Windy's UI (search, forecast card) are drawn over that container whatever
            // its z-index. A window that can be dragged anywhere has to live outside it.
            // It goes straight after the main map: Windy stacks its UI by page order, so a lens
            // spread over the whole map stays under that UI, while the window is raised above it.
            const mapBlock = [...document.body.children].find(el => el.contains(map.getContainer()));
            document.body.insertBefore(root, mapBlock?.nextSibling ?? null);
        }
        mounted = true;
        // Windy moves the main map aside for some of its panes, and the lens has to move with it
        stopWatchingMap = watchMapBox(map.getContainer(), arrange);

        connectPip(iframe)
            .then(api => {
                if (destroyed) {
                    return;
                }
                const pipDoc = iframe.contentDocument as Document;

                pip = api;
                layer = readLayerState(api);
                const stopWatchingLayer = watchLayerState(api, next => {
                    layer = next;
                    save();
                });
                link = linkMaps(main, api, pipDoc, zoomShift);
                // Presses inside the lens's map never reach this window
                pipDoc.addEventListener('pointerdown', onPointerDown, true);

                detachFromLens = () => {
                    stopWatchingLayer();
                    pipDoc.removeEventListener('pointerdown', onPointerDown, true);
                    releasePip(pipDoc);
                };
                status = '';

                introTimer = window.setTimeout(() => {
                    // Moving the lens only shows something new in seamless mode
                    if (floating && mode === 'seamless' && !covering && !userActed) {
                        playIntro();
                    }
                }, INTRO_START);
            })
            .catch((e: Error) => {
                status = e.message;
            });
    });

    onDestroy(() => {
        destroyed = true;
        clearTimeout(introTimer);
        cancelAnimationFrame(introFrame);
        stopWatchingMap?.();
        // The second Windy is discarded with its iframe, but nothing of ours is left hanging on it
        detachFromLens?.();
        link?.dispose();
    });
</script>

<style lang="less">
    // Size of the resize grips: the strip along each edge, and the square in each corner
    @edge: 5px;
    @corner: 12px;
    @bar: 32px;
    @accent: var(--color-orange, #d49500);
    @surface: var(--color-gray-dark, #4d4d4d);

    // Desktop: the lens is a window of its own and Windy's container for the plugin stays empty
    :global(.pip-host--floating) {
        display: none;
    }

    // Mobile: the lens fills Windy's small plugin slot, which is capped at this height
    :global(.pip-host--inline) {
        position: relative;
        height: 200px;
        padding: 0 !important;
        overflow: hidden;
    }

    // The bar has its own close button, placed where it does not cover the controls
    :global(.pip-host--inline > .closing-x) {
        display: none;
    }

    .pip {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
    }

    .pip--floating {
        position: fixed;
        inset: auto;
        // Above Windy's standing UI, below its pop-up windows
        z-index: 50;
        overflow: hidden;
        border-radius: 8px;
        color: #fff;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);

        // Only the bar is filled in, so the main map shows through a see-through lens
        .pip__bar {
            background-color: @surface;
        }
    }

    // The bar alone, as a pill of controls: over a round lens, or over the whole map
    .pill() {
        gap: 4px;
        height: @bar - 4px;
        padding: 0 6px;
        border-radius: (@bar - 4px) / 2;
        background-color: @surface;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);

        // Only the mark is left of the title, as something to drag the lens by
        .pip__title {
            flex: none;
            width: 22px;
            justify-content: center;

            span {
                display: none;
            }

            .pip__pointer {
                left: 8px;
            }
        }
    }

    .pip__bar {
        flex: none;
        display: flex;
        align-items: center;
        gap: 6px;
        box-sizing: border-box;
        height: @bar;
        padding: 2px @corner 0;
        cursor: move;
        user-select: none;
        touch-action: none;

        button {
            flex: none;
            height: 22px;
            padding: 0 8px;
            border: 0;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.15);
            color: inherit;
            font-size: 12px;
            line-height: 22px;
            cursor: pointer;

            &:hover {
                background: rgba(255, 255, 255, 0.3);
            }

            &.on {
                background: @accent;
            }
        }
    }

    // The words are the first thing to give way when the window is narrow
    .pip__title {
        position: relative;
        flex: 1 1 0;
        min-width: 16px;
        display: flex;
        align-items: center;
        gap: 6px;
        color: rgba(255, 255, 255, 0.72);
        // Windy's own rounded typeface
        font: 17px/1 bariolmedium, sans-serif;

        svg {
            flex: none;
            width: 15px;
            height: 15px;
            fill: none;
            stroke: @accent;
            stroke-width: 1.8;
            stroke-linecap: round;
        }

        span {
            overflow: hidden;
            // Room for descenders, which the tight line height would otherwise clip
            padding-bottom: 2px;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        b {
            color: #fff;
            font-weight: normal;
        }
    }

    // The intro's stand-in for the user's pointer, resting on the bar
    .pip__title .pip__pointer {
        position: absolute;
        left: 22px;
        top: 6px;
        width: 16px;
        height: 20px;
        fill: #fff;
        stroke: #222;
        stroke-width: 1;
        stroke-linejoin: round;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
        pointer-events: none;
    }

    .pip__bar .pip__layer {
        flex: 0 1 auto;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 8px 0 2px;
        border-radius: 11px;

        &:disabled {
            padding-left: 8px;
            opacity: 0.5;
            cursor: default;
        }

        img {
            flex: none;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            object-fit: cover;
        }

        small {
            flex: none;
            font-size: 10px;
            opacity: 0.65;
        }
    }

    .pip__layer-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .pip__caret {
        flex: none;
        font-size: 9px;
        opacity: 0.7;
    }

    .pip__bar .pip__icon {
        width: 22px;
        padding: 0;

        svg {
            display: block;
            width: 12px;
            height: 12px;
            margin: auto;
            fill: none;
            stroke: currentColor;
            stroke-width: 1.6;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
    }

    .pip__view {
        position: relative;
        flex: 1;
        min-height: 0;
        // In seamless mode the map inside is far bigger than this view of it
        overflow: hidden;
    }

    iframe {
        position: absolute;
        display: block;
        border: 0;
    }

    // Keep the pointer with the drag instead of letting the inner map grab it
    .pip--dragging iframe {
        pointer-events: none;
    }

    .pip__status {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 12px;
        background: #3d3d3d;
        font-size: 12px;
        text-align: center;
    }

    .pip__hint {
        position: absolute;
        left: 50%;
        bottom: 14%;
        transform: translateX(-50%);
        width: max-content;
        max-width: 76%;
        padding: 8px 14px;
        border-radius: 10px;
        background: rgba(30, 30, 30, 0.85);
        font-size: 12px;
        line-height: 1.4;
        text-align: center;
        pointer-events: none;

        b {
            display: block;
            font-size: 13px;
        }
    }

    // Panels live at the end of the page, above the lens and Windy's own UI
    .pip__panel {
        position: fixed;
        z-index: 51;
        overflow: hidden;
        border-radius: 8px;
        background-color: @surface;
        color: #fff;
        box-shadow: 0 6px 28px rgba(0, 0, 0, 0.55);
    }

    .pip__panel--about {
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 380px;
        max-width: calc(100vw - 32px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        background-color: #1e1c31;
    }

    .pip__grip {
        position: absolute;
        touch-action: none;

        // Marks the corner most people reach for
        svg {
            display: block;
            fill: none;
            stroke: #fff;
            stroke-width: 1.4;
            stroke-linecap: round;
            filter: drop-shadow(0 0 1px #000);
            pointer-events: none;
        }
    }

    .pip__grip--n,
    .pip__grip--s {
        left: @corner;
        right: @corner;
        height: @edge;
        cursor: ns-resize;
    }

    .pip__grip--e,
    .pip__grip--w {
        top: @corner;
        bottom: @corner;
        width: @edge;
        cursor: ew-resize;
    }

    .pip__grip--nw,
    .pip__grip--ne,
    .pip__grip--sw,
    .pip__grip--se {
        width: @corner;
        height: @corner;
    }

    .pip__grip--nw,
    .pip__grip--se {
        cursor: nwse-resize;
    }

    .pip__grip--ne,
    .pip__grip--sw {
        cursor: nesw-resize;
    }

    .pip__grip--n,
    .pip__grip--nw,
    .pip__grip--ne {
        top: 0;
    }

    .pip__grip--s,
    .pip__grip--sw,
    .pip__grip--se {
        bottom: 0;
    }

    .pip__grip--w,
    .pip__grip--nw,
    .pip__grip--sw {
        left: 0;
    }

    .pip__grip--e,
    .pip__grip--ne,
    .pip__grip--se {
        right: 0;
    }

    // A round lens: the window itself disappears, leaving a pill of controls over a circle
    .pip--circle {
        overflow: visible;
        border-radius: 0;
        background: none;
        box-shadow: none;
        // The corners around the circle belong to the map underneath
        pointer-events: none;

        .pip__bar,
        .pip__view,
        .pip__knob {
            pointer-events: auto;
        }

        .pip__bar {
            .pill();
            align-self: center;
            margin-bottom: 4px;
        }

        // The caption has to fit across the circle, which narrows towards the rim
        .pip__hint {
            bottom: 20%;
            max-width: 75%;
        }

        .pip__view {
            flex: none;
            align-self: center;
            width: var(--lens);
            height: var(--lens);
            border-radius: 50%;
            // Makes the round corners clip the map in every browser
            isolation: isolate;
            box-shadow:
                0 0 0 3px @surface,
                0 0 0 4px rgba(255, 255, 255, 0.35),
                0 6px 24px rgba(0, 0, 0, 0.5);
        }
    }

    // Over the whole map the window itself goes, leaving its two parts to be placed apart
    .pip--cover {
        display: contents;

        .pip__bar {
            .pill();
            position: fixed;
            left: var(--bar-x);
            top: var(--bar-y);
            // Above Windy's UI, like the window
            z-index: 50;
            transform: translateX(-50%);
        }

        // No z-index: placed straight after the main map on the page, it is drawn over that
        // map and under the Windy UI that follows
        .pip__view {
            position: fixed;
            inset: 0;
            // Every press goes through to the main map, and the lens follows it
            pointer-events: none;
        }

        // Starting up takes a while: say so without hiding the map
        .pip__status {
            inset: auto;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            padding: 8px 14px;
            border-radius: 10px;
            background: rgba(30, 30, 30, 0.85);
        }
    }

    // Sits on the rim of the round lens, at its lower right
    .pip__knob {
        position: absolute;
        left: calc(50% + var(--lens) * 0.3536 - 9px);
        top: calc(@bar + var(--lens) * 0.8536 - 9px);
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background-color: @surface;
        box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.35),
            0 2px 6px rgba(0, 0, 0, 0.5);
        cursor: nwse-resize;
        touch-action: none;

        svg {
            width: 12px;
            height: 12px;
            fill: none;
            stroke: #fff;
            stroke-width: 1.2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
    }
</style>
