/**
 * player-stat router
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreRouter("api::player-stat.player-stat", {
  prefix: "",
  only: ["find", "findOne"],
  config: {
    find: {
      policies: [],
      middlewares: [],
    },
    findOne: {
      policies: [],
      middlewares: [],
    },
  },
});
