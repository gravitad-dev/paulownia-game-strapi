import type { Core } from '@strapi/strapi';

export default {
  register({ strapi }: { strapi: Core.Strapi }) {
    strapi.log.info('🧩 Game Dashboard plugin registered');
  },

  bootstrap({ strapi }: { strapi: Core.Strapi }) {
    strapi.log.info('🚀 Game Dashboard plugin bootstrapped');
  },

  destroy({ strapi }: { strapi: Core.Strapi }) {
    strapi.log.info('Game Dashboard plugin destroyed');
  },

  // Export empty/default objects to satisfy Strapi's plugin structure
  config: {
    default: {},
    validator() {},
  },
  controllers: {},
  routes: {},
  services: {},
  contentTypes: {},
  policies: {},
  middlewares: {},
};
