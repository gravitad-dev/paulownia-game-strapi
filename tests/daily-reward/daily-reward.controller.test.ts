import { createStrapiMock } from "../helpers/strapi-mock";
import { mockCtx } from "../helpers/ctx-mock";
import {
  makeDailyReward,
  makeUserDailyReward,
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

describe("Daily Reward Controller", () => {
  let controller: any;
  let strapi: ReturnType<typeof createStrapiMock>;
  const user = { id: 1 };

  beforeEach(async () => {
    strapi = createStrapiMock();
    (global as any).strapi = strapi;
    jest.resetModules();
    controller = (
      await import("../../src/api/daily-reward/controllers/daily-reward")
    ).default;
    jest.useRealTimers();
  });

  function setAllRewards(days = 7) {
    const rewards = Array.from({ length: days }, (_, i) =>
      makeDailyReward(i + 1, i % 2 === 0 ? "coins" : "tickets", (i + 1) * 100),
    );
    strapi.entityService.findMany.mockImplementation(
      (uid: string, opts?: any) => {
        if (uid === "api::daily-reward.daily-reward") {
          if (opts && opts.filters && typeof opts.filters.day === "number") {
            return rewards.filter((r) => r.day === opts.filters.day);
          }
          return rewards;
        }
        if (uid === "api::user-daily-reward.user-daily-reward") {
          return [];
        }
        return [];
      },
    );
    return rewards;
  }

  describe("myStatus", () => {
    test("retorna nextDay=1 y canClaim=true para usuario sin reclamos", async () => {
      const rewards = setAllRewards(7);
      const psQuery1 = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery1.findOne.mockResolvedValue(null);
      const res = await controller.myStatus(mockCtx(user));
      expect(res.nextDay).toBe(1);
      expect(res.canClaim).toBe(true);
      expect(res.nextClaimDate).toBeInstanceOf(Date);
      expect(
        res.rewards.filter((r: any) => r.status === "available")[0].day,
      ).toBe(1);
      expect(res.playerStats.coins).toBe(0);
      expect(res.playerStats.tickets).toBe(0);
      expect(res.rewards).toHaveLength(rewards.length);
    });

    test("retorna 401 si el usuario no está autenticado", async () => {
      const res = await controller.myStatus(mockCtx());
      expect(res.status).toBe(401);
      expect(res.data?.reason).toBe("unauthorized");
      expect(res.message).toMatch(/unauthorized/i);
    });

    test("canClaim=false cuando el último reclamo fue hace menos de 24h", async () => {
      const now = new Date();
      const twentyThreeHoursAgo = new Date(now.getTime() - 23 * 60 * 60 * 1000);
      const rewardDay1 = makeDailyReward(1, "coins", 100);
      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::user-daily-reward.user-daily-reward")
          return [makeUserDailyReward(user.id, rewardDay1, twentyThreeHoursAgo)];
        if (uid === "api::daily-reward.daily-reward")
          return [
            rewardDay1,
            makeDailyReward(2, "tickets", 200),
            makeDailyReward(3, "coins", 300),
          ];
        return [];
      });
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));
      const res = await controller.myStatus(mockCtx(user));
      expect(res.canClaim).toBe(false);
      const available = res.rewards.find((r: any) => r.status === "available");
      expect(available).toBeUndefined();
      
      // nextClaimDate should be 24h after last claim
      const expectedNextClaim = new Date(twentyThreeHoursAgo.getTime() + 24 * 60 * 60 * 1000);
      expect(new Date(res.nextClaimDate).getTime()).toBe(expectedNextClaim.getTime());
    });

    test("canClaim=true cuando el último reclamo fue hace más de 24h", async () => {
      const now = new Date();
      const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);
      const rewardDay1 = makeDailyReward(1, "coins", 100);
      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::user-daily-reward.user-daily-reward")
          return [makeUserDailyReward(user.id, rewardDay1, twentyFiveHoursAgo)];
        if (uid === "api::daily-reward.daily-reward")
          return [
            rewardDay1,
            makeDailyReward(2, "tickets", 200),
            makeDailyReward(3, "coins", 300),
          ];
        return [];
      });
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));
      const res = await controller.myStatus(mockCtx(user));
      expect(res.canClaim).toBe(true);
      // nextClaimDate should be roughly now (or exactly now per logic)
      // The logic sets it to 'now' if available
      expect(new Date(res.nextClaimDate).getTime()).toBeCloseTo(now.getTime(), -3); // within 1s
    });

    test("ignora registros corruptos sin daily_reward y calcula nextDay", async () => {
      const past = new Date(Date.now() - 48 * 3600 * 1000); // 48h ago
      const rewardDay3 = makeDailyReward(3, "coins", 300);
      const corrupted: any = {
        users_permissions_user: user.id,
        daily_reward: null,
        claimed: true,
        claimedAt: past,
      };
      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::user-daily-reward.user-daily-reward")
          return [corrupted, makeUserDailyReward(user.id, rewardDay3, past)];
        if (uid === "api::daily-reward.daily-reward")
          return [
            makeDailyReward(1, "coins", 100),
            makeDailyReward(2, "tickets", 200),
            rewardDay3,
          ];
        return [];
      });
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));
      const res = await controller.myStatus(mockCtx(user));
      expect(res.nextDay).toBeNull();
      const available2 = res.rewards.find((r: any) => r.status === "available");
      expect(available2).toBeUndefined();
    });

    test("incluye claimedAt en rewards reclamados", async () => {
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
      const rewardDay1 = makeDailyReward(1, "coins", 100);
      const claimed = makeUserDailyReward(user.id, rewardDay1, yesterday);
      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::user-daily-reward.user-daily-reward")
          return [claimed];
        if (uid === "api::daily-reward.daily-reward")
          return [
            rewardDay1,
            makeDailyReward(2, "tickets", 200),
            makeDailyReward(3, "coins", 300),
          ];
        return [];
      });
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));
      const res = await controller.myStatus(mockCtx(user));
      const day1 = res.rewards.find((r: any) => r.day === 1);
      expect(day1.status).toBe("claimed");
      expect(new Date(day1.claimedAt).getTime()).toBe(yesterday.getTime());
    });

    test("todos reclamados: nextDay=null, canClaim=false y todas 'claimed'", async () => {
      const rewards = setAllRewards(7);
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
      const claimedAll = rewards.map((r) =>
        makeUserDailyReward(user.id, r, yesterday),
      );
      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::user-daily-reward.user-daily-reward")
          return claimedAll;
        if (uid === "api::daily-reward.daily-reward") return rewards;
        return [];
      });
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));
      const res = await controller.myStatus(mockCtx(user));
      expect(res.nextDay).toBeNull();
      expect(res.canClaim).toBe(false);
      const available = res.rewards.find((r: any) => r.status === "available");
      expect(available).toBeUndefined();
      expect(res.rewards.every((r: any) => r.status === "claimed")).toBe(true);
    });
  });

  describe("claim", () => {
    test("entrega recompensa del día 1, crea player-stat y bloquea reclamo del día", async () => {
      setAllRewards(7);
      strapi.entityService.findMany.mockImplementation(
        (uid: string, opts?: any) => {
          if (uid === "api::user-daily-reward.user-daily-reward") return [];
          if (uid === "api::daily-reward.daily-reward") {
            if (opts && opts.filters && typeof opts.filters.day === "number")
              return [makeDailyReward(1, "coins", 100)];
            return [
              makeDailyReward(1, "coins", 100),
              makeDailyReward(2, "tickets", 200),
            ];
          }
          return [];
        },
      );
      const psQuery2 = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery2.findOne.mockResolvedValueOnce(null);
      const now = new Date();
      strapi.entityService.create.mockResolvedValueOnce({
        id: 111,
        claimedAt: now,
      });
      strapi.entityService.create.mockResolvedValueOnce({});
      const afterStat = makePlayerStat(user.id, 100, 0, 100, 0);
      psQuery2.findOne.mockResolvedValueOnce(afterStat);
      const res = await controller.claim(mockCtx(user));
      expect(res.claimedReward.day).toBe(1);
      expect(res.claimedReward.claimedAt).toBeDefined();
      expect(res.playerStats.coins).toBe(100);
      expect(res.status.canClaim).toBe(false);
      expect(res.status.nextDay).toBe(2);
      
      // Check nextClaimDate is 24h from now
      const expectedNextClaim = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      expect(new Date(res.status.nextClaimDate).getTime()).toBe(expectedNextClaim.getTime());
    });

    test("rechaza doble reclamo en menos de 24h con 400 y devuelve nextClaimDate", async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
      const rewardDay1 = makeDailyReward(1, "coins", 100);
      const claimed = makeUserDailyReward(user.id, rewardDay1, oneHourAgo);
      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::user-daily-reward.user-daily-reward")
          return [claimed];
        if (uid === "api::daily-reward.daily-reward") return [rewardDay1];
        return [];
      });
      const res = await controller.claim(mockCtx(user));
      expect(res.status).toBe(400);
      expect(res.message).toMatch(/already claimed today/i);
      expect(res.data?.reason).toBe("already_claimed_today");
      
      // Verify nextClaimDate in error details
      expect(res.data?.nextClaimDate).toBeDefined();
      const expectedNextClaim = new Date(oneHourAgo.getTime() + 24 * 60 * 60 * 1000);
      expect(new Date(res.data.nextClaimDate).getTime()).toBe(expectedNextClaim.getTime());
    });

    test("entrega recompensa del día 2 tras 24h y actualiza tickets", async () => {
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 3600 * 1000);
      const rewardDay1 = makeDailyReward(1, "coins", 100);
      const rewardDay2 = makeDailyReward(2, "tickets", 200);
      const claimed = makeUserDailyReward(user.id, rewardDay1, twentyFiveHoursAgo);
      strapi.entityService.findMany.mockImplementation(
        (uid: string, opts?: any) => {
          if (uid === "api::user-daily-reward.user-daily-reward")
            return [claimed];
          if (uid === "api::daily-reward.daily-reward") {
            if (opts && opts.filters && typeof opts.filters.day === "number")
              return [rewardDay2];
            return [rewardDay1, rewardDay2];
          }
          return [];
        },
      );
      const beforeStat = makePlayerStat(user.id, 100, 0, 100, 0);
      const psQuery3 = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery3.findOne.mockResolvedValueOnce(beforeStat);
      strapi.entityService.update.mockResolvedValue({});
      const afterStat = makePlayerStat(user.id, 100, 200, 100, 200);
      psQuery3.findOne.mockResolvedValueOnce(afterStat);
      // Mock create para devolver un objeto con claimedAt
      const now = new Date();
      strapi.entityService.create.mockResolvedValueOnce({
        id: 999,
        claimedAt: now,
      });
      const res = await controller.claim(mockCtx(user));
      expect(res.claimedReward.day).toBe(2);
      expect(res.playerStats.tickets).toBe(200);
      expect(res.status.nextDay).toBe(3);
    });

    test("retorna 401 si el usuario no está autenticado", async () => {
      const res = await controller.claim(mockCtx());
      expect(res.status).toBe(401);
      expect(res.data?.reason).toBe("unauthorized");
      expect(res.message).toMatch(/Unauthorized/i);
    });

    test("retorna 400 cuando se completa el ciclo sin recompensa para el siguiente día", async () => {
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
      const lastReward = makeDailyReward(7, "coins", 700);
      const claimed = makeUserDailyReward(user.id, lastReward, yesterday);
      strapi.entityService.findMany.mockImplementation(
        (uid: string, opts?: any) => {
          if (uid === "api::user-daily-reward.user-daily-reward")
            return [claimed];
          if (uid === "api::daily-reward.daily-reward") {
            if (opts && opts.filters && typeof opts.filters.day === "number")
              return [];
            return Array.from({ length: 7 }, (_, i) =>
              makeDailyReward(
                i + 1,
                i % 2 === 0 ? "coins" : "tickets",
                (i + 1) * 100,
              ),
            );
          }
          return [];
        },
      );
      const res = await controller.claim(mockCtx(user));
      expect(res.status).toBe(400);
      expect(res.data?.reason).toBe("cycle_complete");
      expect(res.message).toMatch(/No reward available/i);
    });

    test("retorna cycle_complete (no already_claimed_today) si se reclama inmediatamente después del último día", async () => {
      const now = new Date();
      const lastReward = makeDailyReward(7, "coins", 700);
      const claimed = makeUserDailyReward(user.id, lastReward, now); // Claimed just now
      strapi.entityService.findMany.mockImplementation(
        (uid: string, opts?: any) => {
          if (uid === "api::user-daily-reward.user-daily-reward")
            return [claimed];
          if (uid === "api::daily-reward.daily-reward") {
            // Day 8 does not exist
            if (opts && opts.filters && typeof opts.filters.day === "number" && opts.filters.day === 8)
              return [];
            return Array.from({ length: 7 }, (_, i) =>
              makeDailyReward(
                i + 1,
                i % 2 === 0 ? "coins" : "tickets",
                (i + 1) * 100,
              ),
            );
          }
          return [];
        },
      );
      const res = await controller.claim(mockCtx(user));
      expect(res.status).toBe(400);
      expect(res.data?.reason).toBe("cycle_complete");
      expect(res.message).toMatch(/No reward available/i);
      // Should NOT be already_claimed_today
      expect(res.data?.reason).not.toBe("already_claimed_today");
    });

    test("registra transacción con datos correctos para coins", async () => {
      setAllRewards(7);
      strapi.entityService.findMany.mockImplementation(
        (uid: string, opts?: any) => {
          if (uid === "api::user-daily-reward.user-daily-reward") return [];
          if (uid === "api::daily-reward.daily-reward") {
            if (opts && opts.filters && typeof opts.filters.day === "number")
              return [makeDailyReward(1, "coins", 100)];
            return [
              makeDailyReward(1, "coins", 100),
              makeDailyReward(2, "tickets", 200),
            ];
          }
          return [];
        },
      );
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValueOnce(
        makePlayerStat(user.id, 50, 0, 0, 0),
      );
      strapi.entityService.update.mockResolvedValue({});
      psQuery.findOne.mockResolvedValueOnce(
        makePlayerStat(user.id, 150, 0, 0, 0),
      );
      strapi.entityService.create.mockClear();
      strapi.entityService.create.mockResolvedValueOnce({
        id: 999,
        claimedAt: new Date(),
      });
      const res = await controller.claim(mockCtx(user));
      expect(res.playerStats.coins).toBe(150);
      const calls = strapi.entityService.create.mock.calls;
      const txCall = calls.find(
        (c: any) =>
          c[0] === "api::user-transaction-history.user-transaction-history",
      );
      expect(txCall[1].data.users_permissions_user).toBe(user.id);
      expect(txCall[1].data.amount).toBe(100);
      expect(txCall[1].data.currency).toBe("coins");
      expect(txCall[1].data.type).toBe("daily_reward");
    });
  });
  test.each([
    { gapHours: 25, lastDay: 2, expectedNextDay: 3 },
    { gapHours: 24.1, lastDay: 1, expectedNextDay: 2 },
    { gapHours: 48, lastDay: 3, expectedNextDay: 4 },
  ])(
    "myStatus: calcula nextDay correcto con brecha de %s horas",
    async ({ gapHours, lastDay, expectedNextDay }) => {
      const past = new Date(Date.now() - gapHours * 3600 * 1000);
      const rewards = setAllRewards(7);
      const lastReward = rewards.find((r) => r.day === lastDay)!;
      const claimed = makeUserDailyReward(user.id, lastReward, past);
      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::user-daily-reward.user-daily-reward")
          return [claimed];
        if (uid === "api::daily-reward.daily-reward") return rewards;
        return [];
      });
      const psQuery4 = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery4.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));
      const res = await controller.myStatus(mockCtx(user));
      expect(res.nextDay).toBe(expectedNextDay);
      const available = res.rewards.find((r: any) => r.status === "available");
      expect(available.day).toBe(expectedNextDay);
    },
  );

  test("myStatus: con lastDay=7 y gap 24h, nextDay=null y canClaim=false (fin de ciclo)", async () => {
    const past = new Date(Date.now() - 24.1 * 3600 * 1000);
    const rewards = setAllRewards(7);
    const lastReward = rewards.find((r) => r.day === 7)!;
    const claimed = makeUserDailyReward(user.id, lastReward, past);
    strapi.entityService.findMany.mockImplementation((uid: string) => {
      if (uid === "api::user-daily-reward.user-daily-reward") return [claimed];
      if (uid === "api::daily-reward.daily-reward") return rewards;
      return [];
    });
    const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
    psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 0, 0, 0, 0));
    const res = await controller.myStatus(mockCtx(user));
    expect(res.nextDay).toBeNull();
    expect(res.canClaim).toBe(false);
    const available = res.rewards.find((r: any) => r.status === "available");
    expect(available).toBeUndefined();
  });

  test("devuelve 400 si no existe recompensa para nextDay", async () => {
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    const rewardDay1 = makeDailyReward(1, "coins", 100);
    const claimed = makeUserDailyReward(user.id, rewardDay1, yesterday);
    strapi.entityService.findMany.mockImplementation(
      (uid: string, opts?: any) => {
        if (uid === "api::user-daily-reward.user-daily-reward")
          return [claimed];
        if (uid === "api::daily-reward.daily-reward") {
          if (opts && opts.filters && typeof opts.filters.day === "number")
            return [];
          return [rewardDay1];
        }
        return [];
      },
    );
    const res = await controller.claim(mockCtx(user));
    expect(res.status).toBe(400);
    expect(res.message).toMatch(/No reward available/i);
  });

  test("bloquea reclamo si falla el registro de la transacción y hace rollback", async () => {
    const createdClaimId = 999;
    let claimCreated = false;
    let playerStatReverted = false;

    const rewardDay1 = makeDailyReward(1, "coins", 100);
    const rewardDay2 = makeDailyReward(2, "tickets", 200);

    strapi.entityService.findMany.mockImplementation(
      (uid: string, opts?: any) => {
        if (uid === "api::user-daily-reward.user-daily-reward") return [];
        if (uid === "api::daily-reward.daily-reward") {
          if (opts && opts.filters && typeof opts.filters.day === "number")
            return [rewardDay1];
          return [rewardDay1, rewardDay2];
        }
        return [];
      },
    );

    const psQueryRollback = strapi.db.query(
      "api::player-stat.player-stat",
    ) as any;
    const beforeStat = makePlayerStat(user.id, 100, 0, 100, 0);
    psQueryRollback.findOne.mockResolvedValueOnce(beforeStat);
    const afterStat = makePlayerStat(user.id, 200, 0, 200, 0);
    psQueryRollback.findOne.mockResolvedValueOnce(afterStat);

    strapi.entityService.create.mockImplementation(
      (uid: string, opts?: any) => {
        if (uid === "api::user-daily-reward.user-daily-reward") {
          claimCreated = true;
          return { id: createdClaimId, claimedAt: new Date() };
        }
        if (uid === "api::user-transaction-history.user-transaction-history") {
          throw new Error("create transaction history failed");
        }
        return {};
      },
    );

    strapi.entityService.delete.mockImplementation(
      (uid: string, id: number) => {
        if (
          uid === "api::user-daily-reward.user-daily-reward" &&
          id === createdClaimId
        ) {
          claimCreated = false;
        }
        return {};
      },
    );

    strapi.entityService.update.mockImplementation(
      (uid: string, id: number, opts?: any) => {
        if (uid === "api::player-stat.player-stat") {
          playerStatReverted = true;
        }
        return {};
      },
    );

    const res = await controller.claim(mockCtx(user));

    expect(res.status).toBe(400);
    expect(res.data?.reason).toBe("transaction_log_failed");
    expect(res.message).toMatch(/Failed to log daily reward transaction/i);

    // Verificar que se hizo rollback
    expect(claimCreated).toBe(false); // El claim fue eliminado
    expect(playerStatReverted).toBe(true); // El playerStat fue revertido
    expect(strapi.entityService.delete).toHaveBeenCalledWith(
      "api::user-daily-reward.user-daily-reward",
      createdClaimId,
    );
  });
});
