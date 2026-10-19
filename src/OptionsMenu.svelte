<div class="menu">
    <div class="menu__row" class:off={covering} title={covering ? COVERING_HINT : null}>
        <span class="menu__label">View</span>
        <div class="menu__choice">
            {#each MODES as { id, name, hint }}
                <button
                    class:on={shownMode === id}
                    title={covering ? null : hint}
                    disabled={covering}
                    on:click={() => setMode(id)}
                >
                    {name}
                </button>
            {/each}
        </div>
    </div>
    {#if floating}
        <div class="menu__row" class:off={covering} title={covering ? COVERING_HINT : null}>
            <span class="menu__label">Shape</span>
            <div class="menu__choice">
                {#each SHAPES as { id, name }}
                    <button
                        class:on={shownShape === id}
                        disabled={covering}
                        on:click={() => setShape(id)}
                    >
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                            {#if id === 'circle'}
                                <circle cx="8" cy="8" r="5.5" />
                            {:else}
                                <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
                            {/if}
                        </svg>
                        {name}
                    </button>
                {/each}
            </div>
        </div>
    {/if}
    {#if floating}
        <label class="menu__row" title="How much of the main map shows through the lens">
            <span class="menu__label">Opacity</span>
            <input
                class="menu__slider"
                style:--fill="{((percent - 10) / 90) * 100}%"
                type="range"
                min="10"
                max="100"
                step="5"
                value={percent}
                on:input={e => setOpacity(Number(e.currentTarget.value) / 100)}
            />
            <span class="menu__value">{percent}%</span>
        </label>
    {/if}
    <div class="menu__footer">
        <button class="menu__about" on:click={about}>About {title}</button>
        <span class="menu__version">v{version}</span>
    </div>
</div>

<script lang="ts">
    import { MODES, SHAPES } from './options';

    import type { Mode, Shape } from './options';

    export let title: string;
    export let version: string;
    export let mode: Mode;
    export let shape: Shape;
    /**
     * False on phones and tablets, where the lens is docked in Windy's strip at the foot of the
     * screen: it has no outline of its own to change, and Windy fills in what is behind it.
     */
    export let floating: boolean;
    /**
     * Whether the lens is spread over the whole map. View and shape cannot be changed there,
     * but are still shown, as what the lens can do once gathered back into its window.
     */
    export let covering: boolean;
    /** The lens's current opacity, from 0.1 to 1. */
    export let opacity: number;
    export let setMode: (mode: Mode) => void;
    export let setShape: (shape: Shape) => void;
    export let setOpacity: (opacity: number) => void;
    export let about: () => void;

    const COVERING_HINT = 'For the lens in its window. Over the whole map it shows exactly what it covers.';

    // Over the whole map the lens shows exactly what it covers, and is neither round nor a
    // window: the choices made for the window are kept for when it goes back to one
    $: shownMode = covering ? 'seamless' : mode;
    $: shownShape = covering ? null : shape;
    $: percent = Math.round(opacity * 100);
</script>

<style lang="less">
    @accent: var(--color-orange, #d49500);

    .menu {
        padding: 10px 10px 6px;
        font-size: 12px;
    }

    .menu__row {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
    }

    // Shown, but not for now
    .menu__row.off {
        opacity: 0.4;

        button:hover:not(.on) {
            background: rgba(255, 255, 255, 0.13);
        }
    }

    .menu__label {
        flex: none;
        width: 44px;
        font-size: 11px;
        opacity: 0.6;
    }

    .menu__choice {
        flex: 1;
        display: flex;
        overflow: hidden;
        border-radius: 4px;
    }

    button {
        border: 0;
        color: inherit;
        font-size: 12px;
        cursor: pointer;
    }

    .menu__choice button {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        height: 24px;
        padding: 0 8px;
        background: rgba(255, 255, 255, 0.13);
        white-space: nowrap;

        &:hover {
            background: rgba(255, 255, 255, 0.25);
        }

        &.on {
            background: @accent;
        }

        &:disabled {
            cursor: default;
        }

        svg {
            width: 13px;
            height: 13px;
            fill: none;
            stroke: currentColor;
            stroke-width: 1.6;
        }
    }

    // Drawn like the buttons beside it, over Windy's own styling of inputs. `--fill` is how far
    // along the track the handle is.
    @track: rgba(255, 255, 255, 0.35);

    .menu__slider {
        flex: 1;
        min-width: 0;
        box-sizing: border-box;
        height: 24px;
        margin: 0;
        padding: 0 8px;
        border: 0;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.13);
        appearance: none;
        cursor: pointer;

        &:hover {
            background: rgba(255, 255, 255, 0.25);
        }

        &::-webkit-slider-runnable-track {
            height: 3px;
            border-radius: 2px;
            background: linear-gradient(to right, @accent var(--fill), @track var(--fill));
        }

        &::-webkit-slider-thumb {
            width: 12px;
            height: 12px;
            margin-top: -4.5px;
            border-radius: 50%;
            background: @accent;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
            appearance: none;
        }

        &::-moz-range-track {
            height: 3px;
            border-radius: 2px;
            background: @track;
        }

        &::-moz-range-progress {
            height: 3px;
            border-radius: 2px;
            background: @accent;
        }

        &::-moz-range-thumb {
            width: 12px;
            height: 12px;
            border: 0;
            border-radius: 50%;
            background: @accent;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
        }
    }

    .menu__value {
        flex: none;
        width: 34px;
        font-size: 11px;
        text-align: right;
        opacity: 0.8;
    }

    // A quiet footer: the way to the about card, and which version this is
    .menu__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 24px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        font-size: 11px;
    }

    .menu__about {
        padding: 0 2px;
        background: none;
        font-size: 11px;
        opacity: 0.5;

        &:hover {
            opacity: 0.85;
        }
    }

    .menu__version {
        padding-right: 2px;
        opacity: 0.35;
    }
</style>
