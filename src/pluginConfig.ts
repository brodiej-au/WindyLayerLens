import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-layer-lens',
    version: '0.1.0',
    icon: '🔎',
    title: 'Layer Lens',
    description:
        'See two weather layers at once. A movable lens, round or rectangular, shows any other ' +
        'layer for the exact spot it covers, with its own forecast model and altitude.',
    author: 'Brodie (appd.com.au)',
    repository: 'https://github.com/brodiej-au/WindyLayerLens',
    desktopUI: 'embedded',
    mobileUI: 'small',
    private: true,
};

export default config;
