import { createStrapiMock } from "../helpers/strapi-mock";
import { mockCtx } from "../helpers/ctx-mock";

describe("Game Session Controller - Replay Logic", () => {
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

  test("should award 0 coins and 0 score if level is already won", async () => {
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
      history: { hash: "H123", startAt },
      completed: false,
    };

    levelQuery.findOne.mockResolvedValue({ id: 10, uuid: "LEVEL-UUID" });
    // Mock existing history (game in progress)
    userGameHistoryQuery.findMany.mockResolvedValue([history]);

    // Mock UserLevel ALREADY WON
    userLevelQuery.findOne.mockResolvedValue({ id: 30, levelStatus: "won", wonDifficulties: ["maestro"] });

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

    // Should be 0 because it's a replay of a won level
    expect(res.data.coins).toBe(0);
    expect(res.data.score).toBe(0);

    // Verify database updates used 0
    expect(userGameHistoryQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          score: 0,
          coinsEarned: 0,
        }),
      }),
    );
  });

  test("should award normal coins and score if level is NOT already won", async () => {
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
      history: { hash: "H123", startAt },
      completed: false,
    };

    levelQuery.findOne.mockResolvedValue({ id: 10, uuid: "LEVEL-UUID" });
    userGameHistoryQuery.findMany.mockResolvedValue([history]);

    // Mock UserLevel AVAILABLE (not won yet)
    userLevelQuery.findOne.mockResolvedValue({
      id: 30,
      levelStatus: "available",
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

    // Maestro gives 800 coins
    expect(res.data.coins).toBe(800);
    expect(res.data.score).toBeGreaterThan(0);
  });
});
