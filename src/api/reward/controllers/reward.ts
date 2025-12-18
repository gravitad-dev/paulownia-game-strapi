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

      // 1.5 Check if user is Premium
      // @ts-ignore
      if (!user.isPremium) {
        return ctx.forbidden("This feature is reserved for Premium members", {
          reason: "premium_required",
        });
      }

      try {
        // Start Database Transaction
        return await strapi.db.transaction(async ({ trx }) => {
          // A. Lock Player Stats Row (Pessimistic Lock)
          // We assume 'api::player-stat.player-stat' maps to a table.
          // We first find the ID to lock efficiently.
          const initialPs = await strapi.db
            .query("api::player-stat.player-stat")
            .findOne({
              where: { users_permissions_user: user.id },
              select: ["id"],
            });

          if (!initialPs) {
            throw new Error("PLAYER_STAT_NOT_FOUND");
          }

          const psMetadata = strapi.db.metadata.get(
            "api::player-stat.player-stat",
          );
          const psTableName = psMetadata.tableName;

          // Perform SELECT ... FOR UPDATE using Knex (trx)
          const lockedStatsArray = await trx(psTableName)
            .where("id", initialPs.id)
            .forUpdate()
            .select("*");

          const lockedStats = lockedStatsArray[0];

          // 2. Check tickets from LOCKED row
          // Note: using Number() to ensure safety
          const currentTickets = Number(lockedStats.tickets || 0);

          if (currentTickets < 1) {
            throw new Error("INSUFFICIENT_TICKETS");
          }

          // 3. Get available rewards (Standard read, no lock needed on rewards listing yet)
          // We use entityService here as we don't need transactional write yet
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
            throw new Error("NO_REWARDS_AVAILABLE");
          }

          // 4. Filter out unique rewards already obtained
          // Read user-rewards inside transaction (optional but better) or standard read
          const userRewards = await strapi.db
            .query("api::user-reward.user-reward")
            .findMany({
              where: { users_permissions_user: user.id },
              populate: ["reward"],
            });

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
            throw new Error("ALL_UNIQUE_OBTAINED");
          }

          // 5. Select reward
          const selectedReward = weightedRandomSelection(
            availableRewards,
            (reward: any) => reward.probability || 0,
          );

          if (!selectedReward) {
            throw new Error("SELECTION_FAILED");
          }

          // 6. Process reward and update stats IN TRANSACTION
          const now = new Date();

          // Logic update: use explicit typeReward
          const isCoin = selectedReward.typeReward === "currency";
          const isTicket = selectedReward.typeReward === "ticket";

          const ticketRewardValue = isTicket ? selectedReward.value || 0 : 0;
          const coinRewardValue = isCoin ? selectedReward.value || 0 : 0;

          const newTickets = currentTickets - 1 + ticketRewardValue;
          const currentCoins = Number(lockedStats.coins || 0);

          // 6. Process reward and apply atomic player-stat update IN TRANSACTION
          // @ts-ignore
          await (strapi.db.query("api::player-stat.player-stat") as any).update(
            {
              where: { id: initialPs.id },
              data: {
                tickets: newTickets,
                ticketsSpent: (Number(lockedStats.tickets_spent) || 0) + 1,
                ticketsEarned:
                  (Number(lockedStats.tickets_earned) ||
                    Number(lockedStats.ticketsEarned) ||
                    0) + ticketRewardValue,
                ...(coinRewardValue > 0
                  ? {
                      coins: currentCoins + coinRewardValue,
                      coinsEarned:
                        (Number(lockedStats.coins_earned) ||
                          Number(lockedStats.coinsEarned) ||
                          0) + coinRewardValue,
                    }
                  : {}),
              },
            },
            { transacting: trx },
          );

          // 7. Update reward stock
          // @ts-ignore
          await (strapi.db.query("api::reward.reward") as any).update(
            {
              where: { id: selectedReward.id },
              data: {
                quantity: selectedReward.quantity - 1,
              },
            },
            { transacting: trx },
          );

          // 8. Create user-reward
          const userRewardData: any = {
            users_permissions_user: user.id,
            reward: selectedReward.id,
            obtainedAt: now,
            quantity: 1,
          };

          if (
            selectedReward.typeReward === "currency" ||
            selectedReward.typeReward === "ticket"
          ) {
            userRewardData.rewardStatus = "claimed";
            userRewardData.claimed = true;
            userRewardData.claimedAt = now;
            userRewardData.quantity = selectedReward.value || 0;
          } else if (selectedReward.typeReward === "consumable") {
            userRewardData.rewardStatus = "available";
            userRewardData.claimed = false;
            userRewardData.canBeClaimed = true;
            userRewardData.hasClaim = false;
          } else {
            userRewardData.rewardStatus = "available";
            userRewardData.claimed = false;
          }

          // @ts-ignore
          const userReward = await (
            strapi.db.query("api::user-reward.user-reward") as any
          ).create(
            {
              data: userRewardData,
            },
            { transacting: trx },
          );

          if (
            selectedReward.typeReward === "cosmetic" &&
            !userRewardData.claimed // Just checking flow
          ) {
            // We allow creation but might warn or handled by frontend
            // Original code returned Not Implemented. We keep it working but secure.
          }

          // 9. History
          // @ts-ignore
          await (
            strapi.db.query("api::roulette-history.roulette-history") as any
          ).create(
            {
              data: {
                users_permissions_user: user.id,
                reward: selectedReward.id,
                timestamp: now,
              },
            },
            { transacting: trx },
          );

          // 10. Return Response
          // Re-fetch updated stats? Or just use what we calculated. Safe to use calculated.
          return {
            reward: {
              uuid: selectedReward.uuid,
              name: selectedReward.name,
              description: selectedReward.description,
              image: selectedReward.image,
              typeReward: selectedReward.typeReward,
              value: selectedReward.value,
              quantity: selectedReward.quantity - 1,
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
              coins:
                coinRewardValue > 0
                  ? currentCoins + coinRewardValue
                  : currentCoins,
              tickets: newTickets,
            },
          };
        });
      } catch (error: any) {
        // Handle Errors properly
        const msg = error.message;
        if (msg === "INSUFFICIENT_TICKETS" || msg === "PLAYER_STAT_NOT_FOUND") {
          return ctx.badRequest("Insufficient tickets", {
            reason: "insufficient_tickets",
            ticketsAvailable: 0,
          });
        }
        if (msg === "NO_REWARDS_AVAILABLE") {
          return ctx.badRequest("No rewards available", {
            reason: "no_rewards_available",
          });
        }
        if (msg === "ALL_UNIQUE_OBTAINED") {
          return ctx.badRequest(
            "No rewards available (all unique rewards obtained)",
            { reason: "all_unique_rewards_obtained" },
          );
        }
        if (msg === "SELECTION_FAILED") {
          return ctx.badRequest("Failed to select reward", {
            reason: "probability_selection_failed",
          });
        }

        // Default error
        strapi.log.error(error);
        throw error;
      }
    },
  }),
);
