import { createStrapiMock } from "../helpers/strapi-mock";
import { mockCtx } from "../helpers/ctx-mock";
import {
  makeAchievement,
  makeUserAchievement,
  makePlayerStat,
} from "../helpers/factory";

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (_uid: string, builder: any) =>
      builder({ strapi: (global as any).strapi }),
  },
}));

jest.mock("../../src/helpers/uuidApi", () => ({
  getUuidControllerMethods: () => ({}),
}));

describe("Achievement Controller - Escenarios de Visibilidad e isActive", () => {
  let controller: any;
  let strapi: ReturnType<typeof createStrapiMock>;
  const user = { id: 1 };

  beforeEach(async () => {
    strapi = createStrapiMock();
    (global as any).strapi = strapi;
    jest.resetModules();
    controller = (
      await import("../../src/api/achievement/controllers/achievement")
    ).default;
  });

  describe("myAchievements Filter Logic", () => {
    test("debe mostrar logros con visibleToUser: true e isActive: false", async () => {
      const achievement = makeAchievement(
        1,
        "Logro Inactivo pero Visible",
        "xp",
        100,
        "coins",
        50,
        { visibleToUser: true, isActive: false },
      );

      strapi.entityService.findMany.mockImplementation(
        (uid: string, params: any) => {
          if (uid === "api::achievement.achievement") {
            if (
              params.filters.visibleToUser === true &&
              params.filters.isActive === undefined
            ) {
              return [achievement];
            }
            return [];
          }
          return [];
        },
      );

      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(makePlayerStat(user.id));

      const res = await controller.myAchievements(mockCtx(user));

      expect(res.achievements).toHaveLength(1);
      expect(res.achievements[0].isActive).toBe(false);
    });

    test("no debe mostrar logros con visibleToUser: false aunque isActive: true", async () => {
      strapi.entityService.findMany.mockImplementation(
        (uid: string, params: any) => {
          if (uid === "api::achievement.achievement") {
            if (params.filters.visibleToUser === true) return [];
            return [
              makeAchievement(1, "Oculto", "xp", 100, "coins", 50, {
                visibleToUser: false,
              }),
            ];
          }
          return [];
        },
      );

      const res = await controller.myAchievements(mockCtx(user));
      expect(res.achievements).toHaveLength(0);
    });
  });

  describe("claim Validation Logic", () => {
    test("debe rechazar reclamo si isActive: false", async () => {
      const achievement = makeAchievement(
        1,
        "Logro Inactivo",
        "xp",
        100,
        "coins",
        50,
        { isActive: false },
      );
      achievement.uuid = "inactive-uuid";

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::achievement.achievement") return [achievement];
        return [];
      });

      const ctx = mockCtx(user);
      ctx.request.body = { uuid: "inactive-uuid" };

      const res = await controller.claim(ctx);

      expect(res.status).toBe(400);
      expect(res.data.reason).toBe("achievement_not_active");
    });

    test("debe permitir reclamo si isActive: true y está completado", async () => {
      const achievement = makeAchievement(
        1,
        "Logro Activo",
        "xp",
        100,
        "coins",
        50,
        { isActive: true },
      );
      achievement.uuid = "active-uuid";

      const userAchievement = makeUserAchievement(user.id, achievement, {
        currentProgress: 100,
        claimed: false,
      });

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::achievement.achievement") return [achievement];
        if (uid === "api::user-achievement.user-achievement")
          return [userAchievement];
        return [];
      });

      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0));

      const ctx = mockCtx(user);
      ctx.request.body = { uuid: "active-uuid" };

      const res = await controller.claim(ctx);

      expect(res.claimedAchievement.uuid).toBe("active-uuid");
    });
  });
});
