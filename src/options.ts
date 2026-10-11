/** How the lens follows the main map. */
export type Mode = 'seamless' | 'full';

/** Outline of the lens window. */
export type Shape = 'rectangle' | 'circle';

export const MODES: { id: Mode; name: string; hint: string }[] = [
    { id: 'seamless', name: 'Seamless', hint: 'Show the part of the main map the lens covers' },
    { id: 'full', name: 'Full', hint: 'Fit the whole view of the main map into the lens' },
];

export const SHAPES: { id: Shape; name: string }[] = [
    { id: 'rectangle', name: 'Rectangle' },
    { id: 'circle', name: 'Circle' },
];
