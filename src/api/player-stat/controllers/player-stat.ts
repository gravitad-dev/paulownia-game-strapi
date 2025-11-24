import { factories } from "@strapi/strapi";
import { getUuidControllerMethods } from "../../../helpers/uuidApi";

export default factories.createCoreController(
  "api::player-stat.player-stat",
  ({ strapi }) => ({
    ...getUuidControllerMethods("api::player-stat.player-stat"),
  }),
);
