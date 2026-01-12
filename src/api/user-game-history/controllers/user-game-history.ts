import { factories } from "@strapi/strapi";
import { getUuidControllerMethods } from "../../../helpers/uuidApi";

export default factories.createCoreController(
  "api::user-game-history.user-game-history",
  ({ strapi }) => ({
    ...getUuidControllerMethods("api::user-game-history.user-game-history"),

    async find(ctx) {
      // Calling the default find
      const { data, meta } = await super.find(ctx);

      // We can't rely on data being complete because it's already sanitized by super.find
      // So we'll have to do something else if we want to retrieve the private info.
      return { data, meta };
    },
  }),
);
