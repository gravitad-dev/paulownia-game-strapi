export default ({ env }: { env: (key: string, def?: any) => any }) => {
  const dayStr = String(env("CRON_RESET_DAY", "1")).toLowerCase();
  const hourStr = String(env("CRON_RESET_HOUR", "0"));

  const resetTask = async ({ strapi }: { strapi: any }) => {
    const startedAt = new Date().toISOString();
    console.log("Running monthly daily reward reset...");
    try {
      const beforeCount = await strapi.entityService.count(
        "api::user-daily-reward.user-daily-reward",
        { filters: {} },
      );
      const delRes = await strapi.db
        .query("api::user-daily-reward.user-daily-reward")
        .deleteMany({ where: {} });
      const afterCount = await strapi.entityService.count(
        "api::user-daily-reward.user-daily-reward",
        { filters: {} },
      );
      const deleted =
        typeof delRes?.count === "number"
          ? delRes.count
          : beforeCount - afterCount;
      const finishedAt = new Date().toISOString();
      const stats = {
        mode: dayStr,
        expr: null,
        beforeCount,
        deleted,
        afterCount,
        startedAt,
        finishedAt,
      };
      console.log("Monthly daily reward reset completed.", stats);
    } catch (error) {
      console.error("Error in monthly daily reward reset:", error);
    }
  };

  const generateRanking = async ({ strapi }: { strapi: any }) => {
    console.log("Running ranking generation...");
    try {
      const players = await strapi.entityService.findMany(
        "api::player-stat.player-stat",
        {
          sort: { highestScore: "desc" },
          limit: 100,
          populate: {
            users_permissions_user: {
              populate: {
                avatar: true,
              },
            },
          },
        },
      );

      const topPlayers = players.map((p: any, index: number) => {
        const user = p.users_permissions_user;

        // Normalizar números
        const highestScore = Number(p.highestScore || 0);
        const xp = Number(p.xp || 0);
        const coins = Number(p.coins || 0);
        const tickets = Number(p.tickets || 0);
        const gamesPlayed = Number(p.gamesPlayed || 0);
        const gamesWon = Number(p.gamesWon || p.victories || 0);

        // Normalizar winRate: preferir p.winRate si está definido.
        // p.winRate puede venir en formato ratio (0-1) o porcentaje (0-100).
        // Aquí lo convertimos a ratio 0-1 para consistencia en `winRate`.
        let winRateRatio = 0;
        if (p.winRate !== null && p.winRate !== undefined) {
          const wr = Number(p.winRate);
          // Si está en formato porcentaje (>1), convertir a ratio
          winRateRatio = wr > 1 ? wr / 100 : wr;
        } else if (gamesPlayed > 0) {
          winRateRatio = gamesWon / gamesPlayed;
        }

        const winRatePercent = winRateRatio * 100;
        const winRateFormatted = `${winRatePercent.toFixed(2)}%`;

        return {
          rank: index + 1,
          username: user?.username || null,
          user: user
            ? {
                id: user.id,
                username: user.username,
                country: user.country || null,
              }
            : null,
          score: highestScore,
          xp,
          victories: gamesWon,
          gamesWon,
          gamesPlayed,
          winRate: Number(winRateRatio), // 0-1
          winRatePercent: Number(Number(winRatePercent).toFixed(2)), // 0-100 (two decimals)
          winRateFormatted,
          coins,
          tickets,
          country: user?.country || null,
          avatar: user?.avatar?.url || null,
        };
      });

      // Calcular estadísticas globales
      const totalPlayers = players.length;
      const averageScore =
        players.reduce(
          (acc: number, p: any) => acc + (p.highestScore || 0),
          0,
        ) / (totalPlayers || 1);

      const mostWinsPlayer = [...players].sort(
        (a: any, b: any) => (b.gamesWon || 0) - (a.gamesWon || 0),
      )[0];
      const mostGamesPlayer = [...players].sort(
        (a: any, b: any) => (b.gamesPlayed || 0) - (a.gamesPlayed || 0),
      )[0];

      // Calcular winRate en tiempo real si es null o undefined
      const playersWithWinRate = players.map((p: any) => {
        const gamesPlayed = Number(p.gamesPlayed || 0);
        const gamesWon = Number(p.gamesWon || p.victories || 0);
        let wr = 0;
        if (p.winRate !== null && p.winRate !== undefined) {
          const raw = Number(p.winRate);
          wr = raw > 1 ? raw / 100 : raw; // normalize to ratio
        } else if (gamesPlayed > 0) {
          wr = gamesWon / gamesPlayed;
        }
        return {
          ...p,
          calculatedWinRateRatio: wr, // 0-1
          calculatedWinRatePercent: Number((wr * 100).toFixed(2)), // 0-100
        };
      });

      const highestWinRatePlayer = [...playersWithWinRate].sort(
        (a: any, b: any) =>
          (b.calculatedWinRatePercent || 0) - (a.calculatedWinRatePercent || 0),
      )[0];

      // Calcular fechas de inicio para semana y mes
      const { utcToZonedTime, zonedTimeToUtc } = await import("date-fns-tz");
      const { startOfWeek, startOfMonth, addDays } = await import("date-fns");
      const tz = "Europe/Madrid";
      const now = new Date();
      const zonedNow = utcToZonedTime(now, tz);
      const startWeekZoned = startOfWeek(zonedNow, { weekStartsOn: 1 });
      const startMonthZoned = startOfMonth(zonedNow);
      const startOfWeekUtc = zonedTimeToUtc(startWeekZoned, tz);
      const startOfMonthUtc = zonedTimeToUtc(startMonthZoned, tz);

      // Helper para obtener top 10 de un periodo
      const getTop10ByPeriod = async (startDate: Date) => {
        const histories = await strapi.entityService.findMany(
          "api::user-game-history.user-game-history",
          {
            filters: {
              completedAt: { $gte: startDate },
            },
            populate: { users_permissions_user: true },
            sort: { score: "desc" },
            limit: 1000, // Traemos suficientes para filtrar por usuario único
          },
        );

        const uniqueUsers = new Map();
        histories.forEach((h: any) => {
          const userId = h.users_permissions_user?.id;
          if (userId && !uniqueUsers.has(userId)) {
            uniqueUsers.set(userId, {
              username: h.users_permissions_user.username,
              score: h.score,
              date: h.completedAt,
            });
          }
        });

        return Array.from(uniqueUsers.values())
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, 10);
      };

      const top10Week = await getTop10ByPeriod(startOfWeekUtc);
      const top10Month = await getTop10ByPeriod(startOfMonthUtc);

      const stats = {
        totalPlayers,
        averageScore: Math.round(averageScore),
        mostWins: mostWinsPlayer
          ? {
              username: mostWinsPlayer.users_permissions_user?.username,
              count: mostWinsPlayer.gamesWon,
            }
          : null,
        mostGamesPlayed: mostGamesPlayer
          ? {
              username: mostGamesPlayer.users_permissions_user?.username,
              count: mostGamesPlayer.gamesPlayed,
            }
          : null,
        highestWinRate: highestWinRatePlayer
          ? {
              username: highestWinRatePlayer.users_permissions_user?.username,
              // rate en porcentaje con 2 decimales (ej. 34.15)
              rate: highestWinRatePlayer.calculatedWinRatePercent,
            }
          : null,
        top10Week,
        top10Month,
        generatedAt: new Date(),
      };

      await strapi.entityService.create("api::ranking.ranking", {
        data: {
          timestamp: new Date(),
          topPlayers,
          stats,
        },
      });

      // Política de Retención: Mantener historial de 1 año (365 días)
      // Eliminamos registros antiguos para evitar crecimiento infinito de la DB
      const retentionZoned = addDays(zonedNow, -365);
      const retentionDate = zonedTimeToUtc(retentionZoned, tz);

      const deleted = await strapi.db.query("api::ranking.ranking").deleteMany({
        where: {
          timestamp: {
            $lt: retentionDate,
          },
        },
      });

      if (deleted.count > 0) {
        console.log(
          `Ranking cleanup: Deleted ${deleted.count} records older than 1 year.`,
        );
      }

      console.log("Ranking generation completed.");
    } catch (error) {
      console.error("Error in ranking generation:", error);
    }
  };

  const tasks: Record<string, any> = {};

  if (dayStr === "test") {
    tasks["* * * * *"] = resetTask;
    return tasks;
  }

  if (dayStr === "off" || dayStr === "disabled" || dayStr === "false") {
    return tasks;
  }

  const day = parseInt(dayStr, 10);
  const hour = parseInt(hourStr, 10);
  const validDay = Number.isFinite(day) && day >= 1 && day <= 31 ? day : 1;
  const validHourMadrid =
    Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 0;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    timeZoneName: "short",
  }).formatToParts(new Date());
  const tzPart = parts.find((p) => p.type === "timeZoneName");
  const m = tzPart && tzPart.value.match(/GMT([+-]\d+)/);
  const offsetHours = m ? parseInt(m[1], 10) : 1;
  const utcHour = (((validHourMadrid - offsetHours) % 24) + 24) % 24;
  const expr = `0 ${utcHour} ${validDay} * *`;
  tasks[expr] = resetTask;

  const rankingConfig = env("CRON_RANKING_SCHEDULE", "6");
  let rankingExpr = "0 */6 * * *";

  if (rankingConfig === "test") {
    rankingExpr = "* * * * *"; // Every minute for testing
    console.log("Ranking Cron running in TEST mode (every minute)");
  } else if (
    !isNaN(parseInt(rankingConfig)) &&
    !rankingConfig.includes("*") &&
    !rankingConfig.includes(" ")
  ) {
    rankingExpr = `0 */${rankingConfig} * * *`; // Every X hours
    console.log(`Ranking Cron running every ${rankingConfig} hours`);
  } else {
    rankingExpr = rankingConfig; // Custom cron expression
    console.log(`Ranking Cron running with custom schedule: ${rankingExpr}`);
  }

  tasks[rankingExpr] = generateRanking;

  return tasks;
};
