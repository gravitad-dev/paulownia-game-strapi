import { autoUuid } from './lifecycles/autoUuid';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) { },
  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: any }) {
    strapi.log.info(`CRON_RESET_DAY ${process.env.CRON_RESET_DAY ?? '1'}`)
    strapi.db.lifecycles.subscribe(autoUuid);

    // Seed Daily Rewards if empty
    const count = await strapi.entityService.count('api::daily-reward.daily-reward');
    if (count === 0) {
      strapi.log.info('Seeding Daily Rewards...');
      const rewards = [
        { day: 1, rewardType: 'coins', rewardAmount: 100, name: 'Day 1 Reward' },
        { day: 2, rewardType: 'coins', rewardAmount: 200, name: 'Day 2 Reward' },
        { day: 3, rewardType: 'coins', rewardAmount: 300, name: 'Day 3 Reward' },
        { day: 4, rewardType: 'coins', rewardAmount: 400, name: 'Day 4 Reward' },
        { day: 5, rewardType: 'coins', rewardAmount: 500, name: 'Day 5 Reward' },
        { day: 6, rewardType: 'coins', rewardAmount: 600, name: 'Day 6 Reward' },
        { day: 7, rewardType: 'tickets', rewardAmount: 1, name: 'Day 7 Big Reward' },
      ];

      for (const reward of rewards) {
        await strapi.entityService.create('api::daily-reward.daily-reward', {
          data: {
            ...reward,
            isActive: true,
          },
        });
      }
      strapi.log.info('Daily Rewards seeded successfully.');
    }
  },
};

