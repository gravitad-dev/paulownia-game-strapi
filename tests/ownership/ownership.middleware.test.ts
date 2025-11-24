import ownershipGuard from "../../src/middlewares/ownership-guard";
import { createStrapiMock } from "../helpers/strapi-mock";

function makeCtx(path: string, method: string, user?: any) {
  const ctx: any = {
    request: { path, body: {} },
    path,
    method,
    params: {},
    query: {},
    state: { user, route: { info: {}, handler: "" } },
    forbidden: (msg: string) => ({ status: 403, message: msg }),
    notFound: () => ({ status: 404 }),
  };
  return ctx;
}

describe("ownership-guard middleware", () => {
  let strapi: any;
  let mw: any;

  const user1 = { id: 116 };
  const user1Doc = "lbosecieintjd1deuw228yz1";
  const user2 = { id: 117 };
  const user2Doc = "jy0bus4hoor22bnhcf1nm8uj";

  beforeEach(() => {
    strapi = createStrapiMock();
    (strapi as any).getModel = jest.fn((uid: string) => {
      if (uid === "api::user-game-history.user-game-history") {
        return { attributes: { users_permissions_user: { type: "relation" } } };
      }
      if (uid === "api::token-info.token-info") {
        return { attributes: {} };
      }
      return null;
    });
    (strapi as any).service = jest.fn((uid: string) => {
      return {
        findOne: jest.fn(async (docId: string) => {
          if (uid === "api::user-game-history.user-game-history") {
            if (docId === "own-doc") {
              return {
                users_permissions_user: { id: user1.id, documentId: user1Doc },
              };
            }
            if (docId === "other-doc") {
              return {
                users_permissions_user: { id: user2.id, documentId: user2Doc },
              };
            }
            return null;
          }
          return null;
        }),
      };
    });

    const qUGH = strapi.db.query(
      "api::user-game-history.user-game-history",
    ) as any;
    qUGH.findOne.mockImplementation(async ({ where }: any) => {
      if (where?.uuid === "own-uuid") {
        return {
          users_permissions_user: { id: user1.id, documentId: user1Doc },
        };
      }
      if (where?.uuid === "other-uuid") {
        return {
          users_permissions_user: { id: user2.id, documentId: user2Doc },
        };
      }
      return null;
    });

    strapi.entityService.findOne.mockImplementation(
      async (uid: string, id: any) => {
        if (uid === "plugin::users-permissions.user") {
          if (id === user1.id)
            return { id, documentId: user1Doc, role: { name: "Player" } };
          if (id === user2.id)
            return { id, documentId: user2Doc, role: { name: "Player" } };
          if (id === 999)
            return { id, documentId: "admin-doc", role: { name: "Admin" } };
        }
        return null;
      },
    );

    mw = ownershipGuard({}, { strapi });
  });

  test("pasa cuando no es /api", async () => {
    const ctx = makeCtx("/admin", "GET", user1);
    const next = jest.fn();
    await mw(ctx, next);
    expect(next).toHaveBeenCalled();
  });

  test("pasa cuando no hay usuario", async () => {
    const ctx = makeCtx("/api/user-game-histories", "GET");
    const next = jest.fn();
    await mw(ctx, next);
    expect(next).toHaveBeenCalled();
  });

  test("admin bypass", async () => {
    const ctx = makeCtx("/api/user-game-histories", "GET", { id: 999 });
    ctx.state.route.info.apiName = "user-game-history";
    const next = jest.fn();
    await mw(ctx, next);
    expect(next).toHaveBeenCalled();
  });

  test("GET colección user-game-histories no inyecta filtro (lectura abierta)", async () => {
    const ctx = makeCtx("/api/user-game-histories", "GET", user1);
    ctx.state.route.info.apiName = "user-game-history";
    const next = jest.fn();
    await mw(ctx, next);
    expect(ctx.query.filters).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  test("GET detalle por documentId permite si propio", async () => {
    const ctx = makeCtx("/api/user-game-histories/own-doc", "GET", user1);
    ctx.state.route.info.apiName = "user-game-history";
    ctx.params.id = "own-doc";
    const next = jest.fn();
    await mw(ctx, next);
    expect(next).toHaveBeenCalled();
  });

  test("GET detalle por documentId en user-game-history permite lectura abierta", async () => {
    const ctx = makeCtx("/api/user-game-histories/other-doc", "GET", user1);
    ctx.state.route.info.apiName = "user-game-history";
    ctx.params.id = "other-doc";
    const next = jest.fn();
    await mw(ctx, next);
    expect(next).toHaveBeenCalled();
  });

  test("GET detalle por documentId bloquea si ajeno en plural path", async () => {
    const ctx = makeCtx("/api/player-stats/other-doc", "GET", user1);
    ctx.state.route.info = {};
    ctx.params = {};
    const next = jest.fn();
    // Mock model resolution for player-stat
    (strapi as any).contentTypes = {
      "api::player-stat.player-stat": {
        info: { pluralName: "player-stats", singularName: "player-stat" },
        attributes: { users_permissions_user: { type: "relation" } },
      },
    };
    (strapi as any).getModel = jest.fn((uid: string) => {
      if (uid === "api::player-stat.player-stat") {
        return { attributes: { users_permissions_user: { type: "relation" } } };
      }
      return null;
    });
    // Adjust service mock for player-stat
    (strapi as any).service = jest.fn((uid: string) => {
      return {
        findOne: jest.fn(async (docId: string) => {
          if (uid === "api::player-stat.player-stat") {
            if (docId === "other-doc") {
              return {
                users_permissions_user: { id: user2.id, documentId: user2Doc },
              };
            }
            if (docId === "own-doc") {
              return {
                users_permissions_user: { id: user1.id, documentId: user1Doc },
              };
            }
          }
          return null;
        }),
      };
    });
    await mw(ctx, next);
    expect(next).toHaveBeenCalled();
  });

  test("GET colección de player-stats no inyecta filtros", async () => {
    const ctx = makeCtx("/api/player-stats", "GET", user1);
    ctx.state.route.info = {};
    const next = jest.fn();
    (strapi as any).contentTypes = {
      "api::player-stat.player-stat": {
        info: { pluralName: "player-stats", singularName: "player-stat" },
        attributes: { users_permissions_user: { type: "relation" } },
      },
    };
    await mw(ctx, next);
    expect(ctx.query.filters).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  test("PUT de player-stats ajeno bloquea", async () => {
    const ctx = makeCtx("/api/player-stats/other-doc", "PUT", user1);
    ctx.state.route.info = {};
    ctx.params = {};
    (strapi as any).contentTypes = {
      "api::player-stat.player-stat": {
        info: { pluralName: "player-stats", singularName: "player-stat" },
        attributes: { users_permissions_user: { type: "relation" } },
      },
    };
    (strapi as any).getModel = jest.fn((uid: string) => {
      if (uid === "api::player-stat.player-stat") {
        return { attributes: { users_permissions_user: { type: "relation" } } };
      }
      return null;
    });
    (strapi as any).service = jest.fn((uid: string) => {
      return {
        findOne: jest.fn(async (docId: string) => {
          if (uid === "api::player-stat.player-stat" && docId === "other-doc") {
            return {
              users_permissions_user: { id: user2.id, documentId: user2Doc },
            };
          }
          return null;
        }),
      };
    });
    const res = await mw(ctx, jest.fn());
    expect(res.status).toBe(403);
  });

  test("PUT por uuid en user-game-history ajeno bloquea", async () => {
    const ctx = makeCtx(
      "/api/user-game-histories/uuid/other-uuid",
      "PUT",
      user1,
    );
    ctx.state.route.info.apiName = "user-game-history";
    ctx.params.uuid = "other-uuid";
    const res = await mw(ctx, jest.fn());
    expect(res.status).toBe(403);
  });

  test("GET detalle por uuid permite si propio", async () => {
    const ctx = makeCtx("/api/user-game-histories/uuid/own-uuid", "GET", user1);
    ctx.state.route.info.apiName = "user-game-history";
    ctx.params.uuid = "own-uuid";
    const next = jest.fn();
    await mw(ctx, next);
    expect(next).toHaveBeenCalled();
  });

  test("GET detalle por uuid en user-game-history permite lectura abierta", async () => {
    const ctx = makeCtx(
      "/api/user-game-histories/uuid/other-uuid",
      "GET",
      user1,
    );
    ctx.state.route.info.apiName = "user-game-history";
    ctx.params.uuid = "other-uuid";
    const next = jest.fn();
    await mw(ctx, next);
    expect(next).toHaveBeenCalled();
  });

  test("POST setea users_permissions_user a documentId propio", async () => {
    const ctx = makeCtx("/api/user-game-histories", "POST", user1);
    ctx.state.route.info.apiName = "user-game-history";
    ctx.request.body = { data: { score: 10 } };
    const next = jest.fn();
    await mw(ctx, next);
    expect(ctx.request.body.data.users_permissions_user).toBe(user1Doc);
    expect(next).toHaveBeenCalled();
  });

  test("POST con users_permissions_user ajeno bloquea", async () => {
    const ctx = makeCtx("/api/user-game-histories", "POST", user2);
    ctx.state.route.info.apiName = "user-game-history";
    ctx.request.body = {
      data: { users_permissions_user: user1Doc, score: 10 },
    };
    const res = await mw(ctx, jest.fn());
    expect(res.status).toBe(403);
  });

  test("ruta /api/users/:id permite si propio y bloquea si ajeno", async () => {
    const ctxOwn = makeCtx("/api/users/116", "GET", user1);
    const next = jest.fn();
    await mw(ctxOwn, next);
    expect(next).toHaveBeenCalled();

    const ctxOther = makeCtx("/api/users/116", "GET", user2);
    const res = await mw(ctxOther, jest.fn());
    expect(res.status).toBe(403);
  });

  test("ruta /api/users/me siempre permite para usuario autenticado", async () => {
    const ctxMe = makeCtx("/api/users/me", "GET", user1);
    const next = jest.fn();
    await mw(ctxMe, next);
    expect(next).toHaveBeenCalled();
  });

  test("model sin relación de propietario no modifica ni bloquea", async () => {
    const ctx = makeCtx("/api/token-infos", "GET", user1);
    ctx.state.route.info.apiName = "token-info";
    const next = jest.fn();
    await mw(ctx, next);
    expect(ctx.query.filters).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});
