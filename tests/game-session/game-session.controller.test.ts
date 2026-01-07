import { createStrapiMock } from "../helpers/strapi-mock";
import { mockCtx } from "../helpers/ctx-mock";

describe("Game Session Controller", () => {
  let controller: any;
  let strapi: ReturnType<typeof createStrapiMock>;
  const user = { id: 1, username: "player" } as any;

  beforeEach(async () => {
    strapi = createStrapiMock();
    (global as any).strapi = strapi;
    jest.resetModules();
    controller = (
      await import("../../src/api/game-session/controllers/game-session")
    ).default;

    const levelQuery = {
      findOne: jest.fn(),
    };
    const playerStatQuery = {
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    const userLevelQuery = {
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    const userGameHistoryQuery = {
      findMany: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    const userSessionQuery = {
      findOne: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    strapi.db.query.mockImplementation((uid: string) => {
      if (uid === "api::level.level") return levelQuery;
      if (uid === "api::player-stat.player-stat") return playerStatQuery;
      if (uid === "api::user-level.user-level") return userLevelQuery;
      if (uid === "api::user-game-history.user-game-history")
        return userGameHistoryQuery;
      if (uid === "api::user-session.user-session") return userSessionQuery;
      return {
        findOne: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      };
    });
  });

  describe("start", () => {
    test("retorna 401 si no autenticado", async () => {
      const ctx = mockCtx() as any;
      ctx.request = { body: {} };
      const res = await controller.start(ctx);
      expect(res.status).toBe(401);
    });

    test("retorna hash si nivel desbloqueado (no crea UserLevel)", async () => {
      const levelQuery = strapi.db.query("api::level.level");
      const playerStatQuery = strapi.db.query("api::player-stat.player-stat");
      const userLevelQuery = strapi.db.query("api::user-level.user-level");
      const userGameHistoryQuery = strapi.db.query(
        "api::user-game-history.user-game-history",
      );
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );

      levelQuery.findOne.mockResolvedValue({
        id: 10,
        uuid: "LEVEL-UUID",
        difficulty: "maestro",
      });
      playerStatQuery.findOne.mockResolvedValue({ id: 20 });
      userLevelQuery.findOne.mockResolvedValue({
        id: 30,
        levelStatus: "available",
      });
      userGameHistoryQuery.create.mockResolvedValue({ id: 40 });
      userSessionQuery.findMany.mockResolvedValue([]);
      userSessionQuery.create.mockResolvedValue({ id: 50 });

      const ctx = mockCtx(user) as any;
      ctx.request = {
        body: {
          levelUuid: "LEVEL-UUID",
          difficulty: "maestro",
          startAt: new Date().toISOString(),
          seed: "abc123",
        },
      };

      const res = await controller.start(ctx);
      expect(res.data.hash).toBeDefined();
      expect(res.data.gridSize).toBe("8x8x8");
      expect(userLevelQuery.create).not.toHaveBeenCalled();
      expect(userGameHistoryQuery.create).toHaveBeenCalled();
      expect(userSessionQuery.create).toHaveBeenCalled();
    });

    test("retorna 403 si nivel no está desbloqueado", async () => {
      const levelQuery = strapi.db.query("api::level.level");
      const playerStatQuery = strapi.db.query("api::player-stat.player-stat");
      const userLevelQuery = strapi.db.query("api::user-level.user-level");

      levelQuery.findOne.mockResolvedValue({
        id: 10,
        uuid: "LEVEL-UUID",
        difficulty: "maestro",
      });
      playerStatQuery.findOne.mockResolvedValue({ id: 20 });
      userLevelQuery.findOne.mockResolvedValue(null);

      const ctx = mockCtx(user) as any;
      ctx.request = {
        body: {
          levelUuid: "LEVEL-UUID",
          difficulty: "maestro",
          startAt: new Date().toISOString(),
          seed: "abc123",
        },
      };

      const res = await controller.start(ctx);
      expect(res.status).toBe(403);
      expect(res.message).toMatch(/Level not unlocked/i);
    });

    test("retorna 403 si nivel está bloqueado", async () => {
      const levelQuery = strapi.db.query("api::level.level");
      const playerStatQuery = strapi.db.query("api::player-stat.player-stat");
      const userLevelQuery = strapi.db.query("api::user-level.user-level");

      levelQuery.findOne.mockResolvedValue({
        id: 10,
        uuid: "LEVEL-UUID",
        difficulty: "maestro",
      });
      playerStatQuery.findOne.mockResolvedValue({ id: 20 });
      userLevelQuery.findOne.mockResolvedValue({
        id: 30,
        levelStatus: "blocked",
      });

      const ctx = mockCtx(user) as any;
      ctx.request = {
        body: {
          levelUuid: "LEVEL-UUID",
          difficulty: "maestro",
          startAt: new Date().toISOString(),
          seed: "abc123",
        },
      };

      const res = await controller.start(ctx);
      expect(res.status).toBe(403);
      expect(res.message).toMatch(/Level is not available/i);
    });
  });

  describe("end", () => {
    test("retorna 401 si no autenticado", async () => {
      const ctx = mockCtx() as any;
      ctx.request = { body: {} };
      const res = await controller.end(ctx);
      expect(res.status).toBe(401);
    });

    test("actualiza history, player-stat, user-level y cierra sesión", async () => {
      const levelQuery = strapi.db.query("api::level.level");
      const playerStatQuery = strapi.db.query("api::player-stat.player-stat");
      const userLevelQuery = strapi.db.query("api::user-level.user-level");
      const userGameHistoryQuery = strapi.db.query(
        "api::user-game-history.user-game-history",
      );
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );

      const startAt = new Date(Date.now() - 120000).toISOString();
      const history = {
        id: 40,
        history: {
          hash: "H123",
          startAt,
          difficulty: "maestro",
          gridSize: "8x8x8",
        },
        completed: false,
      };

      levelQuery.findOne.mockResolvedValue({
        id: 10,
        uuid: "LEVEL-UUID",
        difficulty: "maestro",
      });
      userGameHistoryQuery.findMany.mockResolvedValue([history]);
      userGameHistoryQuery.update.mockResolvedValue({});
      userLevelQuery.findOne.mockResolvedValue({ id: 30, wonDifficulties: [] });
      userLevelQuery.update.mockResolvedValue({});
      playerStatQuery.findOne.mockResolvedValue({
        id: 20,
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        highestScore: 0,
      });
      playerStatQuery.update.mockResolvedValue({});
      userSessionQuery.findOne.mockResolvedValue({
        id: 50,
        startedAt: new Date(Date.now() - 300000),
        isActive: true,
        scoreInSession: 0,
        gamesPlayedInSession: 0,
      });
      userSessionQuery.update.mockResolvedValue({});

      const ctx = mockCtx(user) as any;
      ctx.request = {
        body: {
          levelUuid: "LEVEL-UUID",
          difficulty: "maestro",
          endAt: new Date().toISOString(),
          hash: "H123",
          bonusPoints: 100,
          status: "won",
        },
      };

      const res = await controller.end(ctx);
      expect(res.data.status).toBe("won");
      expect(res.data.levelStatus).toBe("won");
      expect(userGameHistoryQuery.update).toHaveBeenCalled();
      expect(strapi.entityService.update).toHaveBeenCalled(); // Check entityService.update instead of playerStatQuery.update
      expect(userLevelQuery.update).toHaveBeenCalled();
      expect(userSessionQuery.update).toHaveBeenCalled();
      expect(res.data.duration).toBeGreaterThan(0);
      expect(res.data.score).toBeGreaterThan(0);
      // Maestro difficulty should give 800 coins on win
      expect(res.data.coins).toBe(200);

      // Verify wonDifficulties was updated
      const updateCall = userLevelQuery.update.mock.calls[0];
      expect(updateCall[0].where.id).toBe(30);
      expect(updateCall[0].data.wonDifficulties).toEqual(["maestro"]);
    });

    test("da 0 coins si la dificultad ya fue ganada", async () => {
      const levelQuery = strapi.db.query("api::level.level");
      const playerStatQuery = strapi.db.query("api::player-stat.player-stat");
      const userLevelQuery = strapi.db.query("api::user-level.user-level");
      const userGameHistoryQuery = strapi.db.query(
        "api::user-game-history.user-game-history",
      );
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );

      const startAt = new Date(Date.now() - 120000).toISOString();
      const history = {
        id: 40,
        history: {
          hash: "H123",
          startAt,
          difficulty: "maestro",
          gridSize: "8x8x8",
        },
        completed: false,
      };

      levelQuery.findOne.mockResolvedValue({
        id: 10,
        uuid: "LEVEL-UUID",
        difficulty: "maestro",
      });
      userGameHistoryQuery.findMany.mockResolvedValue([history]);
      userGameHistoryQuery.update.mockResolvedValue({});
      // User already won "maestro" difficulty
      userLevelQuery.findOne.mockResolvedValue({
        id: 30,
        levelStatus: "won",
        wonDifficulties: ["maestro"],
      });
      userLevelQuery.update.mockResolvedValue({});
      playerStatQuery.findOne.mockResolvedValue({
        id: 20,
        gamesPlayed: 5,
        gamesWon: 2,
        gamesLost: 3,
        highestScore: 1000,
      });
      playerStatQuery.update.mockResolvedValue({});
      userSessionQuery.findOne.mockResolvedValue({
        id: 50,
        startedAt: new Date(Date.now() - 300000),
        isActive: true,
      });
      userSessionQuery.update.mockResolvedValue({});

      const ctx = mockCtx(user) as any;
      ctx.request = {
        body: {
          levelUuid: "LEVEL-UUID",
          difficulty: "maestro", // Same difficulty already won
          endAt: new Date().toISOString(),
          hash: "H123",
          bonusPoints: 100,
          status: "won",
        },
      };

      const res = await controller.end(ctx);
      expect(res.data.score).toBe(0);
      expect(res.data.coins).toBe(0);
    });

    test("da coins si gana otra dificultad del mismo nivel", async () => {
      const levelQuery = strapi.db.query("api::level.level");
      const playerStatQuery = strapi.db.query("api::player-stat.player-stat");
      const userLevelQuery = strapi.db.query("api::user-level.user-level");
      const userGameHistoryQuery = strapi.db.query(
        "api::user-game-history.user-game-history",
      );
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );

      const startAt = new Date(Date.now() - 120000).toISOString();
      const history = {
        id: 40,
        history: {
          hash: "H123",
          startAt,
          difficulty: "maestro",
          gridSize: "8x8x8",
        },
        completed: false,
      };

      levelQuery.findOne.mockResolvedValue({
        id: 10,
        uuid: "LEVEL-UUID",
        difficulty: "maestro",
      });
      userGameHistoryQuery.findMany.mockResolvedValue([history]);
      userGameHistoryQuery.update.mockResolvedValue({});
      // User won "aprendiz" but not "hard"
      userLevelQuery.findOne.mockResolvedValue({
        id: 30,
        levelStatus: "won",
        wonDifficulties: ["aprendiz"],
      });
      userLevelQuery.update.mockResolvedValue({});
      playerStatQuery.findOne.mockResolvedValue({
        id: 20,
        gamesPlayed: 5,
        gamesWon: 2,
        gamesLost: 3,
        highestScore: 1000,
      });
      playerStatQuery.update.mockResolvedValue({});
      userSessionQuery.findOne.mockResolvedValue({
        id: 50,
        startedAt: new Date(Date.now() - 300000),
        isActive: true,
      });
      userSessionQuery.update.mockResolvedValue({});

      const ctx = mockCtx(user) as any;
      ctx.request = {
        body: {
          levelUuid: "LEVEL-UUID",
          difficulty: "maestro", // Different difficulty
          endAt: new Date().toISOString(),
          hash: "H123",
          bonusPoints: 100,
          status: "won",
        },
      };

      const res = await controller.end(ctx);
      expect(res.data.score).toBeGreaterThan(0);
      expect(res.data.coins).toBe(200); // Maestro coins

      // Verify wonDifficulties is updated with new difficulty
      const updateCall = userLevelQuery.update.mock.calls[0];
      expect(updateCall[0].where.id).toBe(30);
      expect(updateCall[0].data.wonDifficulties).toEqual([
        "aprendiz",
        "maestro",
      ]);
    });

    test("idempotente si el history ya está completado", async () => {
      const levelQuery = strapi.db.query("api::level.level");
      const userGameHistoryQuery = strapi.db.query(
        "api::user-game-history.user-game-history",
      );

      levelQuery.findOne.mockResolvedValue({ id: 10, uuid: "LEVEL-UUID" });
      userGameHistoryQuery.findMany.mockResolvedValue([]);
      userGameHistoryQuery.findMany.mockResolvedValueOnce([]);
      const completedHistory = {
        id: 41,
        history: { hash: "H123" },
        completed: true,
        score: 200,
        duration: 90,
        completedAt: new Date().toISOString(),
      };
      // For completed histories search
      strapi.db.query.mockImplementation((uid: string) => {
        if (uid === "api::user-game-history.user-game-history") {
          return {
            findMany: jest.fn().mockResolvedValue([completedHistory]),
            findOne: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
          };
        }
        return {
          findOne: jest.fn(),
          findMany: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        };
      });

      const ctx = mockCtx(user) as any;
      ctx.request = {
        body: {
          levelUuid: "LEVEL-UUID",
          difficulty: "maestro",
          endAt: new Date().toISOString(),
          hash: "H123",
          bonusPoints: 0,
          status: "won",
        },
      };

      const res = await controller.end(ctx);
      expect(res.data.alreadyCompleted).toBe(true);
      expect(res.data.score).toBe(200);
    });
  });

  describe("achievement progress", () => {
    test("actualiza progreso de gamesWon achievement al ganar", async () => {
      const levelQuery = strapi.db.query("api::level.level");
      const playerStatQuery = strapi.db.query("api::player-stat.player-stat");
      const userLevelQuery = strapi.db.query("api::user-level.user-level");
      const userGameHistoryQuery = strapi.db.query(
        "api::user-game-history.user-game-history",
      );
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );

      const achievementQuery = {
        findOne: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      };
      const userAchievementQuery = {
        findOne: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      };

      strapi.db.query.mockImplementation((uid: string) => {
        if (uid === "api::level.level") return levelQuery;
        if (uid === "api::player-stat.player-stat") return playerStatQuery;
        if (uid === "api::user-level.user-level") return userLevelQuery;
        if (uid === "api::user-game-history.user-game-history")
          return userGameHistoryQuery;
        if (uid === "api::user-session.user-session") return userSessionQuery;
        if (uid === "api::achievement.achievement") return achievementQuery;
        if (uid === "api::user-achievement.user-achievement")
          return userAchievementQuery;
        return {
          findOne: jest.fn(),
          findMany: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        };
      });

      const startAt = new Date(Date.now() - 120000).toISOString();
      const history = {
        id: 40,
        history: {
          hash: "H123",
          startAt,
          difficulty: "aprendiz",
          gridSize: "6x6x6",
        },
        completed: false,
      };

      levelQuery.findOne.mockResolvedValue({
        id: 10,
        uuid: "LEVEL-UUID",
        difficulty: "aprendiz",
      });
      userGameHistoryQuery.findMany.mockResolvedValue([history]);
      userGameHistoryQuery.update.mockResolvedValue({});
      userLevelQuery.findOne.mockResolvedValue({ id: 30, wonDifficulties: [] });
      userLevelQuery.update.mockResolvedValue({});
      playerStatQuery.findOne.mockResolvedValue({
        id: 20,
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        score: 0,
        totalPlayTime: 0,
        xp: 0,
      });
      userSessionQuery.findOne.mockResolvedValue(null);

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::achievement.achievement") {
          return [
            {
              id: 1,
              targetType: "gamesWon",
              goalAmount: 1,
              isActive: true,
            },
          ];
        }
        return [];
      });
      userAchievementQuery.findOne.mockResolvedValue(null);
      userAchievementQuery.create.mockResolvedValue({ id: 100 });

      const ctx = mockCtx(user) as any;
      ctx.request = {
        body: {
          levelUuid: "LEVEL-UUID",
          difficulty: "aprendiz",
          endAt: new Date().toISOString(),
          hash: "H123",
          bonusPoints: 0,
          status: "won",
        },
      };

      await controller.end(ctx);

      expect(userAchievementQuery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            users_permissions_user: user.id,
            achievement: 1,
            currentProgress: 1,
            completed: true,
          }),
        }),
      );
    });

    test("actualiza progreso de score achievement sin completarlo", async () => {
      const levelQuery = strapi.db.query("api::level.level");
      const playerStatQuery = strapi.db.query("api::player-stat.player-stat");
      const userLevelQuery = strapi.db.query("api::user-level.user-level");
      const userGameHistoryQuery = strapi.db.query(
        "api::user-game-history.user-game-history",
      );
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );

      const achievementQuery = {
        findOne: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      };
      const userAchievementQuery = {
        findOne: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      };

      strapi.db.query.mockImplementation((uid: string) => {
        if (uid === "api::level.level") return levelQuery;
        if (uid === "api::player-stat.player-stat") return playerStatQuery;
        if (uid === "api::user-level.user-level") return userLevelQuery;
        if (uid === "api::user-game-history.user-game-history")
          return userGameHistoryQuery;
        if (uid === "api::user-session.user-session") return userSessionQuery;
        if (uid === "api::achievement.achievement") return achievementQuery;
        if (uid === "api::user-achievement.user-achievement")
          return userAchievementQuery;
        return {
          findOne: jest.fn(),
          findMany: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        };
      });

      const startAt = new Date(Date.now() - 120000).toISOString();
      const history = {
        id: 40,
        history: {
          hash: "H123",
          startAt,
          difficulty: "aprendiz",
          gridSize: "6x6x6",
        },
        completed: false,
      };

      levelQuery.findOne.mockResolvedValue({
        id: 10,
        uuid: "LEVEL-UUID",
        difficulty: "aprendiz",
      });
      userGameHistoryQuery.findMany.mockResolvedValue([history]);
      userGameHistoryQuery.update.mockResolvedValue({});
      userLevelQuery.findOne.mockResolvedValue({ id: 30, wonDifficulties: [] });
      userLevelQuery.update.mockResolvedValue({});
      playerStatQuery.findOne.mockResolvedValue({
        id: 20,
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        score: 500,
        totalPlayTime: 0,
        xp: 0,
      });
      userSessionQuery.findOne.mockResolvedValue(null);

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::achievement.achievement") {
          return [
            {
              id: 2,
              targetType: "score",
              goalAmount: 10000,
              isActive: true,
            },
          ];
        }
        return [];
      });
      userAchievementQuery.findOne.mockResolvedValue(null);
      userAchievementQuery.create.mockResolvedValue({ id: 101 });

      const ctx = mockCtx(user) as any;
      ctx.request = {
        body: {
          levelUuid: "LEVEL-UUID",
          difficulty: "aprendiz",
          endAt: new Date().toISOString(),
          hash: "H123",
          bonusPoints: 0,
          status: "won",
        },
      };

      await controller.end(ctx);

      expect(userAchievementQuery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            users_permissions_user: user.id,
            achievement: 2,
            completed: false,
          }),
        }),
      );
    });
  });
});
