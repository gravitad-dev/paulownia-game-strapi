import { createStrapiMock } from "../helpers/strapi-mock";
import { mockCtx } from "../helpers/ctx-mock";
import { makePlayerStat } from "../helpers/factory";

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (_uid: string, builder: any) =>
      builder({ strapi: (global as any).strapi }),
  },
}));

jest.mock("../../src/helpers/uuidApi", () => ({
  getUuidControllerMethods: () => ({}),
}));

jest.mock("../../src/helpers/probabilityHelper", () => ({
  weightedRandomSelection: jest.fn(),
}));

describe("Reward Controller - Spin Endpoint", () => {
  let controller: any;
  let strapi: ReturnType<typeof createStrapiMock>;
  let weightedRandomSelection: jest.Mock;
  const user = { id: 1, documentId: "user-doc-1" };

  beforeEach(async () => {
    strapi = createStrapiMock();
    (global as any).strapi = strapi;
    jest.resetModules();
    
    const probabilityHelper = await import("../../src/helpers/probabilityHelper");
    weightedRandomSelection = probabilityHelper.weightedRandomSelection as jest.Mock;
    
    controller = (await import("../../src/api/reward/controllers/reward")).default;
  });

  const makeReward = (
    id: number,
    name: string,
    typeReward: string,
    value: number,
    probability: number,
    quantity: number,
    isUnique = false
  ) => ({
    id,
    documentId: `reward-doc-${id}`,
    uuid: `reward-uuid-${id}`,
    name,
    description: `Description for ${name}`,
    typeReward,
    value,
    probability,
    quantity,
    isActive: true,
    isUnique,
    image: null,
  });

  const makeUserReward = (userId: number, rewardId: number, status: string, claimed: boolean) => ({
    id: Math.floor(Math.random() * 1000),
    documentId: `user-reward-doc-${Math.floor(Math.random() * 1000)}`,
    uuid: `user-reward-uuid-${Math.floor(Math.random() * 1000)}`,
    users_permissions_user: userId,
    reward: rewardId,
    rewardStatus: status,
    claimed,
    obtainedAt: new Date(),
    claimedAt: claimed ? new Date() : null,
    quantity: 1,
  });

  describe("Authentication & Validation", () => {
    test("returns 401 if user is not authenticated", async () => {
      const res = await controller.spin(mockCtx());
      expect(res.status).toBe(401);
      expect(res.data?.reason).toBe("unauthorized");
      expect(res.message).toMatch(/Unauthorized/i);
    });

    test("returns 400 if user has insufficient tickets", async () => {
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 100, 0, 0, 0));

      const res = await controller.spin(mockCtx(user));
      expect(res.status).toBe(400);
      expect(res.data?.reason).toBe("insufficient_tickets");
      expect(res.data?.ticketsAvailable).toBe(0);
      expect(res.message).toMatch(/Insufficient tickets/i);
    });

    test("returns 400 if no player stats exist", async () => {
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(null);

      const res = await controller.spin(mockCtx(user));
      expect(res.status).toBe(400);
      expect(res.data?.reason).toBe("insufficient_tickets");
    });

    test("returns 400 if no rewards are available", async () => {
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 100, 10, 0, 0));

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::reward.reward") return [];
        if (uid === "api::user-reward.user-reward") return [];
        return [];
      });

      const res = await controller.spin(mockCtx(user));
      expect(res.status).toBe(400);
      expect(res.data?.reason).toBe("no_rewards_available");
    });

    test("returns 400 if all rewards have quantity 0", async () => {
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 100, 10, 0, 0));

      // Since the query filters by quantity > 0, rewards with quantity 0 won't be returned
      // So this simulates all rewards being out of stock
      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::reward.reward") return []; // No rewards with quantity > 0
        if (uid === "api::user-reward.user-reward") return [];
        return [];
      });

      const res = await controller.spin(mockCtx(user));
      expect(res.status).toBe(400);
      expect(res.data?.reason).toBe("no_rewards_available");
    });

    test("returns 400 if all unique rewards already obtained", async () => {
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue(makePlayerStat(user.id, 100, 10, 0, 0));

      const rewards = [
        makeReward(1, "Avatar Dorado", "cosmetic", 0, 50, 5, true),
        makeReward(2, "Tema Oscuro", "cosmetic", 0, 50, 5, true),
      ];

      const userRewards = [
        { reward: { id: 1, isUnique: true } },
        { reward: { id: 2, isUnique: true } },
      ];

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::reward.reward") return rewards;
        if (uid === "api::user-reward.user-reward") return userRewards;
        return [];
      });

      const res = await controller.spin(mockCtx(user));
      expect(res.status).toBe(400);
      expect(res.data?.reason).toBe("all_unique_rewards_obtained");
    });
  });

  describe("Currency Rewards", () => {
    test("successfully spins and wins currency reward (coins)", async () => {
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      const initialStats = makePlayerStat(user.id, 1000, 10, 500, 5);
      psQuery.findOne.mockResolvedValueOnce(initialStats);

      const rewards = [
        makeReward(1, "100 Coins", "currency", 100, 40, 50),
        makeReward(2, "500 Coins", "currency", 500, 25, 30),
      ];

      const selectedReward = rewards[0];
      weightedRandomSelection.mockReturnValue(selectedReward);

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::reward.reward") return rewards;
        if (uid === "api::user-reward.user-reward") return [];
        return [];
      });

      const createdUserReward = {
        uuid: "new-user-reward-uuid",
        rewardStatus: "claimed",
        claimed: true,
        obtainedAt: new Date(),
        claimedAt: new Date(),
        quantity: 100,
      };

      strapi.entityService.create.mockResolvedValueOnce(createdUserReward);
      strapi.entityService.create.mockResolvedValueOnce({});

      const updatedStats = makePlayerStat(user.id, 1100, 9, 600, 5);
      psQuery.findOne.mockResolvedValueOnce(updatedStats);

      const res = await controller.spin(mockCtx(user));

      expect(res.reward).toBeDefined();
      expect(res.reward.name).toBe("100 Coins");
      expect(res.reward.value).toBe(100);
      expect(res.userReward).toBeDefined();
      expect(res.userReward.rewardStatus).toBe("claimed");
      expect(res.userReward.claimed).toBe(true);
      expect(res.playerStats.coins).toBe(1100);
      expect(res.playerStats.tickets).toBe(9);

      // Verify ticket was deducted
      expect(strapi.entityService.update).toHaveBeenCalledWith(
        "api::player-stat.player-stat",
        initialStats.id,
        expect.objectContaining({
          data: { tickets: 9, ticketsSpent: 1 },
        })
      );

      // Verify stock was updated
      expect(strapi.entityService.update).toHaveBeenCalledWith(
        "api::reward.reward",
        selectedReward.id,
        expect.objectContaining({
          data: { quantity: 49 },
        })
      );

      // Verify roulette history was created
      expect(strapi.entityService.create).toHaveBeenCalledWith(
        "api::roulette-history.roulette-history",
        expect.objectContaining({
          data: expect.objectContaining({
            users_permissions_user: user.id,
            reward: selectedReward.id,
          }),
        })
      );
    });

    test("successfully spins and wins currency reward (tickets)", async () => {
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      const initialStats = makePlayerStat(user.id, 1000, 10, 500, 5);
      psQuery.findOne.mockResolvedValueOnce(initialStats);

      const rewards = [
        makeReward(1, "5 Tickets", "currency", 5, 40, 25),
      ];

      const selectedReward = rewards[0];
      weightedRandomSelection.mockReturnValue(selectedReward);

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::reward.reward") return rewards;
        if (uid === "api::user-reward.user-reward") return [];
        return [];
      });

      strapi.entityService.create.mockResolvedValue({
        uuid: "new-user-reward-uuid",
        rewardStatus: "claimed",
        claimed: true,
        obtainedAt: new Date(),
        claimedAt: new Date(),
        quantity: 5,
      });

      const updatedStats = makePlayerStat(user.id, 1000, 14, 500, 10);
      psQuery.findOne.mockResolvedValueOnce(updatedStats);

      const res = await controller.spin(mockCtx(user));

      expect(res.reward.name).toBe("5 Tickets");
      expect(res.playerStats.tickets).toBe(14);
      expect(res.userReward.claimed).toBe(true);
    });
  });

  describe("Consumable Rewards", () => {
    test("successfully spins and wins consumable reward", async () => {
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      const initialStats = makePlayerStat(user.id, 1000, 10, 500, 5);
      psQuery.findOne.mockResolvedValueOnce(initialStats);

      const rewards = [
        makeReward(1, "Gift Card $10", "consumable", 10, 40, 5),
      ];

      const selectedReward = rewards[0];
      weightedRandomSelection.mockReturnValue(selectedReward);

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::reward.reward") return rewards;
        if (uid === "api::user-reward.user-reward") return [];
        return [];
      });

      const createdUserReward = {
        uuid: "new-user-reward-uuid",
        rewardStatus: "pending",
        claimed: false,
        obtainedAt: new Date(),
        claimedAt: null,
        quantity: 1,
      };

      strapi.entityService.create.mockResolvedValueOnce(createdUserReward);
      strapi.entityService.create.mockResolvedValueOnce({});

      const updatedStats = makePlayerStat(user.id, 1000, 9, 500, 5);
      psQuery.findOne.mockResolvedValueOnce(updatedStats);

      const res = await controller.spin(mockCtx(user));

      expect(res.reward.name).toBe("Gift Card $10");
      expect(res.userReward.rewardStatus).toBe("pending");
      expect(res.userReward.claimed).toBe(false);
      expect(res.userReward.claimedAt).toBeNull();
      expect(res.playerStats.tickets).toBe(9);

      // Verify user-reward was created with correct status
      expect(strapi.entityService.create).toHaveBeenCalledWith(
        "api::user-reward.user-reward",
        expect.objectContaining({
          data: expect.objectContaining({
            rewardStatus: "pending",
            claimed: false,
            quantity: 1,
          }),
        })
      );
    });
  });

  describe("Cosmetic Rewards", () => {
    test("returns 501 for cosmetic rewards (not implemented)", async () => {
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      const initialStats = makePlayerStat(user.id, 1000, 10, 500, 5);
      psQuery.findOne.mockResolvedValueOnce(initialStats);

      const rewards = [
        makeReward(1, "Avatar Dorado", "cosmetic", 0, 40, 3, true),
      ];

      const selectedReward = rewards[0];
      weightedRandomSelection.mockReturnValue(selectedReward);

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::reward.reward") return rewards;
        if (uid === "api::user-reward.user-reward") return [];
        return [];
      });

      strapi.entityService.update.mockResolvedValue({});
      strapi.entityService.create.mockResolvedValue({
        uuid: "new-user-reward-uuid",
        rewardStatus: "available",
        claimed: false,
        obtainedAt: new Date(),
        claimedAt: null,
        quantity: 1,
      });

      const res = await controller.spin(mockCtx(user));

      expect(res.status).toBe(501);
      expect(res.data?.reason).toBe("cosmetic_not_implemented");
      expect(res.message).toMatch(/Cosmetic rewards not yet implemented/i);

      // Verify user-reward was still created
      expect(strapi.entityService.create).toHaveBeenCalledWith(
        "api::user-reward.user-reward",
        expect.objectContaining({
          data: expect.objectContaining({
            rewardStatus: "available",
            claimed: false,
          }),
        })
      );
    });
  });

  describe("Unique Rewards Logic", () => {
    test("filters out unique rewards already obtained by user", async () => {
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValueOnce(makePlayerStat(user.id, 1000, 10, 500, 5));

      const rewards = [
        makeReward(1, "Avatar Dorado", "cosmetic", 0, 40, 3, true),
        makeReward(2, "100 Coins", "currency", 100, 60, 50, false),
      ];

      const userRewards = [
        { reward: { id: 1, isUnique: true } }, // Already has unique reward 1
      ];

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::reward.reward") return rewards;
        if (uid === "api::user-reward.user-reward") return userRewards;
        return [];
      });

      const selectedReward = rewards[1]; // Should select the non-unique one
      weightedRandomSelection.mockReturnValue(selectedReward);

      strapi.entityService.create.mockResolvedValue({
        uuid: "new-user-reward-uuid",
        rewardStatus: "claimed",
        claimed: true,
        obtainedAt: new Date(),
        claimedAt: new Date(),
        quantity: 100,
      });

      psQuery.findOne.mockResolvedValueOnce(makePlayerStat(user.id, 1100, 9, 600, 5));

      const res = await controller.spin(mockCtx(user));

      expect(res.reward.name).toBe("100 Coins");

      // Verify weightedRandomSelection was called with filtered rewards (only non-unique)
      expect(weightedRandomSelection).toHaveBeenCalledWith(
        [rewards[1]], // Only the non-unique reward
        expect.any(Function)
      );
    });

    test("allows obtaining non-unique rewards multiple times", async () => {
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValueOnce(makePlayerStat(user.id, 1000, 10, 500, 5));

      const rewards = [
        makeReward(1, "100 Coins", "currency", 100, 100, 50, false),
      ];

      const userRewards = [
        { reward: { id: 1, isUnique: false } }, // Already has this reward but it's not unique
      ];

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::reward.reward") return rewards;
        if (uid === "api::user-reward.user-reward") return userRewards;
        return [];
      });

      weightedRandomSelection.mockReturnValue(rewards[0]);

      strapi.entityService.create.mockResolvedValue({
        uuid: "new-user-reward-uuid",
        rewardStatus: "claimed",
        claimed: true,
        obtainedAt: new Date(),
        claimedAt: new Date(),
        quantity: 100,
      });

      psQuery.findOne.mockResolvedValueOnce(makePlayerStat(user.id, 1100, 9, 600, 5));

      const res = await controller.spin(mockCtx(user));

      expect(res.reward.name).toBe("100 Coins");
      // Should allow obtaining the same non-unique reward again
      expect(weightedRandomSelection).toHaveBeenCalledWith(
        rewards,
        expect.any(Function)
      );
    });
  });

  describe("Stock Management", () => {
    test("decreases reward stock by 1 after spin", async () => {
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValueOnce(makePlayerStat(user.id, 1000, 10, 500, 5));

      const rewards = [
        makeReward(1, "100 Coins", "currency", 100, 100, 50),
      ];

      weightedRandomSelection.mockReturnValue(rewards[0]);

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::reward.reward") return rewards;
        if (uid === "api::user-reward.user-reward") return [];
        return [];
      });

      strapi.entityService.create.mockResolvedValue({});
      psQuery.findOne.mockResolvedValueOnce(makePlayerStat(user.id, 1100, 9, 600, 5));

      await controller.spin(mockCtx(user));

      expect(strapi.entityService.update).toHaveBeenCalledWith(
        "api::reward.reward",
        rewards[0].id,
        expect.objectContaining({
          data: { quantity: 49 },
        })
      );
    });

    test("returns correct remaining stock in response", async () => {
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValueOnce(makePlayerStat(user.id, 1000, 10, 500, 5));

      const rewards = [
        makeReward(1, "100 Coins", "currency", 100, 100, 50),
      ];

      weightedRandomSelection.mockReturnValue(rewards[0]);

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::reward.reward") return rewards;
        if (uid === "api::user-reward.user-reward") return [];
        return [];
      });

      strapi.entityService.create.mockResolvedValue({});
      psQuery.findOne.mockResolvedValueOnce(makePlayerStat(user.id, 1100, 9, 600, 5));

      const res = await controller.spin(mockCtx(user));

      expect(res.reward.quantity).toBe(49); // 50 - 1
    });
  });

  describe("Probability Selection", () => {
    test("calls weightedRandomSelection with correct parameters", async () => {
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValueOnce(makePlayerStat(user.id, 1000, 10, 500, 5));

      const rewards = [
        makeReward(1, "100 Coins", "currency", 100, 40, 50),
        makeReward(2, "500 Coins", "currency", 500, 25, 30),
        makeReward(3, "1000 Coins", "currency", 1000, 15, 20),
      ];

      weightedRandomSelection.mockReturnValue(rewards[0]);

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::reward.reward") return rewards;
        if (uid === "api::user-reward.user-reward") return [];
        return [];
      });

      strapi.entityService.create.mockResolvedValue({});
      psQuery.findOne.mockResolvedValueOnce(makePlayerStat(user.id, 1100, 9, 600, 5));

      await controller.spin(mockCtx(user));

      expect(weightedRandomSelection).toHaveBeenCalledWith(
        rewards,
        expect.any(Function)
      );

      // Test the weight function
      const weightFn = weightedRandomSelection.mock.calls[0][1];
      expect(weightFn(rewards[0])).toBe(40);
      expect(weightFn(rewards[1])).toBe(25);
      expect(weightFn(rewards[2])).toBe(15);
    });

    test("returns 400 if probability selection fails", async () => {
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValueOnce(makePlayerStat(user.id, 1000, 10, 500, 5));

      const rewards = [
        makeReward(1, "100 Coins", "currency", 100, 40, 50),
      ];

      weightedRandomSelection.mockReturnValue(null); // Selection failed

      strapi.entityService.findMany.mockImplementation((uid: string) => {
        if (uid === "api::reward.reward") return rewards;
        if (uid === "api::user-reward.user-reward") return [];
        return [];
      });

      const res = await controller.spin(mockCtx(user));

      expect(res.status).toBe(400);
      expect(res.data?.reason).toBe("probability_selection_failed");
    });
  });
});
