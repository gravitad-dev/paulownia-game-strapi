import { createStrapiMock } from "../helpers/strapi-mock";
import { mockCtx } from "../helpers/ctx-mock";

describe("Controlador de Sesión de Juego - Lógica de Rejugabilidad", () => {
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
  });

  test("debería otorgar 0 monedas y 0 puntos si la dificultad ya fue ganada anteriormente", async () => {
    const levelQuery = { findOne: jest.fn() };
    const playerStatQuery = { findOne: jest.fn(), update: jest.fn() };
    const userLevelQuery = { findOne: jest.fn(), update: jest.fn() };
    const userGameHistoryQuery = { findMany: jest.fn(), update: jest.fn() };
    const userSessionQuery = { findOne: jest.fn(), update: jest.fn() };

    strapi.db.query.mockImplementation((uid: string) => {
      if (uid === "api::level.level") return levelQuery;
      if (uid === "api::player-stat.player-stat") return playerStatQuery;
      if (uid === "api::user-level.user-level") return userLevelQuery;
      if (uid === "api::user-game-history.user-game-history")
        return userGameHistoryQuery;
      if (uid === "api::user-session.user-session") return userSessionQuery;
      return { findOne: jest.fn(), findMany: jest.fn() };
    });

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
      difficulty: "aprendiz", // Dificultad base del nivel
    });
    // Simular historial existente (partida en progreso)
    userGameHistoryQuery.findMany.mockResolvedValue([history]);

    // Simular que el usuario ya ganó "maestro" en este nivel
    userLevelQuery.findOne.mockResolvedValue({
      id: 30,
      levelStatus: "won",
      wonDifficulties: ["maestro"],
    });

    playerStatQuery.findOne.mockResolvedValue({ id: 20, coins: 1000 });

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

    // Debería ser 0 porque rejugó "maestro" que ya estaba en wonDifficulties
    expect(res.data.coins).toBe(0);
    expect(res.data.score).toBe(0);

    // Verificar que las actualizaciones de la base de datos usaron 0
    expect(userGameHistoryQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          score: 0,
          coinsEarned: 0,
        }),
      }),
    );
  });

  test("debería otorgar monedas y puntos normales si la dificultad seleccionada NO ha sido ganada aún (aunque el nivel sea estado won)", async () => {
    const levelQuery = { findOne: jest.fn() };
    const playerStatQuery = { findOne: jest.fn(), update: jest.fn() };
    const userLevelQuery = { findOne: jest.fn(), update: jest.fn() };
    const userGameHistoryQuery = { findMany: jest.fn(), update: jest.fn() };
    const userSessionQuery = { findOne: jest.fn(), update: jest.fn() };

    strapi.db.query.mockImplementation((uid: string) => {
      if (uid === "api::level.level") return levelQuery;
      if (uid === "api::player-stat.player-stat") return playerStatQuery;
      if (uid === "api::user-level.user-level") return userLevelQuery;
      if (uid === "api::user-game-history.user-game-history")
        return userGameHistoryQuery;
      if (uid === "api::user-session.user-session") return userSessionQuery;
      return { findOne: jest.fn(), findMany: jest.fn() };
    });

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
      difficulty: "aprendiz", // El nivel es base aprendiz
    });
    userGameHistoryQuery.findMany.mockResolvedValue([history]);

    // El usuario ya ganó "aprendiz" (por eso status es won), pero NO ha ganado "maestro"
    userLevelQuery.findOne.mockResolvedValue({
      id: 30,
      levelStatus: "won",
      wonDifficulties: ["aprendiz"],
    });

    playerStatQuery.findOne.mockResolvedValue({ id: 20, coins: 1000 });

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

    // Maestro otorga 200 monedas porque NO estaba en wonDifficulties
    expect(res.data.coins).toBe(200);
    expect(res.data.score).toBeGreaterThan(0);
  });
});
