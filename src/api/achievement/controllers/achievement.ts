import { factories } from "@strapi/strapi";
import { getUuidControllerMethods } from "../../../helpers/uuidApi";

export default factories.createCoreController(
  "api::achievement.achievement",
  ({ strapi }) => ({
    ...getUuidControllerMethods("api::achievement.achievement"),

    async myAchievements(ctx) {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
      }

      // 1. Extract and validate query params
      const {
        status,
        targetType,
        rewardType,
        sort,
        pagination = {},
      } = ctx.query || {};

      const page = Math.max(1, parseInt((pagination as any).page) || 1);
      const pageSize = Math.min(
        100,
        Math.max(1, parseInt((pagination as any).pageSize) || 25),
      );

      const achievementFilters: any = {
        isActive: true,
        visibleToUser: true,
      };

      if (targetType) {
        achievementFilters.targetType = targetType;
      }

      if (rewardType) {
        achievementFilters.rewardType = rewardType;
      }

      const allAchievements = await strapi.entityService.findMany(
        "api::achievement.achievement",
        {
          filters: achievementFilters,
          populate: ["image"],
        },
      );

      const userAchievements = await strapi.entityService.findMany(
        "api::user-achievement.user-achievement",
        {
          filters: {
            users_permissions_user: user.id,
          },
          populate: ["achievement"],
        },
      );

      const userAchievementMap = new Map();
      (userAchievements || []).forEach((ua: any) => {
        if (ua.achievement) {
          userAchievementMap.set(ua.achievement.id, ua);
        }
      });

      let achievementsList = allAchievements.map((achievement: any) => {
        const userAchievement = userAchievementMap.get(achievement.id);

        let achievementStatus = "locked";
        let currentProgress = 0;
        let obtainedAt = null;
        let claimedAt = null;

        if (userAchievement) {
          currentProgress = userAchievement.currentProgress || 0;
          obtainedAt = userAchievement.obtainedAt;
          claimedAt = userAchievement.claimedAt;

          if (userAchievement.claimed) {
            achievementStatus = "claimed";
          } else if (currentProgress >= achievement.goalAmount) {
            achievementStatus = "completed";
          }
        }

        return {
          ...achievement,
          status: achievementStatus,
          currentProgress: Math.min(currentProgress, achievement.goalAmount),
          obtainedAt,
          claimedAt,
        };
      });

      if (status) {
        achievementsList = achievementsList.filter(
          (a: any) => a.status === status,
        );
      }

      if (sort) {
        const [field, order] = (sort as string).split(":");
        achievementsList.sort((a: any, b: any) => {
          const aVal = a[field];
          const bVal = b[field];

          if (aVal === null || aVal === undefined) return 1;
          if (bVal === null || bVal === undefined) return -1;

          if (order === "desc") {
            return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
          } else {
            return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
          }
        });
      }

      const total = achievementsList.length;
      const pageCount = Math.ceil(total / pageSize);
      const start = (page - 1) * pageSize;
      const end = start + pageSize;

      const paginatedAchievements = achievementsList.slice(start, end);

      const playerStat = await strapi.db
        .query("api::player-stat.player-stat")
        .findOne({
          where: { users_permissions_user: user.id },
        });

      return {
        achievements: paginatedAchievements,
        playerStats: {
          coins: playerStat?.coins || 0,
          tickets: playerStat?.tickets || 0,
        },
        meta: {
          pagination: {
            page,
            pageSize,
            pageCount,
            total,
          },
        },
      };
    },

    async claim(ctx) {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
      }

      const { uuid } = ctx.request?.body || {};
      if (!uuid) {
        return ctx.badRequest("Achievement uuid is required", {
          reason: "missing_achievement_uuid",
        });
      }

      // Find the achievement by uuid
      const achievements = await strapi.entityService.findMany(
        "api::achievement.achievement",
        {
          filters: { uuid },
          populate: ["image"],
        },
      );

      if (!achievements || achievements.length === 0) {
        return ctx.notFound("Achievement not found", {
          reason: "achievement_not_found",
        });
      }

      const achievement = achievements[0] as any;

      const userAchievements = await strapi.entityService.findMany(
        "api::user-achievement.user-achievement",
        {
          filters: {
            users_permissions_user: user.id,
            achievement: {
              uuid: achievement.uuid,
            },
          },
          populate: ["achievement"],
        },
      );

      if (!userAchievements || userAchievements.length === 0) {
        return ctx.badRequest("Achievement is not completed", {
          reason: "achievement_not_completed",
        });
      }

      const isCompleted = userAchievements.some(
        (ua: any) => (ua.currentProgress || 0) >= achievement.goalAmount,
      );
      if (!isCompleted) {
        return ctx.badRequest("Achievement is not completed", {
          reason: "achievement_not_completed",
        });
      }

      const isClaimed = userAchievements.some((ua: any) => ua.claimed);
      if (isClaimed) {
        return ctx.badRequest("Achievement already claimed", {
          reason: "achievement_already_claimed",
        });
      }

      const playerStat = await strapi.db
        .query("api::player-stat.player-stat")
        .findOne({
          where: { users_permissions_user: user.id },
        });

      const prevPlayerStat = playerStat ? { ...playerStat } : null;
      let createdPlayerStatId: number | null = null;

      if (playerStat) {
        const updateData: any = {};
        if (achievement.rewardType === "coins") {
          updateData.coins = (playerStat.coins || 0) + achievement.rewardAmount;
          updateData.coinsEarned =
            (playerStat.coinsEarned || 0) + achievement.rewardAmount;
        } else if (achievement.rewardType === "tickets") {
          updateData.tickets =
            (playerStat.tickets || 0) + achievement.rewardAmount;
          updateData.ticketsEarned =
            (playerStat.ticketsEarned || 0) + achievement.rewardAmount;
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
        const createData: any = {
          users_permissions_user: user.id,
          coins: 0,
          tickets: 0,
          coinsEarned: 0,
          ticketsEarned: 0,
        };
        if (achievement.rewardType === "coins") {
          createData.coins = achievement.rewardAmount;
          createData.coinsEarned = achievement.rewardAmount;
        } else if (achievement.rewardType === "tickets") {
          createData.tickets = achievement.rewardAmount;
          createData.ticketsEarned = achievement.rewardAmount;
        }
        const createdPs = await strapi.entityService.create(
          "api::player-stat.player-stat",
          {
            data: createData,
          },
        );
        createdPlayerStatId = (createdPs as any)?.id ?? null;
      }

      const claimedAt = new Date();
      await Promise.all(
        userAchievements.map((ua: any) =>
          strapi.entityService.update(
            "api::user-achievement.user-achievement",
            ua.id,
            {
              data: {
                claimed: true,
                claimedAt,
              },
            },
          ),
        ),
      );

      try {
        await strapi.entityService.create(
          "api::user-transaction-history.user-transaction-history",
          {
            data: {
              users_permissions_user: user.id,
              amount: achievement.rewardAmount,
              type: "achievement",
              currency: achievement.rewardType,
              description: `Achievement: ${achievement.title}`,
              transactionDate: new Date(),
            },
          },
        );
      } catch (e) {
        try {
          // Revert ALL user achievements
          await Promise.all(
            userAchievements.map((ua: any) =>
              strapi.entityService.update(
                "api::user-achievement.user-achievement",
                ua.id,
                {
                  data: {
                    claimed: false,
                    claimedAt: null,
                  },
                },
              ),
            ),
          );

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
              },
            );
          } else if (!prevPlayerStat && createdPlayerStatId) {
            await strapi.entityService.delete(
              "api::player-stat.player-stat",
              createdPlayerStatId,
            );
          }
        } finally {
          return ctx.badRequest("Failed to log achievement transaction", {
            reason: "transaction_log_failed",
          });
        }
      }

      const updatedPlayerStat = await strapi.db
        .query("api::player-stat.player-stat")
        .findOne({
          where: { users_permissions_user: user.id },
        });

      return {
        claimedAchievement: {
          uuid: achievement.uuid,
          title: achievement.title,
          rewardType: achievement.rewardType,
          rewardAmount: achievement.rewardAmount,
          image: achievement.image,
          claimedAt,
        },
        playerStats: {
          coins: updatedPlayerStat?.coins || 0,
          tickets: updatedPlayerStat?.tickets || 0,
        },
      };
    },
  }),
);
