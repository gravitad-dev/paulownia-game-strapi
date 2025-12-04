import crypto from "crypto";

const PLAYER_STAT_UID = "api::player-stat.player-stat";
const USER_SESSION_UID = "api::user-session.user-session" as any;
const USER_GAME_HISTORY_UID = "api::user-game-history.user-game-history";
const LEVEL_UID = "api::level.level";
const USER_LEVEL_UID = "api::user-level.user-level";

const difficultyToGrid = (difficulty: string): string => {
  const d = String(difficulty || "").toLowerCase();
  const small = ["aprendiz", "novato"];
  const large = ["aventurero", "veterano", "maestro", "leyenda"];
  if (small.includes(d)) return "6x6x6";
  if (large.includes(d)) return "8x8x8";
  return "6x6x6";
};

const makeHash = (
  levelUuid: string,
  difficulty: string,
  startAt: string,
  seed: string,
  userId: number,
  salt: string,
): string => {
  const payload = `${levelUuid}|${difficulty}|${startAt}|${seed}|${userId}|${salt}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
};

export default {
  async start(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
    }

    const { levelUuid, difficulty, startAt, seed } = ctx.request.body || {};
    if (!levelUuid || !difficulty || !startAt || !seed) {
      return ctx.badRequest("Missing required fields", {
        reason: "missing_required_fields",
        required: ["levelUuid", "difficulty", "startAt", "seed"],
      });
    }

    const level = await strapi.db
      .query(LEVEL_UID)
      .findOne({ where: { uuid: levelUuid } });
    if (!level) {
      const anyByHash = await strapi.db.query(USER_GAME_HISTORY_UID).findMany({
        where: {
          users_permissions_user: user.id,
          completed: true,
        },
      });
      const dup = (anyByHash || []).find(
        (h: any) => h.history && h.history.hash === hash,
      );
      if (dup) {
        return {
          data: {
            alreadyCompleted: true,
            score: dup.score,
            duration: dup.duration,
            completedAt: dup.completedAt,
          },
        };
      }
      return ctx.notFound("Level not found", { reason: "level_not_found" });
    }

    const gridSize = difficultyToGrid(difficulty);
    const salt = String(
      (strapi as any)?.config?.get?.("server.puzzleSeedSalt") ??
        process.env.PUZZLE_SEED_SALT ??
        "",
    );
    const hash = makeHash(levelUuid, difficulty, startAt, seed, user.id, salt);

    let playerStat = await strapi.db
      .query(PLAYER_STAT_UID)
      .findOne({ where: { users_permissions_user: user.id } });
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

    const existingUL = await strapi.db
      .query(USER_LEVEL_UID)
      .findOne({ where: { users_permissions_user: user.id, level: level.id } });
    if (!existingUL) {
      return ctx.forbidden("Level not unlocked", {
        reason: "level_not_unlocked",
      });
    }
    const statusUL = String(existingUL.levelStatus || "").trim();
    if (statusUL !== "available" && statusUL !== "won") {
      return ctx.forbidden("Level is not available", {
        reason: "level_locked",
      });
    }

    const history = await strapi.db.query(USER_GAME_HISTORY_UID).create({
      data: {
        users_permissions_user: user.id,
        level: level.id,
        score: 0,
        duration: 0,
        completed: false,
        seed: String(seed),
        history: { hash, difficulty, gridSize, startAt },
      },
    });

    const activeSessions = await strapi.db
      .query(USER_SESSION_UID)
      .findMany({ where: { users_permissions_user: user.id, isActive: true } });
    const now = new Date(startAt);
    for (const s of activeSessions) {
      const startedAt = new Date(s.startedAt);
      const seconds = Math.max(
        0,
        Math.floor((now.getTime() - startedAt.getTime()) / 1000),
      );
      await strapi.db.query(USER_SESSION_UID).update({
        where: { id: s.id },
        data: { isActive: false, endedAt: now, duration: seconds },
      });
    }

    await strapi.db.query(USER_SESSION_UID).create({
      data: {
        users_permissions_user: user.id,
        player_stat: playerStat.id,
        sessionType: "game",
        startedAt: now,
        isActive: true,
      },
    });

    return {
      data: { hash, gridSize, startedAt: startAt, gameHistoryId: history.id },
    };
  },

  async end(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
    }

    const { levelUuid, difficulty, endAt, hash, bonusPoints, status } =
      ctx.request.body || {};
    if (!levelUuid || !difficulty || !endAt || !hash || !status) {
      return ctx.badRequest("Missing required fields", {
        reason: "missing_required_fields",
        required: ["levelUuid", "difficulty", "endAt", "hash", "status"],
      });
    }

    const completedWithSameHash = await strapi.db
      .query(USER_GAME_HISTORY_UID)
      .findMany({
        where: {
          users_permissions_user: user.id,
          completed: true,
        },
      });
    const dupByHash = (completedWithSameHash || [])
      .filter((h: any) => h && h.completed === true)
      .find((h: any) => h.history && h.history.hash === hash);
    if (dupByHash) {
      return {
        data: {
          alreadyCompleted: true,
          score: dupByHash.score,
          duration: dupByHash.duration,
          completedAt: dupByHash.completedAt,
        },
      };
    }

    const level = await strapi.db
      .query(LEVEL_UID)
      .findOne({ where: { uuid: levelUuid } });
    if (!level) {
      return ctx.notFound("Level not found", { reason: "level_not_found" });
    }

    const histories = await strapi.db.query(USER_GAME_HISTORY_UID).findMany({
      where: {
        users_permissions_user: user.id,
        level: level.id,
        completed: false,
      },
    });
    const target = (histories || [])
      .filter((h: any) => h && h.completed === false)
      .find((h: any) => h.history && h.history.hash === hash);
    if (!target) {
      const anyByHash = await strapi.db.query(USER_GAME_HISTORY_UID).findMany({
        where: {
          users_permissions_user: user.id,
          level: level.id,
          completed: true,
        },
      });
      const dup = anyByHash.find(
        (h: any) => h.history && h.history.hash === hash,
      );
      if (dup) {
        return {
          data: {
            alreadyCompleted: true,
            score: dup.score,
            duration: dup.duration,
            completedAt: dup.completedAt,
          },
        };
      }
      return ctx.notFound("Game history not found", {
        reason: "history_not_found",
      });
    }

    const startAt = target.history?.startAt
      ? new Date(target.history.startAt)
      : new Date();
    const endDate = new Date(endAt);
    const durationSeconds = Math.max(
      0,
      Math.floor((endDate.getTime() - startAt.getTime()) / 1000),
    );
    const gridSize = difficultyToGrid(difficulty);
    const base = gridSize === "8x8x8" ? 5120 : 2160;
    const penalty = Math.floor(durationSeconds / 5);
    const extra = Number(bonusPoints || 0);
    const score = Math.max(0, base + extra - penalty);

    await strapi.db.query(USER_GAME_HISTORY_UID).update({
      where: { id: target.id },
      data: {
        completed: true,
        completedAt: endDate,
        duration: durationSeconds,
        score,
        history: { ...(target.history || {}), status },
      },
    });

    const ul = await strapi.db
      .query(USER_LEVEL_UID)
      .findOne({ where: { users_permissions_user: user.id, level: level.id } });
    if (ul) {
      const won = String(status).toLowerCase() === "won";
      await strapi.db.query(USER_LEVEL_UID).update({
        where: { id: ul.id },
        data: { levelStatus: won ? "won" : "available", lastPlayed: endDate },
      });
    }

    const ps = await strapi.db
      .query(PLAYER_STAT_UID)
      .findOne({ where: { users_permissions_user: user.id } });
    if (ps) {
      const won = String(status).toLowerCase() === "won";
      const gamesPlayed = (ps.gamesPlayed || 0) + 1;
      const gamesWon = (ps.gamesWon || 0) + (won ? 1 : 0);
      const gamesLost = (ps.gamesLost || 0) + (won ? 0 : 1);
      const highestScore = Math.max(ps.highestScore || 0, score);
      await strapi.db.query(PLAYER_STAT_UID).update({
        where: { id: ps.id },
        data: {
          gamesPlayed,
          gamesWon,
          gamesLost,
          highestScore,
          lastPlayedAt: endDate,
        },
      });
    }

    const session = await strapi.db.query(USER_SESSION_UID).findOne({
      where: { users_permissions_user: user.id, isActive: true },
      orderBy: { startedAt: "desc" },
    });
    if (session) {
      const startedAt = new Date(session.startedAt);
      const duration = Math.max(
        0,
        Math.floor((endDate.getTime() - startedAt.getTime()) / 1000),
      );
      const scoreInSession = (session.scoreInSession || 0) + score;
      const gamesPlayedInSession = (session.gamesPlayedInSession || 0) + 1;
      await strapi.db.query(USER_SESSION_UID).update({
        where: { id: session.id },
        data: {
          isActive: false,
          endedAt: endDate,
          duration,
          scoreInSession,
          gamesPlayedInSession,
        },
      });
    }

    return {
      data: {
        status,
        score,
        duration: durationSeconds,
        completedAt: endAt,
        levelStatus:
          String(status).toLowerCase() === "won" ? "won" : "available",
      },
    };
  },
};
