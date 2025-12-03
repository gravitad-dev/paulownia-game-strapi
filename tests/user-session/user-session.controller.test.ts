import { createStrapiMock } from "../helpers/strapi-mock";
import { mockCtx, Ctx } from "../helpers/ctx-mock";

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (_uid: string, builder: any) =>
      builder({ strapi: (global as any).strapi }),
  },
}));

describe("UserSession Controller", () => {
  let controller: any;
  let strapi: ReturnType<typeof createStrapiMock>;
  const user = {
    id: 1,
    username: "testuser",
    createdAt: new Date("2025-01-01"),
  };

  beforeEach(async () => {
    strapi = createStrapiMock();
    (global as any).strapi = strapi;
    jest.resetModules();
    controller = (
      await import("../../src/api/user-session/controllers/user-session")
    ).default;
    jest.useRealTimers();

    // Setup db.query mock for user-session
    const userSessionQuery = {
      findOne: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    };
    const playerStatQuery = {
      findOne: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    strapi.db.query.mockImplementation((uid: string) => {
      if (uid === "api::user-session.user-session") return userSessionQuery;
      if (uid === "api::player-stat.player-stat") return playerStatQuery;
      return {
        findOne: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      };
    });
  });

  describe("startSession", () => {
    test("retorna 401 si el usuario no está autenticado", async () => {
      const ctx = mockCtx() as any;
      ctx.request = { body: {}, ip: "127.0.0.1", headers: {} };
      const res = await controller.startSession(ctx);
      expect(res.status).toBe(401);
      expect(res.data?.reason).toBe("unauthorized");
    });

    test("crea una nueva sesión correctamente", async () => {
      const playerStatQuery = strapi.db.query("api::player-stat.player-stat");
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );

      playerStatQuery.findOne.mockResolvedValue({
        id: 1,
        users_permissions_user: user.id,
        coins: 100,
        tickets: 5,
        currentStreak: 0,
        longestStreak: 0,
        lastStreakDate: null,
        totalSessions: 0,
      });

      userSessionQuery.findMany.mockResolvedValue([]); // No active sessions
      userSessionQuery.create.mockResolvedValue({
        id: 1,
        uuid: "session-uuid-123",
        sessionType: "login",
        startedAt: new Date(),
        isActive: true,
      });

      playerStatQuery.update.mockResolvedValue({});

      const ctx = mockCtx(user) as any;
      ctx.request = {
        body: { data: { sessionType: "login" } },
        ip: "127.0.0.1",
        headers: {},
      };

      const res = await controller.startSession(ctx);

      expect(res.data).toBeDefined();
      expect(res.data.sessionId).toBe(1);
      expect(res.data.sessionType).toBe("login");
      expect(res.data.isActive).toBe(true);
      expect(res.data.streak).toBeDefined();
    });

    test("cierra sesiones activas anteriores al crear una nueva", async () => {
      const playerStatQuery = strapi.db.query("api::player-stat.player-stat");
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );

      playerStatQuery.findOne.mockResolvedValue({
        id: 1,
        users_permissions_user: user.id,
        coins: 100,
        tickets: 5,
        currentStreak: 1,
        longestStreak: 5,
        lastStreakDate: new Date().toISOString().split("T")[0],
        totalSessions: 3,
      });

      const oldSession = {
        id: 99,
        startedAt: new Date(Date.now() - 3600000), // 1 hora antes
        isActive: true,
      };
      userSessionQuery.findMany.mockResolvedValue([oldSession]);
      userSessionQuery.update.mockResolvedValue({});
      userSessionQuery.create.mockResolvedValue({
        id: 100,
        uuid: "new-session-uuid",
        sessionType: "game",
        startedAt: new Date(),
        isActive: true,
      });

      const ctx = mockCtx(user) as any;
      ctx.request = {
        body: { data: { sessionType: "game" } },
        ip: "192.168.1.1",
        headers: {},
      };

      await controller.startSession(ctx);

      // Verify old session was closed
      expect(userSessionQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 99 },
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    test("crea player stat si no existe", async () => {
      const playerStatQuery = strapi.db.query("api::player-stat.player-stat");
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );

      playerStatQuery.findOne.mockResolvedValue(null);
      playerStatQuery.create.mockResolvedValue({
        id: 1,
        users_permissions_user: user.id,
        coins: 0,
        tickets: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastStreakDate: null,
        totalSessions: 0,
      });

      userSessionQuery.findMany.mockResolvedValue([]);
      userSessionQuery.create.mockResolvedValue({
        id: 1,
        uuid: "session-uuid",
        sessionType: "login",
        startedAt: new Date(),
        isActive: true,
      });
      playerStatQuery.update.mockResolvedValue({});

      const ctx = mockCtx(user) as any;
      ctx.request = {
        body: { data: {} },
        ip: "127.0.0.1",
        headers: {},
      };

      await controller.startSession(ctx);

      expect(playerStatQuery.create).toHaveBeenCalled();
    });
  });

  describe("heartbeat", () => {
    test("retorna 401 si no autenticado", async () => {
      const ctx = mockCtx() as any;
      ctx.request = { body: {} };
      const res = await controller.heartbeat(ctx);
      expect(res.status).toBe(401);
    });

    test("retorna 404 si no hay sesión activa", async () => {
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );
      userSessionQuery.findOne.mockResolvedValue(null);

      const ctx = mockCtx(user) as any;
      ctx.request = { body: { data: {} } };

      const res = await controller.heartbeat(ctx);
      expect(res.status).toBe(404);
      expect(res.data?.reason).toBe("no_active_session");
    });

    test("actualiza heartbeat y estadísticas de sesión", async () => {
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );

      const existingSession = {
        id: 1,
        startedAt: new Date(Date.now() - 600000), // 10 minutos antes
        isActive: true,
        gamesPlayedInSession: 2,
        scoreInSession: 1000,
        coinsEarnedInSession: 50,
      };
      userSessionQuery.findOne.mockResolvedValue(existingSession);
      userSessionQuery.update.mockResolvedValue({});

      const ctx = mockCtx(user) as any;
      ctx.request = {
        body: {
          data: {
            gamesPlayed: 1,
            score: 500,
            coinsEarned: 25,
          },
        },
      };

      const res = await controller.heartbeat(ctx);

      expect(res.data.isActive).toBe(true);
      expect(res.data.gamesPlayedInSession).toBe(3); // 2 + 1
      expect(res.data.scoreInSession).toBe(1500); // 1000 + 500
      expect(res.data.coinsEarnedInSession).toBe(75); // 50 + 25
      expect(res.data.duration).toBeGreaterThan(0);
    });
  });

  describe("endSession", () => {
    test("retorna 401 si no autenticado", async () => {
      const ctx = mockCtx() as any;
      ctx.request = { body: {} };
      const res = await controller.endSession(ctx);
      expect(res.status).toBe(401);
    });

    test("retorna 404 si no hay sesión activa", async () => {
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );
      userSessionQuery.findOne.mockResolvedValue(null);

      const ctx = mockCtx(user) as any;
      ctx.request = { body: { data: {} } };

      const res = await controller.endSession(ctx);
      expect(res.status).toBe(404);
    });

    test("cierra la sesión y actualiza player stats", async () => {
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );
      const playerStatQuery = strapi.db.query("api::player-stat.player-stat");

      const existingSession = {
        id: 1,
        startedAt: new Date(Date.now() - 1800000), // 30 minutos antes
        isActive: true,
        gamesPlayedInSession: 5,
        scoreInSession: 2500,
        coinsEarnedInSession: 100,
      };
      userSessionQuery.findOne.mockResolvedValue(existingSession);
      userSessionQuery.update.mockResolvedValue({});

      playerStatQuery.findOne.mockResolvedValue({
        id: 1,
        totalPlayTime: 3600, // 1 hora previa
        totalSessions: 5,
      });
      playerStatQuery.update.mockResolvedValue({});

      const ctx = mockCtx(user) as any;
      ctx.request = { body: { data: {} } };

      const res = await controller.endSession(ctx);

      expect(res.data.isActive).toBe(false);
      expect(res.data.endedAt).toBeDefined();
      expect(res.data.duration).toBeGreaterThan(0);

      // Verify player stats were updated
      expect(playerStatQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalPlayTime: expect.any(Number),
            averageSessionTime: expect.any(Number),
            lastPlayedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe("getCurrentSession", () => {
    test("retorna 401 si no autenticado", async () => {
      const ctx = mockCtx() as any;
      const res = await controller.getCurrentSession(ctx);
      expect(res.status).toBe(401);
    });

    test("retorna null si no hay sesión activa", async () => {
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );
      userSessionQuery.findOne.mockResolvedValue(null);

      const ctx = mockCtx(user) as any;

      const res = await controller.getCurrentSession(ctx);
      expect(res.data).toBeNull();
      expect(res.meta.hasActiveSession).toBe(false);
    });

    test("retorna sesión activa con duración calculada", async () => {
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );

      const activeSession = {
        id: 1,
        uuid: "active-session-uuid",
        sessionType: "game",
        startedAt: new Date(Date.now() - 300000), // 5 minutos antes
        isActive: true,
        lastHeartbeat: new Date(),
        gamesPlayedInSession: 3,
        scoreInSession: 1500,
        coinsEarnedInSession: 75,
      };
      userSessionQuery.findOne.mockResolvedValue(activeSession);

      const ctx = mockCtx(user) as any;

      const res = await controller.getCurrentSession(ctx);

      expect(res.data).toBeDefined();
      expect(res.data.sessionId).toBe(1);
      expect(res.data.isActive).toBe(true);
      expect(res.data.duration).toBeGreaterThanOrEqual(300);
      expect(res.meta.hasActiveSession).toBe(true);
    });

    test("cierra automáticamente sesión expirada (sin heartbeat)", async () => {
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );

      const expiredSession = {
        id: 1,
        uuid: "expired-session-uuid",
        sessionType: "login",
        startedAt: new Date(Date.now() - 600000), // 10 minutos antes
        isActive: true,
        lastHeartbeat: new Date(Date.now() - 400000), // último heartbeat hace 6+ minutos
        gamesPlayedInSession: 0,
        scoreInSession: 0,
        coinsEarnedInSession: 0,
      };
      userSessionQuery.findOne.mockResolvedValue(expiredSession);
      userSessionQuery.update.mockResolvedValue({});

      const ctx = mockCtx(user) as any;

      const res = await controller.getCurrentSession(ctx);

      expect(res.data).toBeNull();
      expect(res.meta.hasActiveSession).toBe(false);
      expect(res.meta.previousSessionTimedOut).toBe(true);
    });
  });

  describe("getSessionHistory", () => {
    test("retorna 401 si no autenticado", async () => {
      const ctx = mockCtx() as any;
      ctx.query = {};
      const res = await controller.getSessionHistory(ctx);
      expect(res.status).toBe(401);
    });

    test("retorna historial paginado", async () => {
      const userSessionQuery = strapi.db.query(
        "api::user-session.user-session",
      );

      const sessions = [
        {
          id: 3,
          uuid: "session-3",
          sessionType: "game",
          startedAt: new Date(),
          endedAt: new Date(),
          duration: 1800,
          isActive: false,
          gamesPlayedInSession: 10,
          scoreInSession: 5000,
          coinsEarnedInSession: 200,
        },
        {
          id: 2,
          uuid: "session-2",
          sessionType: "login",
          startedAt: new Date(Date.now() - 86400000),
          endedAt: new Date(Date.now() - 86400000 + 3600000),
          duration: 3600,
          isActive: false,
          gamesPlayedInSession: 5,
          scoreInSession: 2000,
          coinsEarnedInSession: 100,
        },
      ];
      userSessionQuery.findMany.mockResolvedValue(sessions);
      userSessionQuery.count.mockResolvedValue(15);

      const ctx = mockCtx(user) as any;
      ctx.query = { page: 1, pageSize: 10 };

      const res = await controller.getSessionHistory(ctx);

      expect(res.data).toHaveLength(2);
      expect(res.data[0].sessionId).toBe(3);
      expect(res.meta.pagination.page).toBe(1);
      expect(res.meta.pagination.pageSize).toBe(10);
      expect(res.meta.pagination.total).toBe(15);
      expect(res.meta.pagination.pageCount).toBe(2);
    });
  });
});
