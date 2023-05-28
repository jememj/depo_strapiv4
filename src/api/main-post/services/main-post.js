'use strict';

/**
 * main-post service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::main-post.main-post');
