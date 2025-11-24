export default {
  routes: [
    {
      method: 'GET',
      path: '/daily-rewards/my-status',
      handler: 'daily-reward.myStatus',
    },
    {
      method: 'POST',
      path: '/daily-rewards/claim',
      handler: 'daily-reward.claim',
    },
  ],
};
