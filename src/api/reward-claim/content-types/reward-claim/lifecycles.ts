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
        .service('api::notification.notification')
        .createRewardClaimNotification(result);
      
      strapi.log.info(`Notification created for new claim ${result.id} - status: ${result.claimStatus}`);
    } catch (error) {
      strapi.log.error('Error in reward-claim afterCreate lifecycle:', error);
    }
  },

  /**
   * After update: Create notification when claimStatus changes
   */
  async afterUpdate(event) {
    const { result, params } = event;

    // Only if claimStatus was updated
    if (params.data.claimStatus && result) {
      try {
        await strapi
          .service('api::notification.notification')
          .createRewardClaimNotification(result);
        
        strapi.log.info(`Notification created for claim ${result.id} - status: ${result.claimStatus}`);
      } catch (error) {
        strapi.log.error('Error in reward-claim lifecycle:', error);
      }
    }
  },
};
