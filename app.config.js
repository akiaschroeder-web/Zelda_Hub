// Extends app.json. Set EXPO_BASE_URL (e.g. "/Zelda_Hub") when building the web
// version for a sub-path such as GitHub Pages; normal development is unaffected.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
