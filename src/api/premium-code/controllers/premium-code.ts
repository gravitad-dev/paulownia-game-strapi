/**
 * premium-code controller
 */

import { factories } from "@strapi/strapi";

// @ts-ignore
export default factories.createCoreController(
  "api::premium-code.premium-code",
  ({ strapi }) => ({
    async redeem(ctx) {
      const { user } = ctx.state;
      if (!user) {
        return ctx.unauthorized();
      }

      const { code } = ctx.request.body;
      if (!code) {
        return ctx.badRequest("Code is required", {
          errorCode: "MISSING_CODE",
        });
      }

      // Normalize code: trim and uppercase
      const normalizedCode = code.trim().toUpperCase();

      // Check if user is already premium first to avoid unnecessary DB calls
      // @ts-ignore
      const userDoc = await strapi
        .documents("plugin::users-permissions.user")
        .findFirst({
          filters: { id: user.id },
          // @ts-ignore
          fields: ["documentId", "isPremium"],
        });

      if (!userDoc) {
        return ctx.notFound("User not found", { errorCode: "USER_NOT_FOUND" });
      }

      // @ts-ignore
      if (userDoc.isPremium) {
        return ctx.badRequest("User is already premium", {
          errorCode: "ALREADY_PREMIUM",
        });
      }

      try {
        // @ts-ignore
        const premiumCode = await strapi
          .documents("api::premium-code.premium-code")
          .findFirst({
            filters: {
              // @ts-ignore
              code: normalizedCode,
              isUsed: false,
            },
          });

        if (!premiumCode) {
          return ctx.badRequest("Invalid or used code", {
            errorCode: "INVALID_CODE",
          });
        }

        // Update User
        // @ts-ignore
        await strapi.documents("plugin::users-permissions.user").update({
          // @ts-ignore
          documentId: userDoc.documentId,
          data: {
            // @ts-ignore
            isPremium: true,
          },
        });

        // Update Code
        // @ts-ignore
        await strapi.documents("api::premium-code.premium-code").update({
          // @ts-ignore
          documentId: premiumCode.documentId,
          data: {
            isUsed: true,
            // @ts-ignore
            usedBy: userDoc.documentId,
            usedAt: new Date(),
          },
        });

        return ctx.send({
          message: "Premium activated successfully",
          isPremium: true,
        });
      } catch (err) {
        ctx.internalServerError("An error occurred during redemption");
      }
    },
  }),
);
