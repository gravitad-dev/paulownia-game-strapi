// @ts-nocheck
export default {
  async getOverview(ctx) {
    try {
      // Fetch raw data from sources of truth using strapi.db.query (most robust)
      const usersDb = await strapi.db
        .query("plugin::users-permissions.user")
        .findMany({});
      const usersCount = usersDb.length;
      
      const gameHistory = (await strapi.db
        .query("api::user-game-history.user-game-history")
        .findMany({})) as any[];
        
      const userSessions = (await strapi.db
        .query("api::user-session.user-session")
        .findMany({})) as any[];

      const playerStats = (await strapi.db
        .query("api::player-stat.player-stat")
        .findMany({})) as any[];

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const totalUsers = usersCount;
      const activeSessions = userSessions.filter((s) => s.isActive).length;

      const totalGamesPlayed = gameHistory.length;
      const totalCoinsEarned = gameHistory.reduce(
        (sum, g) => sum + (g.coinsEarned || 0),
        0,
      );

      const sessionsToday = userSessions.filter(
        (s) => new Date(s.startedAt) >= today,
      ).length;

      const sessionsWithDuration = userSessions.filter((s) => s.duration > 0);
      const avgSessionDuration =
        sessionsWithDuration.length > 0
          ? Math.round(
              sessionsWithDuration.reduce(
                (sum, s) => sum + (s.duration || 0),
                0,
              ) / sessionsWithDuration.length,
            )
          : 0;

      const totalGamesWon = gameHistory.filter((g) => g.completed).length;
      const avgWinRate =
        totalGamesPlayed > 0
          ? Math.round((totalGamesWon / totalGamesPlayed) * 100)
          : 0;

      return {
        totalUsers,
        activeSessions,
        totalGamesPlayed,
        totalCoinsEarned,
        sessionsToday,
        avgSessionDuration,
        avgWinRate,
        totalGamesWon,
      };
    } catch (error) {
      console.error("GameDashboard getOverview Error:", error);
      ctx.badRequest("Failed to fetch overview stats", { error });
    }
  },

  async getSessionsOverTime(ctx) {
    try {
      const { startDate, endDate } = ctx.query;
      const start = startDate
        ? new Date(startDate as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();

      const sessions = (await strapi.db
        .query("api::user-session.user-session")
        .findMany({
          where: {
            startedAt: {
              $gte: start.toISOString(),
              $lte: end.toISOString(),
            },
          },
        })) as any[];

      const groupedByDate: Record<
        string,
        { sessions: number; games: number; score: number; coins: number }
      > = {};

      sessions.forEach((session) => {
        const date = new Date(session.startedAt).toISOString().split("T")[0];
        if (!groupedByDate[date]) {
          groupedByDate[date] = { sessions: 0, games: 0, score: 0, coins: 0 };
        }
        groupedByDate[date].sessions += 1;
        groupedByDate[date].games += session.gamesPlayedInSession || 0;
        groupedByDate[date].score += session.scoreInSession || 0;
        groupedByDate[date].coins += session.coinsEarnedInSession || 0;
      });

      return Object.entries(groupedByDate)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
       console.error("GameDashboard getSessionsOverTime Error:", error);
       ctx.badRequest("Failed to fetch sessions", { error });
    }
  },

  async getTopPlayers(ctx) {
    try {
        const { limit = 10 } = ctx.query;
        const players = (await strapi.db
          .query("api::player-stat.player-stat")
          .findMany({
            populate: ["users_permissions_user"],
            orderBy: { score: "desc" },
            limit: Number(limit),
          })) as any[];

        return players.map((player, index) => ({
          rank: index + 1,
          username: player.users_permissions_user?.username || "Unknown",
          score: player.score || 0,
          gamesPlayed: player.gamesPlayed || 0,
          gamesWon: player.gamesWon || 0,
          winRate: player.winRate || 0,
          coins: player.coins || 0,
        }));
    } catch (error) {
       console.error("GameDashboard getTopPlayers Error:", error);
       ctx.badRequest("Failed to fetch top players", { error });
    }
  },

  async getEconomyStats(ctx) {
    try {
        const playerStats = (await strapi.db
          .query("api::player-stat.player-stat")
          .findMany({})) as any[];

        const totalCoins = playerStats.reduce(
          (sum, p) => sum + (p.coins || 0),
          0,
        );

        const gameHistory = (await strapi.db
          .query("api::user-game-history.user-game-history")
          .findMany({})) as any[];
        const totalCoinsEarned = gameHistory.reduce(
          (sum, g) => sum + (g.coinsEarned || 0),
          0,
        );

        const totalCoinsSpent = playerStats.reduce(
          (sum, p) => sum + (p.coinsSpent || 0),
          0,
        );
        const totalTickets = playerStats.reduce(
          (sum, p) => sum + (p.tickets || 0),
          0,
        );
        const totalTicketsEarned = playerStats.reduce(
          (sum, p) => sum + (p.ticketsEarned || 0),
          0,
        );
        const totalTicketsSpent = playerStats.reduce(
          (sum, p) => sum + (p.ticketsSpent || 0),
          0,
        );

        const avgCoinsPerPlayer =
          playerStats.length > 0
            ? Math.round(totalCoins / playerStats.length)
            : 0;
        const avgTicketsPerPlayer =
          playerStats.length > 0
            ? Math.round(totalTickets / playerStats.length)
            : 0;

        return {
          totalCoins,
          totalCoinsEarned,
          totalCoinsSpent,
          totalTickets,
          totalTicketsEarned,
          totalTicketsSpent,
          avgCoinsPerPlayer,
          avgTicketsPerPlayer,
          circulationRate:
            totalCoinsEarned > 0
              ? Math.round((totalCoinsSpent / totalCoinsEarned) * 100)
              : 0,
        };
    } catch (error) {
      console.error("GameDashboard getEconomyStats Error:", error);
      ctx.badRequest("Failed to fetch economy stats", { error });
    }
  }
};
