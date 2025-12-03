/**
 * player-dashboard routes
 * Módulo unificado para todas las rutas del dashboard del jugador
 */

export default {
  routes: [
    // ==================== PUBLIC ROUTES (Player) ====================

    // Summary - Resumen completo de estadísticas del jugador
    {
      method: "GET",
      path: "/player-dashboard/summary",
      handler: "player-dashboard.getSummary",
      config: {
        policies: [],
        middlewares: [],
        description: "Get comprehensive player statistics summary",
      },
    },

    // Session Management
    {
      method: "POST",
      path: "/player-dashboard/session/start",
      handler: "player-dashboard.startSession",
      config: {
        policies: [],
        middlewares: [],
        description: "Start a new game session",
      },
    },
    {
      method: "POST",
      path: "/player-dashboard/session/heartbeat",
      handler: "player-dashboard.heartbeat",
      config: {
        policies: [],
        middlewares: [],
        description: "Send heartbeat to keep session alive",
      },
    },
    {
      method: "POST",
      path: "/player-dashboard/session/end",
      handler: "player-dashboard.endSession",
      config: {
        policies: [],
        middlewares: [],
        description: "End current session",
      },
    },
    {
      method: "GET",
      path: "/player-dashboard/session/current",
      handler: "player-dashboard.getCurrentSession",
      config: {
        policies: [],
        middlewares: [],
        description: "Get current active session",
      },
    },
    {
      method: "GET",
      path: "/player-dashboard/session/history",
      handler: "player-dashboard.getSessionHistory",
      config: {
        policies: [],
        middlewares: [],
        description: "Get session history with pagination",
      },
    },
  ],
};
