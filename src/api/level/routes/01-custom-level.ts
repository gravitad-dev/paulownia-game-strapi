export default {
  routes: [
    {
      method: 'POST',
      path: '/levels/:id/unlock',
      handler: 'level.unlock',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
