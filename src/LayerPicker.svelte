<div class="picker" class:picker--compact={compact}>
    <div class="picker__now">
        <img class="picker__thumb" src={current.image} alt="" />
        <div class="picker__options">
            <div class="picker__title">{current.name}</div>
            {#each options as { key, label, value, choices, long } (key)}
                {#if compact || long}
                    <label class="picker__row">
                        <span class="picker__label">{label}</span>
                        <select {value} on:change={e => set(key, e.currentTarget.value)}>
                            {#each choices as { id, name, detail }}
                                <option value={id}>{name} {detail}</option>
                            {/each}
                        </select>
                    </label>
                {:else}
                    <div class="picker__row">
                        <span class="picker__label">{label}</span>
                        <div class="picker__chips">
                            {#each choices as { id, name, detail }}
                                <button
                                    class="chip"
                                    class:chip--on={id === value}
                                    on:click={() => set(key, id)}
                                >
                                    {name}
                                    {#if detail}
                                        <small>{detail}</small>
                                    {/if}
                                </button>
                            {/each}
                        </div>
                    </div>
                {/if}
            {/each}
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
        label: string;
        value: string;
        choices: { id: string; name: string; detail: string }[];
        /** Too many choices to lay out side by side: always offered as a drop-down. */
        long: boolean;
    }

    /** What the lens shows now. */
    export let layer: LayerState;
    /** Asks the lens to switch layer, forecast model or altitude. */
    export let set: (key: OptionKey, value: string) => void;
    /** For small screens: every option becomes a drop-down, so the layers keep most of the room. */
    export let compact = false;

    const groups = layerGroups();

    let query = '';
    let searchInput: HTMLInputElement;

    $: current = layerItem(layer.overlay);

    // What can be changed about the current layer. An option with nothing to choose is left out.
    $: options = (
        [
            {
                key: 'overlay',
                label: 'Type',
                value: layer.overlay,
                choices: variantsOf(layer.overlay).map(({ id, name }) => ({ id, name, detail: '' })),
                long: false,
            },
            {
                key: 'product',
                label: 'Model',
                value: layer.product,
                choices: layer.products.map(id => ({
                    id,
                    name: modelName(id),
                    detail: modelResolution(id),
                })),
                long: false,
            },
            {
                key: 'level',
                label: 'Altitude',
                value: layer.level,
                choices: layer.levels.map(id => ({ id, name: levelName(id), detail: '' })),
                long: true,
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
        width: 52px;
        height: 52px;
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

    // A labelled option: the label keeps its own column when the chips wrap
    .picker__row {
        display: flex;
        align-items: baseline;
        margin-top: 8px;
    }

    .picker__label {
        flex: none;
        width: 52px;
        font-size: 11px;
        opacity: 0.6;
    }

    .picker__chips {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }

    // Small screens: a short header of drop-downs, and the groups on one line to swipe along
    .picker--compact {
        .picker__now {
            gap: 10px;
            padding: 10px 12px;
        }

        .picker__thumb {
            width: 36px;
            height: 36px;
        }

        .picker__row {
            align-items: center;
            margin-top: 6px;
        }

        select {
            flex: 1;
            min-width: 0;
            height: 28px;
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

    select {
        height: 22px;
        padding: 0 4px;
        border: 0;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.92);
        color: #333;
        font-size: 12px;
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

        small {
            margin-left: 4px;
            font-size: 10px;
            opacity: 0.7;
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
