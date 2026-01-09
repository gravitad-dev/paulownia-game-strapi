import { createStrapiMock } from "../helpers/strapi-mock";
import { mockCtx } from "../helpers/ctx-mock";
import { makeAchievement, makeUserAchievement } from "../helpers/factory";

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (_uid: string, builder: any) =>
      builder({ strapi: (global as any).strapi }),
  },
}));

jest.mock("../../src/helpers/uuidApi", () => ({
  getUuidControllerMethods: () => ({}),
}));

describe("Achievement Controller - Regresión Meta Modificada", () => {
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

  test("un logro NO debe aparecer como completado si el progreso es menor a la meta actual, aunque la DB diga completed: true", async () => {
    const achievementWithNewGoal = makeAchievement(
      6,
      "Logro 6",
      "gamesWon",
      90,
      "tickets",
      10,
    );
    achievementWithNewGoal.uuid = "achievement-6";

    const userAchievementOutdated = makeUserAchievement(
      user.id,
      achievementWithNewGoal,
      {
        completed: true,
        claimed: false,
        currentProgress: 52,
      },
    );

    strapi.entityService.findMany.mockImplementation((uid: string) => {
      if (uid === "api::achievement.achievement")
        return [achievementWithNewGoal];
      if (uid === "api::user-achievement.user-achievement")
        return [userAchievementOutdated];
      return [];
    });

    const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
    psQuery.findOne.mockResolvedValue({ coins: 0, tickets: 0 });

    const res = await controller.myAchievements(mockCtx(user));

    const log6 = res.achievements.find((a: any) => a.uuid === "achievement-6");

    expect(log6.status).toBe("locked");
    expect(log6.currentProgress).toBe(52);
    expect(log6.goalAmount).toBe(90);
  });

  test("NO se debe permitir reclamar un logro si el progreso es insuficiente, aunque est\u00E9 marcado como completed en la DB", async () => {
    const achievementWithNewGoal = makeAchievement(
      6,
      "Logro 6",
      "gamesWon",
      90,
      "tickets",
      10,
    );
    achievementWithNewGoal.uuid = "achievement-6";

    const userAchievementOutdated = makeUserAchievement(
      user.id,
      achievementWithNewGoal,
      {
        completed: true,
        claimed: false,
        currentProgress: 52,
      },
    );

    strapi.entityService.findMany.mockImplementation((uid: string) => {
      if (uid === "api::achievement.achievement")
        return [achievementWithNewGoal];
      if (uid === "api::user-achievement.user-achievement")
        return [userAchievementOutdated];
      return [];
    });

    const ctx = mockCtx(user);
    ctx.request.body = { uuid: "achievement-6" };

    const res: any = await controller.claim(ctx);

    expect(res.status).toBe(400);
    expect(res.data?.reason).toBe("achievement_not_completed");
  });

  test("debe validar correctamente distintos tipos de logros (score, time, xp) contra sus metas tras un cambio", async () => {
    const achievements = [
      makeAchievement(10, "Gran Puntuación", "score", 10000, "coins", 100),
      makeAchievement(11, "Maratón", "time", 3600, "tickets", 50),
      makeAchievement(12, "Nivel de Maestro", "xp", 5000, "coins", 200),
    ];
    (achievements[0] as any).uuid = "ach-score";
    (achievements[1] as any).uuid = "ach-time";
    (achievements[2] as any).uuid = "ach-xp";

    const userAchievements = [
      makeUserAchievement(user.id, achievements[0], {
        completed: true,
        currentProgress: 8000,
      }),
      makeUserAchievement(user.id, achievements[1], {
        completed: true,
        currentProgress: 1800,
      }),
      makeUserAchievement(user.id, achievements[2], {
        completed: true,
        currentProgress: 4999,
      }),
    ];

    strapi.entityService.findMany.mockImplementation((uid: string) => {
      if (uid === "api::achievement.achievement") return achievements;
      if (uid === "api::user-achievement.user-achievement")
        return userAchievements;
      return [];
    });

    const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
    psQuery.findOne.mockResolvedValue({ coins: 0, tickets: 0 });

    const res = await controller.myAchievements(mockCtx(user));

    const scoreAch = res.achievements.find((a: any) => a.uuid === "ach-score");
    const timeAch = res.achievements.find((a: any) => a.uuid === "ach-time");
    const xpAch = res.achievements.find((a: any) => a.uuid === "ach-xp");

    expect(scoreAch.status).toBe("locked");
    expect(timeAch.status).toBe("locked");
    expect(xpAch.status).toBe("locked");
  });
});
