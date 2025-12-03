/**
 * Lifecycle hooks for user-reward content type
 * Automatically initializes canBeClaimed and hasClaim fields for consumable rewards
 */

export default {
  async beforeCreate(event) {
    const { data } = event.params;

    // Get the reward to check its type
    if (data.reward) {
      try {
        let reward;
        
        // Check if data.reward is a string (documentId) or number (id) or object (connect)
        if (typeof data.reward === 'string') {
             reward = await strapi.entityService.findOne(
                "api::reward.reward",
                data.reward,
              );
        } else if (typeof data.reward === 'number') {
             // Fallback for numeric IDs (though v5 prefers documentId)
             reward = await strapi.db.query("api::reward.reward").findOne({
                 where: { id: data.reward }
             });
        } else if (typeof data.reward === 'object' && data.reward.connect && data.reward.connect.length > 0) {
             // Handle connect syntax { connect: [{ id: ... }] } or { connect: [id] }
             const connectId = data.reward.connect[0]?.id || data.reward.connect[0];
             if (connectId) {
                 reward = await strapi.db.query("api::reward.reward").findOne({
                     where: { id: connectId } // Usually connect uses ID, but could be docId. db.query handles ID well.
                 });
                 
                 if (!reward) {
                      // Try as documentId
                      reward = await strapi.db.query("api::reward.reward").findOne({
                         where: { documentId: connectId }
                     });
                 }
             }
        }

        // If it's a consumable reward, initialize claim fields
        if (reward && reward.typeReward === "consumable") {
          data.canBeClaimed = true;
          data.hasClaim = false;
          strapi.log.info(`[UserReward Lifecycle] Initialized claim fields for reward ${reward.documentId}`);
        }
      } catch (error) {
        strapi.log.error("[UserReward Lifecycle] Error initializing claim fields:", error);
      }
    }
  },
};
