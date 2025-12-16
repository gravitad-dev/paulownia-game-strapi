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

      let nextDay: number | null = 1;
      let canClaim = true;
      let lastClaimedDate = null;
      let nextClaimDate = null;

      if (claimedRewards.length > 0) {
        const lastReward = claimedRewards[0] as any;

        const lastRewardDay = lastReward.daily_reward.day;

        nextDay = lastRewardDay + 1;
        lastClaimedDate = new Date(lastReward.claimedAt);

        // Check if user already claimed after last 5 AM cutoff
        const { wasClaimedAfterLast5AM, getNext5AMMadrid } = await import(
          "../../../helpers/dailyResetHelper"
        );

        if (wasClaimedAfterLast5AM(lastClaimedDate)) {
          // Already claimed today (after last 5 AM), cannot claim again
          canClaim = false;
          nextClaimDate = getNext5AMMadrid();
        } else {
          // Last claim was before today's 5 AM cutoff, can claim now
          canClaim = true;
          nextClaimDate = new Date(); // Available now
        }
      } else {
        // No claims yet, available immediately
        nextClaimDate = new Date();
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
      } else if (maxDay > 0 && nextDay !== null && nextDay > maxDay) {
        // Cycle complete, wait for reset
        nextDay = null;
        canClaim = false;
        nextClaimDate = null;
      }

      // Map rewards with status
      const rewardsList = allRewards.map((reward: any) => {
        const claimedEntry = claimedRewards.find(
          (cr: any) => cr.daily_reward.id === reward.id,
        );
        let status = "locked";

        if (claimedEntry) {
          status = "claimed";
        } else if (nextDay !== null && reward.day === nextDay && canClaim) {
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

      // Dynamic import helpers
      const { wasClaimedAfterLast5AM, getNext5AMMadrid } = await import(
        "../../../helpers/dailyResetHelper"
      );

      try {
        // === START TRANSACTION ===
        const trxResult = await strapi.db.transaction(async ({ trx }) => {
          // 1. Lock Player Stat (Serializes user)
          let psInitial = await strapi.db
            .query("api::player-stat.player-stat")
            .findOne({ where: { users_permissions_user: user.id } });

          if (!psInitial) {
            // @ts-ignore
            psInitial = await (
              strapi.db.query("api::player-stat.player-stat") as any
            ).create(
              {
                data: {
                  users_permissions_user: user.id,
                  coins: 0,
                  tickets: 0,
                  publishedAt: new Date(),
                },
              },
              { transacting: trx },
            );
          }

          const psTable = strapi.db.metadata.get(
            "api::player-stat.player-stat",
          ).tableName;
          // PESSIMISTIC LOCK: FOR UPDATE
          const lockedPsArr = await trx(psTable)
            .where("id", psInitial.id)
            .forUpdate()
            .select("*");
          const lockedPs = lockedPsArr[0];

          // 2. Check Last Claim (Consistent Read inside Trx)
          // @ts-ignore
          const lastClaims = await (
            strapi.db.query("api::user-daily-reward.user-daily-reward") as any
          ).findMany(
            {
              where: { users_permissions_user: user.id },
              orderBy: { claimedAt: "desc" },
              limit: 1,
              populate: ["daily_reward"],
            },
            { transacting: trx },
          );

          let nextDay = 1;
          let lastClaimedDate: Date | null = null;
          if (lastClaims && lastClaims.length > 0) {
            const last = lastClaims[0];
            if (last.daily_reward) {
              nextDay = last.daily_reward.day + 1;
              lastClaimedDate = new Date(last.claimedAt);
            }
          }

          // 3. Find Reward details (Config read)
          const rewards = await strapi.db
            .query("api::daily-reward.daily-reward")
            .findMany({
              where: { day: nextDay },
              populate: ["image"],
            });

          if (!rewards || rewards.length === 0) {
            throw new Error("CYCLE_COMPLETE");
          }
          const rewardToClaim = rewards[0];

          // 4. Validate 5 AM Rule
          if (lastClaimedDate) {
            if (wasClaimedAfterLast5AM(lastClaimedDate)) {
              const nextDate = getNext5AMMadrid();
              const err: any = new Error("ALREADY_CLAIMED");
              err.details = { nextClaimDate: nextDate };
              throw err;
            }
          }

          // 5. Create Claim (Trx)
          // @ts-ignore
          const newClaim = await (
            strapi.db.query("api::user-daily-reward.user-daily-reward") as any
          ).create(
            {
              data: {
                users_permissions_user: user.id,
                daily_reward: rewardToClaim.id,
                claimed: true,
                claimedAt: new Date(),
                publishedAt: new Date(),
              },
            },
            { transacting: trx },
          );

          // 6. Update Player Stats (Trx)
          const currentCoins = Number(lockedPs.coins || 0);
          const currentTickets = Number(lockedPs.tickets || 0);
          const rewardAmount = Number(rewardToClaim.rewardAmount || 0);

          let newCoins = currentCoins;
          let newTickets = currentTickets;
          let coinsEarned = Number(
            lockedPs.coins_earned || lockedPs.coinsEarned || 0,
          );
          let ticketsEarned = Number(
            lockedPs.tickets_earned || lockedPs.ticketsEarned || 0,
          );

          if (rewardToClaim.rewardType === "coins") {
            newCoins += rewardAmount;
            coinsEarned += rewardAmount;
          } else if (rewardToClaim.rewardType === "tickets") {
            newTickets += rewardAmount;
            ticketsEarned += rewardAmount;
          }

          // @ts-ignore
          await (strapi.db.query("api::player-stat.player-stat") as any).update(
            {
              where: { id: lockedPs.id },
              data: {
                coins: newCoins,
                tickets: newTickets,
                coinsEarned,
                ticketsEarned,
              },
            },
            { transacting: trx },
          );

          // 7. Log Transaction (Trx)
          // @ts-ignore
          await (
            strapi.db.query(
              "api::user-transaction-history.user-transaction-history",
            ) as any
          ).create(
            {
              data: {
                users_permissions_user: user.id,
                transactionType: "daily_reward",
                currency: rewardToClaim.rewardType || "unknown",
                statusTransaction: "completed",
                amountDelivered: rewardAmount,
                executedAt: new Date(),
                publishedAt: new Date(),
              },
            },
            { transacting: trx },
          );

          return {
            rewardToClaim,
            newClaim,
            newCoins,
            newTickets,
            nextDay, // The day just claimed
          };
        });

        // === TRANSACTION SUCCESS ===

        // 8. Prepare UI Response
        const allRewardsList = await strapi.entityService.findMany(
          "api::daily-reward.daily-reward",
          {
            sort: { day: "asc" },
            populate: ["image"],
          },
        );

        const newNextDay = trxResult.nextDay + 1;
        const nextClaimDate = getNext5AMMadrid();

        const rewardsList = allRewardsList.map((reward: any) => {
          let status = "locked";
          if (reward.day <= trxResult.nextDay) {
            status = "claimed";
          }
          return {
            ...reward,
            status,
            image: reward.image,
            claimedAt:
              reward.day === trxResult.nextDay && trxResult.newClaim
                ? trxResult.newClaim.claimedAt
                : null,
          };
        });

        return {
          claimedReward: {
            day: trxResult.rewardToClaim.day,
            type: trxResult.rewardToClaim.rewardType,
            amount: trxResult.rewardToClaim.rewardAmount,
            name: trxResult.rewardToClaim.name,
            image: (trxResult.rewardToClaim as any).image,
            claimedAt: trxResult.newClaim.claimedAt,
          },
          rewards: rewardsList,
          playerStats: {
            coins: trxResult.newCoins,
            tickets: trxResult.newTickets,
          },
          status: {
            nextDay: newNextDay,
            canClaim: false, // Just claimed
            nextClaimDate: nextClaimDate,
          },
        };
      } catch (err: any) {
        if (err.message === "CYCLE_COMPLETE") {
          return ctx.badRequest("No reward available (Cycle complete)", {
            reason: "cycle_complete",
          });
        }
        if (err.message === "ALREADY_CLAIMED") {
          return ctx.badRequest("Daily reward already claimed today", {
            reason: "already_claimed_today",
            nextClaimDate: err.details?.nextClaimDate,
          });
        }
        strapi.log.error(err);
        return ctx.badRequest("Daily reward claim failed", {
          reason: "transaction_error",
        });
      }
    },
  }),
);
