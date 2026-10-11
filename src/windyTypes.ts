import type overlays from '@windy/overlays';
import type products from '@windy/products';
import type { levels } from '@windy/rootScope';

// Windy's own aliases for these do not resolve from a plugin project

/** Id of a weather layer, e.g. `wind`. */
export type Overlays = keyof typeof overlays;

/** Id of a forecast model or other data source, e.g. `ecmwf`. */
export type Products = keyof typeof products;

/** Id of an altitude level, e.g. `850h`. */
export type Levels = (typeof levels)[number];
