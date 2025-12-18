/**
 * reward-claim lifecycles
 * Automatically create notifications when claim status changes
 */

module.exports = {
  /**
   * After create: Create notification for new claim
   */
  async afterCreate(event) {
    const { result } = event;
    try {
      await strapi
        .service("api::notification.notification")
        .createRewardClaimNotification(result);

      strapi.log.info(
        `Notification created for new claim ${result.id} - status: ${result.claimStatus}`,
      );
    } catch (error) {
      strapi.log.error("Error in reward-claim afterCreate lifecycle:", error);
    }
  },

  async afterUpdate(event) {
    const { result, params } = event;

    // Only if claimStatus was updated
    if (params.data.claimStatus && result) {
      try {
        // If claim was approved (delivered), update associated user-reward to claimed
        if (result.claimStatus === "delivered") {
          const claim = await strapi.db
            .query("api::reward-claim.reward-claim")
            .findOne({
              where: { id: result.id },
              populate: ["user_reward"],
            });

          if (claim?.user_reward) {
            await strapi.db.query("api::user-reward.user-reward").update({
              where: { id: claim.user_reward.id },
              data: {
                rewardStatus: "claimed",
                claimed: true,
                claimedAt: new Date(),
              },
            });

            strapi.log.info(
              `UserReward ${claim.user_reward.id} marked as claimed (claim ${result.id} approved)`,
            );
          }
        }

        // Create notification for status change
        await strapi
          .service("api::notification.notification")
          .createRewardClaimNotification(result);

        strapi.log.info(
          `Notification created for claim ${result.id} - status: ${result.claimStatus}`,
        );
      } catch (error) {
        strapi.log.error("Error in reward-claim lifecycle:", error);
      }
    }
  },
};
