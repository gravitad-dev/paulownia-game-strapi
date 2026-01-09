// @ts-nocheck - Types will be generated after build
/**
 * Notification service
 * Creates and manages persistent notifications in database
 */

export default () => ({
  /**
   * Create notification for available consumable reward
   */
  async createRewardAvailableNotification(userReward) {
    try {
      // Populate reward details
      const populated = await strapi.entityService.findOne(
        "api::user-reward.user-reward",
        userReward.id,
        { populate: ["reward", "users_permissions_user"] },
      );

      // @ts-ignore - Populated types not yet generated
      const reward = populated.reward;

      // Only create for consumable rewards
      // @ts-ignore
      if (!reward || reward.typeReward !== "consumable") {
        return null;
      }

      // Check if user already has this notification (avoid duplicates)
      const existing = await strapi.db
        .query("api::notification.notification")
        .findOne({
          where: {
            // @ts-ignore
            user: populated.users_permissions_user.id,
            relatedEntity: "user-reward",
            relatedEntityId: userReward.id,
            type: "REWARD_AVAILABLE",
          },
        });

      if (existing) {
        return existing;
      }

      // Create notification
      // @ts-ignore - Types will be generated after build
      return await strapi.entityService.create(
        "api::notification.notification",
        {
          data: {
            // @ts-ignore
            user: populated.users_permissions_user.id,
            type: "REWARD_AVAILABLE",
            title: "Premio disponible",
            // @ts-ignore
            message: `Tienes "${reward.name}" disponible para reclamar!`,
            priority: "HIGH",
            read: false,
            metadata: {
              userRewardId: userReward.id,
              rewardName: reward.name,
              rewardStatus: userReward.rewardStatus,
            },
            relatedEntity: "user-reward",
            relatedEntityId: userReward.id,
          },
        },
      );
    } catch (error) {
      strapi.log.error("Error creating reward available notification:", error);
      return null;
    }
  },

  /**
   * Create notification for reward claim status change
   */
  async createRewardClaimNotification(claim) {
    try {
      const messages = {
        pending: {
          title: "Reclamación recibida",
          message:
            "ha sido recibida. Por favor sube los documentos requeridos para continuar.",
          priority: "HIGH",
        },
        processing: {
          title: "Reclamación en proceso",
          message: "está siendo procesada por el equipo de administración.",
          priority: "MEDIUM",
        },
        delivered: {
          title: "¡Reclamación aprobada!",
          message: claim.trackingNumber
            ? `ha sido aprobada y enviada. Tracking: ${claim.trackingNumber}`
            : "ha sido aprobada. El equipo se pondrá en contacto contigo para coordinar la entrega.",
          priority: "HIGH",
        },
        rejected: {
          title: "Reclamación rechazada",
          message: claim.adminNotes
            ? `fue rechazada. Motivo: ${claim.adminNotes}`
            : "fue rechazada. Revisa los detalles",
          priority: "HIGH",
        },
        cancelled: {
          title: "Reclamación cancelada",
          message: "ha sido cancelada",
          priority: "MEDIUM",
        },
      };

      const config = messages[claim.claimStatus];
      if (!config) {
        return null;
      }

      // Get user and reward info
      const populated = await strapi.entityService.findOne(
        "api::reward-claim.reward-claim",
        claim.id,
        {
          populate: [
            "user_reward",
            "user_reward.reward",
            "users_permissions_user",
          ],
        },
      );

      const rewardName = populated.user_reward?.reward?.name || "Premio";
      const userId = populated.users_permissions_user?.id;

      if (!userId) {
        strapi.log.warn(
          `Cannot create notification: no user for claim ${claim.id}`,
        );
        return null;
      }

      // Create notification
      // @ts-ignore - Types will be generated after build
      return await strapi.entityService.create(
        "api::notification.notification",
        {
          data: {
            user: userId,
            type: "REWARD_STATUS_UPDATE",
            title: config.title,
            message: `Tu reclamación de "${rewardName}" ${config.message}`,
            priority: config.priority,
            read: false,
            metadata: {
              claimId: claim.id,
              claimCode: claim.claimCode,
              claimStatus: claim.claimStatus,
              trackingNumber: claim.trackingNumber,
              adminNotes: claim.adminNotes,
              userRewardId: populated.user_reward?.id,
              rewardName,
            },
            relatedEntity: "reward-claim",
            relatedEntityId: claim.id,
          },
        },
      );
    } catch (error) {
      strapi.log.error("Error creating reward claim notification:", error);
      return null;
    }
  },

  /**
   * Create notification when reward status changes to in_claim
   */
  async createRewardInClaimNotification(userReward) {
    try {
      const populated = await strapi.entityService.findOne(
        "api::user-reward.user-reward",
        userReward.id,
        { populate: ["reward", "users_permissions_user"] },
      );

      const reward = populated.reward;
      if (!reward || reward.typeReward !== "consumable") {
        return null;
      }

      return await strapi.entityService.create(
        "api::notification.notification",
        {
          data: {
            user: populated.users_permissions_user.id,
            type: "REWARD_STATUS_UPDATE",
            title: "Premio en trámite",
            message: `Tu "${reward.name}" está en proceso de reclamación.`,
            priority: "MEDIUM",
            read: false,
            metadata: {
              userRewardId: userReward.id,
              rewardName: reward.name,
              rewardStatus: userReward.rewardStatus,
            },
            relatedEntity: "user-reward",
            relatedEntityId: userReward.id,
          },
        },
      );
    } catch (error) {
      strapi.log.error("Error creating in_claim notification:", error);
      return null;
    }
  },

  /**
   * Handle user-reward status changes
   */
  async handleRewardStatusChange(userReward) {
    const status = userReward.rewardStatus;

    if (status === "available" || status === "pending") {
      return await this.createRewardAvailableNotification(userReward);
    } else if (status === "in_claim") {
      // Redundant notification: handled by reward-claim lifecycle
      return null;
    }

    return null;
  },

  /**
   * Create welcome notification for new users
   */
  async createWelcomeNotification(user) {
    try {
      // Check if already exists
      const existing = await strapi.db
        .query("api::notification.notification")
        .findOne({
          where: {
            user: user.id,
            type: "WELCOME",
          },
        });

      if (existing) {
        return existing;
      }

      return await strapi.entityService.create(
        "api::notification.notification",
        {
          data: {
            user: user.id,
            type: "WELCOME",
            title: "Bienvenido a Paulownia",
            message: "Gracias por unirte a nuestra comunidad gamer.",
            priority: "LOW",
            read: false,
            metadata: {
              registeredAt: user.createdAt,
            },
            relatedEntity: "user",
            relatedEntityId: user.id,
          },
        },
      );
    } catch (error) {
      strapi.log.error("Error creating welcome notification:", error);
      return null;
    }
  },
});
