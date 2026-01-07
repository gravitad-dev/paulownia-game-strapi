import { createStrapi } from "@strapi/strapi";

function generateCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const segments = 6;
  const segmentLength = 4;

  let code = [];
  for (let i = 0; i < segments; i++) {
    let segment = "";
    for (let j = 0; j < segmentLength; j++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code.push(segment);
  }

  return code.join("-");
}

// Configuración de cantidad de registros
const COUNTS = {
  USERS: 5,
  LEVELS: 5,
  ACHIEVEMENTS: 5,
  DAILY_REWARDS: 7,
  REWARDS: 5,
  USER_GAME_HISTORY: 5,
  USER_TRANSACTION_HISTORY: 5,
};

async function cleanDatabase(strapi: any) {
  console.log("🧹 Limpiando base de datos...");

  // Obtener el usuario gravitad para preservarlo
  const gravitadUser = await strapi.db
    .query("plugin::users-permissions.user")
    .findOne({
      where: { email: "synergiart.websupp@gmail.com" },
    });

  const types = [
    "api::reward-claim.reward-claim",
    "api::user-transaction-history.user-transaction-history",
    "api::user-game-history.user-game-history",
    "api::user-achievement.user-achievement",
    "api::user-daily-reward.user-daily-reward",
    "api::user-reward.user-reward",
    "api::roulette-history.roulette-history",
    "api::log-history.log-history",
    "api::player-stat.player-stat",
    "api::reward.reward",
    "api::daily-reward.daily-reward",
    "api::achievement.achievement",
    "api::level.level",
    "api::guardiand.guardiand",
    "api::premium-code.premium-code",
  ];

  for (const uid of types) {
    try {
      await strapi.db.query(uid).deleteMany({ where: {} });
      console.log(`🗑️ Eliminados registros de ${uid}`);
    } catch (e) {
      console.error(`Error limpiando ${uid}`, e);
    }
  }

  // Eliminar usuarios excepto gravitad
  if (gravitadUser) {
    await strapi.db.query("plugin::users-permissions.user").deleteMany({
      where: {
        id: { $ne: gravitadUser.id },
      },
    });
    console.log(`🗑️ Eliminados usuarios (preservando gravitad)`);
  } else {
    console.log("⚠️ Usuario gravitad no encontrado, no se eliminaron usuarios");
  }

  console.log("✅ Limpieza completada");
}

async function seedDatabase(strapi: any) {
  console.log("🚀 Iniciando seeder...");

  // 1. Obtener Rol Player
  console.log("🔍 Buscando rol 'Player'...");
  let playerRole = await strapi.db
    .query("plugin::users-permissions.role")
    .findOne({
      where: { type: "player" },
    });

  if (!playerRole) {
    playerRole = await strapi.db
      .query("plugin::users-permissions.role")
      .findOne({
        where: { name: "Player" },
      });
  }

  if (!playerRole) {
    playerRole = await strapi.db
      .query("plugin::users-permissions.role")
      .findOne({
        where: { type: "authenticated" },
      });
  }

  console.log(`✅ Usando rol: ${playerRole.name} (ID: ${playerRole.id})`);

  // 2. Crear Usuarios y PlayerStats
  console.log(`👤 Creando ${COUNTS.USERS} usuarios...`);

  // Perfiles de usuarios con edades variadas
  const userProfiles = [
    { age: 25, country: "US", isPremium: true }, // user1: Adulto
    { age: 16, country: "ES", isPremium: false }, // user2: Menor (16 años)
    { age: 30, country: "MX", isPremium: true }, // user3: Adulto
    { age: 15, country: "AR", isPremium: false }, // user4: Menor (15 años)
    { age: 22, country: "CO", isPremium: true }, // user5: Adulto
  ];

  const users = [];
  for (let i = 1; i <= COUNTS.USERS; i++) {
    const username = `user${i}`;
    const email = `user${i}@example.com`;
    const profile = userProfiles[i - 1] || {
      age: 25,
      country: "US",
      isPremium: false,
    };

    const existing = await strapi.db
      .query("plugin::users-permissions.user")
      .findOne({
        where: { email },
      });

    let user;
    if (!existing) {
      // Calcular fecha de nacimiento basada en la edad
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - profile.age);
      // Ajustar mes y día para asegurar que la edad sea exacta
      birthDate.setMonth(0); // Enero
      birthDate.setDate(1); // Día 1

      user = await strapi.entityService.create(
        "plugin::users-permissions.user",
        {
          data: {
            username,
            email,
            password: "Password1",
            confirmed: true,
            role: playerRole.id,
            provider: "local",
            country: profile.country,
            age: birthDate.toISOString().split("T")[0], // Formato YYYY-MM-DD para campo tipo date
            isPremium: profile.isPremium, // Add isPremium from profile
          },
        },
      );
      console.log(
        `✅ Usuario ${username} creado - ${profile.age} años (${profile.country})`,
      );
    } else {
      user = existing;
    }
    users.push(user);

    const existingStats = await strapi.db
      .query("api::player-stat.player-stat")
      .findOne({
        where: { users_permissions_user: user.id },
      });

    if (!existingStats) {
      const gamesPlayed = Math.floor(Math.random() * 50) + 1; // Al menos 1 partida
      const gamesWon = Math.floor(Math.random() * gamesPlayed); // Siempre <= gamesPlayed
      const gamesLost = gamesPlayed - gamesWon;

      // Dar más tickets a user1 para testing de ruleta
      const ticketsAmount = i === 1 ? 50 : Math.floor(Math.random() * 100);

      // Estadísticas de tiempo y rachas variadas por usuario
      const totalPlayTime = Math.floor(Math.random() * 36000) + 600; // 10 min a 10 horas en segundos
      const totalSessions = Math.floor(Math.random() * 20) + 1;
      const averageSessionTime = Math.round(totalPlayTime / totalSessions);

      // Rachas determinísticas para testing
      let currentStreak = 0;
      let longestStreak = 0;
      let lastStreakDate = null;
      let lastPlayedAt = null;
      let lastLoginAt = null;

      if (i === 1) {
        // user1: Racha activa de 3 días
        currentStreak = 3;
        longestStreak = 5;
        lastStreakDate = new Date().toISOString().split("T")[0]; // Hoy
        lastPlayedAt = new Date();
        lastLoginAt = new Date();
      } else if (i === 2) {
        // user2: Racha rota (jugó hace 3 días)
        currentStreak = 0;
        longestStreak = 7;
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        lastStreakDate = threeDaysAgo.toISOString().split("T")[0];
        lastPlayedAt = threeDaysAgo;
        lastLoginAt = threeDaysAgo;
      } else if (i === 3) {
        // user3: Nueva racha de 1 día
        currentStreak = 1;
        longestStreak = 1;
        lastStreakDate = new Date().toISOString().split("T")[0];
        lastPlayedAt = new Date();
        lastLoginAt = new Date();
      } else if (i === 4) {
        // user4: Racha larga activa
        currentStreak = 12;
        longestStreak = 12;
        lastStreakDate = new Date().toISOString().split("T")[0];
        lastPlayedAt = new Date();
        lastLoginAt = new Date();
      } else {
        // user5: Sin actividad reciente
        currentStreak = 0;
        longestStreak = 3;
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        lastStreakDate = weekAgo.toISOString().split("T")[0];
        lastPlayedAt = weekAgo;
        lastLoginAt = weekAgo;
      }

      await strapi.entityService.create("api::player-stat.player-stat", {
        data: {
          users_permissions_user: user.documentId,
          score: Math.floor(Math.random() * 10000),
          highestScore: Math.floor(Math.random() * 10000),
          coins: Math.floor(Math.random() * 5000),
          tickets: ticketsAmount,
          xp: Math.floor(Math.random() * 500),
          gamesPlayed,
          gamesWon,
          gamesLost,
          // Nuevos campos de tiempo y racha
          totalPlayTime,
          totalSessions,
          averageSessionTime,
          currentStreak,
          longestStreak,
          lastStreakDate,
          lastPlayedAt,
          lastLoginAt,
          publishedAt: new Date(),
        },
      });
      console.log(
        `✅ Usuario ${username}: ${ticketsAmount} tickets, racha: ${currentStreak}/${longestStreak} días, tiempo: ${Math.round(totalPlayTime / 60)}min`,
      );
    }
  }

  // 3. Crear Single Types
  console.log("⚙️ Configurando Single Types...");

  const globalData = await strapi.entityService.findMany("api::global.global");
  if (!globalData) {
    await strapi.entityService.create("api::global.global", {
      data: {
        siteName: "Paulownia Game",
        siteDescription: "Un juego increíble de puzzles y recompensas.",
        publishedAt: new Date(),
      },
    });
  }

  const currency = await strapi.entityService.findMany(
    "api::currency-info.currency-info",
  );
  if (!currency) {
    await strapi.entityService.create("api::currency-info.currency-info", {
      data: {
        name: "Paulownia Coin",
        symbol: "PLC",
        exchangeRate: 1.0,
        maxAmount: 1000000,
        minAmount: 10,
        publishedAt: new Date(),
      },
    });
  }

  const setting = await strapi.entityService.findMany("api::setting.setting");
  if (!setting) {
    await strapi.entityService.create("api::setting.setting", {
      data: {
        rouletteIsActive: true,
        publishedAt: new Date(),
      },
    });
  }

  const token = await strapi.entityService.findMany(
    "api::token-info.token-info",
  );
  if (!token) {
    await strapi.entityService.create("api::token-info.token-info", {
      data: {
        name: "Kinetic Token",
        symbol: "KNRT",
        chainID: "137",
        exchangeRate: 0.5,
        maxAmount: 500000,
        minAmount: 1,
        publishedAt: new Date(),
      },
    });
  }

  // 4. Crear Levels
  console.log(`🎮 Creando ${COUNTS.LEVELS} niveles...`);
  const levels = [];
  const difficulties = ["easy", "easy2", "medium", "medium2", "hard", "hard2"];

  // Subir imagen de puzzle una vez
  const fs = require("fs");
  const path = require("path");
  const puzzleImagePath = path.join(
    __dirname,
    "..",
    "scriptsassets",
    "puzzleImage.png",
  );

  let puzzleImageId: number | null = null;
  if (fs.existsSync(puzzleImagePath)) {
    try {
      const fileStat = fs.statSync(puzzleImagePath);
      const uploadedFiles = await strapi.plugins.upload.services.upload.upload({
        data: {},
        files: {
          filepath: puzzleImagePath,
          originalFilename: "puzzleImage.png",
          mimetype: "image/png",
          size: fileStat.size,
        },
      });
      if (uploadedFiles && uploadedFiles.length > 0) {
        puzzleImageId = uploadedFiles[0].id;
        console.log(`📷 Imagen puzzleImage subida (ID: ${puzzleImageId})`);
      }
    } catch (uploadError) {
      console.log(`⚠️ Error subiendo imagen: ${uploadError}`);
    }
  } else {
    console.log(`⚠️ No se encontró imagen en ${puzzleImagePath}`);
  }

  for (let i = 1; i <= COUNTS.LEVELS; i++) {
    const levelData: any = {
      name: `Nivel ${i}`,
      description: `Descripción del nivel ${i}`,
      difficulty: difficulties[(i - 1) % difficulties.length],
      password: "123456",
      isActive: true,
      date: new Date().toISOString().split("T")[0],
      publishedAt: new Date(),
    };

    if (puzzleImageId) {
      levelData.puzzleImage = [puzzleImageId];
    }

    const level = await strapi.entityService.create("api::level.level", {
      data: levelData,
    });
    levels.push(level);
  }
  console.log(`✅ Creados ${levels.length} niveles con password '123456'`);

  // 4.1 Crear User Levels - Todos bloqueados para testing limpio
  console.log("🎮 Asignando niveles a usuarios (UserLevels)...");
  for (const user of users) {
    for (const level of levels) {
      await strapi.entityService.create("api::user-level.user-level", {
        data: {
          users_permissions_user: user.documentId,
          level: level.documentId,
          levelStatus: "blocked",
          wonDifficulties: [],
          lastPlayed: null,
          publishedAt: new Date(),
        },
      });
    }
  }
  console.log(
    `✅ UserLevels creados para ${users.length} usuarios (todos bloqueados)`,
  );

  // 5. Crear Achievements
  console.log(`🏆 Creando logros definidos...`);
  const achievementConfigs = [
    {
      title: "Primer Paso",
      description: "Gana tu primera partida",
      targetType: "gamesWon",
      goalAmount: 1,
      rewardType: "coins",
      rewardAmount: 100,
    },
    {
      title: "Jugador Asiduo",
      description: "Gana 5 partidas",
      targetType: "gamesWon",
      goalAmount: 5,
      rewardType: "tickets",
      rewardAmount: 2,
    },
    {
      title: "Veterano del Reino",
      description: "Gana 20 partidas",
      targetType: "gamesWon",
      goalAmount: 20,
      rewardType: "coins",
      rewardAmount: 1000,
    },
    {
      title: "Leyenda Victoriosa",
      description: "Gana 50 partidas",
      targetType: "gamesWon",
      goalAmount: 50,
      rewardType: "tickets",
      rewardAmount: 10,
    },
    {
      title: "Acumulador de Puntos",
      description: "Alcanza 5,000 puntos en total",
      targetType: "score",
      goalAmount: 5000,
      rewardType: "coins",
      rewardAmount: 500,
    },
    {
      title: "Maestro del Score",
      description: "Alcanza 25,000 puntos en total",
      targetType: "score",
      goalAmount: 25000,
      rewardType: "tickets",
      rewardAmount: 5,
    },
    {
      title: "Millonario de Puntos",
      description: "Alcanza 100,000 puntos en total",
      targetType: "score",
      goalAmount: 100000,
      rewardType: "coins",
      rewardAmount: 5000,
    },
    {
      title: "Dominio Aprendiz",
      description: "Gana 5 niveles en dificultad Aprendiz",
      targetType: "difficultyMastery",
      targetDifficulty: "aprendiz",
      goalAmount: 5,
      rewardType: "coins",
      rewardAmount: 1000,
    },
    {
      title: "Novato Experto",
      description: "Gana 5 niveles en dificultad Novato",
      targetType: "difficultyMastery",
      targetDifficulty: "novato",
      goalAmount: 5,
      rewardType: "coins",
      rewardAmount: 1200,
    },
    {
      title: "Aventurero Experto",
      description: "Gana 5 niveles en dificultad Aventurero",
      targetType: "difficultyMastery",
      targetDifficulty: "aventurero",
      goalAmount: 5,
      rewardType: "tickets",
      rewardAmount: 5,
    },
    {
      title: "Veterano Invicto",
      description: "Gana 5 niveles en dificultad Veterano",
      targetType: "difficultyMastery",
      targetDifficulty: "veterano",
      goalAmount: 5,
      rewardType: "tickets",
      rewardAmount: 8,
    },
    {
      title: "Maestría Total",
      description: "Gana 5 niveles en dificultad Maestro",
      targetType: "difficultyMastery",
      targetDifficulty: "maestro",
      goalAmount: 5,
      rewardType: "coins",
      rewardAmount: 2500,
    },
    {
      title: "Leyenda Suprema",
      description: "Gana 5 niveles en dificultad Leyenda",
      targetType: "difficultyMastery",
      targetDifficulty: "leyenda",
      goalAmount: 5,
      rewardType: "coins",
      rewardAmount: 5000,
    },
    {
      title: "Maestría Completa",
      description: "Gana todas las dificultades de un nivel",
      targetType: "levelFullMastery",
      goalAmount: 1,
      rewardType: "coins",
      rewardAmount: 2000,
    },
    {
      title: "Dedicación",
      description: "Juega durante 30 minutos (1800 seg)",
      targetType: "time",
      goalAmount: 1800,
      rewardType: "coins",
      rewardAmount: 300,
    },
  ];

  const achievements = [];
  for (const config of achievementConfigs) {
    const achievement = await strapi.entityService.create(
      "api::achievement.achievement",
      {
        data: {
          ...config,
          quantity: 0,
          isActive: true,
          visibleToUser: true,
          publishedAt: new Date(),
        },
      },
    );
    achievements.push(achievement);
  }
  console.log(`✅ Creados ${achievements.length} logros`);

  // 6. Crear Daily Rewards
  console.log(`📅 Creando ${COUNTS.DAILY_REWARDS} recompensas diarias...`);
  const dailyRewards = [];
  for (let i = 1; i <= COUNTS.DAILY_REWARDS; i++) {
    const existing = await strapi.entityService.findMany(
      "api::daily-reward.daily-reward",
      { filters: { day: i } },
    );

    if (existing && existing.length > 0) {
      dailyRewards.push(existing[0]);
      continue;
    }

    const dr = await strapi.entityService.create(
      "api::daily-reward.daily-reward",
      {
        data: {
          name: `Día ${i}`,
          day: i,
          rewardType: i % 2 === 0 ? "coins" : "tickets",
          rewardAmount: i * 50,
          isActive: true,
          publishedAt: new Date(),
        },
      },
    );
    dailyRewards.push(dr);
  }
  console.log(`✅ Creadas ${dailyRewards.length} recompensas diarias`);

  // 7. Crear Rewards (Ruleta) - Variados para testing
  console.log(`🎁 Creando premios de ruleta variados...`);
  const rewards = [];

  const rewardConfigs = [
    // Currency rewards (coins) - Más comunes
    {
      name: "100 Coins",
      description: "Una pequeña cantidad de monedas",
      typeReward: "currency",
      value: 100,
      probability: 40,
      quantity: 50,
      isUnique: false,
    },
    {
      name: "500 Coins",
      description: "Una cantidad moderada de monedas",
      typeReward: "currency",
      value: 500,
      probability: 25,
      quantity: 30,
      isUnique: false,
    },
    {
      name: "1000 Coins",
      description: "¡Muchas monedas!",
      typeReward: "currency",
      value: 1000,
      probability: 15,
      quantity: 20,
      isUnique: false,
    },

    // Currency rewards (tickets) - Menos comunes
    {
      name: "5 Tickets",
      description: "Algunos tickets para más giros",
      typeReward: "ticket",
      value: 5,
      probability: 10,
      quantity: 25,
      isUnique: false,
    },
    {
      name: "10 Tickets",
      description: "¡Muchos tickets!",
      typeReward: "ticket",
      value: 10,
      probability: 5,
      quantity: 15,
      isUnique: false,
    },

    // Consumable rewards - Raros
    {
      name: "Gift Card $10",
      description: "Tarjeta de regalo de $10 (reclamar con admin)",
      typeReward: "consumable",
      value: 10,
      probability: 3,
      quantity: 5,
      isUnique: false,
    },
    {
      name: "Gift Card $50",
      description: "Tarjeta de regalo de $50 (reclamar con admin)",
      typeReward: "consumable",
      value: 50,
      probability: 1,
      quantity: 2,
      isUnique: false,
    },

    // Cosmetic rewards - Muy raros (no implementado aún)
    {
      name: "Avatar Dorado",
      description: "Avatar especial dorado",
      typeReward: "cosmetic",
      value: 0,
      probability: 0.8,
      quantity: 3,
      isUnique: true,
    },
    {
      name: "Tema Oscuro Premium",
      description: "Tema oscuro exclusivo",
      typeReward: "cosmetic",
      value: 0,
      probability: 0.2,
      quantity: 1,
      isUnique: true,
    },
  ];

  for (const config of rewardConfigs) {
    const reward = await strapi.entityService.create("api::reward.reward", {
      data: {
        ...config,
        isActive: true,
        visibleToUser: true,
        publishedAt: new Date(),
      },
    });
    rewards.push(reward);
  }
  console.log(`✅ Creados ${rewards.length} premios de ruleta`);

  // 8. Crear Historiales y Relaciones
  console.log("🔗 Generando historial y relaciones...");
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    console.log(`  Procesando user${i + 1}...`);

    // User Game History
    if (levels.length > 0) {
      console.log(`    Creando ${COUNTS.USER_GAME_HISTORY} game histories...`);
      for (let j = 0; j < COUNTS.USER_GAME_HISTORY; j++) {
        await strapi.entityService.create(
          "api::user-game-history.user-game-history",
          {
            data: {
              users_permissions_user: user.documentId,
              level: levels[j % levels.length].documentId,
              score: Math.floor(Math.random() * 1000),
              completed: Math.random() > 0.5,
              coinsEarned: Math.floor(Math.random() * 100),
              duration: Math.floor(Math.random() * 300),
              completedAt: new Date(),
            },
          },
        );
      }
    }

    // User Transaction History
    console.log(
      `    Creando ${COUNTS.USER_TRANSACTION_HISTORY} transaction histories...`,
    );
    for (let j = 0; j < COUNTS.USER_TRANSACTION_HISTORY; j++) {
      await strapi.entityService.create(
        "api::user-transaction-history.user-transaction-history",
        {
          data: {
            users_permissions_user: user.documentId,
            amountDelivered: Math.floor(Math.random() * 100),
            coinsExchanged: Math.floor(Math.random() * 50),
            transactionType: "daily_reward",
            currency: "coins",
            statusTransaction: "completed",
            executedAt: new Date(),
          },
        },
      );
    }

    // User Achievements - Perfiles determinísticos para testing (user1-user5)
    for (let j = 0; j < achievements.length; j++) {
      const achievement = achievements[j];

      let completed = false;
      let claimed = false;
      let currentProgress = 0;
      let obtainedAt = null;
      let claimedAt = null;

      // Achievement Indices (based on config order):
      // 0: Primera Victoria (1 win)
      // 1: 5 Victorias (5 wins)
      // 2: Maestro del Score (1000 pts)
      // 3: Experiencia Acumulada (500 xp)
      // 4: Dedicación Total (3600 sec)

      if (i === 0) {
        // User 1: Newbie (Casi todo en 0 o poco progreso)
        // Ideal para ver estados "Locked" o "In Progress" iniciales
        if (j === 4) {
          // Time
          currentProgress = 100; // 100 seconds
        } else if (j === 2) {
          // Score
          currentProgress = 50; // 50 pts
        }
      } else if (i === 1) {
        if (j === 0) {
          completed = true;
          claimed = false;
          currentProgress = achievement.goalAmount;
          obtainedAt = new Date();
        } else if (j === 1) {
          completed = true;
          claimed = false;
          currentProgress = achievement.goalAmount;
          obtainedAt = new Date();
        } else if (j === 2) {
          currentProgress = 800;
        }
      } else if (i === 2) {
        // User 3: Claimed (Ya reclamados) & Progress
        // Ideal para ver estados "Completed" (Reclamado)
        if (j === 0) {
          // First Win -> Claimed
          completed = true;
          claimed = true;
          currentProgress = achievement.goalAmount;
          obtainedAt = new Date();
          obtainedAt.setDate(obtainedAt.getDate() - 2);
          claimedAt = new Date();
          claimedAt.setDate(claimedAt.getDate() - 1);
        } else if (j === 1) {
          // 5 Wins -> Completed, Not Claimed
          completed = true;
          claimed = false;
          currentProgress = achievement.goalAmount;
          obtainedAt = new Date();
        }
      } else if (i === 3) {
        if (j === 0) {
          completed = true;
          claimed = true;
          currentProgress = achievement.goalAmount;
          obtainedAt = new Date();
          claimedAt = new Date();
        } else if (j === 2) {
          completed = true;
          claimed = false;
          currentProgress = achievement.goalAmount;
          obtainedAt = new Date();
        } else if (j === 3) {
          currentProgress = Math.floor(achievement.goalAmount * 0.5);
        } else if (j === 4) {
          completed = true;
          claimed = false;
          currentProgress = achievement.goalAmount;
          obtainedAt = new Date();
        }
      } else {
        if (j === 0) {
          completed = true;
          claimed = true;
          currentProgress = achievement.goalAmount;
          obtainedAt = new Date();
          claimedAt = new Date();
        } else if (j === 1 || j === 3) {
          completed = true;
          claimed = false;
          currentProgress = achievement.goalAmount;
          obtainedAt = new Date();
        } else {
          currentProgress = Math.floor(achievement.goalAmount * 0.75);
        }
      }

      await strapi.entityService.create(
        "api::user-achievement.user-achievement",
        {
          data: {
            users_permissions_user: user.documentId,
            achievement: achievement.documentId,
            completed,
            claimed,
            currentProgress,
            obtainedAt,
            claimedAt,
          },
        },
      );
    }

    // User Daily Rewards (Progreso)
    if (dailyRewards.length > 0) {
      let daysToClaim = 0;

      // Escenarios según el índice del usuario
      if (i === 0) {
        // user1
        // Escenario: Reclamó día 1, le toca día 2
        daysToClaim = 1;
      } else if (i === 1) {
        // user2
        // Escenario: Reclamó 3 días, le toca día 4
        daysToClaim = 3;
      } else if (i === 2) {
        // user3
        // Escenario: No ha reclamado nada (0 días)
        daysToClaim = 0;
      } else if (i === 3) {
        // user4
        // Escenario: Reclamó todos los días (7 días)
        daysToClaim = 7;
      } else {
        // user5
        // Escenario: Reclamó 5 días, le toca día 6
        daysToClaim = 5;
      }

      const today = new Date();

      for (let d = 0; d < daysToClaim; d++) {
        // Asegurarnos de no exceder los rewards disponibles
        if (d >= dailyRewards.length) break;

        const claimDate = new Date(today);
        // El último reclamado fue ayer.
        // d va de 0 a daysToClaim-1.
        // Si daysToClaim es 3:
        // d=2 (Día 3) -> Fue ayer (daysAgo = 1)
        // d=1 (Día 2) -> Fue anteayer (daysAgo = 2)
        // d=0 (Día 1) -> Hace 3 días (daysAgo = 3)
        // Formula: daysAgo = (daysToClaim - d)

        const daysAgo = daysToClaim - d;
        claimDate.setDate(claimDate.getDate() - daysAgo);
        claimDate.setHours(10, 0, 0, 0);

        await strapi.entityService.create(
          "api::user-daily-reward.user-daily-reward",
          {
            data: {
              users_permissions_user: user.documentId,
              daily_reward: dailyRewards[d].documentId,
              claimed: true,
              claimedAt: claimDate,
            },
          },
        );
      }
    }

    // User Rewards (Inventario)
    // Crear diferentes tipos de rewards para testing
    if (rewards.length > 0) {
      // Crear un reward basado en el tipo correcto
      const userRewardItem = rewards[i % rewards.length];
      const isCurrencyOrTicket =
        userRewardItem.typeReward === "currency" ||
        userRewardItem.typeReward === "ticket";

      await strapi.entityService.create("api::user-reward.user-reward", {
        data: {
          users_permissions_user: user.documentId,
          reward: userRewardItem.documentId,
          obtainedAt: new Date(),
          // Currency/Ticket = claimed automatically, others = available
          rewardStatus: isCurrencyOrTicket ? "claimed" : "available",
          claimed: isCurrencyOrTicket,
          claimedAt: isCurrencyOrTicket ? new Date() : null,
          quantity: isCurrencyOrTicket ? userRewardItem.value : 1,
          canBeClaimed: !isCurrencyOrTicket,
        },
      });

      // Para usuarios 1, 2, 3, 4 y 5: crear consumables para testing de claims
      // user2 (i=1) y user4 (i=3) son menores
      if (i === 0 || i === 1 || i === 2 || i === 3 || i === 4) {
        // Buscar rewards consumables
        const consumableRewards = rewards.filter(
          (r) => r.typeReward === "consumable",
        );
        if (consumableRewards.length > 0) {
          const consumable = consumableRewards[0]; // Gift Card $10
          await strapi.entityService.create("api::user-reward.user-reward", {
            data: {
              users_permissions_user: user.documentId,
              reward: consumable.documentId,
              obtainedAt: new Date(),
              // Consumables start as "available" (ready to initiate claim process)
              rewardStatus: "available",
              claimed: false,
              quantity: 1,
              canBeClaimed: true,
              hasClaim: false,
            },
          });
          console.log(
            `  💎 user${i + 1}: Gift Card $10 agregada (consumable - available)`,
          );
        }
      }
    }

    // Roulette History
    const rewardForHistory = rewards[i % rewards.length];

    const rouletteHistory = await strapi.entityService.create(
      "api::roulette-history.roulette-history",
      {
        data: {
          users_permissions_user: user.documentId,
          timestamp: new Date(),
        },
      },
    );

    // Actualizar el Reward para vincularlo al historial
    // En Strapi v5, entityService.update usa ID (integer) como segundo argumento
    await strapi.entityService.update(
      "api::reward.reward",
      rewardForHistory.id,
      {
        data: {
          roulette_history: rouletteHistory.documentId,
        },
      },
    );

    // Log History
    await strapi.entityService.create("api::log-history.log-history", {
      data: {
        action: "login",
        user: user.documentId,
        details: {
          title: "User Login",
          description: `User ${user.username} logged in`,
          level: "info",
          timestamp: new Date(),
          module: "auth",
          eventType: "login",
        },
      },
    });
  }

  // 10. Crear Guardiands
  console.log("🛡️ Creando Guardiands...");
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    let guardianCount = 0;

    // Configuración determinista de guardianes para testing
    if (i === 1) {
      // user2 (Menor, 16 años): 0 guardianes (Caso: Menor sin guardián)
      guardianCount = 0;
      console.log(`  🛡️ user2: Sin guardianes (Testing: Menor sin guardián)`);
    } else if (i === 3) {
      // user4 (Menor, 15 años): 1 guardián específico (Caso: Menor con guardián)
      guardianCount = 1;
      console.log(
        `  🛡️ user4: 1 guardián asignado (Testing: Menor con guardián)`,
      );
    } else {
      // Otros usuarios: Aleatorio (0-2)
      guardianCount = Math.floor(Math.random() * 3);
    }

    for (let j = 0; j < guardianCount; j++) {
      const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

      // Datos específicos para el guardián de user4
      const guardianData =
        i === 3 && j === 0
          ? {
              name: "Padre de User4",
              lastName: "Guardian",
              DNI: "DNI-USER4-PARENT",
              email: "padre.user4@example.com",
              phone: "555-USER4",
              address: "Calle User4 123",
              zipcode: "4444",
              city: "Ciudad User4",
              country: "Argentina",
            }
          : {
              name: `Guardian ${j + 1} of ${user.username}`,
              lastName: `Doe`,
              DNI: `DNI-${uniqueSuffix}`,
              email: `guardian${uniqueSuffix}@example.com`,
              phone: `555-${Math.floor(Math.random() * 10000)}`,
              address: `Calle Falsa ${Math.floor(Math.random() * 123)}`,
              zipcode: `12345`,
              city: `Ciudad Gótica`,
              country: `País de las Maravillas`,
            };

      await strapi.entityService.create("api::guardiand.guardiand", {
        data: {
          ...guardianData,
          user: user.documentId,
          publishedAt: new Date(),
        },
      });
    }
  }

  // 9. Crear User Achievements para el usuario gravitad
  console.log("👤 Creando achievements para usuario gravitad...");
  const gravitadUser = await strapi.db
    .query("plugin::users-permissions.user")
    .findOne({
      where: { email: "synergiart.websupp@gmail.com" },
    });

  if (gravitadUser) {
    // Asegurar que gravitad tiene player-stat en 0
    await strapi.entityService.create("api::player-stat.player-stat", {
      data: {
        users_permissions_user: gravitadUser.documentId,
        score: 0,
        highestScore: 0,
        coins: 0,
        tickets: 0,
        xp: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        totalPlayTime: 0,
        currentStreak: 0,
        publishedAt: new Date(),
      },
    });

    if (achievements.length > 0) {
      // Crear user-achievements para gravitad con estados específicos para testing
      // Orden esperado: 0:FirstWin, 1:5Wins, 2:Score, 3:XP, 4:Time

      // Inicializar todos los logros en 0 para un estado limpio
      for (let j = 0; j < achievements.length; j++) {
        const achievement = achievements[j];

        await strapi.entityService.create(
          "api::user-achievement.user-achievement",
          {
            data: {
              users_permissions_user: gravitadUser.documentId,
              achievement: achievement.documentId,
              completed: false,
              claimed: false,
              currentProgress: 0,
              obtainedAt: null,
              claimedAt: null,
            },
          },
        );
      }
    }
  } else {
    console.log(
      "⚠️ Usuario gravitad no encontrado, no se crearon achievements",
    );
  }

  // 11. Crear Rankings de ejemplo (históricos)
  console.log("🏁 Generando rankings de ejemplo...");
  try {
    // Obtener total de player-stats y limitar top players al total disponible
    const totalPlayers = await strapi.db
      .query("api::player-stat.player-stat")
      .count();

    const topLimit = Math.min(5, Math.max(0, totalPlayers));

    // Obtener top players desde player-stat (limitado a los que existen)
    const topStats: any[] = await strapi.entityService.findMany(
      "api::player-stat.player-stat",
      {
        sort: { score: "desc" },
        limit: topLimit,
        populate: { users_permissions_user: true },
      },
    );

    const topPlayers = topStats.map((ps, idx) => {
      const user = ps.users_permissions_user || null;
      const gamesPlayed = Number(ps.gamesPlayed || 0);
      const gamesWon = Number(ps.gamesWon || ps.victories || 0);
      const winRateNum = gamesPlayed > 0 ? gamesWon / gamesPlayed : 0;
      const winRatePct = `${(winRateNum * 100).toFixed(2)}%`;

      return {
        rank: idx + 1,
        score: Number(ps.score || 0),
        xp: Number(ps.xp || 0),
        victories: gamesWon,
        gamesWon: gamesWon,
        gamesPlayed,
        winRate: Number(winRateNum),
        winRatePercent: Number((winRateNum * 100).toFixed(2)),
        winRateFormatted: winRatePct,
        coins: Number(ps.coins || 0),
        tickets: Number(ps.tickets || 0),
        user: user
          ? {
              id: user.id,
              username: user.username,
              country: user.country || null,
            }
          : null,
        username: user ? user.username : null,
        country: user ? user.country || null : null,
      };
    });

    // Calcular estadísticas globales de forma coherente con el cron
    const allPlayers: any[] = await strapi.entityService.findMany(
      "api::player-stat.player-stat",
      {
        populate: { users_permissions_user: true },
        limit: 1000,
      },
    );

    const totalPlayersAll = allPlayers.length;
    const averageScore = Math.round(
      allPlayers.reduce(
        (acc: number, p: any) => acc + Number(p.highestScore || p.score || 0),
        0,
      ) / (totalPlayersAll || 1),
    );

    const mostWinsPlayer = [...allPlayers].sort(
      (a: any, b: any) =>
        Number(b.gamesWon || b.victories || 0) -
        Number(a.gamesWon || a.victories || 0),
    )[0];
    const mostGamesPlayer = [...allPlayers].sort(
      (a: any, b: any) =>
        Number(b.gamesPlayed || 0) - Number(a.gamesPlayed || 0),
    )[0];

    const playersWithWinRate = allPlayers.map((p: any) => {
      const gamesPlayed = Number(p.gamesPlayed || 0);
      const gamesWon = Number(p.gamesWon || p.victories || 0);
      let wr = 0;
      if (p.winRate !== null && p.winRate !== undefined) {
        const raw = Number(p.winRate);
        wr = raw > 1 ? raw / 100 : raw;
      } else if (gamesPlayed > 0) {
        wr = gamesWon / gamesPlayed;
      }
      return {
        ...p,
        calculatedWinRateRatio: wr,
        calculatedWinRatePercent: Number((wr * 100).toFixed(2)),
      };
    });

    const highestWinRatePlayer = [...playersWithWinRate].sort(
      (a: any, b: any) =>
        (b.calculatedWinRatePercent || 0) - (a.calculatedWinRatePercent || 0),
    )[0];

    // Reutilizar helper similar al cron para top10 semana/mes
    const { utcToZonedTime, zonedTimeToUtc } = await import("date-fns-tz");
    const { startOfWeek, startOfMonth, addDays } = await import("date-fns");
    const tz = "Europe/Madrid";
    const now = new Date();
    const zonedNow = utcToZonedTime(now, tz);
    const startWeekZoned = startOfWeek(zonedNow, { weekStartsOn: 1 });
    const startMonthZoned = startOfMonth(zonedNow);
    const startOfWeekUtc = zonedTimeToUtc(startWeekZoned, tz);
    const startOfMonthUtc = zonedTimeToUtc(startMonthZoned, tz);

    const getTop10ByPeriod = async (startDate: Date) => {
      const histories = await strapi.entityService.findMany(
        "api::user-game-history.user-game-history",
        {
          filters: {
            completedAt: { $gte: startDate },
          },
          populate: { users_permissions_user: true },
          sort: { score: "desc" },
          limit: 1000,
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
      totalPlayers: totalPlayersAll,
      averageScore,
      mostWins: mostWinsPlayer
        ? {
            username: mostWinsPlayer.users_permissions_user?.username,
            count: mostWinsPlayer.gamesWon || mostWinsPlayer.victories || 0,
          }
        : null,
      mostGamesPlayed: mostGamesPlayer
        ? {
            username: mostGamesPlayer.users_permissions_user?.username,
            count: mostGamesPlayer.gamesPlayed || 0,
          }
        : null,
      highestWinRate: highestWinRatePlayer
        ? {
            username: highestWinRatePlayer.users_permissions_user?.username,
            rate: highestWinRatePlayer.calculatedWinRatePercent,
          }
        : null,
      top10Week,
      top10Month,
      generatedAt: now.toISOString(),
    };

    const rankingEntries = [
      {
        timestamp: new Date(now),
        topPlayers,
        stats,
      },
      {
        timestamp: new Date(now.getTime() - 24 * 60 * 60 * 1000), // ayer
        topPlayers: topPlayers.map((p) => ({
          ...p,
          score: Math.max(0, p.score - 20),
        })),
        stats: { ...stats, note: "snapshot-1d" },
      },
      {
        timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // hace 2 días
        topPlayers: topPlayers.map((p) => ({
          ...p,
          score: Math.max(0, p.score - 50),
        })),
        stats: { ...stats, note: "snapshot-2d" },
      },
    ];

    for (const entry of rankingEntries) {
      // Evitar duplicados por timestamp exacto
      const existing = await strapi.db.query("api::ranking.ranking").findOne({
        where: { timestamp: entry.timestamp },
      });
      if (!existing) {
        await strapi.entityService.create("api::ranking.ranking", {
          data: {
            timestamp: entry.timestamp,
            topPlayers: entry.topPlayers,
            stats: entry.stats,
          },
        });
      }
    }
    console.log("✅ Rankings de ejemplo creados");
  } catch (e) {
    console.error("⚠️ Error creando rankings de ejemplo:", e);
  }

  // 12. Create Premium Codes
  console.log("🎟️ Creating Premium Codes...");
  try {
    const premiumCodesCount = 20;
    for (let i = 0; i < premiumCodesCount; i++) {
      await strapi.entityService.create("api::premium-code.premium-code", {
        data: {
          code: generateCode(),
          isUsed: false,
        },
      });
    }
    console.log(`✅ Created ${premiumCodesCount} premium codes.`);
  } catch (e) {
    console.error("⚠️ Error creating premium codes:", e);
  }

  console.log("✅ Seeder completado exitosamente.");
}

async function main() {
  const strapi = await createStrapi({ distDir: "./dist" }).load();

  try {
    const args = process.argv.slice(2);
    const shouldClean = args.includes("--clean");

    if (shouldClean) {
      await cleanDatabase(strapi);
    } else {
      await seedDatabase(strapi);
    }
    process.exit(0);
  } catch (error) {
    console.error("❌ Error en el seeder:", error);
    process.exit(1);
  }
}

main();
