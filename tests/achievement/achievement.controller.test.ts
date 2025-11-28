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

describe("Achievement Controller", () => {
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
    jest.useRealTimers();
  });

  // Helper para configurar achievements básicos
  function setupAchievements() {
    return [
      makeAchievement(1, "Primera Victoria", "gamesWon", 1, "coins", 100),
      makeAchievement(2, "Velocista", "time", 60, "tickets", 5),
      makeAchievement(3, "Maestro", "gamesWon", 10, "coins", 500),
      makeAchievement(4, "Experto en XP", "xp", 1000, "tickets", 10),
      makeAchievement(5, "Puntuación Alta", "score", 5000, "coins", 250),
      makeAchievement(6, "Racha Diaria", "dailyLogin", 7, "tickets", 15),
    ];
  }

  describe("myAchievements", () => {
    test("retorna 401 si el usuario no está autenticado", async () => {
      const res = await controller.myAchievements(mockCtx());
      expect(res.status).toBe(401);
      expect(res.data?.reason).toBe("unauthorized");
      expect(res.message).toMatch(/unauthorized/i);
    });

    test("retorna todos los achievements con estado 'locked' para usuario nuevo", async () => {
      const achievements = setupAchievements();

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::achievement.achievement") return achievements;
        if (uid === "api::user-achievement.user-achievement") return [];
        return [];
      });

      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));

      const res = await controller.myAchievements(mockCtx(user));

      expect(res.achievements).toHaveLength(6);
      expect(res.achievements.every((a: any) => a.status === "locked")).toBe(
        true
      );
      expect(res.achievements[0]).toMatchObject({
        uuid: "achievement-1",
        title: "Primera Victoria",
        targetType: "gamesWon",
        goalAmount: 1,
        currentProgress: 0,
        rewardType: "coins",
        rewardAmount: 100,
        status: "locked",
      });
      expect(res.playerStats).toEqual({ coins: 0, tickets: 0 });
    });

    test("retorna achievement con estado 'completed' cuando está completado pero no reclamado", async () => {
      const achievements = setupAchievements();
      const completedDate = new Date();

      const userAchievements = [
        makeUserAchievement(user.id, achievements[0], {
          completed: true,
          claimed: false,
          currentProgress: 1,
          obtainedAt: completedDate,
        }),
      ];

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::achievement.achievement") return achievements;
        if (uid === "api::user-achievement.user-achievement")
          return userAchievements;
        return [];
      });

      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 50, 5, 50, 5));

      const res = await controller.myAchievements(mockCtx(user));

      const firstAchievement = res.achievements.find(
        (a: any) => a.uuid === "achievement-1"
      );
      expect(firstAchievement.status).toBe("completed");
      expect(firstAchievement.currentProgress).toBe(1);
      expect(new Date(firstAchievement.obtainedAt).getTime()).toBe(
        completedDate.getTime()
      );
      expect(firstAchievement.claimedAt).toBeNull();

      // Los demás deben estar locked
      const otherAchievements = res.achievements.filter(
        (a: any) => a.uuid !== "achievement-1"
      );
      expect(otherAchievements.every((a: any) => a.status === "locked")).toBe(
        true
      );
    });

    test("retorna achievement con estado 'claimed' cuando está completado y reclamado", async () => {
      const achievements = setupAchievements();
      const completedDate = new Date(Date.now() - 2 * 24 * 3600 * 1000);
      const claimedDate = new Date(Date.now() - 1 * 24 * 3600 * 1000);

      const userAchievements = [
        makeUserAchievement(user.id, achievements[0], {
          completed: true,
          claimed: true,
          currentProgress: 1,
          obtainedAt: completedDate,
          claimedAt: claimedDate,
        }),
      ];

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::achievement.achievement") return achievements;
        if (uid === "api::user-achievement.user-achievement")
          return userAchievements;
        return [];
      });

      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(
        makePlayerStat(user.id, 100, 0, 100, 0)
      );

      const res = await controller.myAchievements(mockCtx(user));

      const firstAchievement = res.achievements.find(
        (a: any) => a.uuid === "achievement-1"
      );
      expect(firstAchievement.status).toBe("claimed");
      expect(new Date(firstAchievement.claimedAt).getTime()).toBe(
        claimedDate.getTime()
      );
    });

    test("retorna múltiples achievements con diferentes estados", async () => {
      const achievements = setupAchievements();
      const now = new Date();

      const userAchievements = [
        // Achievement 1: claimed
        makeUserAchievement(user.id, achievements[0], {
          completed: true,
          claimed: true,
          currentProgress: 1,
          obtainedAt: new Date(now.getTime() - 3 * 24 * 3600 * 1000),
          claimedAt: new Date(now.getTime() - 2 * 24 * 3600 * 1000),
        }),
        // Achievement 2: completed but not claimed
        makeUserAchievement(user.id, achievements[1], {
          completed: true,
          claimed: false,
          currentProgress: 45,
          obtainedAt: new Date(now.getTime() - 1 * 24 * 3600 * 1000),
        }),
        // Achievement 3: in progress (not completed)
        makeUserAchievement(user.id, achievements[2], {
          completed: false,
          claimed: false,
          currentProgress: 7,
        }),
      ];

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::achievement.achievement") return achievements;
        if (uid === "api::user-achievement.user-achievement")
          return userAchievements;
        return [];
      });

      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(
        makePlayerStat(user.id, 200, 10, 200, 10)
      );

      const res = await controller.myAchievements(mockCtx(user));

      expect(res.achievements).toHaveLength(6);

      const ach1 = res.achievements.find((a: any) => a.uuid === "achievement-1");
      const ach2 = res.achievements.find((a: any) => a.uuid === "achievement-2");
      const ach3 = res.achievements.find((a: any) => a.uuid === "achievement-3");
      const ach4 = res.achievements.find((a: any) => a.uuid === "achievement-4");

      expect(ach1.status).toBe("claimed");
      expect(ach2.status).toBe("completed");
      expect(ach3.status).toBe("locked");
      expect(ach3.currentProgress).toBe(7);
      expect(ach4.status).toBe("locked");
      expect(ach4.currentProgress).toBe(0);
    });

    test("filtra achievements no activos (isActive: false)", async () => {
      const achievements = [
        ...setupAchievements(),
        makeAchievement(7, "Hidden Achievement", "score", 10000, "coins", 1000, {
          isActive: false,
        }),
      ];

      strapi.entityService.findMany.mockImplementation((uid: string, opts?: any) => {
        if (uid === "api::achievement.achievement") {
          // Filter by isActive and visibleToUser if filters are provided
          if (opts?.filters) {
            return achievements.filter((a: any) => {
              if (opts.filters.isActive !== undefined && a.isActive !== opts.filters.isActive) return false;
              if (opts.filters.visibleToUser !== undefined && a.visibleToUser !== opts.filters.visibleToUser) return false;
              return true;
            });
          }
          return achievements;
        }
        if (uid === "api::user-achievement.user-achievement") return [];
        return [];
      });

      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));

      const res = await controller.myAchievements(mockCtx(user));

      expect(res.achievements).toHaveLength(6);
      expect(res.achievements.find((a: any) => a.uuid === "achievement-7")).toBeUndefined();
    });

    test("filtra achievements no visibles (visibleToUser: false)", async () => {
      const achievements = [
        ...setupAchievements(),
        makeAchievement(8, "Secret Achievement", "xp", 5000, "tickets", 50, {
          visibleToUser: false,
        }),
      ];

      strapi.entityService.findMany.mockImplementation((uid: string, opts?: any) => {
        if (uid === "api::achievement.achievement") {
          // Filter by isActive and visibleToUser if filters are provided
          if (opts?.filters) {
            return achievements.filter((a: any) => {
              if (opts.filters.isActive !== undefined && a.isActive !== opts.filters.isActive) return false;
              if (opts.filters.visibleToUser !== undefined && a.visibleToUser !== opts.filters.visibleToUser) return false;
              return true;
            });
          }
          return achievements;
        }
        if (uid === "api::user-achievement.user-achievement") return [];
        return [];
      });

      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));

      const res = await controller.myAchievements(mockCtx(user));

      expect(res.achievements).toHaveLength(6);
      expect(res.achievements.find((a: any) => a.uuid === "achievement-8")).toBeUndefined();
    });

    test("maneja correctamente cuando no hay player-stat (usuario nuevo)", async () => {
      const achievements = setupAchievements();

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::achievement.achievement") return achievements;
        if (uid === "api::user-achievement.user-achievement") return [];
        return [];
      });

      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(null);

      const res = await controller.myAchievements(mockCtx(user));

      expect(res.playerStats).toEqual({ coins: 0, tickets: 0 });
      expect(res.achievements).toHaveLength(6);
    });

    test("incluye imagen del achievement si existe", async () => {
      const achievementWithImage = makeAchievement(
        1,
        "Primera Victoria",
        "gamesWon",
        1,
        "coins",
        100
      );
      achievementWithImage.image = {
        id: 1,
        url: "/uploads/achievement_1.png",
        name: "achievement_1.png",
      };

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::achievement.achievement")
          return [achievementWithImage];
        if (uid === "api::user-achievement.user-achievement") return [];
        return [];
      });

      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));

      const res = await controller.myAchievements(mockCtx(user));

      expect(res.achievements[0].image).toEqual({
        id: 1,
        url: "/uploads/achievement_1.png",
        name: "achievement_1.png",
      });
    });

    describe("Filtrado y Paginación", () => {
      test("filtra achievements por status=completed", async () => {
        const achievements = setupAchievements();
        const now = new Date();

        const userAchievements = [
          makeUserAchievement(user.id, achievements[0], {
            completed: true,
            claimed: false,
            currentProgress: 1,
            obtainedAt: now,
          }),
          makeUserAchievement(user.id, achievements[1], {
            completed: true,
            claimed: true,
            currentProgress: 60,
            obtainedAt: now,
            claimedAt: now,
          }),
        ];

        strapi.entityService.findMany.mockImplementation((uid: string, opts?: any) => {
          if (uid === "api::achievement.achievement") {
            if (opts?.filters) {
              return achievements.filter((a: any) => {
                if (opts.filters.isActive !== undefined && a.isActive !== opts.filters.isActive) return false;
                if (opts.filters.visibleToUser !== undefined && a.visibleToUser !== opts.filters.visibleToUser) return false;
                return true;
              });
            }
            return achievements;
          }
          if (uid === "api::user-achievement.user-achievement")
            return userAchievements;
          return [];
        });

        const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
        psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 100, 10, 100, 10));

        const ctx = mockCtx(user);
        ctx.query = { status: "completed" };

        const res = await controller.myAchievements(ctx);

        expect(res.achievements).toHaveLength(1);
        expect(res.achievements[0].status).toBe("completed");
        expect(res.achievements[0].uuid).toBe("achievement-1");
      });

      test("filtra achievements por status=locked", async () => {
        const achievements = setupAchievements();

        const userAchievements = [
          makeUserAchievement(user.id, achievements[0], {
            completed: true,
            claimed: true,
            currentProgress: 1,
            obtainedAt: new Date(),
            claimedAt: new Date(),
          }),
        ];

        strapi.entityService.findMany.mockImplementation((uid: string, opts?: any) => {
          if (uid === "api::achievement.achievement") {
            if (opts?.filters) {
              return achievements.filter((a: any) => {
                if (opts.filters.isActive !== undefined && a.isActive !== opts.filters.isActive) return false;
                if (opts.filters.visibleToUser !== undefined && a.visibleToUser !== opts.filters.visibleToUser) return false;
                return true;
              });
            }
            return achievements;
          }
          if (uid === "api::user-achievement.user-achievement")
            return userAchievements;
          return [];
        });

        const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
        psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 100, 10, 100, 10));

        const ctx = mockCtx(user);
        ctx.query = { status: "locked" };

        const res = await controller.myAchievements(ctx);

        expect(res.achievements).toHaveLength(5);
        expect(res.achievements.every((a: any) => a.status === "locked")).toBe(true);
      });

      test("filtra achievements por targetType=score", async () => {
        const achievements = setupAchievements();

        strapi.entityService.findMany.mockImplementation((uid: string, opts?: any) => {
          if (uid === "api::achievement.achievement") {
            let filtered = achievements;
            if (opts?.filters) {
              filtered = achievements.filter((a: any) => {
                if (opts.filters.isActive !== undefined && a.isActive !== opts.filters.isActive) return false;
                if (opts.filters.visibleToUser !== undefined && a.visibleToUser !== opts.filters.visibleToUser) return false;
                if (opts.filters.targetType && a.targetType !== opts.filters.targetType) return false;
                return true;
              });
            }
            return filtered;
          }
          if (uid === "api::user-achievement.user-achievement") return [];
          return [];
        });

        const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
        psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));

        const ctx = mockCtx(user);
        ctx.query = { targetType: "score" };

        const res = await controller.myAchievements(ctx);

        expect(res.achievements).toHaveLength(1);
        expect(res.achievements[0].targetType).toBe("score");
        expect(res.achievements[0].title).toBe("Puntuación Alta");
      });

      test("filtra achievements por rewardType=tickets", async () => {
        const achievements = setupAchievements();

        strapi.entityService.findMany.mockImplementation((uid: string, opts?: any) => {
          if (uid === "api::achievement.achievement") {
            let filtered = achievements;
            if (opts?.filters) {
              filtered = achievements.filter((a: any) => {
                if (opts.filters.isActive !== undefined && a.isActive !== opts.filters.isActive) return false;
                if (opts.filters.visibleToUser !== undefined && a.visibleToUser !== opts.filters.visibleToUser) return false;
                if (opts.filters.rewardType && a.rewardType !== opts.filters.rewardType) return false;
                return true;
              });
            }
            return filtered;
          }
          if (uid === "api::user-achievement.user-achievement") return [];
          return [];
        });

        const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
        psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));

        const ctx = mockCtx(user);
        ctx.query = { rewardType: "tickets" };

        const res = await controller.myAchievements(ctx);

        expect(res.achievements).toHaveLength(3);
        expect(res.achievements.every((a: any) => a.rewardType === "tickets")).toBe(true);
      });

      test("ordena achievements por goalAmount:asc", async () => {
        const achievements = setupAchievements();

        strapi.entityService.findMany.mockImplementation((uid: string, opts?: any) => {
          if (uid === "api::achievement.achievement") {
            if (opts?.filters) {
              return achievements.filter((a: any) => {
                if (opts.filters.isActive !== undefined && a.isActive !== opts.filters.isActive) return false;
                if (opts.filters.visibleToUser !== undefined && a.visibleToUser !== opts.filters.visibleToUser) return false;
                return true;
              });
            }
            return achievements;
          }
          if (uid === "api::user-achievement.user-achievement") return [];
          return [];
        });

        const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
        psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));

        const ctx = mockCtx(user);
        ctx.query = { sort: "goalAmount:asc" };

        const res = await controller.myAchievements(ctx);

        expect(res.achievements).toHaveLength(6);
        expect(res.achievements[0].goalAmount).toBe(1);
        expect(res.achievements[1].goalAmount).toBe(7);
        expect(res.achievements[2].goalAmount).toBe(10);
        expect(res.achievements[5].goalAmount).toBe(5000);
      });

      test("ordena achievements por rewardAmount:desc", async () => {
        const achievements = setupAchievements();

        strapi.entityService.findMany.mockImplementation((uid: string, opts?: any) => {
          if (uid === "api::achievement.achievement") {
            if (opts?.filters) {
              return achievements.filter((a: any) => {
                if (opts.filters.isActive !== undefined && a.isActive !== opts.filters.isActive) return false;
                if (opts.filters.visibleToUser !== undefined && a.visibleToUser !== opts.filters.visibleToUser) return false;
                return true;
              });
            }
            return achievements;
          }
          if (uid === "api::user-achievement.user-achievement") return [];
          return [];
        });

        const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
        psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));

        const ctx = mockCtx(user);
        ctx.query = { sort: "rewardAmount:desc" };

        const res = await controller.myAchievements(ctx);

        expect(res.achievements).toHaveLength(6);
        expect(res.achievements[0].rewardAmount).toBe(500);
        expect(res.achievements[1].rewardAmount).toBe(250);
        expect(res.achievements[5].rewardAmount).toBe(5);
      });

      test("aplica paginación correctamente (página 1, tamaño 3)", async () => {
        const achievements = setupAchievements();

        strapi.entityService.findMany.mockImplementation((uid: string, opts?: any) => {
          if (uid === "api::achievement.achievement") {
            if (opts?.filters) {
              return achievements.filter((a: any) => {
                if (opts.filters.isActive !== undefined && a.isActive !== opts.filters.isActive) return false;
                if (opts.filters.visibleToUser !== undefined && a.visibleToUser !== opts.filters.visibleToUser) return false;
                return true;
              });
            }
            return achievements;
          }
          if (uid === "api::user-achievement.user-achievement") return [];
          return [];
        });

        const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
        psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));

        const ctx = mockCtx(user);
        ctx.query = { pagination: { page: "1", pageSize: "3" } };

        const res = await controller.myAchievements(ctx);

        expect(res.achievements).toHaveLength(3);
        expect(res.meta.pagination).toEqual({
          page: 1,
          pageSize: 3,
          pageCount: 2,
          total: 6,
        });
      });

      test("aplica paginación página 2", async () => {
        const achievements = setupAchievements();

        strapi.entityService.findMany.mockImplementation((uid: string, opts?: any) => {
          if (uid === "api::achievement.achievement") {
            if (opts?.filters) {
              return achievements.filter((a: any) => {
                if (opts.filters.isActive !== undefined && a.isActive !== opts.filters.isActive) return false;
                if (opts.filters.visibleToUser !== undefined && a.visibleToUser !== opts.filters.visibleToUser) return false;
                return true;
              });
            }
            return achievements;
          }
          if (uid === "api::user-achievement.user-achievement") return [];
          return [];
        });

        const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
        psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));

        const ctx = mockCtx(user);
        ctx.query = { pagination: { page: "2", pageSize: "3" } };

        const res = await controller.myAchievements(ctx);

        expect(res.achievements).toHaveLength(3);
        expect(res.achievements[0].id).toBe(4);
        expect(res.meta.pagination.page).toBe(2);
      });

      test("limita pageSize a máximo 100", async () => {
        const achievements = setupAchievements();

        strapi.entityService.findMany.mockImplementation((uid: string, opts?: any) => {
          if (uid === "api::achievement.achievement") {
            if (opts?.filters) {
              return achievements.filter((a: any) => {
                if (opts.filters.isActive !== undefined && a.isActive !== opts.filters.isActive) return false;
                if (opts.filters.visibleToUser !== undefined && a.visibleToUser !== opts.filters.visibleToUser) return false;
                return true;
              });
            }
            return achievements;
          }
          if (uid === "api::user-achievement.user-achievement") return [];
          return [];
        });

        const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
        psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));

        const ctx = mockCtx(user);
        ctx.query = { pagination: { page: "1", pageSize: "200" } };

        const res = await controller.myAchievements(ctx);

        expect(res.meta.pagination.pageSize).toBe(100);
      });

      test("combina filtros: status + targetType + sort", async () => {
        const achievements = setupAchievements();

        const userAchievements = [
          makeUserAchievement(user.id, achievements[0], {
            completed: true,
            claimed: false,
            currentProgress: 1,
            obtainedAt: new Date(),
          }),
        ];

        strapi.entityService.findMany.mockImplementation((uid: string, opts?: any) => {
          if (uid === "api::achievement.achievement") {
            let filtered = achievements;
            if (opts?.filters) {
              filtered = achievements.filter((a: any) => {
                if (opts.filters.isActive !== undefined && a.isActive !== opts.filters.isActive) return false;
                if (opts.filters.visibleToUser !== undefined && a.visibleToUser !== opts.filters.visibleToUser) return false;
                if (opts.filters.targetType && a.targetType !== opts.filters.targetType) return false;
                return true;
              });
            }
            return filtered;
          }
          if (uid === "api::user-achievement.user-achievement")
            return userAchievements;
          return [];
        });

        const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
        psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));

        const ctx = mockCtx(user);
        ctx.query = {
          status: "completed",
          targetType: "gamesWon",
          sort: "goalAmount:desc",
        };

        const res = await controller.myAchievements(ctx);

        expect(res.achievements).toHaveLength(1);
        expect(res.achievements[0].status).toBe("completed");
        expect(res.achievements[0].targetType).toBe("gamesWon");
      });

      test("devuelve valores por defecto sin query params", async () => {
        const achievements = setupAchievements();

        strapi.entityService.findMany.mockImplementation((uid: string, opts?: any) => {
          if (uid === "api::achievement.achievement") {
            if (opts?.filters) {
              return achievements.filter((a: any) => {
                if (opts.filters.isActive !== undefined && a.isActive !== opts.filters.isActive) return false;
                if (opts.filters.visibleToUser !== undefined && a.visibleToUser !== opts.filters.visibleToUser) return false;
                return true;
              });
            }
            return achievements;
          }
          if (uid === "api::user-achievement.user-achievement") return [];
          return [];
        });

        const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
        psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));

        const ctx = mockCtx(user);
        ctx.query = {};

        const res = await controller.myAchievements(ctx);

        expect(res.achievements).toHaveLength(6);
        expect(res.meta.pagination).toEqual({
          page: 1,
          pageSize: 25,
          pageCount: 1,
          total: 6,
        });
      });
    });
  });

  describe("claim", () => {
    test("retorna 401 si el usuario no está autenticado", async () => {
      const res = await controller.claim(mockCtx());
      expect(res.status).toBe(401);
      expect(res.data?.reason).toBe("unauthorized");
      expect(res.message).toMatch(/unauthorized/i);
    });

    test("retorna 400 si no se proporciona uuid del achievement", async () => {
      const ctx = mockCtx(user);
      ctx.request = { body: {} } as any;

      const res = await controller.claim(ctx);
      expect(res.status).toBe(400);
      expect(res.data?.reason).toBe("missing_achievement_uuid");
      expect(res.message).toMatch(/achievement uuid is required/i);
    });

    test("retorna 404 si el achievement no existe", async () => {
      const ctx = mockCtx(user);
      ctx.request = { body: { uuid: "achievement-999" } } as any;

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::achievement.achievement") return [];
        return [];
      });

      const res = await controller.claim(ctx);
      expect(res.status).toBe(404);
      expect(res.data?.reason).toBe("achievement_not_found");
      expect(res.message).toMatch(/achievement not found/i);
    });

    test("retorna 400 si el achievement no está completado", async () => {
      const achievement = setupAchievements()[0];
      const ctx = mockCtx(user);
      ctx.request = { body: { uuid: "achievement-1" } } as any;

      // Usuario no tiene este achievement o no está completado
      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::achievement.achievement") return [achievement];
        if (uid === "api::user-achievement.user-achievement") return [];
        return [];
      });

      const res = await controller.claim(ctx);
      expect(res.status).toBe(400);
      expect(res.data?.reason).toBe("achievement_not_completed");
      expect(res.message).toMatch(/achievement is not completed/i);
    });

    test("retorna 400 si el achievement ya fue reclamado", async () => {
      const achievement = setupAchievements()[0];
      const ctx = mockCtx(user);
      ctx.request = { body: { uuid: "achievement-1" } } as any;

      const userAchievement = makeUserAchievement(user.id, achievement, {
        completed: true,
        claimed: true,
        currentProgress: 1,
        obtainedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
        claimedAt: new Date(Date.now() - 1 * 24 * 3600 * 1000),
      });

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::achievement.achievement") return [achievement];
        if (uid === "api::user-achievement.user-achievement")
          return [userAchievement];
        return [];
      });

      const res = await controller.claim(ctx);
      expect(res.status).toBe(400);
      expect(res.data?.reason).toBe("achievement_already_claimed");
      expect(res.message).toMatch(/achievement already claimed/i);
    });

    test("reclama achievement completado y otorga recompensa de coins", async () => {
      const achievement = setupAchievements()[0]; // 100 coins
      const ctx = mockCtx(user);
      ctx.request = { body: { uuid: "achievement-1" } } as any;

      const userAchievement = makeUserAchievement(user.id, achievement, {
        completed: true,
        claimed: false,
        currentProgress: 1,
        obtainedAt: new Date(Date.now() - 1 * 24 * 3600 * 1000),
      });

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::achievement.achievement") return [achievement];
        if (uid === "api::user-achievement.user-achievement")
          return [userAchievement];
        return [];
      });

      const beforeStat = makePlayerStat(user.id, 50, 10, 50, 10);
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValueOnce(beforeStat);

      const now = new Date();
      strapi.entityService.update.mockResolvedValue({});
      strapi.entityService.create.mockResolvedValue({});

      const afterStat = makePlayerStat(user.id, 150, 10, 150, 10);
      psQuery.findOne.mockResolvedValueOnce(afterStat);

      const res = await controller.claim(ctx);

      expect(res.claimedAchievement).toMatchObject({
        uuid: "achievement-1",
        title: "Primera Victoria",
        rewardType: "coins",
        rewardAmount: 100,
      });
      expect(res.claimedAchievement.claimedAt).toBeDefined();
      expect(res.playerStats).toEqual({ coins: 150, tickets: 10 });

      // Verificar que se actualizó el player-stat
      expect(strapi.entityService.update).toHaveBeenCalledWith(
        "api::player-stat.player-stat",
        beforeStat.id,
        expect.objectContaining({
          data: expect.objectContaining({
            coins: 150,
            coinsEarned: 150,
          }),
        })
      );

      // Verificar que se actualizó el user-achievement
      expect(strapi.entityService.update).toHaveBeenCalledWith(
        "api::user-achievement.user-achievement",
        userAchievement.id,
        expect.objectContaining({
          data: expect.objectContaining({
            claimed: true,
            claimedAt: expect.any(Date),
          }),
        })
      );

      // Verificar que se creó la transacción
      expect(strapi.entityService.create).toHaveBeenCalledWith(
        "api::user-transaction-history.user-transaction-history",
        expect.objectContaining({
          data: expect.objectContaining({
            users_permissions_user: user.id,
            amount: 100,
            type: "achievement",
            currency: "coins",
            description: expect.stringContaining("Primera Victoria"),
          }),
        })
      );
    });

    test("reclama achievement completado y otorga recompensa de tickets", async () => {
      const achievement = setupAchievements()[1]; // 5 tickets
      const ctx = mockCtx(user);
      ctx.request = { body: { uuid: "achievement-2" } } as any;

      const userAchievement = makeUserAchievement(user.id, achievement, {
        completed: true,
        claimed: false,
        currentProgress: 45,
        obtainedAt: new Date(),
      });

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::achievement.achievement") return [achievement];
        if (uid === "api::user-achievement.user-achievement")
          return [userAchievement];
        return [];
      });

      const beforeStat = makePlayerStat(user.id, 100, 20, 100, 20);
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValueOnce(beforeStat);

      strapi.entityService.update.mockResolvedValue({});
      strapi.entityService.create.mockResolvedValue({});

      const afterStat = makePlayerStat(user.id, 100, 25, 100, 25);
      psQuery.findOne.mockResolvedValueOnce(afterStat);

      const res = await controller.claim(ctx);

      expect(res.claimedAchievement).toMatchObject({
        uuid: "achievement-2",
        title: "Velocista",
        rewardType: "tickets",
        rewardAmount: 5,
      });
      expect(res.playerStats).toEqual({ coins: 100, tickets: 25 });

      // Verificar actualización de tickets
      expect(strapi.entityService.update).toHaveBeenCalledWith(
        "api::player-stat.player-stat",
        beforeStat.id,
        expect.objectContaining({
          data: expect.objectContaining({
            tickets: 25,
            ticketsEarned: 25,
          }),
        })
      );
    });

    test("crea player-stat si no existe y otorga recompensa", async () => {
      const achievement = setupAchievements()[0]; // 100 coins
      const ctx = mockCtx(user);
      ctx.request = { body: { uuid: "achievement-1" } } as any;

      const userAchievement = makeUserAchievement(user.id, achievement, {
        completed: true,
        claimed: false,
        currentProgress: 1,
        obtainedAt: new Date(),
      });

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::achievement.achievement") return [achievement];
        if (uid === "api::user-achievement.user-achievement")
          return [userAchievement];
        return [];
      });

      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValueOnce(null); // No existe player-stat

      const createdStat = makePlayerStat(user.id, 100, 0, 100, 0);
      strapi.entityService.create.mockImplementation((uid: string) => {
        if (uid === "api::player-stat.player-stat") return createdStat;
        return {};
      });

      strapi.entityService.update.mockResolvedValue({});
      psQuery.findOne.mockResolvedValueOnce(createdStat);

      const res = await controller.claim(ctx);

      expect(res.playerStats).toEqual({ coins: 100, tickets: 0 });

      // Verificar que se creó el player-stat
      expect(strapi.entityService.create).toHaveBeenCalledWith(
        "api::player-stat.player-stat",
        expect.objectContaining({
          data: expect.objectContaining({
            users_permissions_user: user.id,
            coins: 100,
            tickets: 0,
            coinsEarned: 100,
            ticketsEarned: 0,
          }),
        })
      );
    });

    test("hace rollback si falla el registro de la transacción", async () => {
      const achievement = setupAchievements()[0];
      const ctx = mockCtx(user);
      ctx.request = { body: { uuid: "achievement-1" } } as any;

      const userAchievement = makeUserAchievement(user.id, achievement, {
        completed: true,
        claimed: false,
        currentProgress: 1,
        obtainedAt: new Date(),
      });

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::achievement.achievement") return [achievement];
        if (uid === "api::user-achievement.user-achievement")
          return [userAchievement];
        return [];
      });

      const beforeStat = makePlayerStat(user.id, 50, 10, 50, 10);
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(beforeStat);

      let playerStatUpdated = false;
      let userAchievementUpdated = false;

      strapi.entityService.update.mockImplementation((uid: string) => {
        if (uid === "api::player-stat.player-stat") {
          playerStatUpdated = true;
        }
        if (uid === "api::user-achievement.user-achievement") {
          userAchievementUpdated = true;
        }
        return {};
      });

      // Simular fallo en la creación de la transacción
      strapi.entityService.create.mockImplementation((uid: string) => {
        if (uid === "api::user-transaction-history.user-transaction-history") {
          throw new Error("Transaction log failed");
        }
        return {};
      });

      const res = await controller.claim(ctx);

      expect(res.status).toBe(400);
      expect(res.data?.reason).toBe("transaction_log_failed");
      expect(res.message).toMatch(/failed to log achievement transaction/i);

      // Verificar que se hizo rollback
      expect(strapi.entityService.update).toHaveBeenCalledWith(
        "api::player-stat.player-stat",
        beforeStat.id,
        expect.objectContaining({
          data: expect.objectContaining({
            coins: 50,
            tickets: 10,
            coinsEarned: 50,
            ticketsEarned: 10,
          }),
        })
      );

      expect(strapi.entityService.update).toHaveBeenCalledWith(
        "api::user-achievement.user-achievement",
        userAchievement.id,
        expect.objectContaining({
          data: expect.objectContaining({
            claimed: false,
            claimedAt: null,
          }),
        })
      );
    });

    test("hace rollback si se creó player-stat y falla la transacción", async () => {
      const achievement = setupAchievements()[0];
      const ctx = mockCtx(user);
      ctx.request = { body: { uuid: "achievement-1" } } as any;

      const userAchievement = makeUserAchievement(user.id, achievement, {
        completed: true,
        claimed: false,
        currentProgress: 1,
        obtainedAt: new Date(),
      });

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::achievement.achievement") return [achievement];
        if (uid === "api::user-achievement.user-achievement")
          return [userAchievement];
        return [];
      });

      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(null); // No existe player-stat

      const createdStatId = "ps-new-1";

      strapi.entityService.create.mockImplementation((uid: string) => {
        if (uid === "api::player-stat.player-stat") {
          return { id: createdStatId };
        }
        if (uid === "api::user-transaction-history.user-transaction-history") {
          throw new Error("Transaction log failed");
        }
        return {};
      });

      strapi.entityService.update.mockResolvedValue({});
      strapi.entityService.delete.mockResolvedValue({});

      const res = await controller.claim(ctx);

      expect(res.status).toBe(400);
      expect(res.data?.reason).toBe("transaction_log_failed");

      // Verificar que se eliminó el player-stat creado
      expect(strapi.entityService.delete).toHaveBeenCalledWith(
        "api::player-stat.player-stat",
        createdStatId
      );

      // Verificar que se revirtió el user-achievement
      expect(strapi.entityService.update).toHaveBeenCalledWith(
        "api::user-achievement.user-achievement",
        userAchievement.id,
        expect.objectContaining({
          data: expect.objectContaining({
            claimed: false,
            claimedAt: null,
          }),
        })
      );
    });

    test("incluye imagen del achievement en la respuesta de claim", async () => {
      const achievement = setupAchievements()[0];
      achievement.image = {
        id: 1,
        url: "/uploads/achievement_1.png",
        name: "achievement_1.png",
      };

      const ctx = mockCtx(user);
      ctx.request = { body: { uuid: "achievement-1" } } as any;

      const userAchievement = makeUserAchievement(user.id, achievement, {
        completed: true,
        claimed: false,
        currentProgress: 1,
        obtainedAt: new Date(),
      });

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::achievement.achievement") return [achievement];
        if (uid === "api::user-achievement.user-achievement")
          return [userAchievement];
        return [];
      });

      const beforeStat = makePlayerStat(user.id, 50, 10, 50, 10);
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValueOnce(beforeStat);

      strapi.entityService.update.mockResolvedValue({});
      strapi.entityService.create.mockResolvedValue({});

      const afterStat = makePlayerStat(user.id, 150, 10, 150, 10);
      psQuery.findOne.mockResolvedValueOnce(afterStat);

      const res = await controller.claim(ctx);

      expect(res.claimedAchievement.image).toEqual({
        id: 1,
        url: "/uploads/achievement_1.png",
        name: "achievement_1.png",
      });
    });
  });
});
