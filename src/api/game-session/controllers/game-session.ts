import crypto from "crypto";

const PLAYER_STAT_UID = "api::player-stat.player-stat";
const USER_SESSION_UID = "api::user-session.user-session" as any;
const USER_GAME_HISTORY_UID = "api::user-game-history.user-game-history";
const LEVEL_UID = "api::level.level";
const USER_LEVEL_UID = "api::user-level.user-level";
const ACHIEVEMENT_UID = "api::achievement.achievement";
const USER_ACHIEVEMENT_UID = "api::user-achievement.user-achievement";

// =============== COINS REWARDS BY DIFFICULTY ===============

const COINS_REWARDS_BY_DIFFICULTY: Record<string, number> = {
  aprendiz: 100,
  novato: 100,
  aventurero: 150,
  veterano: 150,
  maestro: 200,
  leyenda: 200,
};

// Default coins if difficulty is not recognized
const DEFAULT_COINS_REWARD = 100;

// Coins multiplier for losing (0 = no coins on loss)
const COINS_LOSS_MULTIPLIER = 0;
// ============================================================

/**
 * Get coins reward based on difficulty and game status
 * @param difficulty - The difficulty level (aprendiz, novato, aventurero, veterano, maestro, leyenda)
 * @param won - Whether the player won the game
 * @returns The coins reward amount
 */
const getCoinsReward = (difficulty: string, won: boolean): number => {
  if (!won) {
    // If player lost, apply the loss multiplier (default: 0 coins)
    const baseCoins =
      COINS_REWARDS_BY_DIFFICULTY[String(difficulty).toLowerCase()] ??
      DEFAULT_COINS_REWARD;
    return Math.floor(baseCoins * COINS_LOSS_MULTIPLIER);
  }

  const coins = COINS_REWARDS_BY_DIFFICULTY[String(difficulty).toLowerCase()];
  return coins ?? DEFAULT_COINS_REWARD;
};

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

const updateAchievementProgress = async (
  userId: number,
  playerStats: {
    gamesWon: number;
    score: number;
    totalPlayTime: number;
    xp: number;
  },
  wonDifficulty: string | null,
) => {
  const achievements = await strapi.entityService.findMany(ACHIEVEMENT_UID, {
    filters: { isActive: true },
  });

  if (!achievements || achievements.length === 0) return;

  for (const achievement of achievements as any[]) {
    let currentValue = 0;
    const targetType = achievement.targetType;

    if (targetType === "gamesWon") {
      currentValue = playerStats.gamesWon;
    } else if (targetType === "score") {
      currentValue = playerStats.score;
    } else if (targetType === "time") {
      currentValue = playerStats.totalPlayTime;
    } else if (targetType === "xp") {
      currentValue = playerStats.xp;
    } else if (targetType === "difficultyMastery" && wonDifficulty) {
      const targetDiff = achievement.targetDifficulty || "all";
      if (targetDiff === "all" || targetDiff === wonDifficulty) {
        const userLevels = await strapi.db.query(USER_LEVEL_UID).findMany({
          where: { users_permissions_user: userId },
        });
        const levelsWithDifficulty = userLevels.filter((ul: any) =>
          (ul.wonDifficulties || []).includes(wonDifficulty),
        );
        currentValue = levelsWithDifficulty.length;
      } else {
        // Si no coincide la dificultad, no tocamos este logro
        continue;
      }
    } else {
      continue;
    }

    const goalAmount = achievement.goalAmount || 0;
    const isCompleted = currentValue >= goalAmount;

    let userAchievement = await strapi.db.query(USER_ACHIEVEMENT_UID).findOne({
      where: { users_permissions_user: userId, achievement: achievement.id },
    });

    if (userAchievement) {
      if (userAchievement.completed) continue;

      await strapi.db.query(USER_ACHIEVEMENT_UID).update({
        where: { id: userAchievement.id },
        data: {
          currentProgress: currentValue,
          completed: isCompleted,
          obtainedAt: isCompleted ? new Date() : null,
        },
      });
    } else {
      await strapi.db.query(USER_ACHIEVEMENT_UID).create({
        data: {
          users_permissions_user: userId,
          achievement: achievement.id,
          currentProgress: currentValue,
          completed: isCompleted,
          claimed: false,
          obtainedAt: isCompleted ? new Date() : null,
        },
      });
    }
  }
};

export default {
  async start(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
    }

    const {
      levelUuid,
      startAt,
      seed,
      difficulty: requestedDifficulty,
    } = ctx.request.body || {};

    if (!levelUuid || !startAt || !seed) {
      return ctx.badRequest("Missing required fields", {
        reason: "missing_required_fields",
        required: ["levelUuid", "startAt", "seed"],
      });
    }

    // 1. Load Level
    const level = await strapi.db
      .query(LEVEL_UID)
      .findOne({ where: { uuid: levelUuid } });

    if (!level) {
      return ctx.notFound("Level not found", { reason: "level_not_found" });
    }

    // 2. Use requested difficulty or level default
    // Validamos que la dificultad esté en nuestro mapa de recompensas
    const difficulty =
      requestedDifficulty && COINS_REWARDS_BY_DIFFICULTY[requestedDifficulty]
        ? requestedDifficulty
        : level.difficulty || "aprendiz";

    const gridSize = difficultyToGrid(difficulty);

    const salt = String(
      (strapi as any)?.config?.get?.("server.puzzleSeedSalt") ??
        process.env.PUZZLE_SEED_SALT ??
        "",
    );

    // 3. Generate Valid Hash
    const hash = makeHash(levelUuid, difficulty, startAt, seed, user.id, salt);

    // 4. Check for duplicates (using the computed hash)
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

    const { levelUuid, endAt, hash, bonusPoints, status } =
      ctx.request.body || {};
    // Ignore difficulty from body for security

    if (!levelUuid || !endAt || !hash || !status) {
      return ctx.badRequest("Missing required fields", {
        reason: "missing_required_fields",
        required: ["levelUuid", "endAt", "hash", "status"],
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
      // FIX: Still count the game as played even if it's a duplicate
      const ps = await strapi.db
        .query(PLAYER_STAT_UID)
        .findOne({ where: { users_permissions_user: user.id } });
      if (ps) {
        await strapi.db.query(PLAYER_STAT_UID).update({
          where: { id: ps.id },
          data: {
            gamesPlayed: (ps.gamesPlayed || 0) + 1,
            lastPlayedAt: new Date().toISOString(),
          },
        });
      }
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
        // FIX: Still count the game as played even if it's a duplicate
        const ps = await strapi.db
          .query(PLAYER_STAT_UID)
          .findOne({ where: { users_permissions_user: user.id } });
        if (ps) {
          await strapi.db.query(PLAYER_STAT_UID).update({
            where: { id: ps.id },
            data: {
              gamesPlayed: (ps.gamesPlayed || 0) + 1,
              lastPlayedAt: new Date().toISOString(),
            },
          });
        }
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

    // FIX: Use stored difficulty from history (Trusted by Server)
    const storedDifficulty = target.history?.difficulty || "aprendiz";

    const gridSize = difficultyToGrid(storedDifficulty);
    const base = gridSize === "8x8x8" ? 5120 : 2160;
    const penalty = Math.floor(durationSeconds / 5);
    const extra = Number(bonusPoints || 0);
    let score = Math.max(0, base + extra - penalty);

    // Calculate coins earned based on difficulty and win status
    const won = String(status).toLowerCase() === "won";
    let coinsEarned = getCoinsReward(storedDifficulty, won);

    // FIX: If player lost, no score points
    if (!won) {
      score = 0;
    }

    // Check if THIS DIFFICULTY was already won to prevent farming
    const ul = await strapi.db
      .query(USER_LEVEL_UID)
      .findOne({ where: { users_permissions_user: user.id, level: level.id } });

    const wonDifficulties: string[] = ul?.wonDifficulties || [];
    const difficultyLower = String(storedDifficulty).toLowerCase();
    const alreadyWonThisDifficulty = wonDifficulties.includes(difficultyLower);

    if (alreadyWonThisDifficulty) {
      score = 0;
      coinsEarned = 0;
    }

    await strapi.db.query(USER_GAME_HISTORY_UID).update({
      where: { id: target.id },
      data: {
        completed: true,
        completedAt: endDate.toISOString(),
        duration: durationSeconds,
        score,
        coinsEarned,
        history: { ...(target.history || {}), status },
      },
    });

    if (ul) {
      // Update wonDifficulties if this difficulty was won for the first time
      const updatedWonDifficulties =
        won && !alreadyWonThisDifficulty
          ? [...wonDifficulties, difficultyLower]
          : wonDifficulties;

      await strapi.db.query(USER_LEVEL_UID).update({
        where: { id: ul.id },
        data: {
          levelStatus: won ? "won" : ul.levelStatus,
          lastPlayed: endDate.toISOString(),
          wonDifficulties: updatedWonDifficulties,
        },
      });
    }

    const ps = await strapi.db
      .query(PLAYER_STAT_UID)
      .findOne({ where: { users_permissions_user: user.id } });
    if (ps) {
      const gamesPlayed = (ps.gamesPlayed || 0) + 1;
      const gamesWon = (ps.gamesWon || 0) + (won ? 1 : 0);
      const gamesLost = (ps.gamesLost || 0) + (won ? 0 : 1);
      const highestScore = Math.max(ps.highestScore || 0, score);
      const newCoins = (ps.coins || 0) + coinsEarned;
      const newCoinsEarned = (ps.coinsEarned || 0) + coinsEarned;
      const newScore = (ps.score || 0) + score;
      const newTotalPlayTime = (ps.totalPlayTime || 0) + durationSeconds;
      const winRate =
        gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;
      const dataToUpdate = {
        gamesPlayed,
        gamesWon,
        gamesLost,
        highestScore,
        score: newScore,
        winRate,
        totalPlayTime: newTotalPlayTime,
        coins: newCoins,
        coinsEarned: newCoinsEarned,
        lastPlayedAt: endDate.toISOString(),
        publishedAt: new Date(),
      };
      await strapi.entityService.update(PLAYER_STAT_UID, ps.id, {
        data: dataToUpdate,
      });
    }

    if (ps) {
      const updatedStats = {
        gamesWon: (ps.gamesWon || 0) + (won ? 1 : 0),
        score: (ps.score || 0) + score,
        totalPlayTime: (ps.totalPlayTime || 0) + durationSeconds,
        xp: ps.xp || 0,
      };
      await updateAchievementProgress(
        user.id,
        updatedStats,
        won && !alreadyWonThisDifficulty ? storedDifficulty : null,
      );
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
      const coinsEarnedInSession =
        (session.coinsEarnedInSession || 0) + coinsEarned;
      await strapi.db.query(USER_SESSION_UID).update({
        where: { id: session.id },
        data: {
          isActive: false,
          endedAt: endDate.toISOString(),
          duration,
          scoreInSession,
          gamesPlayedInSession,
          coinsEarnedInSession,
        },
      });
    }

    return {
      data: {
        status,
        score,
        coins: coinsEarned,
        duration: durationSeconds,
        completedAt: endAt,
        levelStatus: won ? "won" : "available",
      },
    };
  },
};
