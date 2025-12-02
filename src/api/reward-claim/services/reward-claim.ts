/**
 * reward-claim service
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreService(
  "api::reward-claim.reward-claim" as any,
);
