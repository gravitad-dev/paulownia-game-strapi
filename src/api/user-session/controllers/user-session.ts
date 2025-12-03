/**
 * user-session controller
 */

import { factories } from "@strapi/strapi";
import {
  startOfDay,
  differenceInDays,
  differenceInSeconds,
  parseISO,
} from "date-fns";
import { utcToZonedTime } from "date-fns-tz";
import { getUuidControllerMethods } from "../../../helpers/uuidApi";

const TIMEZONE = "Europe/Madrid";
const HEARTBEAT_TIMEOUT_SECONDS = 300; // 5 minutes - session considered inactive after this

// Use 'as any' to bypass TypeScript checks for new content type until types are regenerated
const USER_SESSION_UID = "api::user-session.user-session" as any;
const PLAYER_STAT_UID = "api::player-stat.player-stat";

export default factories.createCoreController(
  USER_SESSION_UID,
  ({ strapi }) => ({
    // Include UUID-based methods (findOneByUuid, updateByUuid, deleteByUuid)
    ...getUuidControllerMethods(USER_SESSION_UID),
    /**
     * Start a new session for the user
     * POST /api/user-sessions/start
     */
    async startSession(ctx: any) {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
      }

      const body = ctx.request.body?.data || {};
      const sessionType = body.sessionType || "login";
      const deviceInfo = body.deviceInfo || null;

      // Get user's player stats
      let playerStat = await strapi.db
        .query(PLAYER_STAT_UID)
        .findOne({ where: { users_permissions_user: user.id } });

      // Create player stat if doesn't exist
      if (!playerStat) {
        playerStat = await strapi.db.query(PLAYER_STAT_UID).create({
          data: {
            users_permissions_user: user.id,
            coins: 0,
            tickets: 0,
            publishedAt: new Date(),
          },
        });
      }

      // Close any existing active sessions for this user
      const activeSessions = await strapi.db.query(USER_SESSION_UID).findMany({
        where: {
          users_permissions_user: user.id,
          isActive: true,
        },
      });

      const now = new Date();
      for (const session of activeSessions) {
        const startedAt = new Date(session.startedAt);
        const duration = differenceInSeconds(now, startedAt);
        await strapi.db.query(USER_SESSION_UID).update({
          where: { id: session.id },
          data: {
            isActive: false,
            endedAt: now,
            duration,
          },
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
     * POST /api/user-sessions/heartbeat
     */
    async heartbeat(ctx: any) {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
      }

      const body = ctx.request.body?.data || {};
      const sessionId = body.sessionId;

      // Find active session
      let session;
      if (sessionId) {
        session = await strapi.db.query(USER_SESSION_UID).findOne({
          where: {
            id: sessionId,
            users_permissions_user: user.id,
            isActive: true,
          },
        });
      } else {
        session = await strapi.db.query(USER_SESSION_UID).findOne({
          where: {
            users_permissions_user: user.id,
            isActive: true,
          },
          orderBy: { startedAt: "desc" },
        });
      }

      if (!session) {
        return ctx.notFound("No active session found", {
          reason: "no_active_session",
        });
      }

      const now = new Date();

      // Update session stats if provided
      const updateData: any = {
        lastHeartbeat: now,
      };

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
     * POST /api/user-sessions/end
     */
    async endSession(ctx: any) {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
      }

      const body = ctx.request.body?.data || {};
      const sessionId = body.sessionId;

      // Find active session
      let session;
      if (sessionId) {
        session = await strapi.db.query(USER_SESSION_UID).findOne({
          where: {
            id: sessionId,
            users_permissions_user: user.id,
            isActive: true,
          },
        });
      } else {
        session = await strapi.db.query(USER_SESSION_UID).findOne({
          where: {
            users_permissions_user: user.id,
            isActive: true,
          },
          orderBy: { startedAt: "desc" },
        });
      }

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
          isActive: false,
          startedAt: session.startedAt,
          endedAt: now,
          duration,
          gamesPlayedInSession: finalGamesPlayed,
          scoreInSession: finalScore,
          coinsEarnedInSession: finalCoins,
        },
      };
    },

    /**
     * Get current active session
     * GET /api/user-sessions/current
     */
    async getCurrentSession(ctx: any) {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
      }

      const session = await strapi.db.query(USER_SESSION_UID).findOne({
        where: {
          users_permissions_user: user.id,
          isActive: true,
        },
        orderBy: { startedAt: "desc" },
      });

      if (!session) {
        return {
          data: null,
          meta: {
            hasActiveSession: false,
          },
        };
      }

      // Check if session has timed out
      const now = new Date();
      const lastHeartbeat = new Date(
        session.lastHeartbeat || session.startedAt,
      );
      const secondsSinceHeartbeat = differenceInSeconds(now, lastHeartbeat);

      if (secondsSinceHeartbeat > HEARTBEAT_TIMEOUT_SECONDS) {
        // Auto-close timed out session
        const duration = differenceInSeconds(
          lastHeartbeat,
          new Date(session.startedAt),
        );
        await strapi.db.query(USER_SESSION_UID).update({
          where: { id: session.id },
          data: {
            isActive: false,
            endedAt: lastHeartbeat,
            duration,
          },
        });

        return {
          data: null,
          meta: {
            hasActiveSession: false,
            previousSessionTimedOut: true,
          },
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
          lastHeartbeat: session.lastHeartbeat,
          gamesPlayedInSession: session.gamesPlayedInSession || 0,
          scoreInSession: session.scoreInSession || 0,
          coinsEarnedInSession: session.coinsEarnedInSession || 0,
        },
        meta: {
          hasActiveSession: true,
        },
      };
    },

    /**
     * Get session history for the user
     * GET /api/user-sessions/history
     */
    async getSessionHistory(ctx: any) {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
      }

      const { page = 1, pageSize = 10 } = ctx.query;

      const sessions = await strapi.db.query(USER_SESSION_UID).findMany({
        where: { users_permissions_user: user.id },
        orderBy: { startedAt: "desc" },
        offset: (Number(page) - 1) * Number(pageSize),
        limit: Number(pageSize),
      });

      const total = await strapi.db.query(USER_SESSION_UID).count({
        where: { users_permissions_user: user.id },
      });

      return {
        data: (sessions || []).map((s: any) => ({
          sessionId: s.id,
          uuid: s.uuid,
          sessionType: s.sessionType,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          duration: s.duration,
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
        },
      };
    },
  }),
);

/**
 * Update streak for the user (helper function outside controller)
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
