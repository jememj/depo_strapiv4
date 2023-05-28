'use strict';

/**
 * popular router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::popular.popular');
