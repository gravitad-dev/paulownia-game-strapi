import type { Core } from "@strapi/strapi";

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async getOverview() {
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalUsers = usersCount;
    const activeSessions = userSessions.filter((s: any) => s.isActive).length;

    const totalGamesPlayed = gameHistory.length;
    const totalCoinsEarned = gameHistory.reduce(
      (sum: number, g: any) => sum + (g.coinsEarned || 0),
      0,
    );

    const sessionsToday = userSessions.filter(
      (s: any) => new Date(s.startedAt) >= today,
    ).length;

    const sessionsWithDuration = userSessions.filter(
      (s: any) => s.duration > 0,
    );
    const avgSessionDuration =
      sessionsWithDuration.length > 0
        ? Math.round(
            sessionsWithDuration.reduce(
              (sum: number, s: any) => sum + (s.duration || 0),
              0,
            ) / sessionsWithDuration.length,
          )
        : 0;

    const totalGamesWon = gameHistory.filter((g: any) => g.completed).length;
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
  },

  async getSessionsOverTime(query: any) {
    const { startDate, endDate } = query;
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

    sessions.forEach((session: any) => {
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
  },

  async getTopPlayers(query: any) {
    const { limit = 10 } = query;
    const players = (await strapi.db
      .query("api::player-stat.player-stat")
      .findMany({
        populate: ["users_permissions_user"],
        orderBy: { score: "desc" },
        limit: Number(limit),
      })) as any[];

    return players.map((player: any, index: number) => ({
      rank: index + 1,
      username: player.users_permissions_user?.username || "Unknown",
      score: player.score || 0,
      gamesPlayed: player.gamesPlayed || 0,
      gamesWon: player.gamesWon || 0,
      winRate: player.winRate || 0,
      coins: player.coins || 0,
      tickets: player.tickets || 0,
    }));
  },

  async getEconomyStats() {
    const playerStats = (await strapi.db
      .query("api::player-stat.player-stat")
      .findMany({})) as any[];

    const totalCoins = playerStats.reduce(
      (sum: number, p: any) => sum + (p.coins || 0),
      0,
    );

    const gameHistory = (await strapi.db
      .query("api::user-game-history.user-game-history")
      .findMany({})) as any[];
    const totalCoinsEarned = gameHistory.reduce(
      (sum: number, g: any) => sum + (g.coinsEarned || 0),
      0,
    );

    const totalCoinsSpent = playerStats.reduce(
      (sum: number, p: any) => sum + (p.coinsSpent || 0),
      0,
    );
    const totalTickets = playerStats.reduce(
      (sum: number, p: any) => sum + (p.tickets || 0),
      0,
    );
    const totalTicketsEarned = playerStats.reduce(
      (sum: number, p: any) => sum + (p.ticketsEarned || 0),
      0,
    );
    const totalTicketsSpent = playerStats.reduce(
      (sum: number, p: any) => sum + (p.ticketsSpent || 0),
      0,
    );

    const avgCoinsPerPlayer =
      playerStats.length > 0 ? Math.round(totalCoins / playerStats.length) : 0;
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
  },

  async getLogs(query: any) {
    const { limit = 10 } = query;
    const logs = (await strapi.db
      .query("api::log-history.log-history")
      .findMany({
        populate: ["user"],
        orderBy: { createdAt: "desc" },
        limit: Number(limit),
      })) as any[];

    return logs.map((log: any) => ({
      id: log.id,
      action: log.action,
      user: log.user ? log.user.username : "Unknown",
      details: log.details,
      createdAt: log.createdAt,
    }));
  },

  async getPendingRewardClaims() {
    const pendingClaims = (await strapi.db
      .query("api::reward-claim.reward-claim")
      .findMany({
        where: { claimStatus: "pending" },
        populate: {
          users_permissions_user: true,
          user_reward: {
            populate: {
              reward: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      })) as any[];

    return pendingClaims.map((claim: any) => ({
      documentId: claim.documentId,
      claimCode: claim.claimCode,
      user: claim.users_permissions_user?.username || "Unknown",
      fullName: claim.fullName,
      rewardName: claim.user_reward?.reward?.name || "Unknown Reward",
      createdAt: claim.createdAt,
      requiresIdentityVerification: claim.requiresIdentityVerification,
    }));
  },
});
