export default {
  routes: [
    {
      method: 'PUT',
      path: '/premium-codes/redeem',
      handler: 'premium-code.redeem',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
