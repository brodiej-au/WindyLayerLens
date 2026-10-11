<div class="picker" class:picker--compact={compact}>
    <div class="picker__now">
        <img class="picker__thumb" src={current.image} alt="" />
        <div class="picker__options">
            <div class="picker__title">{current.name}</div>
            {#if options.length}
                <div class="picker__options-row">
                    {#each options as { key, label, value, choices } (key)}
                        <select
                            {value}
                            title={label}
                            aria-label={label}
                            on:change={e => set(key, e.currentTarget.value)}
                        >
                            {#each choices as { id, name }}
                                <option value={id}>{name}</option>
                            {/each}
                        </select>
                    {/each}
                </div>
            {/if}
        </div>
    </div>

    <input
        class="picker__search"
        type="search"
        placeholder="Search layers"
        bind:value={query}
        bind:this={searchInput}
        on:keydown={onSearchKey}
    />
    {#if !searching}
        <div class="picker__tabs">
            {#each groups as { name }, i}
                <button class="chip" class:chip--on={i === tab} on:click={() => (tab = i)}>
                    {name}
                </button>
            {/each}
        </div>
    {/if}

    <div class="picker__grid">
        {#each shown as { id, name, image, badge } (id)}
            <button class="tile" class:tile--on={id === current.id} on:click={() => set('overlay', id)}>
                <img src={image} alt="" loading="lazy" />
                {#if badge}
                    <span class="tile__badge">{badge}</span>
                {/if}
                <span class="tile__name">{name}</span>
            </button>
        {:else}
            <div class="picker__empty">No layer matches “{query.trim()}”</div>
        {/each}
    </div>
</div>

<script lang="ts">
    import { onMount } from 'svelte';

    import {
        findLayers,
        layerGroups,
        layerItem,
        levelName,
        modelName,
        modelResolution,
        variantsOf,
    } from './layers';

    import type { LayerState } from './layers';

    type OptionKey = 'overlay' | 'product' | 'level';

    interface Option {
        key: OptionKey;
        /** Says what the drop-down is for. Not shown: the choices speak for themselves. */
        label: string;
        value: string;
        choices: { id: string; name: string }[];
    }

    /** What the lens shows now. */
    export let layer: LayerState;
    /** Asks the lens to switch layer, forecast model or altitude. */
    export let set: (key: OptionKey, value: string) => void;
    /** For small screens: a tighter header, and the groups on one line to swipe along. */
    export let compact = false;

    const groups = layerGroups();

    let query = '';
    let searchInput: HTMLInputElement;

    $: current = layerItem(layer.overlay);

    // What can be changed about the current layer. An option with nothing to choose is left out.
    $: options = (
        [
            { key: 'overlay', label: 'Type', value: layer.overlay, choices: variantsOf(layer.overlay) },
            {
                key: 'product',
                label: 'Forecast model',
                value: layer.product,
                choices: layer.products.map(id => ({
                    id,
                    name: `${modelName(id)} ${modelResolution(id)}`,
                })),
            },
            {
                key: 'level',
                label: 'Altitude',
                value: layer.level,
                choices: layer.levels.map(id => ({ id, name: levelName(id) })),
            },
        ] as Option[]
    ).filter(option => option.choices.length > 1);

    // Open on the first group that holds the current layer
    let tab = Math.max(
        0,
        groups.findIndex(g => g.layers.some(item => item.id === layerItem(layer.overlay).id)),
    );

    $: searching = query.trim() !== '';
    $: shown = searching ? findLayers(query) : groups[tab].layers;

    const onSearchKey = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && searching && shown.length) {
            set('overlay', shown[0].id);
        }
    };

    onMount(() => {
        // On a touch screen, focusing the search box would throw the keyboard over the picker
        if (!compact) {
            searchInput.focus();
        }
    });
</script>

<style lang="less">
    @accent: var(--color-orange, #d49500);

    .picker {
        display: flex;
        flex-direction: column;
        height: 100%;
        font-size: 12px;
    }

    .picker__now {
        flex: none;
        display: flex;
        gap: 12px;
        padding: 12px;
        background: rgba(0, 0, 0, 0.2);
    }

    .picker__thumb {
        flex: none;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        object-fit: cover;
        box-shadow: 0 0 0 2px @accent;
    }

    .picker__options {
        flex: 1;
        min-width: 0;
    }

    .picker__title {
        font-size: 16px;
        line-height: 22px;
    }

    // The layer's options, side by side: a few short drop-downs cost one line of height
    .picker__options-row {
        display: flex;
        gap: 6px;
        margin-top: 6px;
    }

    // Drop-downs dressed as Windy's bubbles: a pill showing the current choice, with a small arrow
    select {
        flex: 0 1 auto;
        min-width: 0;
        height: 24px;
        padding: 0 24px 0 10px;
        border: 0;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.13)
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='white' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
            no-repeat right 9px center / 9px;
        color: inherit;
        font-size: 12px;
        text-overflow: ellipsis;
        cursor: pointer;
        outline: none;
        appearance: none;
        -webkit-appearance: none;

        &:hover,
        &:focus-visible {
            background-color: rgba(255, 255, 255, 0.25);
        }
    }

    // The list that drops down is drawn by the browser; these keep it readable on the dark panel
    option {
        background: #4d4d4d;
        color: #fff;
    }

    // Small screens: a tighter header, and the groups on one line to swipe along
    .picker--compact {
        .picker__now {
            gap: 10px;
            padding: 10px 12px;
        }

        .picker__thumb {
            width: 36px;
            height: 36px;
        }

        select {
            height: 30px;
            border-radius: 15px;
        }

        // Below 16px, iOS zooms the whole page in when one of these takes focus
        select,
        .picker__search {
            font-size: 16px;
        }

        .picker__tabs {
            flex-wrap: nowrap;
            overflow-x: auto;
            scrollbar-width: none;

            &::-webkit-scrollbar {
                display: none;
            }
        }

        .chip {
            flex: none;
        }
    }

    .chip {
        height: 22px;
        padding: 0 9px;
        border: 0;
        border-radius: 11px;
        background: rgba(255, 255, 255, 0.13);
        color: inherit;
        font-size: 12px;
        line-height: 22px;
        white-space: nowrap;
        cursor: pointer;

        &:hover {
            background: rgba(255, 255, 255, 0.25);
        }
    }

    .chip--on,
    .chip--on:hover {
        background: @accent;
    }

    .picker__search {
        flex: none;
        height: 28px;
        margin: 12px 12px 0;
        padding: 0 12px;
        border: 0;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.92);
        color: #333;
        font-size: 13px;
        outline: none;
    }

    .picker__tabs {
        flex: none;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 8px 12px 0;
    }

    .picker__grid {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        align-content: start;
        gap: 2px;
        padding: 8px;
        overflow-y: auto;
    }

    .tile {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        min-width: 0;
        padding: 7px 2px;
        border: 0;
        border-radius: 8px;
        background: none;
        color: inherit;
        font-size: 11px;
        line-height: 1.2;
        cursor: pointer;

        &:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        img {
            width: 46px;
            height: 46px;
            border-radius: 50%;
            object-fit: cover;
        }
    }

    .tile--on img {
        box-shadow: 0 0 0 2px @accent;
    }

    .tile__name {
        max-width: 100%;
        text-align: center;
        overflow-wrap: anywhere;
    }

    .tile__badge {
        position: absolute;
        top: 3px;
        right: 6px;
        padding: 1px 4px;
        border-radius: 6px;
        background: @accent;
        font-size: 8px;
    }

    .picker__empty {
        grid-column: 1 / -1;
        padding: 24px 0;
        text-align: center;
        opacity: 0.6;
    }
</style>
