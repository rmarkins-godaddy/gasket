const LRU = require('lru-cache');
const uglify = require('uglify-js');
const { getCacheKeys } = require('./utils');

const swHeader = `'use strict';

/* Gasket composed service worker. */

`;

/**
 * Configures the endpoint with the gasket config
 *
 * @param {Gasket} gasket - Gasket
 * @returns {Function} endpoint
 */
async function configureEndpoint(gasket) {
  const { logger, config } = gasket;
  const { serviceWorker, env } = config;
  const { content, cache: cacheConfig = {}, minify = {} } = serviceWorker;
  const minifyConfig = minify === true ? {} : minify;

  const cache = new LRU(cacheConfig);
  const cacheKeys = await getCacheKeys(gasket);

  return async function sw(req, res) {
    const cacheKey = cacheKeys.reduce((acc, fn) => acc + fn(req), '_');

    let composedContent = cache.get(cacheKey);
    if (!composedContent) {
      logger.info(`Composing service worker for key: ${cacheKey}`);

      const composed = await gasket.execWaterfall(
        'composeServiceWorker',
        content,
        req
      );

      composedContent = swHeader + composed;
      // if the consuming application has specified minification or
      // is in a production in environment, minify the service worker script.
      if ('minify' in serviceWorker || /prod/i.test(env)) {
        composedContent = uglify.minify(composedContent, minifyConfig).code;
      }

      cache.set(cacheKey, composedContent);
    }

    res.set('Content-Type', 'application/javascript');
    res.send(composedContent);
  };
}

/**
 * Express lifecycle to add an endpoint to serve service worker script
 *
 * @param {Gasket} gasket - Gasket
 * @param {Express} app - App
 */
module.exports = async function express(gasket, app) {
  const { serviceWorker: { url } } = gasket.config;
  app.get(url, await configureEndpoint(gasket));
};
