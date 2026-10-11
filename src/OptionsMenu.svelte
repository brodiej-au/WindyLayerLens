<div class="menu">
    <div class="menu__row">
        <span class="menu__label">View</span>
        <div class="menu__choice">
            {#each MODES as { id, name, hint }}
                <button class:on={mode === id} title={hint} on:click={() => setMode(id)}>
                    {name}
                </button>
            {/each}
        </div>
    </div>
    {#if canReshape}
        <div class="menu__row">
            <span class="menu__label">Shape</span>
            <div class="menu__choice">
                {#each SHAPES as { id, name }}
                    <button class:on={shape === id} on:click={() => setShape(id)}>
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
    <button class="menu__about" on:click={about}>About {title}</button>
</div>

<script lang="ts">
    import { MODES, SHAPES } from './options';

    import type { Mode, Shape } from './options';

    export let title: string;
    export let mode: Mode;
    export let shape: Shape;
    /** False where the lens cannot float freely, so has no outline of its own to change. */
    export let canReshape: boolean;
    export let setMode: (mode: Mode) => void;
    export let setShape: (shape: Shape) => void;
    export let about: () => void;
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

        svg {
            width: 13px;
            height: 13px;
            fill: none;
            stroke: currentColor;
            stroke-width: 1.6;
        }
    }

    .menu__about {
        display: block;
        width: 100%;
        height: 28px;
        padding: 0 2px;
        border-top: 1px solid rgba(255, 255, 255, 0.12);
        background: none;
        text-align: left;
        opacity: 0.85;

        &:hover {
            opacity: 1;
            text-decoration: underline;
        }
    }
</style>
