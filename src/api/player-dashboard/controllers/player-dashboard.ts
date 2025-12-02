/**
 * player-dashboard controller
 * Módulo unificado para todas las funcionalidades del dashboard del jugador
 */

import {
  startOfDay,
  differenceInDays,
  differenceInSeconds,
  parseISO,
} from "date-fns";
import { utcToZonedTime } from "date-fns-tz";

const TIMEZONE = "Europe/Madrid";
const HEARTBEAT_TIMEOUT_SECONDS = 300; // 5 minutes - session considered inactive after this

// UIDs for content types
const PLAYER_STAT_UID = "api::player-stat.player-stat";
const USER_SESSION_UID = "api::user-session.user-session" as any;
const USER_GAME_HISTORY_UID = "api::user-game-history.user-game-history";
const USER_ACHIEVEMENT_UID = "api::user-achievement.user-achievement";
const USER_REWARD_UID = "api::user-reward.user-reward";
const RANKING_UID = "api::ranking.ranking";
const LEVEL_UID = "api::level.level";
const ACHIEVEMENT_UID = "api::achievement.achievement";
const USER_DAILY_REWARD_UID = "api::user-daily-reward.user-daily-reward";

/**
 * Helper: Format seconds to human readable time
 */
const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
};

/**
 * Helper: Update streak for the user
 */
async function updateStreak(strapi: any, userId: number, playerStat: any) {
  const now = new Date();
  const nowMadrid = utcToZonedTime(now, TIMEZONE);
  const todayMadrid = startOfDay(nowMadrid);
  const todayStr = todayMadrid.toISOString().split("T")[0];

  const lastStreakDate = playerStat.lastStreakDate;
  let currentStreak = playerStat.currentStreak || 0;
  let longestStreak = playerStat.longestStreak || 0;

  if (!lastStreakDate) {
    // First time playing
    currentStreak = 1;
    longestStreak = Math.max(longestStreak, 1);
  } else {
    const lastDateMadrid = startOfDay(
      utcToZonedTime(parseISO(lastStreakDate), TIMEZONE),
    );
    const daysDiff = differenceInDays(todayMadrid, lastDateMadrid);

    if (daysDiff === 0) {
      // Same day, no change
    } else if (daysDiff === 1) {
      // Consecutive day
      currentStreak += 1;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      // Streak broken
      currentStreak = 1;
    }
  }

  await strapi.db.query(PLAYER_STAT_UID).update({
    where: { id: playerStat.id },
    data: {
      currentStreak,
      longestStreak,
      lastStreakDate: todayStr,
    },
  });

  return { currentStreak, longestStreak };
}

/**
 * Helper: Get or create player stats
 */
async function getOrCreatePlayerStat(strapi: any, userId: number) {
  let playerStat = await strapi.db
    .query(PLAYER_STAT_UID)
    .findOne({ where: { users_permissions_user: userId } });

  if (!playerStat) {
    playerStat = await strapi.db.query(PLAYER_STAT_UID).create({
      data: {
        users_permissions_user: userId,
        coins: 0,
        tickets: 0,
        xp: 0,
        score: 0,
        highestScore: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        totalPlayTime: 0,
        totalSessions: 0,
        averageSessionTime: 0,
        currentStreak: 0,
        longestStreak: 0,
        publishedAt: new Date(),
      },
    });
  }

  return playerStat;
}

export default {
  // ==================== SUMMARY ====================

  /**
   * Get comprehensive player statistics summary
   * GET /api/player-dashboard/summary
   */
  async getSummary(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
    }

    const playerStat = await getOrCreatePlayerStat(strapi, user.id);

    // Get game history stats
    const gameHistories = await strapi.entityService.findMany(
      USER_GAME_HISTORY_UID,
      { filters: { users_permissions_user: user.id } },
    );

    const totalGamesPlayed = gameHistories?.length || 0;
    const totalScore = (gameHistories || []).reduce(
      (acc: number, g: any) => acc + (g.score || 0),
      0,
    );
    const highestScore = (gameHistories || []).reduce(
      (max: number, g: any) => Math.max(max, g.score || 0),
      0,
    );
    const averageScore =
      totalGamesPlayed > 0 ? Math.round(totalScore / totalGamesPlayed) : 0;
    const totalPlayTimeFromGames = (gameHistories || []).reduce(
      (acc: number, g: any) => acc + (g.duration || 0),
      0,
    );

    // Get levels stats
    const completedLevels = await strapi.db
      .query(USER_GAME_HISTORY_UID)
      .findMany({
        where: { users_permissions_user: user.id, completed: true },
        populate: ["level"],
      });

    const uniqueCompletedLevelIds = new Set(
      completedLevels.filter((h: any) => h.level).map((h: any) => h.level.id),
    );
    const levelsCompleted = uniqueCompletedLevelIds.size;

    const totalLevels =
      (await strapi.db
        .query(LEVEL_UID)
        .count({ where: { publishedAt: { $ne: null } } })) || 0;

    // Get achievements stats
    const userAchievements = await strapi.entityService.findMany(
      USER_ACHIEVEMENT_UID,
      { filters: { users_permissions_user: user.id, completed: true } },
    );
    const achievementsUnlocked = userAchievements?.length || 0;

    const totalAchievements =
      (await strapi.db.query(ACHIEVEMENT_UID).count({
        where: { publishedAt: { $ne: null }, isActive: true },
      })) || 0;

    // Get rewards stats
    const userRewards = await strapi.entityService.findMany(USER_REWARD_UID, {
      filters: { users_permissions_user: user.id },
      populate: ["reward"],
    });

    const totalRewardsWon = userRewards?.length || 0;
    const consumablesWon = (userRewards || []).filter(
      (r: any) => r.reward?.typeReward === "consumable",
    ).length;
    const currencyRewardsWon = (userRewards || []).filter(
      (r: any) => r.reward?.typeReward === "currency",
    ).length;
    const cosmeticRewardsWon = (userRewards || []).filter(
      (r: any) => r.reward?.typeReward === "cosmetic",
    ).length;

    // Get ranking info
    const latestRanking = await strapi.entityService.findMany(RANKING_UID, {
      sort: { timestamp: "desc" },
      limit: 1,
    });

    let globalRank: number | null = null;
    let totalPlayers = 0;

    if (latestRanking && latestRanking.length > 0) {
      const rankingData = latestRanking[0] as any;
      const topPlayers = rankingData.topPlayers || [];
      totalPlayers = rankingData.stats?.totalPlayers || topPlayers.length;

      const playerRankIndex = topPlayers.findIndex(
        (p: any) => p.userId === user.id || p.username === user.username,
      );
      if (playerRankIndex !== -1) {
        globalRank = playerRankIndex + 1;
      }
    }

    // Get session stats
    const sessions = await strapi.db.query(USER_SESSION_UID).findMany({
      where: { users_permissions_user: user.id },
      orderBy: { startedAt: "desc" },
    });

    const sessionsArray = sessions || [];
    const totalSessionTime = sessionsArray.reduce(
      (acc: number, s: any) => acc + (s.duration || 0),
      0,
    );
    const totalSessionsCount = sessionsArray.length;
    const avgSessionTime =
      totalSessionsCount > 0
        ? Math.round(totalSessionTime / totalSessionsCount)
        : 0;

    // Get active session if any
    const activeSession = sessionsArray.find((s: any) => s.isActive);

    // Get daily rewards streak info
    const dailyRewardsClaimed = await strapi.entityService.findMany(
      USER_DAILY_REWARD_UID,
      {
        filters: { users_permissions_user: user.id, claimed: true },
        sort: { claimedAt: "desc" },
      },
    );

    return {
      data: {
        // Estadísticas básicas de monedas
        coins: playerStat.coins || 0,
        tickets: playerStat.tickets || 0,
        coinsEarned: playerStat.coinsEarned || 0,
        coinsSpent: playerStat.coinsSpent || 0,
        ticketsEarned: playerStat.ticketsEarned || 0,
        ticketsSpent: playerStat.ticketsSpent || 0,

        // Estadísticas de juego
        totalGamesPlayed,
        gamesWon: playerStat.gamesWon || 0,
        gamesLost: playerStat.gamesLost || 0,
        winRate: playerStat.winRate || 0,
        totalScore,
        highestScore: Math.max(highestScore, playerStat.highestScore || 0),
        averageScore,
        xp: playerStat.xp || 0,

        // Niveles
        levelsCompleted,
        totalLevels,
        currentLevel: levelsCompleted + 1,
        levelProgress:
          totalLevels > 0
            ? Math.round((levelsCompleted / totalLevels) * 100)
            : 0,

        // Logros
        achievementsUnlocked,
        totalAchievements,
        achievementProgress:
          totalAchievements > 0
            ? Math.round((achievementsUnlocked / totalAchievements) * 100)
            : 0,

        // Premios
        totalRewardsWon,
        consumablesWon,
        currencyRewardsWon,
        cosmeticRewardsWon,

        // Tiempo de juego
        totalPlayTime: playerStat.totalPlayTime || totalPlayTimeFromGames || 0,
        totalPlayTimeFormatted: formatTime(
          playerStat.totalPlayTime || totalPlayTimeFromGames || 0,
        ),
        totalSessionTime,
        totalSessionTimeFormatted: formatTime(totalSessionTime),
        averageSessionTime: playerStat.averageSessionTime || avgSessionTime,
        averageSessionTimeFormatted: formatTime(
          playerStat.averageSessionTime || avgSessionTime,
        ),
        totalSessions: playerStat.totalSessions || totalSessionsCount,

        // Racha / Actividad
        currentStreak: playerStat.currentStreak || 0,
        longestStreak: playerStat.longestStreak || 0,
        lastPlayedAt: playerStat.lastPlayedAt || null,
        lastLoginAt: playerStat.lastLoginAt || null,
        dailyRewardsClaimed: dailyRewardsClaimed?.length || 0,

        // Sesión actual
        hasActiveSession: !!activeSession,
        currentSession: activeSession
          ? {
              sessionId: activeSession.id,
              uuid: activeSession.uuid,
              startedAt: activeSession.startedAt,
              sessionType: activeSession.sessionType,
            }
          : null,

        // Ranking
        globalRank,
        totalPlayers,
        rankPercentile:
          globalRank && totalPlayers > 0
            ? Math.round(((totalPlayers - globalRank) / totalPlayers) * 100)
            : null,

        // Fecha de registro
        memberSince: user.createdAt,
      },
    };
  },

  // ==================== SESSION MANAGEMENT ====================

  /**
   * Start a new session for the user
   * POST /api/player-dashboard/session/start
   */
  async startSession(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
    }

    const body = ctx.request.body?.data || ctx.request.body || {};
    const sessionType = body.sessionType || "login";
    const deviceInfo = body.deviceInfo || null;

    const playerStat = await getOrCreatePlayerStat(strapi, user.id);

    // Close any existing active sessions for this user
    const activeSessions = await strapi.db.query(USER_SESSION_UID).findMany({
      where: { users_permissions_user: user.id, isActive: true },
    });

    const now = new Date();
    for (const session of activeSessions) {
      const startedAt = new Date(session.startedAt);
      const duration = differenceInSeconds(now, startedAt);
      await strapi.db.query(USER_SESSION_UID).update({
        where: { id: session.id },
        data: { isActive: false, endedAt: now, duration },
      });
    }

    // Get client IP (safely)
    const ipAddress =
      ctx.request.ip ||
      ctx.request.headers["x-forwarded-for"] ||
      ctx.request.headers["x-real-ip"] ||
      "unknown";

    // Create new session
    const newSession = await strapi.db.query(USER_SESSION_UID).create({
      data: {
        users_permissions_user: user.id,
        player_stat: playerStat.id,
        sessionType,
        startedAt: now,
        isActive: true,
        lastHeartbeat: now,
        gamesPlayedInSession: 0,
        scoreInSession: 0,
        coinsEarnedInSession: 0,
        deviceInfo,
        ipAddress: typeof ipAddress === "string" ? ipAddress : ipAddress[0],
      },
    });

    // Update streak logic
    const streakResult = await updateStreak(strapi, user.id, playerStat);

    // Update last login
    await strapi.db.query(PLAYER_STAT_UID).update({
      where: { id: playerStat.id },
      data: {
        lastLoginAt: now,
        totalSessions: (playerStat.totalSessions || 0) + 1,
      },
    });

    return {
      data: {
        sessionId: newSession.id,
        uuid: newSession.uuid,
        sessionType: newSession.sessionType,
        startedAt: newSession.startedAt,
        isActive: newSession.isActive,
        streak: {
          currentStreak: streakResult.currentStreak,
          longestStreak: streakResult.longestStreak,
        },
      },
    };
  },

  /**
   * Send heartbeat to keep session alive
   * POST /api/player-dashboard/session/heartbeat
   */
  async heartbeat(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
    }

    const body = ctx.request.body?.data || ctx.request.body || {};

    // Find active session
    const session = await strapi.db.query(USER_SESSION_UID).findOne({
      where: { users_permissions_user: user.id, isActive: true },
      orderBy: { startedAt: "desc" },
    });

    if (!session) {
      return ctx.notFound("No active session found", {
        reason: "no_active_session",
      });
    }

    const now = new Date();

    // Update session stats if provided
    const updateData: any = { lastHeartbeat: now };

    if (body.gamesPlayed !== undefined) {
      updateData.gamesPlayedInSession =
        (session.gamesPlayedInSession || 0) + body.gamesPlayed;
    }
    if (body.score !== undefined) {
      updateData.scoreInSession = (session.scoreInSession || 0) + body.score;
    }
    if (body.coinsEarned !== undefined) {
      updateData.coinsEarnedInSession =
        (session.coinsEarnedInSession || 0) + body.coinsEarned;
    }

    await strapi.db.query(USER_SESSION_UID).update({
      where: { id: session.id },
      data: updateData,
    });

    // Calculate current duration
    const startedAt = new Date(session.startedAt);
    const duration = differenceInSeconds(now, startedAt);

    return {
      data: {
        sessionId: session.id,
        isActive: true,
        duration,
        durationFormatted: formatTime(duration),
        lastHeartbeat: now,
        gamesPlayedInSession:
          updateData.gamesPlayedInSession ?? session.gamesPlayedInSession,
        scoreInSession: updateData.scoreInSession ?? session.scoreInSession,
        coinsEarnedInSession:
          updateData.coinsEarnedInSession ?? session.coinsEarnedInSession,
      },
    };
  },

  /**
   * End the current session
   * POST /api/player-dashboard/session/end
   */
  async endSession(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
    }

    const body = ctx.request.body?.data || ctx.request.body || {};

    // Find active session
    const session = await strapi.db.query(USER_SESSION_UID).findOne({
      where: { users_permissions_user: user.id, isActive: true },
      orderBy: { startedAt: "desc" },
    });

    if (!session) {
      return ctx.notFound("No active session found", {
        reason: "no_active_session",
      });
    }

    const now = new Date();
    const startedAt = new Date(session.startedAt);
    const duration = differenceInSeconds(now, startedAt);

    // Update final session stats if provided
    const finalGamesPlayed =
      body.gamesPlayed !== undefined
        ? (session.gamesPlayedInSession || 0) + body.gamesPlayed
        : session.gamesPlayedInSession || 0;
    const finalScore =
      body.score !== undefined
        ? (session.scoreInSession || 0) + body.score
        : session.scoreInSession || 0;
    const finalCoins =
      body.coinsEarned !== undefined
        ? (session.coinsEarnedInSession || 0) + body.coinsEarned
        : session.coinsEarnedInSession || 0;

    // Close the session
    await strapi.db.query(USER_SESSION_UID).update({
      where: { id: session.id },
      data: {
        isActive: false,
        endedAt: now,
        duration,
        gamesPlayedInSession: finalGamesPlayed,
        scoreInSession: finalScore,
        coinsEarnedInSession: finalCoins,
      },
    });

    // Update player stats with accumulated time
    const playerStat = await strapi.db
      .query(PLAYER_STAT_UID)
      .findOne({ where: { users_permissions_user: user.id } });

    if (playerStat) {
      const newTotalPlayTime = (playerStat.totalPlayTime || 0) + duration;
      const newTotalSessions = playerStat.totalSessions || 1;
      const newAverageSessionTime = newTotalPlayTime / newTotalSessions;

      await strapi.db.query(PLAYER_STAT_UID).update({
        where: { id: playerStat.id },
        data: {
          totalPlayTime: newTotalPlayTime,
          averageSessionTime: Math.round(newAverageSessionTime),
          lastPlayedAt: now,
        },
      });
    }

    return {
      data: {
        sessionId: session.id,
        uuid: session.uuid,
        isActive: false,
        startedAt: session.startedAt,
        endedAt: now,
        duration,
        durationFormatted: formatTime(duration),
        gamesPlayedInSession: finalGamesPlayed,
        scoreInSession: finalScore,
        coinsEarnedInSession: finalCoins,
      },
    };
  },

  /**
   * Get current active session
   * GET /api/player-dashboard/session/current
   */
  async getCurrentSession(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
    }

    const session = await strapi.db.query(USER_SESSION_UID).findOne({
      where: { users_permissions_user: user.id, isActive: true },
      orderBy: { startedAt: "desc" },
    });

    if (!session) {
      return {
        data: null,
        meta: { hasActiveSession: false },
      };
    }

    // Check if session has timed out
    const now = new Date();
    const lastHeartbeat = new Date(session.lastHeartbeat || session.startedAt);
    const secondsSinceHeartbeat = differenceInSeconds(now, lastHeartbeat);

    if (secondsSinceHeartbeat > HEARTBEAT_TIMEOUT_SECONDS) {
      // Auto-close timed out session
      const duration = differenceInSeconds(
        lastHeartbeat,
        new Date(session.startedAt),
      );
      await strapi.db.query(USER_SESSION_UID).update({
        where: { id: session.id },
        data: { isActive: false, endedAt: lastHeartbeat, duration },
      });

      return {
        data: null,
        meta: { hasActiveSession: false, previousSessionTimedOut: true },
      };
    }

    const startedAt = new Date(session.startedAt);
    const duration = differenceInSeconds(now, startedAt);

    return {
      data: {
        sessionId: session.id,
        uuid: session.uuid,
        sessionType: session.sessionType,
        startedAt: session.startedAt,
        isActive: session.isActive,
        duration,
        durationFormatted: formatTime(duration),
        lastHeartbeat: session.lastHeartbeat,
        gamesPlayedInSession: session.gamesPlayedInSession || 0,
        scoreInSession: session.scoreInSession || 0,
        coinsEarnedInSession: session.coinsEarnedInSession || 0,
      },
      meta: { hasActiveSession: true },
    };
  },

  /**
   * Get session history for the user
   * GET /api/player-dashboard/session/history
   */
  async getSessionHistory(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
    }

    const { page = 1, pageSize = 10, sessionType } = ctx.query;

    const where: any = { users_permissions_user: user.id };
    if (sessionType) {
      where.sessionType = sessionType;
    }

    const sessions = await strapi.db.query(USER_SESSION_UID).findMany({
      where,
      orderBy: { startedAt: "desc" },
      offset: (Number(page) - 1) * Number(pageSize),
      limit: Number(pageSize),
    });

    const total = await strapi.db.query(USER_SESSION_UID).count({ where });

    // Calculate totals
    const allSessions = await strapi.db.query(USER_SESSION_UID).findMany({
      where: { users_permissions_user: user.id },
    });
    const totalDuration = (allSessions || []).reduce(
      (acc: number, s: any) => acc + (s.duration || 0),
      0,
    );

    return {
      data: (sessions || []).map((s: any) => ({
        sessionId: s.id,
        uuid: s.uuid,
        sessionType: s.sessionType,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        duration: s.duration || 0,
        durationFormatted: formatTime(s.duration || 0),
        isActive: s.isActive,
        gamesPlayedInSession: s.gamesPlayedInSession || 0,
        scoreInSession: s.scoreInSession || 0,
        coinsEarnedInSession: s.coinsEarnedInSession || 0,
      })),
      meta: {
        pagination: {
          page: Number(page),
          pageSize: Number(pageSize),
          pageCount: Math.ceil(total / Number(pageSize)),
          total,
        },
        summary: {
          totalSessions: allSessions?.length || 0,
          totalDuration,
          totalDurationFormatted: formatTime(totalDuration),
        },
      },
    };
  },
};
