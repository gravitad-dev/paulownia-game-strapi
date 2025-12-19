import { factories } from "@strapi/strapi";
import { getUuidControllerMethods } from "../../../helpers/uuidApi";

export default factories.createCoreController(
  "api::roulette-history.roulette-history",
  ({ strapi }) => ({
    ...getUuidControllerMethods("api::roulette-history.roulette-history"),

    async find(ctx) {
      const user = ctx.state.user;

      if (!user) {
        return ctx.unauthorized(
          "You must be logged in to view your roulette history",
        );
      }

      // Allow admins to see all histories
      const isAdmin =
        user.role?.type === "admin" || user.role?.name === "Admin";

      const { query } = ctx;
      const filters = isAdmin
        ? (query.filters as any)
        : {
            ...(query.filters as any),
            users_permissions_user: user.id,
          };

      // @ts-ignore
      const { results, pagination } = await strapi.entityService.findPage(
        "api::roulette-history.roulette-history",
        {
          ...query,
          filters,
          populate: {
            reward: {
              populate: ["image"],
            },
          },
        },
      );

      return {
        data: results,
        meta: { pagination },
      };
    },
  }),
);
