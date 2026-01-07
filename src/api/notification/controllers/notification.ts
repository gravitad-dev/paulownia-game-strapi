/**
 * Notification controller
 * Handles all notification-related endpoints with persistent storage
 */

export default {
  /**
   * GET /api/notifications
   * Returns all notifications for the authenticated user with pagination
   */
  async getAll(ctx) {
    try {
      if (!ctx.state.user) {
        return ctx.unauthorized("You must be logged in to view notifications");
      }

      const userId = ctx.state.user.id;
      const page = parseInt(ctx.query.page as string) || 1;
      const pageSize = parseInt(ctx.query.pageSize as string) || 25;

      // Get notifications from database
      const [notifications, totalCount] = await Promise.all([
        strapi.db.query("api::notification.notification").findMany({
          where: { user: userId },
          orderBy: { createdAt: "desc" },
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        strapi.db.query("api::notification.notification").count({
          where: { user: userId },
        }),
      ]);

      // Get counts
      const [unreadCount, readCount] = await Promise.all([
        strapi.db.query("api::notification.notification").count({
          where: { user: userId, read: false },
        }),
        strapi.db.query("api::notification.notification").count({
          where: { user: userId, read: true },
        }),
      ]);

      // Separate into read and unread within current page
      const unread = notifications.filter((n) => !n.read);
      const read = notifications.filter((n) => n.read);

      // Calculate pagination
      const pageCount = Math.ceil(totalCount / pageSize);

      ctx.body = {
        data: {
          unread,
          read,
        },
        meta: {
          hasNotifications: totalCount > 0,
          unreadCount,
          readCount,
          totalCount,
          pagination: {
            page,
            pageSize,
            pageCount,
            total: totalCount,
          },
        },
      };
    } catch (error) {
      strapi.log.error("Error fetching notifications:", error);
      ctx.badRequest("Failed to fetch notifications");
    }
  },

  /**
   * POST /api/notifications/:id/mark-read
   * Marks a specific notification as read
   */
  async markAsRead(ctx) {
    try {
      if (!ctx.state.user) {
        return ctx.unauthorized("You must be logged in");
      }

      const userId = ctx.state.user.id;
      const notificationId = ctx.params.id;

      if (!notificationId) {
        return ctx.badRequest("Notification ID is required");
      }

      // Verify notification belongs to user
      const notification = await strapi.db
        .query("api::notification.notification")
        .findOne({
          where: { id: notificationId, user: userId },
        });

      if (!notification) {
        return ctx.notFound("Notification not found");
      }

      // Update notification
      await strapi.db.query("api::notification.notification").update({
        where: { id: notificationId },
        data: {
          read: true,
          readAt: new Date(),
        },
      });

      ctx.body = {
        ok: true,
        message: "Notification marked as read",
      };
    } catch (error) {
      strapi.log.error("Error marking notification as read:", error);
      ctx.badRequest("Failed to mark notification as read");
    }
  },

  /**
   * POST /api/notifications/mark-all-read
   * Marks all current notifications as read
   */
  async markAllAsRead(ctx) {
    try {
      if (!ctx.state.user) {
        return ctx.unauthorized("You must be logged in");
      }

      const userId = ctx.state.user.id;

      // First get IDs of unread notifications for this user
      const unreadNotifications = await strapi.db
        .query("api::notification.notification")
        .findMany({
          where: { user: userId, read: false },
          select: ["id"],
        });

      if (unreadNotifications.length > 0) {
        const ids = unreadNotifications.map((n) => n.id);

        // Update them in bulk using their IDs
        await strapi.db.query("api::notification.notification").updateMany({
          where: { id: { $in: ids } },
          data: {
            read: true,
            readAt: new Date(),
          },
        });
      }

      const totalCount = await strapi.db
        .query("api::notification.notification")
        .count({ where: { user: userId } });

      ctx.body = {
        ok: true,
        message: `Marked all notifications as read`,
        count: totalCount,
      };
    } catch (error) {
      strapi.log.error("Error marking all notifications as read:", error);
      ctx.badRequest("Failed to mark all notifications as read");
    }
  },
};
