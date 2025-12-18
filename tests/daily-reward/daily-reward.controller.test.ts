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

jest.mock("../../src/helpers/dailyResetHelper", () => ({
  getNext5AMMadrid: jest.fn(() => {
    // Return tomorrow at 5 AM for predictable testing
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(5, 0, 0, 0);
    return tomorrow;
  }),
  wasClaimedAfterLast5AM: jest.fn((claimDate: Date) => {
    // For testing: claims in the last 12 hours are considered "today"
    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    return claimDate >= twelveHoursAgo;
  }),
  isSameDayMadrid: jest.fn((date1: Date, date2: Date) => {
    return date1.toDateString() === date2.toDateString();
  }),
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

    test("canClaim=false cuando ya reclamó hoy (después de las 5 AM)", async () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000); // Claimed 2h ago (today)
      const rewardDay1 = makeDailyReward(1, "coins", 100);
      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::user-daily-reward.user-daily-reward")
          return [makeUserDailyReward(user.id, rewardDay1, twoHoursAgo)];
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

      // nextClaimDate should be tomorrow at 5 AM
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(5, 0, 0, 0);
      expect(new Date(res.nextClaimDate).getTime()).toBe(tomorrow.getTime());
    });

    test("canClaim=true cuando el último reclamo fue antes de las 5 AM de hoy", async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 20 * 60 * 60 * 1000); // 20h ago (yesterday)
      const rewardDay1 = makeDailyReward(1, "coins", 100);
      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::user-daily-reward.user-daily-reward")
          return [makeUserDailyReward(user.id, rewardDay1, yesterday)];
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
      // nextClaimDate should be now (available immediately)
      expect(new Date(res.nextClaimDate).getTime()).toBeCloseTo(
        now.getTime(),
        -3,
      ); // within 1s
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
      const udrQuery = strapi.db.query(
        "api::user-daily-reward.user-daily-reward",
      ) as any;
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      const drQuery = strapi.db.query("api::daily-reward.daily-reward") as any;
      const txQuery = strapi.db.query(
        "api::user-transaction-history.user-transaction-history",
      ) as any;

      const rewardDay1 = makeDailyReward(1, "coins", 100);
      const rewardDay2 = makeDailyReward(2, "tickets", 200);

      // Inside transaction
      psQuery.findOne.mockResolvedValue(null);
      strapi.db.mockTrx.select.mockResolvedValue([
        { id: 1, coins: 0, tickets: 0, coins_earned: 0, tickets_earned: 0 },
      ]);
      udrQuery.findMany.mockResolvedValue([]);
      drQuery.findMany.mockResolvedValue([rewardDay1]);

      const now = new Date();
      const newClaim = { id: 111, claimedAt: now };
      psQuery.create.mockResolvedValue({ id: 1, coins: 0, tickets: 0 });
      udrQuery.create.mockResolvedValue(newClaim);
      psQuery.update.mockResolvedValue({ id: 1, coins: 100, tickets: 0 });
      txQuery.create.mockResolvedValue({});

      // After transaction - for UI response
      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::daily-reward.daily-reward")
          return [rewardDay1, rewardDay2];
        return [];
      });

      const res = await controller.claim(mockCtx(user));
      expect(res.claimedReward.day).toBe(1);
      expect(res.claimedReward.claimedAt).toBeDefined();
      expect(res.playerStats.coins).toBe(100);
      expect(res.status.canClaim).toBe(false);
      expect(res.status.nextDay).toBe(2);

      // Check nextClaimDate is tomorrow at 5 AM
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(5, 0, 0, 0);
      expect(new Date(res.status.nextClaimDate).getTime()).toBe(
        tomorrow.getTime(),
      );
    });

    test("rechaza doble reclamo el mismo día con 400 y devuelve nextClaimDate", async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
      const rewardDay1 = makeDailyReward(1, "coins", 100);
      const claimed = makeUserDailyReward(user.id, rewardDay1, oneHourAgo);

      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      const udrQuery = strapi.db.query(
        "api::user-daily-reward.user-daily-reward",
      ) as any;
      const drQuery = strapi.db.query("api::daily-reward.daily-reward") as any;

      psQuery.findOne.mockResolvedValue({ id: 1, coins: 100, tickets: 0 });
      strapi.db.mockTrx.select.mockResolvedValue([
        { id: 1, coins: 100, tickets: 0 },
      ]);

      // Return last claim - this triggers ALREADY_CLAIMED because it was after last 5 AM
      udrQuery.findMany.mockResolvedValue([
        {
          ...claimed,
          daily_reward: rewardDay1,
          claimedAt: oneHourAgo,
        },
      ]);

      // The next day reward exists
      drQuery.findMany.mockResolvedValue([makeDailyReward(2, "tickets", 200)]);

      const res = await controller.claim(mockCtx(user));
      expect(res.status).toBe(400);
      expect(res.message).toMatch(/already claimed today/i);
      expect(res.data?.reason).toBe("already_claimed_today");

      // Verify nextClaimDate is tomorrow at 5 AM
      expect(res.data?.nextClaimDate).toBeDefined();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(5, 0, 0, 0);
      expect(new Date(res.data.nextClaimDate).getTime()).toBe(
        tomorrow.getTime(),
      );
    });

    test("entrega recompensa del día 2 al día siguiente y actualiza tickets", async () => {
      const yesterday = new Date(Date.now() - 20 * 3600 * 1000); // 20h ago
      const rewardDay1 = makeDailyReward(1, "coins", 100);
      const rewardDay2 = makeDailyReward(2, "tickets", 200);
      const claimed = makeUserDailyReward(user.id, rewardDay1, yesterday);

      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      const udrQuery = strapi.db.query(
        "api::user-daily-reward.user-daily-reward",
      ) as any;
      const drQuery = strapi.db.query("api::daily-reward.daily-reward") as any;
      const txQuery = strapi.db.query(
        "api::user-transaction-history.user-transaction-history",
      ) as any;

      const beforeStat = makePlayerStat(user.id, 100, 0, 100, 0);
      psQuery.findOne.mockResolvedValue(beforeStat);
      strapi.db.mockTrx.select.mockResolvedValue([
        {
          id: beforeStat.id,
          coins: 100,
          tickets: 0,
          coins_earned: 100,
          tickets_earned: 0,
        },
      ]);

      // Last claim was yesterday's day 1
      udrQuery.findMany.mockResolvedValue([
        {
          ...claimed,
          daily_reward: rewardDay1,
          claimedAt: yesterday,
        },
      ]);

      // Day 2 reward
      drQuery.findMany.mockResolvedValue([rewardDay2]);

      const now = new Date();
      udrQuery.create.mockResolvedValue({ id: 999, claimedAt: now });
      psQuery.update.mockResolvedValue({});
      txQuery.create.mockResolvedValue({});

      // After transaction
      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::daily-reward.daily-reward")
          return [rewardDay1, rewardDay2];
        return [];
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

      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      const udrQuery = strapi.db.query(
        "api::user-daily-reward.user-daily-reward",
      ) as any;
      const drQuery = strapi.db.query("api::daily-reward.daily-reward") as any;

      psQuery.findOne.mockResolvedValue({ id: 1, coins: 700, tickets: 0 });
      strapi.db.mockTrx.select.mockResolvedValue([
        { id: 1, coins: 700, tickets: 0 },
      ]);

      udrQuery.findMany.mockResolvedValue([
        {
          ...claimed,
          daily_reward: lastReward,
          claimedAt: yesterday,
        },
      ]);

      // No reward for day 8
      drQuery.findMany.mockResolvedValue([]);

      const res = await controller.claim(mockCtx(user));
      expect(res.status).toBe(400);
      expect(res.data?.reason).toBe("cycle_complete");
      expect(res.message).toMatch(/No reward available/i);
    });

    test("retorna cycle_complete (no already_claimed_today) si se reclama inmediatamente después del último día", async () => {
      const now = new Date();
      const lastReward = makeDailyReward(7, "coins", 700);
      const claimed = makeUserDailyReward(user.id, lastReward, now); // Claimed just now

      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      const udrQuery = strapi.db.query(
        "api::user-daily-reward.user-daily-reward",
      ) as any;
      const drQuery = strapi.db.query("api::daily-reward.daily-reward") as any;

      psQuery.findOne.mockResolvedValue({ id: 1, coins: 700, tickets: 0 });
      strapi.db.mockTrx.select.mockResolvedValue([
        { id: 1, coins: 700, tickets: 0 },
      ]);

      udrQuery.findMany.mockResolvedValue([
        {
          ...claimed,
          daily_reward: lastReward,
          claimedAt: now,
        },
      ]);

      // Day 8 does not exist
      drQuery.findMany.mockResolvedValue([]);

      const res = await controller.claim(mockCtx(user));
      expect(res.status).toBe(400);
      expect(res.data?.reason).toBe("cycle_complete");
      expect(res.message).toMatch(/No reward available/i);
      // Should NOT be already_claimed_today
      expect(res.data?.reason).not.toBe("already_claimed_today");
    });

    test("registra transacción con datos correctos para coins", async () => {
      const udrQuery = strapi.db.query(
        "api::user-daily-reward.user-daily-reward",
      ) as any;
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      const drQuery = strapi.db.query("api::daily-reward.daily-reward") as any;
      const txQuery = strapi.db.query(
        "api::user-transaction-history.user-transaction-history",
      ) as any;

      const rewardDay1 = makeDailyReward(1, "coins", 100);

      psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 50, 0, 0, 0));
      strapi.db.mockTrx.select.mockResolvedValue([
        { id: 1, coins: 50, tickets: 0, coins_earned: 0, tickets_earned: 0 },
      ]);
      udrQuery.findMany.mockResolvedValue([]);
      drQuery.findMany.mockResolvedValue([rewardDay1]);

      const now = new Date();
      udrQuery.create.mockResolvedValue({ id: 999, claimedAt: now });
      psQuery.update.mockResolvedValue({});
      txQuery.create.mockClear();
      txQuery.create.mockResolvedValue({});

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::daily-reward.daily-reward")
          return [rewardDay1, makeDailyReward(2, "tickets", 200)];
        return [];
      });

      const res = await controller.claim(mockCtx(user));
      expect(res.playerStats.coins).toBe(150);

      // Verify transaction was logged
      const txCalls = txQuery.create.mock.calls;
      expect(txCalls.length).toBe(1);
      expect(txCalls[0][0].data.users_permissions_user).toBe(user.id);
      expect(txCalls[0][0].data.amountDelivered).toBe(100);
      expect(txCalls[0][0].data.currency).toBe("coins");
      expect(txCalls[0][0].data.transactionType).toBe("daily_reward");
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

    const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
    const udrQuery = strapi.db.query(
      "api::user-daily-reward.user-daily-reward",
    ) as any;
    const drQuery = strapi.db.query("api::daily-reward.daily-reward") as any;

    psQuery.findOne.mockResolvedValue({ id: 1, coins: 100, tickets: 0 });
    strapi.db.mockTrx.select.mockResolvedValue([
      { id: 1, coins: 100, tickets: 0 },
    ]);

    udrQuery.findMany.mockResolvedValue([
      {
        ...claimed,
        daily_reward: rewardDay1,
        claimedAt: yesterday,
      },
    ]);

    // No reward for next day
    drQuery.findMany.mockResolvedValue([]);

    const res = await controller.claim(mockCtx(user));
    expect(res.status).toBe(400);
    expect(res.message).toMatch(/No reward available/i);
  });

  test("bloquea reclamo si falla el registro de la transacción y hace rollback", async () => {
    const rewardDay1 = makeDailyReward(1, "coins", 100);

    const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
    const udrQuery = strapi.db.query(
      "api::user-daily-reward.user-daily-reward",
    ) as any;
    const drQuery = strapi.db.query("api::daily-reward.daily-reward") as any;
    const txQuery = strapi.db.query(
      "api::user-transaction-history.user-transaction-history",
    ) as any;

    const beforeStat = makePlayerStat(user.id, 100, 0, 100, 0);
    psQuery.findOne.mockResolvedValue(beforeStat);
    strapi.db.mockTrx.select.mockResolvedValue([
      {
        id: beforeStat.id,
        coins: 100,
        tickets: 0,
        coins_earned: 100,
        tickets_earned: 0,
      },
    ]);

    udrQuery.findMany.mockResolvedValue([]);
    drQuery.findMany.mockResolvedValue([rewardDay1]);

    const createdClaimId = 999;
    udrQuery.create.mockResolvedValue({
      id: createdClaimId,
      claimedAt: new Date(),
    });
    psQuery.update.mockResolvedValue({});

    // Make transaction log fail
    txQuery.create.mockRejectedValue(
      new Error("create transaction history failed"),
    );

    const res = await controller.claim(mockCtx(user));

    // Transaction error is caught and rolled back automatically by Strapi's transaction
    expect(res.status).toBe(400);
    // The error is now generic since Strapi's transaction handles rollback
    expect(res.data?.reason).toBe("transaction_error");
  });
});
