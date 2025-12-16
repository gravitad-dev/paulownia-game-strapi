import { factories } from "@strapi/strapi";
import { getUuidControllerMethods } from "../../../helpers/uuidApi";
import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  startOfYear,
  addDays,
  addMonths,
  addYears,
} from "date-fns";
import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";

const TIMEZONE = "Europe/Madrid";

export default factories.createCoreController(
  "api::player-stat.player-stat",
  ({ strapi }) => ({
    ...getUuidControllerMethods("api::player-stat.player-stat"),

    /**
     * Get complete player stats summary
     * GET /api/player-stats/summary
     */
    async summary(ctx) {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
      }

      // Get player stats (create if doesn't exist)
      let playerStat = await strapi.db
        .query("api::player-stat.player-stat")
        .findOne({ where: { users_permissions_user: user.id } });

      if (!playerStat) {
        // Auto-create player stat for user
        playerStat = await strapi.db
          .query("api::player-stat.player-stat")
          .create({
            data: {
              users_permissions_user: user.id,
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

      // Get game history stats
      const gameHistories = await strapi.entityService.findMany(
        "api::user-game-history.user-game-history",
        {
          filters: { users_permissions_user: user.id },
        },
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
        .query("api::user-game-history.user-game-history")
        .findMany({
          where: {
            users_permissions_user: user.id,
            completed: true,
          },
          populate: ["level"],
        });

      const uniqueCompletedLevelIds = new Set(
        completedLevels.filter((h: any) => h.level).map((h: any) => h.level.id),
      );
      const levelsCompleted = uniqueCompletedLevelIds.size;

      const totalLevelsResult = await strapi.db
        .query("api::level.level")
        .count({ where: { publishedAt: { $ne: null } } });
      const totalLevels = totalLevelsResult || 0;

      // Get achievements stats
      const userAchievements = await strapi.entityService.findMany(
        "api::user-achievement.user-achievement",
        {
          filters: {
            users_permissions_user: user.id,
            completed: true,
          },
        },
      );
      const achievementsUnlocked = userAchievements?.length || 0;

      const totalAchievementsResult = await strapi.db
        .query("api::achievement.achievement")
        .count({
          where: {
            publishedAt: { $ne: null },
            isActive: true,
          },
        });
      const totalAchievements = totalAchievementsResult || 0;

      // Get rewards stats
      const userRewards = await strapi.entityService.findMany(
        "api::user-reward.user-reward",
        {
          filters: { users_permissions_user: user.id },
          populate: ["reward"],
        },
      );

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
      const latestRanking = await strapi.entityService.findMany(
        "api::ranking.ranking",
        {
          sort: { timestamp: "desc" },
          limit: 1,
        },
      );

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

      // Get session stats - use db.query for new content type
      const USER_SESSION_UID = "api::user-session.user-session" as any;
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
      const averageSessionTime =
        totalSessionsCount > 0
          ? Math.round(totalSessionTime / totalSessionsCount)
          : 0;

      // Get active session if any
      const activeSession = sessionsArray.find((s: any) => s.isActive);

      // Get daily rewards streak info
      const dailyRewardsClaimed = await strapi.entityService.findMany(
        "api::user-daily-reward.user-daily-reward",
        {
          filters: {
            users_permissions_user: user.id,
            claimed: true,
          },
          sort: { claimedAt: "desc" },
        },
      );

      // Format time helper (seconds to human readable)
      const formatTime = (seconds: number) => {
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
          totalPlayTime:
            playerStat.totalPlayTime || totalPlayTimeFromGames || 0,
          totalPlayTimeFormatted: formatTime(
            playerStat.totalPlayTime || totalPlayTimeFromGames || 0,
          ),
          totalSessionTime,
          totalSessionTimeFormatted: formatTime(totalSessionTime),
          averageSessionTime:
            playerStat.averageSessionTime || averageSessionTime,
          averageSessionTimeFormatted: formatTime(
            playerStat.averageSessionTime || averageSessionTime,
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

    async exchangeCoinsToTickets(ctx) {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
      }

      const body = ctx.request.body?.data || {};
      const ticketsRequested = Number(body.ticketsRequested);

      if (!Number.isInteger(ticketsRequested) || ticketsRequested <= 0) {
        return ctx.badRequest("Invalid request", { reason: "invalid_request" });
      }

      // 1. Get Settings (Standard read, rarely changes)
      const settingsRes = await strapi.entityService.findMany(
        "api::setting.setting",
        {
          sort: { updatedAt: "desc" },
          publicationState: "live",
          locale: "all",
          limit: 1,
        },
      );
      const settings = (
        Array.isArray(settingsRes) ? settingsRes[0] : settingsRes
      ) as any | undefined;

      let rateSource = 1000;
      let limitDisabled = false;
      let limitCount: number = 10;
      let periodLabel: string = "monthly";

      if (settings) {
        rateSource = Number(settings.coinsPerTicket) || rateSource;
        limitDisabled = settings.exchangeLimitEnabled === false;
        if (!limitDisabled) {
          limitCount = Number(settings.exchangeLimitTickets) || 10;
          const period = String(
            settings.exchangeLimitPeriod || "monthly",
          ).toLowerCase();
          periodLabel =
            period === "daily"
              ? "daily"
              : period === "yearly"
                ? "yearly"
                : "monthly";
        }
      } else {
        return ctx.badRequest("Settings not configured", {
          reason: "settings_not_configured",
        });
      }

      // Calculate period dates
      const now = new Date();
      const nowMadrid = utcToZonedTime(now, TIMEZONE);
      let periodStartMadrid: Date;
      let nextResetMadrid: Date;

      if (periodLabel === "daily") {
        periodStartMadrid = startOfDay(nowMadrid);
        nextResetMadrid = startOfDay(addDays(nowMadrid, 1));
      } else if (periodLabel === "yearly") {
        periodStartMadrid = startOfYear(nowMadrid);
        nextResetMadrid = startOfYear(addYears(nowMadrid, 1));
      } else {
        periodStartMadrid = startOfMonth(nowMadrid);
        nextResetMadrid = startOfMonth(addMonths(nowMadrid, 1));
      }

      const periodStart = zonedTimeToUtc(periodStartMadrid, TIMEZONE);
      const nextResetDate = zonedTimeToUtc(
        nextResetMadrid,
        TIMEZONE,
      ).toISOString();

      try {
        // === START TRANSACTION ===
        const transactionResult = await strapi.db.transaction(
          async ({ trx }) => {
            // 2. Lock Player Stats (Critical: Serializes user requests)
            const initialPs = await strapi.db
              .query("api::player-stat.player-stat")
              .findOne({
                where: { users_permissions_user: user.id },
                select: ["id"],
              });

            if (!initialPs) {
              // Create if not exists (atomically safe if unique constraint exists, likely does)
              // But for locking, we need it to exist.
              // If it doesn't exist, user has 0 coins anyway.
              throw new Error("INSUFFICIENT_COINS");
            }

            const psMetadata = strapi.db.metadata.get(
              "api::player-stat.player-stat",
            );
            const psTableName = psMetadata.tableName;

            // PESSIMISTIC LOCK: FOR UPDATE
            const lockedStatsArray = await trx(psTableName)
              .where("id", initialPs.id)
              .forUpdate()
              .select("*");

            const lockedStats = lockedStatsArray[0];
            const currentCoins = Number(lockedStats.coins || 0);
            const currentTickets = Number(lockedStats.tickets || 0);

            // 3. Check Limits (inside Validated Transaction state)
            let ticketsUsed = 0;
            if (!limitDisabled) {
              const thMetadata = strapi.db.metadata.get(
                "api::user-transaction-history.user-transaction-history",
              );
              // Use standard count inside transaction
              // Fetch history & Filter in memory to ensure Date precision matches JS runtime
              // @ts-ignore
              const periodTx = await (
                strapi.db.query(
                  "api::user-transaction-history.user-transaction-history",
                ) as any
              ).findMany(
                {
                  where: {
                    users_permissions_user: user.id,
                    transactionType: "coins_to_tickets",
                  },
                  select: ["amountDelivered", "executedAt"],
                },
                { transacting: trx },
              );

              ticketsUsed = (periodTx || [])
                .filter((tx: any) => {
                  const txDate = new Date(tx.executedAt);
                  return txDate >= periodStart;
                })
                .reduce(
                  (acc: number, it: any) => acc + (it.amountDelivered || 0),
                  0,
                );

              const ticketsRemaining = Math.max(0, limitCount - ticketsUsed);

              if (
                ticketsRemaining <= 0 ||
                ticketsRequested > ticketsRemaining
              ) {
                throw new Error("EXCHANGE_LIMIT_REACHED");
              }
            }

            // 4. Check Coins
            const coinsNeeded = ticketsRequested * rateSource;

            if (currentCoins < coinsNeeded) {
              throw new Error("INSUFFICIENT_COINS");
            }

            // 5. Update Player Stats (use trx)
            // @ts-ignore
            await (
              strapi.db.query("api::player-stat.player-stat") as any
            ).update(
              {
                where: { id: initialPs.id },
                data: {
                  coins: currentCoins - coinsNeeded,
                  tickets: currentTickets + ticketsRequested,
                  coinsSpent:
                    (Number(lockedStats.coins_spent) || 0) + coinsNeeded,
                  ticketsEarned:
                    (Number(lockedStats.tickets_earned) ||
                      Number(lockedStats.ticketsEarned) ||
                      0) + ticketsRequested,
                },
              },
              { transacting: trx },
            );

            // 6. Create Transaction History (use trx)
            // @ts-ignore
            await (
              strapi.db.query(
                "api::user-transaction-history.user-transaction-history",
              ) as any
            ).create(
              {
                data: {
                  users_permissions_user: user.id,
                  transactionType: "coins_to_tickets",
                  currency: "coins",
                  statusTransaction: "completed",
                  coinsExchanged: coinsNeeded,
                  amountDelivered: ticketsRequested,
                  executedAt: new Date(),
                },
              },
              { transacting: trx },
            );

            // Return necessary data to construct response outside
            return {
              success: true,
              ticketsUsed: ticketsUsed + ticketsRequested,
              coinsSpent: coinsNeeded,
              updatedCoins: currentCoins - coinsNeeded,
              updatedTickets: currentTickets + ticketsRequested,
            };
          },
        );

        // === TRANSACTION COMMITTED ===

        // 7. Calculate Aggregations for UI (Read-only, non-critical consistency)
        // re-calc now for aggregation windows using Madrid timezone
        const now2 = new Date();
        const startOfWeekMadrid = startOfWeek(nowMadrid, { weekStartsOn: 1 });
        const startOfMonthMadrid = startOfMonth(nowMadrid);
        const startOfYearMadrid = startOfYear(nowMadrid);

        const startOfWeekUtc = zonedTimeToUtc(startOfWeekMadrid, TIMEZONE);
        const startOfMonthUtc = zonedTimeToUtc(startOfMonthMadrid, TIMEZONE);
        const startOfYearUtc = zonedTimeToUtc(startOfYearMadrid, TIMEZONE);

        // This queries can be slow, doing them outside trx is better for concurrency
        const history = await strapi.entityService.findMany(
          "api::user-transaction-history.user-transaction-history",
          {
            filters: {
              users_permissions_user: user.id,
              transactionType: "coins_to_tickets",
            },
            sort: { executedAt: "desc" },
            limit: 10,
          },
        );

        // We can optimize these sums using DB aggregation if Strapi supports it,
        // but sticking to existing logic for now.
        const allTx = await strapi.entityService.findMany(
          "api::user-transaction-history.user-transaction-history",
          {
            filters: {
              users_permissions_user: user.id,
              transactionType: "coins_to_tickets",
            },
            fields: ["coinsExchanged", "amountDelivered", "executedAt"],
          },
        );

        // Helper aggregation
        const calcSum = (items: any[]) =>
          items.reduce(
            (acc, it) => ({
              coinsExchanged: acc.coinsExchanged + (it.coinsExchanged || 0),
              amountDelivered: acc.amountDelivered + (it.amountDelivered || 0),
            }),
            { coinsExchanged: 0, amountDelivered: 0 },
          );

        const weekSum = calcSum(
          allTx.filter((t: any) => new Date(t.executedAt) >= startOfWeekUtc),
        );
        const monthSum = calcSum(
          allTx.filter((t: any) => new Date(t.executedAt) >= startOfMonthUtc),
        );
        const yearSum = calcSum(
          allTx.filter((t: any) => new Date(t.executedAt) >= startOfYearUtc),
        );
        const totalSum = calcSum(allTx);

        return {
          ticketsExchanged: ticketsRequested,
          coinsSpent: transactionResult.coinsSpent,
          playerStats: {
            coins: transactionResult.updatedCoins,
            tickets: transactionResult.updatedTickets,
          },
          limit: limitDisabled
            ? { unlimited: true }
            : {
                limitTickets: limitCount,
                period: periodLabel,
                ticketsUsed: transactionResult.ticketsUsed,
                ticketsRemaining: Math.max(
                  0,
                  limitCount - transactionResult.ticketsUsed,
                ),
                nextResetDate,
              },
          stats: {
            week: {
              ticketsExchanged: weekSum.amountDelivered,
              coinsSpent: weekSum.coinsExchanged,
            },
            month: {
              ticketsExchanged: monthSum.amountDelivered,
              coinsSpent: monthSum.coinsExchanged,
            },
            year: {
              ticketsExchanged: yearSum.amountDelivered,
              coinsSpent: yearSum.coinsExchanged,
            },
            total: {
              ticketsExchanged: totalSum.amountDelivered,
              coinsSpent: totalSum.coinsExchanged,
            },
          },
          history: (history || []).map((h: any) => ({
            executedAt: h.executedAt,
            coinsExchanged: h.coinsExchanged,
            amountDelivered: h.amountDelivered,
            statusTransaction: h.statusTransaction,
          })),
        };
      } catch (error: any) {
        if (error.message === "INSUFFICIENT_COINS") {
          const ps = await strapi.db
            .query("api::player-stat.player-stat")
            .findOne({ where: { users_permissions_user: user.id } });

          const maxTicketsPossible = Math.floor((ps?.coins || 0) / rateSource);
          return ctx.badRequest("Insufficient coins", {
            reason: "insufficient_coins",
            maxTicketsPossible,
          });
        }
        if (error.message === "EXCHANGE_LIMIT_REACHED") {
          // Re-calculate details for error response (outside trx)
          // ... simplistic version for error response ...
          return ctx.badRequest("Exchange limit reached", {
            reason: "exchange_limit_reached",
            limitTickets: limitCount,
            period: periodLabel,
            // ticketsUsed: ??? (hard to get exactly without re-query, but user knows)
            nextResetDate,
          });
        }

        strapi.log.error(error);
        return ctx.badRequest("Exchange failed", {
          reason: "transaction_failed",
        });
      }
    },

    async exchangeCoinsToTicketsStatus(ctx) {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
      }
      const settingsRes = await strapi.entityService.findMany(
        "api::setting.setting",
        {
          sort: { updatedAt: "desc" },
          publicationState: "live",
          locale: "all",
          limit: 1,
        },
      );
      const settings = (
        Array.isArray(settingsRes) ? settingsRes[0] : settingsRes
      ) as any | undefined;
      let rateSource = 1000;
      let limitDisabled = false;
      let limitCount: number | null = null;
      let periodLabel: string = "monthly";
      if (settings) {
        rateSource = Number(settings.coinsPerTicket) || rateSource;
        limitDisabled = settings.exchangeLimitEnabled === false;
        if (!limitDisabled) {
          limitCount = Number(settings.exchangeLimitTickets) || 10;
          const period = String(
            settings.exchangeLimitPeriod || "monthly",
          ).toLowerCase();
          periodLabel =
            period === "daily"
              ? "daily"
              : period === "yearly"
                ? "yearly"
                : "monthly";
        }
      } else {
        return ctx.badRequest("Settings not configured", {
          reason: "settings_not_configured",
        });
      }
      const ps = await strapi.db
        .query("api::player-stat.player-stat")
        .findOne({ where: { users_permissions_user: user.id } });
      const rate = rateSource;
      const coins = ps?.coins || 0;
      const tickets = ps?.tickets || 0;
      const maxByCoins = Math.floor(coins / rate);
      let ticketsUsed = 0;
      let ticketsRemaining = Infinity;
      let nextResetDate: string | null = null;
      if (!limitDisabled) {
        const now = new Date();
        const nowMadrid = utcToZonedTime(now, TIMEZONE);
        let periodStartMadrid: Date;
        let nextResetMadrid: Date;

        if (periodLabel === "daily") {
          periodStartMadrid = startOfDay(nowMadrid);
          nextResetMadrid = startOfDay(addDays(nowMadrid, 1));
        } else if (periodLabel === "yearly") {
          periodStartMadrid = startOfYear(nowMadrid);
          nextResetMadrid = startOfYear(addYears(nowMadrid, 1));
        } else {
          periodStartMadrid = startOfMonth(nowMadrid);
          nextResetMadrid = startOfMonth(addMonths(nowMadrid, 1));
        }

        const periodStart = zonedTimeToUtc(periodStartMadrid, TIMEZONE);
        nextResetDate = zonedTimeToUtc(nextResetMadrid, TIMEZONE).toISOString();

        const periodTx = await strapi.entityService.findMany(
          "api::user-transaction-history.user-transaction-history",
          {
            filters: {
              users_permissions_user: user.id,
              transactionType: "coins_to_tickets",
              executedAt: { $gte: periodStart },
            },
          },
        );
        ticketsUsed = (periodTx || []).reduce(
          (acc: number, it: any) => acc + (it.amountDelivered || 0),
          0,
        );
        ticketsRemaining = Math.max(0, (limitCount as number) - ticketsUsed);
      }
      const canExchange = limitDisabled
        ? maxByCoins > 0
        : Math.min(maxByCoins, ticketsRemaining as number) > 0;
      const maxTicketsPossible = limitDisabled
        ? maxByCoins
        : Math.min(maxByCoins, ticketsRemaining as number);
      const history = await strapi.entityService.findMany(
        "api::user-transaction-history.user-transaction-history",
        {
          filters: {
            users_permissions_user: user.id,
            transactionType: "coins_to_tickets",
          },
          sort: { executedAt: "desc" },
          limit: 10,
        },
      );
      return {
        status: { canExchange, maxTicketsPossible },
        rate,
        playerStats: { coins, tickets },
        limit: limitDisabled
          ? { unlimited: true }
          : {
              limitTickets: limitCount as number,
              period: periodLabel,
              ticketsUsed,
              ticketsRemaining: ticketsRemaining as number,
              nextResetDate,
            },
        history: (history || []).map((h: any) => ({
          executedAt: h.executedAt,
          coinsExchanged: h.coinsExchanged,
          amountDelivered: h.amountDelivered,
          statusTransaction: h.statusTransaction,
        })),
      };
    },
  }),
);
