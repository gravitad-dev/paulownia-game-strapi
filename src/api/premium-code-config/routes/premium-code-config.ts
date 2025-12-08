/**
 * premium-code-config router
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreRouter(
  "api::premium-code-config.premium-code-config",
  {
    only: [], // Disable all public API routes, accessible only via Admin Panel
  },
);
