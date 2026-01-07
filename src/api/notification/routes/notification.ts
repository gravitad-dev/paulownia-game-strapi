export default {
  routes: [
    {
      method: "GET",
      path: "/notifications",
      handler: "notification.getAll",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "POST",
      path: "/notifications/mark-all-read",
      handler: "notification.markAllAsRead",
    },
    {
      method: "POST",
      path: "/notifications/:id/mark-read",
      handler: "notification.markAsRead",
    },
  ],
};
