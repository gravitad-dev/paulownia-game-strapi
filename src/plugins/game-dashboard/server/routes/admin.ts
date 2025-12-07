export default {
  type: "admin",
  routes: [
    {
      method: "GET",
      path: "/overview",
      handler: "gameDashboard.getOverview",
      config: {
        policies: [],
      },
    },
    {
      method: "GET",
      path: "/sessions-over-time",
      handler: "gameDashboard.getSessionsOverTime",
      config: {
        policies: [],
      },
    },
    {
      method: "GET",
      path: "/top-players",
      handler: "gameDashboard.getTopPlayers",
      config: {
        policies: [],
      },
    },
    {
      method: "GET",
      path: "/economy",
      handler: "gameDashboard.getEconomyStats",
      config: {
        policies: [],
      },
    },
    {
      method: "GET",
      path: "/logs",
      handler: "gameDashboard.getLogs",
      config: {
        policies: [],
      },
    },
    {
      method: "GET",
      path: "/pending-claims",
      handler: "gameDashboard.getPendingRewardClaims",
      config: {
        policies: [],
      },
    },
  ],
};
