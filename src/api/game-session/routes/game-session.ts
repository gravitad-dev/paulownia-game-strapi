export default {
  routes: [
    {
      method: "POST",
      path: "/game/start",
      handler: "game-session.start",
      config: {
        policies: [],
        middlewares: [],
        description: "Start a game and return unique hash",
      },
    },
    {
      method: "POST",
      path: "/game/end",
      handler: "game-session.end",
      config: {
        policies: [],
        middlewares: [],
        description: "End a game and update stats",
      },
    },
  ],
};

