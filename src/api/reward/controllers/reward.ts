import { factories } from "@strapi/strapi";
import { getUuidControllerMethods } from "../../../helpers/uuidApi";
import { weightedRandomSelection } from "../../../helpers/probabilityHelper";

export default factories.createCoreController(
  "api::reward.reward",
  ({ strapi }) => ({
    ...getUuidControllerMethods("api::reward.reward"),

    async spin(ctx) {
      // 1. Validate authentication
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
      }

      // 2. Check if user has at least 1 ticket
      const playerStat = await strapi.db
        .query("api::player-stat.player-stat")
        .findOne({
          where: { users_permissions_user: user.id },
        });

      if (!playerStat || (playerStat.tickets || 0) < 1) {
        return ctx.badRequest("Insufficient tickets", {
          reason: "insufficient_tickets",
          ticketsAvailable: playerStat?.tickets || 0,
        });
      }

      // 3. Get available rewards
      const allRewards = await strapi.entityService.findMany(
        "api::reward.reward",
        {
          filters: {
            isActive: true,
            quantity: { $gt: 0 },
          },
          populate: ["image"],
        },
      );

      if (!allRewards || allRewards.length === 0) {
        return ctx.badRequest("No rewards available", {
          reason: "no_rewards_available",
        });
      }

      // 4. Filter out unique rewards already obtained
      const userRewards = await strapi.entityService.findMany(
        "api::user-reward.user-reward",
        {
          filters: {
            users_permissions_user: user.id,
          },
          populate: ["reward"],
        },
      );

      const obtainedUniqueRewardIds = new Set(
        userRewards
          .filter((ur: any) => ur.reward?.isUnique)
          .map((ur: any) => ur.reward.id),
      );

      const availableRewards = allRewards.filter((reward: any) => {
        if (reward.isUnique && obtainedUniqueRewardIds.has(reward.id)) {
          return false;
        }
        return true;
      });

      if (availableRewards.length === 0) {
        return ctx.badRequest(
          "No rewards available (all unique rewards obtained)",
          {
            reason: "all_unique_rewards_obtained",
          },
        );
      }

      // 5. Select reward using weighted probability
      const selectedReward = weightedRandomSelection(
        availableRewards,
        (reward: any) => reward.probability || 0,
      );

      if (!selectedReward) {
        return ctx.badRequest("Failed to select reward", {
          reason: "probability_selection_failed",
        });
      }

      // 6. Process reward and apply atomic player-stat update
      let userReward: any = null;
      const now = new Date();

      const isCoin =
        selectedReward.typeReward === "currency" &&
        selectedReward.name?.toLowerCase().includes("coin");

      const ticketRewardValue =
        selectedReward.typeReward === "currency" && !isCoin
          ? selectedReward.value || 0
          : 0;
      const coinRewardValue = isCoin ? selectedReward.value || 0 : 0;

      await strapi.entityService.update(
        "api::player-stat.player-stat",
        playerStat.id,
        {
          data: {
            // Always spend 1 ticket per spin
            tickets: (playerStat.tickets || 0) - 1 + ticketRewardValue,
            ticketsSpent: (playerStat.ticketsSpent || 0) + 1,
            ticketsEarned: (playerStat.ticketsEarned || 0) + ticketRewardValue,
            // Apply coin rewards if applicable
            ...(coinRewardValue > 0
              ? {
                  coins: (playerStat.coins || 0) + coinRewardValue,
                  coinsEarned: (playerStat.coinsEarned || 0) + coinRewardValue,
                }
              : {}),
          },
        },
      );

      // 7. Update reward stock
      await strapi.entityService.update(
        "api::reward.reward",
        selectedReward.id,
        {
          data: {
            quantity: selectedReward.quantity - 1,
          },
        },
      );

      if (selectedReward.typeReward === "currency") {
        // Create user-reward with claimed status
        userReward = await strapi.entityService.create(
          "api::user-reward.user-reward",
          {
            data: {
              users_permissions_user: user.documentId ?? user.id,
              reward: selectedReward.documentId ?? selectedReward.id,
              rewardStatus: "claimed",
              claimed: true,
              obtainedAt: now,
              claimedAt: now,
              quantity: selectedReward.value || 0,
            },
          },
        );
      } else if (selectedReward.typeReward === "consumable") {
        // Create user-reward with pending status (needs to be claimed with admin)
        userReward = await strapi.entityService.create(
          "api::user-reward.user-reward",
          {
            data: {
              users_permissions_user: user.documentId ?? user.id,
              reward: selectedReward.documentId ?? selectedReward.id,
              rewardStatus: "pending",
              claimed: false,
              obtainedAt: now,
              claimedAt: null,
              quantity: 1,
            },
          },
        );
      } else if (selectedReward.typeReward === "cosmetic") {
        // Create user-reward for future implementation
        userReward = await strapi.entityService.create(
          "api::user-reward.user-reward",
          {
            data: {
              users_permissions_user: user.documentId ?? user.id,
              reward: selectedReward.documentId ?? selectedReward.id,
              rewardStatus: "available",
              claimed: false,
              obtainedAt: now,
              claimedAt: null,
              quantity: 1,
            },
          },
        );

        return ctx.notImplemented("Cosmetic rewards not yet implemented", {
          reason: "cosmetic_not_implemented",
        });
      }

      // 9. Create roulette history entry
      await strapi.entityService.create(
        "api::roulette-history.roulette-history",
        {
          data: {
            users_permissions_user: user.documentId ?? user.id,
            reward: selectedReward.documentId ?? selectedReward.id,
            timestamp: now,
          },
        },
      );

      // 10. Get updated player stats
      const updatedPlayerStat = await strapi.db
        .query("api::player-stat.player-stat")
        .findOne({
          where: { users_permissions_user: user.id },
        });

      // 11. Return response
      return {
        reward: {
          uuid: selectedReward.uuid,
          name: selectedReward.name,
          description: selectedReward.description,
          image: selectedReward.image,
          typeReward: selectedReward.typeReward,
          value: selectedReward.value,
          quantity: selectedReward.quantity - 1, // Already updated
        },
        userReward: {
          uuid: userReward.uuid,
          rewardStatus: userReward.rewardStatus,
          claimed: userReward.claimed,
          obtainedAt: userReward.obtainedAt,
          claimedAt: userReward.claimedAt,
          quantity: userReward.quantity,
        },
        playerStats: {
          coins: updatedPlayerStat?.coins || 0,
          tickets: updatedPlayerStat?.tickets || 0,
        },
      };
    },
  }),
);
