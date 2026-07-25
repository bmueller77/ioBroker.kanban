import config from '@iobroker/eslint-config';

export default [
    {
        // Frontend (browser globals), admin JSON and tests are not linted with the Node config
        ignores: ['admin/**', 'www/**', 'test/**', 'node_modules/**', 'docs/**', '*.config.mjs'],
    },
    ...config,
];
