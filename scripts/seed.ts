import { createStrapi } from "@strapi/strapi";

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
  const gravitadUser = await strapi.db.query("plugin::users-permissions.user").findOne({
    where: { email: "synergiart.websupp@gmail.com" },
  });

  const types = [
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
        id: { $ne: gravitadUser.id }
      }
    });
    console.log(`🗑️ Eliminados usuarios (preservando gravitad)`);
  } else {
    console.log("⚠️ Usuario gravitad no encontrado, no se eliminaron usuarios");
  }

  console.log("✅ Limpieza completada");
}

async function seedDatabase(strapi: any) {
  console.log("🚀 Iniciando seeder...");

  // 1. Obtener Rol Gamer
  console.log("🔍 Buscando rol 'Gamer'...");
  let gamerRole = await strapi.db.query("plugin::users-permissions.role").findOne({
    where: { type: "gamer" },
  });

  if (!gamerRole) {
    gamerRole = await strapi.db.query("plugin::users-permissions.role").findOne({
      where: { name: "Gamer" },
    });
  }

  if (!gamerRole) {
    gamerRole = await strapi.db.query("plugin::users-permissions.role").findOne({
      where: { type: "authenticated" },
    });
  }

  console.log(`✅ Usando rol: ${gamerRole.name} (ID: ${gamerRole.id})`);

  // 2. Crear Usuarios y PlayerStats
  console.log(`👤 Creando ${COUNTS.USERS} usuarios...`);
  const users = [];
  for (let i = 1; i <= COUNTS.USERS; i++) {
    const username = `user${i}`;
    const email = `user${i}@example.com`;

    const existing = await strapi.db.query("plugin::users-permissions.user").findOne({
      where: { email },
    });

    let user;
    if (!existing) {
      user = await strapi.entityService.create("plugin::users-permissions.user", {
        data: {
          username,
          email,
          password: "Password123!",
          confirmed: true,
          role: gamerRole.id,
        },
      });
    } else {
      user = existing;
    }
    users.push(user);

    const existingStats = await strapi.db.query("api::player-stat.player-stat").findOne({
      where: { users_permissions_user: user.id },
    });

    if (!existingStats) {
      const gamesPlayed = Math.floor(Math.random() * 50) + 1; // Al menos 1 partida
      const gamesWon = Math.floor(Math.random() * gamesPlayed); // Siempre <= gamesPlayed
      const gamesLost = gamesPlayed - gamesWon;
      
      await strapi.entityService.create("api::player-stat.player-stat", {
        data: {
          users_permissions_user: user.documentId,
          score: Math.floor(Math.random() * 10000),
          highestScore: Math.floor(Math.random() * 10000),
          coins: Math.floor(Math.random() * 5000),
          tickets: Math.floor(Math.random() * 100),
          xp: Math.floor(Math.random() * 500),
          gamesPlayed,
          gamesWon,
          gamesLost,
          publishedAt: new Date(),
        },
      });
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

  const currency = await strapi.entityService.findMany("api::currency-info.currency-info");
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

  const token = await strapi.entityService.findMany("api::token-info.token-info");
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
  for (let i = 1; i <= COUNTS.LEVELS; i++) {
    const existing = await strapi.db.query("api::level.level").findOne({ 
      where: { name: `Nivel ${i}` } 
    });
    if (!existing) {
      const level = await strapi.entityService.create("api::level.level", {
        data: {
          name: `Nivel ${i}`,
          description: `Descripción del nivel ${i}`,
          difficulty: difficulties[(i - 1) % difficulties.length],
          publishedAt: new Date(),
        },
      });
      levels.push(level);
    } else {
      levels.push(existing);
    }
  }

  // 5. Crear Achievements
  console.log(`🏆 Creando ${COUNTS.ACHIEVEMENTS} logros...`);
  const achievements = [];
  for (let i = 1; i <= COUNTS.ACHIEVEMENTS; i++) {
    const existing = await strapi.db.query("api::achievement.achievement").findOne({ 
      where: { title: `Logro ${i}` } 
    });
    if (!existing) {
      const achievement = await strapi.entityService.create("api::achievement.achievement", {
        data: {
          title: `Logro ${i}`,
          description: `Desbloquea este logro haciendo X cosa ${i}`,
          rewardAmount: 500,
          targetType: "score",
          goalAmount: 1000 * i,
          quantity: 0,
          rewardType: "coins",
          isActive: true,
          visibleToUser: true,
          publishedAt: new Date(),
        },
      });
      achievements.push(achievement);
    } else {
      achievements.push(existing);
    }
  }

  // 6. Crear Daily Rewards
  console.log(`📅 Creando ${COUNTS.DAILY_REWARDS} recompensas diarias...`);
  const dailyRewards = [];
  for (let i = 1; i <= COUNTS.DAILY_REWARDS; i++) {
    const existing = await strapi.db.query("api::daily-reward.daily-reward").findOne({ 
      where: { day: i } 
    });
    if (!existing) {
      const dr = await strapi.entityService.create("api::daily-reward.daily-reward", {
        data: {
          name: `Día ${i}`,
          day: i,
          rewardType: i % 2 === 0 ? "coins" : "tickets",
          rewardAmount: i * 50,
          isActive: true,
          publishedAt: new Date(),
        },
      });
      dailyRewards.push(dr);
    } else {
      dailyRewards.push(existing);
    }
  }

  // 7. Crear Rewards (Ruleta)
  console.log(`🎁 Creando ${COUNTS.REWARDS} premios de ruleta...`);
  const rewards = [];
  for (let i = 1; i <= COUNTS.REWARDS; i++) {
    const existing = await strapi.db.query("api::reward.reward").findOne({ 
      where: { name: `Premio ${i}` } 
    });
    if (!existing) {
      const reward = await strapi.entityService.create("api::reward.reward", {
        data: {
          name: `Premio ${i}`,
          description: `Descripción del premio ${i}`,
          typeReward: "currency",
          value: i * 100,
          probability: 100 / COUNTS.REWARDS,
          quantity: 1,
          isActive: true,
          visibleToUser: true,
          isUnique: false,
          publishedAt: new Date(),
        },
      });
      rewards.push(reward);
    } else {
      rewards.push(existing);
    }
  }

  // 8. Crear Historiales y Relaciones
  console.log("🔗 Generando historial y relaciones...");
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    
    // User Game History
    for (let j = 0; j < COUNTS.USER_GAME_HISTORY; j++) {
      await strapi.entityService.create("api::user-game-history.user-game-history", {
        data: {
          users_permissions_user: user.documentId,
          level: levels[j % levels.length].documentId,
          score: Math.floor(Math.random() * 1000),
          completed: Math.random() > 0.5,
          coinsEarned: Math.floor(Math.random() * 100),
          duration: Math.floor(Math.random() * 300),
          completedAt: new Date(),

        },
      });
    }

    // User Transaction History
    for (let j = 0; j < COUNTS.USER_TRANSACTION_HISTORY; j++) {
      await strapi.entityService.create("api::user-transaction-history.user-transaction-history", {
        data: {
          users_permissions_user: user.documentId,
          amountDelivered: Math.floor(Math.random() * 100),
          coinsExchanged: Math.floor(Math.random() * 50),
          transactionType: "daily_reward",
          currency: "coins",
          statusTransaction: "completed",
          executedAt: new Date(),


        },
      });
    }

    // User Achievements - Crear uno para cada achievement (Simulando Option A: Sparse Data)
    for (let j = 0; j < achievements.length; j++) {
      // Solo crear el registro con 30% de probabilidad para simular que no todos tienen todos los achievements iniciados
      if (Math.random() > 0.3) continue;

      const achievement = achievements[j];
      // Variar el estado de completado: algunos completados, otros en progreso
      const isCompleted = Math.random() > 0.8; 
      const currentProgress = isCompleted ? achievement.goalAmount : Math.floor(Math.random() * achievement.goalAmount * 0.8);
      
      await strapi.entityService.create("api::user-achievement.user-achievement", {
        data: {
          users_permissions_user: user.documentId,
          achievement: achievement.documentId,
          completed: isCompleted,
          claimed: false,
          currentProgress,
          obtainedAt: isCompleted ? new Date() : null,

        },
      });
    }

    // User Daily Rewards (Progreso)
    if (dailyRewards.length > 0) {
      await strapi.entityService.create("api::user-daily-reward.user-daily-reward", {
        data: {
          users_permissions_user: user.documentId,
          daily_reward: dailyRewards[0].documentId,
          claimed: true,
          claimedAt: new Date(),

        },
      });
    }

    // User Rewards (Inventario)
    // Usamos el mismo premio que se usará para el historial para mantener consistencia, o uno diferente.
    // Aquí usaremos el correspondiente al índice para variar.
    const userRewardItem = rewards[i % rewards.length];
    
    if (rewards.length > 0) {
      await strapi.entityService.create("api::user-reward.user-reward", {
        data: {
          users_permissions_user: user.documentId,
          reward: userRewardItem.documentId,
          obtainedAt: new Date(),
          rewardStatus: "available",
          claimed: false,
          quantity: 1,

        },
      });
    }

    // Roulette History
    const rewardForHistory = rewards[i % rewards.length];
    
    const rouletteHistory = await strapi.entityService.create("api::roulette-history.roulette-history", {
      data: {
        users_permissions_user: user.documentId,
        timestamp: new Date(),

      },
    });

    // Actualizar el Reward para vincularlo al historial
    // En Strapi v5, entityService.update usa ID (integer) como segundo argumento
    await strapi.entityService.update("api::reward.reward", rewardForHistory.id, {
      data: {
        roulette_history: rouletteHistory.documentId,
      },
    });

    // Log History
    await strapi.entityService.create("api::log-history.log-history", {
      data: {
        title: "User Login",
        description: `User ${user.username} logged in`,
        level: "info",
        timestamp: new Date(),
        module: "auth",
        eventType: "login",

      },
    });
  }

  // 9. Crear User Achievements para el usuario gravitad
  console.log("👤 Creando achievements para usuario gravitad...");
  const gravitadUser = await strapi.db.query("plugin::users-permissions.user").findOne({
    where: { email: "synergiart.websupp@gmail.com" },
  });

  if (gravitadUser && achievements.length > 0) {
    // Crear user-achievements para gravitad
    for (let j = 0; j < achievements.length; j++) {
      const achievement = achievements[j];
      // Primer achievement completado y listo para reclamar, resto en progreso
      const isCompleted = j === 0;
      const currentProgress = isCompleted ? achievement.goalAmount : Math.floor(Math.random() * achievement.goalAmount * 0.5);
      
      await strapi.entityService.create("api::user-achievement.user-achievement", {
        data: {
          users_permissions_user: gravitadUser.documentId,
          achievement: achievement.documentId,
          completed: isCompleted,
          claimed: false,
          currentProgress,
          obtainedAt: isCompleted ? new Date() : null,
        },
      });
    }
    console.log(`✅ Creados ${achievements.length} user-achievements para gravitad`);
  } else if (!gravitadUser) {
    console.log("⚠️ Usuario gravitad no encontrado, no se crearon achievements");
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
