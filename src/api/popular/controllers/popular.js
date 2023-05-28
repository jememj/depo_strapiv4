'use strict';

/**
 * popular controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::popular.popular');
