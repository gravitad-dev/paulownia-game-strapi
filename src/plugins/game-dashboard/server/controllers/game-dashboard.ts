import type { Core } from "@strapi/strapi";

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async getOverview(ctx: any) {
    try {
      const data = await strapi
        .plugin("game-dashboard")
        .service("gameDashboard")
        .getOverview();
      ctx.body = data;
    } catch (error) {
      console.error("GameDashboard getOverview Error:", error);
      ctx.badRequest("Failed to fetch overview stats", { error });
    }
  },

  async getSessionsOverTime(ctx: any) {
    try {
      const data = await strapi
        .plugin("game-dashboard")
        .service("gameDashboard")
        .getSessionsOverTime(ctx.query);
      ctx.body = data;
    } catch (error) {
      console.error("GameDashboard getSessionsOverTime Error:", error);
      ctx.badRequest("Failed to fetch sessions", { error });
    }
  },

  async getTopPlayers(ctx: any) {
    try {
      const data = await strapi
        .plugin("game-dashboard")
        .service("gameDashboard")
        .getTopPlayers(ctx.query);
      ctx.body = data;
    } catch (error) {
      console.error("GameDashboard getTopPlayers Error:", error);
      ctx.badRequest("Failed to fetch top players", { error });
    }
  },

  async getEconomyStats(ctx: any) {
    try {
      const data = await strapi
        .plugin("game-dashboard")
        .service("gameDashboard")
        .getEconomyStats();
      ctx.body = data;
    } catch (error) {
      console.error("GameDashboard getEconomyStats Error:", error);
      ctx.badRequest("Failed to fetch economy stats", { error });
    }
  },
});
