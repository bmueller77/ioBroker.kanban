const path = require('path');
const { tests } = require('@iobroker/testing');

// Start the adapter in a test ioBroker instance and check that it starts/stops cleanly
tests.integration(path.join(__dirname, '..'));
