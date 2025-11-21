import { factories } from "@strapi/strapi";
import { getUuidControllerMethods } from "../../../helpers/uuidApi";

export default factories.createCoreController(
  "api::daily-reward.daily-reward",
  ({ strapi }) => ({
    ...getUuidControllerMethods("api::daily-reward.daily-reward"),
    async myStatus(ctx) {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
      }

      // Get all claimed rewards for this user
      const claimedRewardsRaw = await strapi.entityService.findMany(
        "api::user-daily-reward.user-daily-reward",
        {
          filters: {
            users_permissions_user: user.id,
          },
          populate: ["daily_reward"],
          sort: { claimedAt: "desc" }, // Latest first
        },
      );

      // Filter out any potential corrupted records where daily_reward might be null
      const claimedRewards = claimedRewardsRaw
        ? claimedRewardsRaw.filter((cr: any) => cr.daily_reward)
        : [];

      let nextDay = 1;
      let canClaim = true;
      let lastClaimedDate = null;
      let nextClaimDate = null;

      if (claimedRewards.length > 0) {
        const lastReward = claimedRewards[0] as any;
        const lastRewardDay = lastReward.daily_reward.day;

        nextDay = lastRewardDay + 1;
        lastClaimedDate = new Date(lastReward.claimedAt);

        // Check if claimed today
        const today = new Date();
        const isClaimedToday =
          lastClaimedDate.getDate() === today.getDate() &&
          lastClaimedDate.getMonth() === today.getMonth() &&
          lastClaimedDate.getFullYear() === today.getFullYear();

        if (isClaimedToday) {
          canClaim = false;
          const d = new Date(lastClaimedDate);
          nextClaimDate = new Date(new Date(d).setHours(24, 0, 0, 0));
        }
      }

      // Get all daily rewards
      const allRewards = await strapi.entityService.findMany(
        "api::daily-reward.daily-reward",
        {
          sort: { day: "asc" },
          populate: ["image"],
        },
      );

      const claimedIds = new Set(
        (claimedRewards || []).map((cr: any) => cr.daily_reward.id),
      );
      const maxDay = allRewards.reduce(
        (m: number, r: any) => Math.max(m, r.day || 0),
        0,
      );
      const allClaimed =
        allRewards.length > 0 && claimedIds.size === allRewards.length;
      if (allClaimed) {
        nextDay = null;
        canClaim = false;
        nextClaimDate = null;
      } else if (maxDay > 0 && nextDay > maxDay) {
        nextDay = 1;
      }

      // Map rewards with status
      const rewardsList = allRewards.map((reward: any) => {
        const claimedEntry = claimedRewards.find(
          (cr: any) => cr.daily_reward.id === reward.id,
        );
        let status = "locked";

        if (claimedEntry) {
          status = "claimed";
        } else if (nextDay && reward.day === nextDay && canClaim) {
          status = "available";
        } else if (!allClaimed && nextDay && reward.day < nextDay) {
          status = "claimed"; // Fallback for past days within cycle
        }

        return {
          ...reward,
          status,
          image: reward.image,
          claimedAt: claimedEntry?.claimedAt || null,
        };
      });

      // Get current player stats
      const playerStat = await strapi.db
        .query("api::player-stat.player-stat")
        .findOne({
          where: { users_permissions_user: user.id },
        });

      if (canClaim && !nextClaimDate) {
        nextClaimDate = new Date();
      }

      return {
        nextDay,
        canClaim,
        lastClaimedDate,
        nextClaimDate,
        rewards: rewardsList,
        playerStats: {
          coins: playerStat?.coins || 0,
          tickets: playerStat?.tickets || 0,
        },
      };
    },

    async claim(ctx) {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
      }

      // 1. Check status first
      const claimedRewards = await strapi.entityService.findMany(
        "api::user-daily-reward.user-daily-reward",
        {
          filters: {
            users_permissions_user: user.id,
          },
          populate: ["daily_reward"],
          sort: { claimedAt: "desc" },
        },
      );

      let nextDay = 1;
      if (claimedRewards && claimedRewards.length > 0) {
        // Filter out any potential corrupted records where daily_reward might be null
        const validClaimedRewards = claimedRewards.filter(
          (cr: any) => cr.daily_reward,
        );

        if (validClaimedRewards.length > 0) {
          const lastReward = validClaimedRewards[0] as any; // Cast to any to avoid TS error with populated fields
          const lastRewardDay = lastReward.daily_reward.day;
          nextDay = lastRewardDay + 1;

          const lastClaimedDate = new Date(lastReward.claimedAt);
          const today = new Date();
          const isClaimedToday =
            lastClaimedDate.getDate() === today.getDate() &&
            lastClaimedDate.getMonth() === today.getMonth() &&
            lastClaimedDate.getFullYear() === today.getFullYear();

          if (isClaimedToday) {
            return ctx.badRequest("Daily reward already claimed today", {
              reason: "already_claimed_today",
            });
          }
        }
      }

      // 2. Find the reward for nextDay
      const rewards = await strapi.entityService.findMany(
        "api::daily-reward.daily-reward",
        {
          filters: { day: nextDay },
          populate: ["image"],
        },
      );

      if (!rewards || rewards.length === 0) {
        return ctx.badRequest(
          "No reward available for this day (Cycle complete?)",
          { reason: "cycle_complete" },
        );
      }
      const rewardToClaim = rewards[0] as any;

      // 3. Create UserDailyReward entry
      const newClaim = await strapi.entityService.create(
        "api::user-daily-reward.user-daily-reward",
        {
          data: {
            users_permissions_user: user.id,
            daily_reward: rewardToClaim.id,
            claimed: true,
            claimedAt: new Date(),
          },
        },
      );

      // 4. Grant the actual reward (Coins/Tickets)
      const playerStat = await strapi.db
        .query("api::player-stat.player-stat")
        .findOne({
          where: { users_permissions_user: user.id },
        });
      const prevPlayerStat = playerStat ? { ...playerStat } : null;
      let createdPlayerStatId: number | null = null;

      if (playerStat) {
        const updateData: any = {};
        if (rewardToClaim.rewardType === "coins") {
          updateData.coins =
            (playerStat.coins || 0) + rewardToClaim.rewardAmount;
          updateData.coinsEarned =
            (playerStat.coinsEarned || 0) + rewardToClaim.rewardAmount;
        } else if (rewardToClaim.rewardType === "tickets") {
          updateData.tickets =
            (playerStat.tickets || 0) + rewardToClaim.rewardAmount;
          updateData.ticketsEarned =
            (playerStat.ticketsEarned || 0) + rewardToClaim.rewardAmount;
        }

        if (Object.keys(updateData).length > 0) {
          await strapi.entityService.update(
            "api::player-stat.player-stat",
            playerStat.id,
            {
              data: updateData,
            },
          );
        }
      } else {
        // Create player stat if it doesn't exist (should exist usually, but good fallback)
        const createData: any = {
          users_permissions_user: user.id,
          coins: 0,
          tickets: 0,
          coinsEarned: 0,
          ticketsEarned: 0,
        };
        if (rewardToClaim.rewardType === "coins") {
          createData.coins = rewardToClaim.rewardAmount;
          createData.coinsEarned = rewardToClaim.rewardAmount;
        } else if (rewardToClaim.rewardType === "tickets") {
          createData.tickets = rewardToClaim.rewardAmount;
          createData.ticketsEarned = rewardToClaim.rewardAmount;
        }
        const createdPs = await strapi.entityService.create(
          "api::player-stat.player-stat",
          {
            data: createData,
          }
        );
        createdPlayerStatId = (createdPs as any)?.id ?? null;
      }

      // 5. Log Transaction (must succeed)
      try {
        await strapi.entityService.create(
          "api::user-transaction-history.user-transaction-history",
          {
            data: {
              users_permissions_user: user.id,
              amount: rewardToClaim.rewardAmount,
              type: "daily_reward",
              currency: rewardToClaim.rewardType,
              description: `Daily Reward Day ${nextDay}`,
              transactionDate: new Date(),
            },
          },
        );
      } catch (e) {
        try {
          if (newClaim?.id) {
            await strapi.entityService.delete(
              "api::user-daily-reward.user-daily-reward",
              newClaim.id
            );
          }
          if (prevPlayerStat && playerStat?.id) {
            await strapi.entityService.update(
              "api::player-stat.player-stat",
              playerStat.id,
              {
                data: {
                  coins: prevPlayerStat.coins ?? 0,
                  tickets: prevPlayerStat.tickets ?? 0,
                  coinsEarned: prevPlayerStat.coinsEarned ?? 0,
                  ticketsEarned: prevPlayerStat.ticketsEarned ?? 0,
                },
              }
            );
          } else if (!prevPlayerStat && createdPlayerStatId) {
            await strapi.entityService.delete(
              "api::player-stat.player-stat",
              createdPlayerStatId
            );
          }
        } finally {
          return ctx.badRequest("Failed to log daily reward transaction", {
            reason: "transaction_log_failed",
          });
        }
      }

      // 6. Prepare detailed response
      // Get updated player stats
      const updatedPlayerStat = await strapi.db
        .query("api::player-stat.player-stat")
        .findOne({
          where: { users_permissions_user: user.id },
        });

      // Get all rewards to return the full list with updated status
      const allRewardsList = await strapi.entityService.findMany(
        "api::daily-reward.daily-reward",
        {
          sort: { day: "asc" },
          populate: ["image"],
        },
      );

      // We know we just claimed 'nextDay', so nextDay is now nextDay + 1
      const newNextDay = nextDay + 1;
      const newCanClaim = false; // Just claimed, so cannot claim again today

      const rewardsList = allRewardsList.map((reward: any) => {
        let status = "locked";
        // Logic to determine status based on the claim we just did
        if (reward.day <= nextDay) {
          // nextDay was the one we just claimed
          status = "claimed";
        }
        // Future days remain locked
        return {
          ...reward,
          status,
          image: reward.image,
          claimedAt:
            reward.day === nextDay && newClaim ? newClaim.claimedAt : null,
        };
      });

      return {
        claimedReward: {
          day: rewardToClaim.day,
          type: rewardToClaim.rewardType,
          amount: rewardToClaim.rewardAmount,
          name: rewardToClaim.name,
          image: (rewardToClaim as any).image,
          claimedAt: newClaim.claimedAt,
        },
        rewards: rewardsList,
        playerStats: {
          coins: updatedPlayerStat?.coins || 0,
          tickets: updatedPlayerStat?.tickets || 0,
        },
        status: {
          nextDay: newNextDay,
          canClaim: newCanClaim,
          nextClaimDate: new Date(new Date().setHours(24, 0, 0, 0)),
        },
      };
    },
  }),
);
