export default {
  routes: [
    {
      method: "POST",
      path: "/levels/:id/unlock",
      handler: "level.unlock",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "POST",
      path: "/levels/uuid/:uuid/unlock",
      handler: "level.unlock",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "GET",
      path: "/levels/my-levels",
      handler: "level.myLevels",
      config: {
        policies: [],
        middlewares: [],
        description: "List all levels with user-specific status",
      },
    },
  ],
};
