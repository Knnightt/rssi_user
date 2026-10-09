const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // Watchman is not available in the current Windows development setup.
    useWatchman: process.platform !== 'win32',
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
