import { createStrapiMock } from "../helpers/strapi-mock";
import { mockCtx } from "../helpers/ctx-mock";

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (_uid: string, builder: any) =>
      builder({ strapi: (global as any).strapi }),
  },
}));

describe("Player Dashboard Controller", () => {
  let controller: any;
  let strapi: ReturnType<typeof createStrapiMock>;
  const user = {
    id: 1,
    username: "testplayer",
    createdAt: new Date("2025-01-15T00:00:00Z"),
  };

  beforeEach(async () => {
    strapi = createStrapiMock();
    (global as any).strapi = strapi;
    jest.resetModules();
    controller = (
      await import(
        "../../src/api/player-dashboard/controllers/player-dashboard"
      )
    ).default;

    // Setup db.query mocks
    const playerStatQuery = {
      findOne: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    };
    const gameHistoryQuery = {
      findOne: jest.fn(),
      findMany: jest.fn(),
    };
    const levelQuery = {
      count: jest.fn(),
    };
    const achievementQuery = {
      count: jest.fn(),
    };
    const userSessionQuery = {
      findOne: jest.fn(),
      findMany: jest.fn(),
    };

    strapi.db.query.mockImplementation((uid: string) => {
      if (uid === "api::player-stat.player-stat") return playerStatQuery;
      if (uid === "api::user-game-history.user-game-history")
        return gameHistoryQuery;
      if (uid === "api::level.level") return levelQuery;
      if (uid === "api::achievement.achievement") return achievementQuery;
      if (uid === "api::user-session.user-session") return userSessionQuery;
      return { findOne: jest.fn(), findMany: jest.fn(), count: jest.fn() };
    });
  });

  describe("getSummary endpoint", () => {
    test("retorna 401 si el usuario no está autenticado", async () => {
      const ctx = mockCtx();
      const res = await controller.getSummary(ctx);
      expect(res.status).toBe(401);
      expect(res.data?.reason).toBe("unauthorized");
    });

    test("auto-crea player stat si no existe y retorna datos", async () => {
      const playerStatQuery = strapi.db.query("api::player-stat.player-stat");
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );

      // Mock findOne returns null (no player stat)
      playerStatQuery.findOne.mockResolvedValue(null);

      // Mock create to return new player stat
      playerStatQuery.create = jest.fn().mockResolvedValue({
        id: 1,
        coins: 0,
        tickets: 0,
        xp: 0,
        highestScore: 0,
        gamesWon: 0,
        gamesLost: 0,
        totalPlayTime: 0,
        totalSessions: 0,
        averageSessionTime: 0,
        currentStreak: 0,
        longestStreak: 0,
      });

      strapi.entityService.findMany.mockImplementation(() => []);
      strapi.db
        .query("api::user-game-history.user-game-history")
        .findMany.mockResolvedValue([]);
      strapi.db.query("api::level.level").count.mockResolvedValue(10);
      strapi.db
        .query("api::achievement.achievement")
        .count.mockResolvedValue(10);
      userSessionQuery.findMany.mockResolvedValue([]);

      const ctx = mockCtx(user);
      const res = await controller.getSummary(ctx);

      // Should have called create
      expect(playerStatQuery.create).toHaveBeenCalled();

      // Should return success with data
      expect(res.data).toBeDefined();
      expect(res.data.coins).toBe(0);
      expect(res.data.totalGamesPlayed).toBe(0);
    });

    test("retorna resumen completo de estadísticas del jugador", async () => {
      const playerStatQuery = strapi.db.query("api::player-stat.player-stat");
      const gameHistoryQuery = strapi.db.query(
        "api::user-game-history.user-game-history",
      );
      const levelQuery = strapi.db.query("api::level.level");
      const achievementQuery = strapi.db.query("api::achievement.achievement");
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );

      // Mock player stats
      playerStatQuery.findOne.mockResolvedValue({
        id: 1,
        coins: 15000,
        tickets: 25,
        coinsEarned: 50000,
        coinsSpent: 35000,
        ticketsEarned: 100,
        ticketsSpent: 75,
        gamesWon: 120,
        gamesLost: 30,
        winRate: 80.0,
        highestScore: 5200,
        xp: 12500,
        totalPlayTime: 36000,
        averageSessionTime: 1800,
        totalSessions: 20,
        currentStreak: 5,
        longestStreak: 12,
        lastPlayedAt: new Date("2025-12-02T12:30:00Z"),
        lastLoginAt: new Date("2025-12-02T10:00:00Z"),
      });

      // Mock game histories
      const gameHistories = [
        { score: 1500, duration: 300, completed: true, level: { id: 1 } },
        { score: 2000, duration: 400, completed: true, level: { id: 2 } },
        { score: 5000, duration: 600, completed: true, level: { id: 1 } },
        { score: 3500, duration: 350, completed: true, level: { id: 3 } },
      ];
      strapi.entityService.findMany.mockImplementation(
        (uid: string, opts?: any) => {
          if (uid === "api::user-game-history.user-game-history")
            return gameHistories;
          if (uid === "api::user-achievement.user-achievement") {
            return [
              { id: 1, completed: true },
              { id: 2, completed: true },
              { id: 3, completed: true },
              { id: 4, completed: true },
              { id: 5, completed: true },
              { id: 6, completed: true },
              { id: 7, completed: true },
              { id: 8, completed: true },
            ];
          }
          if (uid === "api::user-reward.user-reward") {
            return [
              { id: 1, reward: { typeReward: "currency" } },
              { id: 2, reward: { typeReward: "currency" } },
              { id: 3, reward: { typeReward: "consumable" } },
              { id: 4, reward: { typeReward: "cosmetic" } },
            ];
          }
          if (uid === "api::ranking.ranking") {
            return [
              {
                topPlayers: [
                  { userId: 50, username: "player50" },
                  { userId: 1, username: "testplayer" },
                  { userId: 30, username: "player30" },
                ],
                stats: { totalPlayers: 5000 },
              },
            ];
          }
          if (uid === "api::user-daily-reward.user-daily-reward") {
            return [{ id: 1 }, { id: 2 }, { id: 3 }];
          }
          return [];
        },
      );

      // Mock completed levels (for unique levels)
      gameHistoryQuery.findMany.mockResolvedValue([
        { level: { id: 1 } },
        { level: { id: 2 } },
        { level: { id: 3 } },
      ]);

      // Mock total levels count
      levelQuery.count.mockResolvedValue(20);

      // Mock total achievements count
      achievementQuery.count.mockResolvedValue(25);

      // Mock sessions
      userSessionQuery.findMany.mockResolvedValue([
        { id: 1, duration: 1800, isActive: false },
        { id: 2, duration: 2400, isActive: false },
        { id: 3, duration: 1200, isActive: true },
      ]);

      const ctx = mockCtx(user);
      const res = await controller.getSummary(ctx);

      expect(res.data).toBeDefined();

      // Basic currency stats
      expect(res.data.coins).toBe(15000);
      expect(res.data.tickets).toBe(25);
      expect(res.data.coinsEarned).toBe(50000);
      expect(res.data.coinsSpent).toBe(35000);

      // Game stats
      expect(res.data.totalGamesPlayed).toBe(4);
      expect(res.data.totalScore).toBe(12000); // 1500 + 2000 + 5000 + 3500
      expect(res.data.highestScore).toBe(5200);
      expect(res.data.averageScore).toBe(3000); // 12000 / 4
      expect(res.data.gamesWon).toBe(120);
      expect(res.data.gamesLost).toBe(30);

      // Levels
      expect(res.data.levelsCompleted).toBe(3); // unique levels
      expect(res.data.totalLevels).toBe(20);
      expect(res.data.levelProgress).toBe(15); // (3/20) * 100

      // Achievements
      expect(res.data.achievementsUnlocked).toBe(8);
      expect(res.data.totalAchievements).toBe(25);
      expect(res.data.achievementProgress).toBe(32); // (8/25) * 100

      // Rewards
      expect(res.data.totalRewardsWon).toBe(4);
      expect(res.data.currencyRewardsWon).toBe(2);
      expect(res.data.consumablesWon).toBe(1);
      expect(res.data.cosmeticRewardsWon).toBe(1);

      // Streak
      expect(res.data.currentStreak).toBe(5);
      expect(res.data.longestStreak).toBe(12);

      // Time stats
      expect(res.data.totalPlayTime).toBe(36000);
      expect(res.data.totalPlayTimeFormatted).toBe("10h 0m");
      expect(res.data.totalSessions).toBe(20);

      // Session info
      expect(res.data.hasActiveSession).toBe(true);

      // Ranking
      expect(res.data.globalRank).toBe(2); // second in topPlayers
      expect(res.data.totalPlayers).toBe(5000);

      // Member since
      expect(res.data.memberSince).toEqual(user.createdAt);
    });

    test("maneja correctamente cuando no hay datos (jugador nuevo)", async () => {
      const playerStatQuery = strapi.db.query("api::player-stat.player-stat");
      const gameHistoryQuery = strapi.db.query(
        "api::user-game-history.user-game-history",
      );
      const levelQuery = strapi.db.query("api::level.level");
      const achievementQuery = strapi.db.query("api::achievement.achievement");
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );

      // Mock empty player stats (new player)
      playerStatQuery.findOne.mockResolvedValue({
        id: 1,
        coins: 0,
        tickets: 0,
        coinsEarned: 0,
        coinsSpent: 0,
        ticketsEarned: 0,
        ticketsSpent: 0,
        gamesWon: 0,
        gamesLost: 0,
        winRate: 0,
        highestScore: 0,
        xp: 0,
        totalPlayTime: 0,
        averageSessionTime: 0,
        totalSessions: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastPlayedAt: null,
        lastLoginAt: null,
      });

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        return [];
      });

      gameHistoryQuery.findMany.mockResolvedValue([]);
      levelQuery.count.mockResolvedValue(20);
      achievementQuery.count.mockResolvedValue(25);
      userSessionQuery.findMany.mockResolvedValue([]);

      const ctx = mockCtx(user);
      const res = await controller.getSummary(ctx);

      expect(res.data).toBeDefined();
      expect(res.data.coins).toBe(0);
      expect(res.data.totalGamesPlayed).toBe(0);
      expect(res.data.averageScore).toBe(0);
      expect(res.data.levelsCompleted).toBe(0);
      expect(res.data.achievementsUnlocked).toBe(0);
      expect(res.data.currentStreak).toBe(0);
      expect(res.data.hasActiveSession).toBe(false);
      expect(res.data.globalRank).toBeNull();
    });

    test("formatea correctamente tiempos cortos", async () => {
      const playerStatQuery = strapi.db.query("api::player-stat.player-stat");
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );

      playerStatQuery.findOne.mockResolvedValue({
        id: 1,
        coins: 100,
        tickets: 5,
        totalPlayTime: 45, // 45 segundos
        averageSessionTime: 45,
        totalSessions: 1,
      });

      strapi.entityService.findMany.mockImplementation(() => []);
      strapi.db
        .query("api::user-game-history.user-game-history")
        .findMany.mockResolvedValue([]);
      strapi.db.query("api::level.level").count.mockResolvedValue(10);
      strapi.db
        .query("api::achievement.achievement")
        .count.mockResolvedValue(10);
      userSessionQuery.findMany.mockResolvedValue([]);

      const ctx = mockCtx(user);
      const res = await controller.getSummary(ctx);

      expect(res.data.totalPlayTimeFormatted).toBe("45s");
    });

    test("formatea correctamente tiempos medianos (minutos)", async () => {
      const playerStatQuery = strapi.db.query("api::player-stat.player-stat");
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );

      playerStatQuery.findOne.mockResolvedValue({
        id: 1,
        coins: 100,
        tickets: 5,
        totalPlayTime: 185, // 3 minutos 5 segundos
        averageSessionTime: 185,
        totalSessions: 1,
      });

      strapi.entityService.findMany.mockImplementation(() => []);
      strapi.db
        .query("api::user-game-history.user-game-history")
        .findMany.mockResolvedValue([]);
      strapi.db.query("api::level.level").count.mockResolvedValue(10);
      strapi.db
        .query("api::achievement.achievement")
        .count.mockResolvedValue(10);
      userSessionQuery.findMany.mockResolvedValue([]);

      const ctx = mockCtx(user);
      const res = await controller.getSummary(ctx);

      expect(res.data.totalPlayTimeFormatted).toBe("3m 5s");
    });

    test("calcula correctamente el percentil de ranking", async () => {
      const playerStatQuery = strapi.db.query("api::player-stat.player-stat");
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );

      playerStatQuery.findOne.mockResolvedValue({
        id: 1,
        coins: 100,
        tickets: 5,
      });

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::ranking.ranking") {
          return [
            {
              topPlayers: [
                { userId: 1, username: "testplayer" }, // rank 1
                { userId: 2, username: "player2" },
                { userId: 3, username: "player3" },
              ],
              stats: { totalPlayers: 100 },
            },
          ];
        }
        return [];
      });

      strapi.db
        .query("api::user-game-history.user-game-history")
        .findMany.mockResolvedValue([]);
      strapi.db.query("api::level.level").count.mockResolvedValue(10);
      strapi.db
        .query("api::achievement.achievement")
        .count.mockResolvedValue(10);
      userSessionQuery.findMany.mockResolvedValue([]);

      const ctx = mockCtx(user);
      const res = await controller.getSummary(ctx);

      expect(res.data.globalRank).toBe(1);
      expect(res.data.totalPlayers).toBe(100);
      expect(res.data.rankPercentile).toBe(99); // (100 - 1) / 100 * 100 = 99
    });
  });
});
