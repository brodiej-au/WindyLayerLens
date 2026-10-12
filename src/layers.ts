import overlays from '@windy/overlays';
import products from '@windy/products';
import store from '@windy/store';
import { levelsData } from '@windy/rootScope';

import type { WindyApi } from './pipWindow';
import type { Levels, Overlays, Products } from './windyTypes';

/** One entry of the layer menu: a layer, or a family of layers shown as one. */
export interface LayerItem {
    id: Overlays;
    name: string;
    image: string;
    badge?: string;
}

export interface LayerGroup {
    name: string;
    layers: LayerItem[];
}

/** What the PIP is showing, and what else Windy offers for it right now. */
export interface LayerState {
    overlay: Overlays;
    product: Products;
    level: Levels;
    /** Forecast models that have this layer for the area on the PIP's map. */
    products: Products[];
    /** Altitudes this layer can be shown at; empty for layers without altitude. */
    levels: Levels[];
}

// Same grouping and order as Windy's own layer menu
const CATEGORIES: [name: string, ids: string[]][] = [
    ['Live', ['radar', 'satellite', 'hurricanes']],
    ['Wind', ['wind', 'gust', 'gustAccu', 'pressure']],
    ['Temperature', ['temp', 'dewpoint', 'rh', 'wetbulbtemp', 'solarpower', 'uvindex', 'heatmaps']],
    ['Rain & snow', ['rain', 'rainAccu', 'snowAccu', 'snowcover', 'ptype', 'thunder']],
    [
        'Clouds',
        [
            'clouds',
            'hclouds',
            'mclouds',
            'lclouds',
            'fog',
            'cloudtop',
            'cbase',
            'visibility',
            'cape',
            'ccl',
            'icing',
            'deg0',
            'turbulence',
        ],
    ],
    [
        'Sea',
        ['waves', 'swell1', 'swell2', 'swell3', 'wwaves', 'sst', 'currents', 'currentsTide', 'wavePower'],
    ],
    ['Air quality', ['aqi', 'no2', 'pm2p5', 'aod550', 'gtco3', 'tcso2', 'go3', 'cosc', 'dustsm']],
    ['Warnings', ['drought40', 'fwi', 'capAlerts', 'avalancheDanger', 'efiTemp', 'topoMap']],
];

// Windy's default pick of layers for its quick menu
const POPULAR = [
    'radar',
    'satellite',
    'wind',
    'rain',
    'temp',
    'hurricanes',
    'clouds',
    'waves',
    'rainAccu',
    'thunder',
    'aqi',
    'snowAccu',
];

// Windy lists some layers under two ids (`swell` is `swell1`), hence the Set
const allOverlays = [...new Set(Object.values(overlays))];

/** The menu entry a layer belongs to: itself, or the family it is a variant of. */
export const layerItem = (id: Overlays): LayerItem => {
    const head = overlays[overlays[id].getMenuIdent() as Overlays];
    return {
        id: head.ident as Overlays,
        name: head.getMenuName(),
        image: head.getMenuImagePath(),
        badge: head.promoBadge,
    };
};

// Layers Windy lists on their own. The rest are variants, reached through their family.
const menuIds = allOverlays
    .filter(o => o.getMenuIdent() === o.ident)
    .map(o => o.ident as Overlays);

const toItems = (ids: string[]): LayerItem[] =>
    ids.filter(id => menuIds.includes(id as Overlays)).map(id => layerItem(id as Overlays));

/**
 * The layer menu, group by group. The first group is the user's own favourites from Windy
 * if they have any, otherwise Windy's default selection.
 */
export const layerGroups = (): LayerGroup[] => {
    const favourites = store.get('favOverlaysDesktop');
    const groups: LayerGroup[] = [
        favourites.length
            ? { name: 'Favourites', layers: toItems(favourites) }
            : { name: 'Popular', layers: toItems(POPULAR) },
        ...CATEGORIES.map(([name, ids]) => ({ name, layers: toItems(ids) })),
    ];

    // Layers Windy has added since the table above was written
    const grouped = CATEGORIES.flatMap(([, ids]) => ids);
    const others = menuIds.filter(id => !grouped.includes(id));
    if (others.length) {
        groups.push({ name: 'Other', layers: toItems(others) });
    }
    return groups;
};

/**
 * The layers of one family, e.g. the three fuel moisture maps under Fire danger.
 * A layer that is not part of a family comes back alone.
 */
export const variantsOf = (id: Overlays): { id: Overlays; name: string }[] => {
    const family = allOverlays.filter(o => o.getMenuIdent() === overlays[id].getMenuIdent());
    const names = family.map(o => o.getName());

    return family.map(o => {
        const name = o.getName();
        if (names.indexOf(name) === names.lastIndexOf(name)) {
            return { id: o.ident as Overlays, name };
        }
        // Several variants share one name: tell them apart by Windy's short name if it
        // differs, else by the number in their id (soil depth, for the drought maps)
        const short = o.getName(true);
        const detail = short !== name ? short : (o.ident.match(/\d+\w*$/) || [''])[0];
        return { id: o.ident as Overlays, name: `${name} ${detail}` };
    });
};

/** Menu entries matching what the user typed, by their own name or a variant's. */
export const findLayers = (query: string): LayerItem[] => {
    const wanted = query.trim().toLowerCase();
    return toItems(menuIds).filter(item =>
        [item.name, ...variantsOf(item.id).map(v => v.name)].some(name =>
            name.toLowerCase().includes(wanted),
        ),
    );
};

export const modelName = (id: Products): string => products[id].modelName;

export const modelResolution = (id: Products): string => {
    const km = products[id].modelResolution;
    return km ? `${km}km` : '';
};

export const levelName = (id: Levels): string => {
    const [pressure, altitude] = levelsData[id];
    return id === 'surface' ? 'Surface' : `${pressure} · ${altitude}`;
};

export const readLayerState = ({ store: pipStore }: WindyApi): LayerState => {
    const overlay = pipStore.get('overlay') as Overlays;
    const available = pipStore.get('availProducts');

    return {
        overlay,
        product: pipStore.get('product'),
        level: pipStore.get('level'),
        products: pipStore.get('visibleProducts').filter(p => available.includes(p)),
        levels: overlays[overlay].hasMoreLevels ? pipStore.get('availLevels') : [],
    };
};

const WATCHED = [
    'overlay',
    'product',
    'level',
    'availProducts',
    'visibleProducts',
    'availLevels',
] as const;

/**
 * Calls `onChange` with the new state whenever the lens's layer, or its options, change.
 * Returns a function that stops watching.
 */
export const watchLayerState = (
    pip: WindyApi,
    onChange: (state: LayerState) => void,
): (() => void) => {
    const listeners = WATCHED.map(key => pip.store.on(key, () => onChange(readLayerState(pip))));
    return () => listeners.forEach(id => pip.store.off(id));
};
