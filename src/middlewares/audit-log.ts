/**
 * `audit-log` middleware
 */
import requestIp from "request-ip";

export default (config, { strapi }: { strapi: any }) => {
  return async (ctx, next) => {
    await next();

    // Only log successful requests for specific routes
    if (ctx.response.status >= 200 && ctx.response.status < 300) {
      const { url, method } = ctx.request;
      // Use path to avoid query strings affecting the match
      const path = ctx.request.path;

      // Get client IP (safely)
      const ipAddress = requestIp.getClientIp(ctx.req) || "unknown";

      let action = null;

      // Map routes to actions
      if (method === "POST") {
        if (path === "/api/exchangeCoinsToTickets") {
          action = "coin_exchange";
        } else if (path === "/api/daily-rewards/claim") {
          action = "daily_reward_claim";
        } else if (path === "/api/achievements/claim") {
          action = "achievement_claim";
        } else if (path === "/api/rewards/spin") {
          action = "roulette_play";
        }
      }

      if (action) {
        try {
          // Get user from state (assuming authenticated request)
          const user = ctx.state.user;

          if (user) {
            await strapi.entityService.create("api::log-history.log-history", {
              data: {
                action,
                user: user.id,
                details: {
                  requestBody: ctx.request.body,
                  responseStatus: ctx.response.status,
                  url: url,
                  timestamp: new Date().toISOString(),
                  ip: ipAddress,
                },
                publishedAt: new Date(), // Publish immediately
              },
            });
          } else {
            // Optional: log or ignore if no user is authenticated (e.g. public actions, though these shouldn't be public)
            // strapi.log.warn(`Audit log skipped for action: ${action} - No user found in state.`);
          }
        } catch (error) {
          strapi.log.error("Error creating audit log:", error);
        }
      }
    }
  };
};
