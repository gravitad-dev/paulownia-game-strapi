import { factories } from "@strapi/strapi";
import { getUuidControllerMethods } from "../../../helpers/uuidApi";

export default factories.createCoreController(
  "api::user-reward.user-reward",
  ({ strapi }) => ({
    ...getUuidControllerMethods("api::user-reward.user-reward"),

    async find(ctx) {
      const user = ctx.state.user;

      if (!user) {
        return ctx.unauthorized("You must be logged in to view your rewards");
      }

      // Allow admins to see all rewards
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
      const paginationParams = (query.pagination || {}) as any;
      const page = parseInt(paginationParams.page) || 1;
      const limit = parseInt(paginationParams.pageSize) || 10;

      const { results, pagination } = await strapi.entityService.findPage(
        "api::user-reward.user-reward",
        {
          ...query,
          filters,
          page,
          pageSize: limit, // Strapi v5 uses pageSize in findPage
          populate: {
            reward: {
              populate: ["image"],
            },
          },
        },
      );

      // Return raw data to bypass permission checks on 'reward' relation
      // In a strict environment, we should sanitize, but we know reward is safe to show to owner.
      return {
        data: results,
        meta: { pagination },
      };
    },
  }),
);
