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
      // Note: Strapi Admin Panel uses different endpoints, this is for API users with Admin role
      const isAdmin =
        user.role?.type === "admin" || user.role?.name === "Admin";

      if (!isAdmin) {
        // Force filter by current user for non-admins
        ctx.query = {
          ...ctx.query,
          filters: {
            ...(ctx.query.filters as any),
            users_permissions_user: {
              id: user.id,
            },
          },
        };
      }

      return super.find(ctx);
    },
  }),
);
