/**
 * premium-code router
 */

import { factories } from "@strapi/strapi";

// @ts-ignore
export default factories.createCoreRouter("api::premium-code.premium-code", {
  only: [], // Disable all core routes (find, findOne, create, update, delete)
});
