export default {
  routes: [
    {
      method: 'GET',
      path: '/achievements/my-achievements',
      handler: 'achievement.myAchievements',
    },
    {
      method: 'POST',
      path: '/achievements/claim',
      handler: 'achievement.claim',
    },
  ],
};
