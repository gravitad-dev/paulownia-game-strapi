import fs from "fs";
import path from "path";

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
          filters: {
            users_permissions_user: {
              role: {
                type: { $ne: "admin" },
              },
            },
          },
          sort: { highestScore: "desc" },
          limit: 100,
          populate: {
            users_permissions_user: {
              populate: {
                avatar: true,
                role: true,
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

  const cleanupOrphanedUploads = async ({ strapi }: { strapi: any }) => {
    console.log("🔍 Running orphaned uploads check...");
    try {
      // 1. Get all files from database
      // Usamos query engine directamente para eficiencia
      const dbFiles = await strapi.db.query("plugin::upload.file").findMany({
        select: ["hash", "ext", "formats"],
      });

      const validFiles = new Set<string>();
      dbFiles.forEach((file: any) => {
        // Main file
        validFiles.add(`${file.hash}${file.ext}`);

        // Formats (thumbnail, small, medium, large, etc.)
        if (file.formats) {
          // formats es un objeto JSON
          Object.values(file.formats).forEach((format: any) => {
            if (format && format.hash && format.ext) {
              validFiles.add(`${format.hash}${format.ext}`);
            }
          });
        }
      });

      console.log(
        `✅ Found ${dbFiles.length} file records in DB (expecting approx ${validFiles.size} physical files).`,
      );

      // 2. Get all files from disk
      // Aseguramos la ruta correcta a public/uploads
      const uploadDir = path.join(process.cwd(), "public/uploads");

      if (!fs.existsSync(uploadDir)) {
        console.warn("⚠️ Uploads directory not found at:", uploadDir);
        return;
      }

      const diskFiles = fs.readdirSync(uploadDir).filter((file) => {
        // Ignore system files
        return (
          file !== ".gitkeep" &&
          file !== ".DS_Store" &&
          fs.statSync(path.join(uploadDir, file)).isFile()
        );
      });

      console.log(`📂 Found ${diskFiles.length} files on disk.`);

      // 3. Compare
      const orphans: string[] = [];
      let totalSize = 0;

      diskFiles.forEach((file) => {
        if (!validFiles.has(file)) {
          orphans.push(file);
          try {
            const stats = fs.statSync(path.join(uploadDir, file));
            totalSize += stats.size;
          } catch (e) {
            // Ignore error if file disappears or perm issue
          }
        }
      });

      // 4. Report
      if (orphans.length > 0) {
        const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
        console.log(
          `\n⚠️ Found ${orphans.length} orphaned files (Total wasted space: ${sizeInMB} MB):`,
        );

        // List first 20
        orphans.slice(0, 20).forEach((file) => console.log(` - ${file}`));
        if (orphans.length > 20) {
          console.log(` ... and ${orphans.length - 20} more.`);
        }

        // Log to a specific file if needed, or just stdout

        // Controlled deletion via env flag
        const shouldDelete =
          String(env("CLEANUP_DELETE", "true")).toLowerCase() === "true";
        if (shouldDelete) {
          console.log("🗑️ Deleting orphaned files...");
          for (const file of orphans) {
            try {
              fs.unlinkSync(path.join(uploadDir, file));
              console.log(`Deleted: ${file}`);
            } catch (delErr) {
              console.error(`Failed to delete ${file}:`, delErr);
            }
          }
          console.log("✅ Cleanup complete.");
        } else {
          console.log(
            "🔎 Dry-run mode: set CLEANUP_DELETE=true to enable deletion.",
          );
        }
      } else {
        console.log("\n✨ No orphaned files found. Everything is clean!");
      }
    } catch (error) {
      console.error("❌ Error checking orphaned uploads:", error);
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

  const cleanupOldNotifications = async ({ strapi }: { strapi: any }) => {
    console.log("🧹 Running old notifications cleanup...");
    try {
      const daysToKeep = 365; // Retention period: 1 year
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() - daysToKeep);

      const deleted = await strapi.db
        .query("api::notification.notification")
        .deleteMany({
          where: {
            createdAt: {
              $lt: expirationDate.toISOString(),
            },
          },
        });

      if (deleted.count > 0) {
        console.log(
          `✅ Deleted ${deleted.count} notifications older than ${daysToKeep} days.`,
        );
      } else {
        console.log("✨ No old notifications to clean up.");
      }
    } catch (error) {
      console.error("❌ Error cleaning up old notifications:", error);
    }
  };

  const cleanupOldSessions = async ({ strapi }: { strapi: any }) => {
    console.log("🧹 Running old user sessions cleanup...");
    try {
      const daysToKeep = 90;
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() - daysToKeep);

      const deleted = await strapi.db
        .query("api::user-session.user-session")
        .deleteMany({
          where: {
            startedAt: {
              $lt: expirationDate.toISOString(),
            },
          },
        });

      if (deleted.count > 0) {
        console.log(
          `✅ Deleted ${deleted.count} user sessions older than ${daysToKeep} days.`,
        );
      } else {
        console.log("✨ No old user sessions to clean up.");
      }
    } catch (error) {
      console.error("❌ Error cleaning up old user sessions:", error);
    }
  };

  // Tarea de limpieza de notificaciones antiguas (Run weekly, Sunday at 3:30 AM)
  const notificationsCleanupConfig = env(
    "CRON_NOTIFICATIONS_CLEANUP_SCHEDULE",
    "30 3 * * 0",
  );
  console.log(
    `Notifications Cleanup Cron configured with schedule: ${notificationsCleanupConfig}`,
  );
  tasks[notificationsCleanupConfig] = cleanupOldNotifications;

  // Tarea de limpieza de sesiones antiguas (Run daily at 5:00 AM)
  const sessionsCleanupConfig = env(
    "CRON_SESSIONS_CLEANUP_SCHEDULE",
    "0 5 * * *",
  );
  console.log(
    `User Sessions Cleanup Cron configured with schedule: ${sessionsCleanupConfig}`,
  );
  tasks[sessionsCleanupConfig] = cleanupOldSessions;

  // Tarea de limpieza de imágenes huérfanas
  const cleanupConfig = env("CRON_CLEANUP_SCHEDULE", "0 4 * * 0"); // Default: weekly, Sunday 4 AM
  console.log(`Cleanup Cron configured with schedule: ${cleanupConfig}`);
  tasks[cleanupConfig] = cleanupOrphanedUploads;

  return tasks;
};
