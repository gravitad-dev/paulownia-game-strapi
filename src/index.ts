import { autoUuid } from "./lifecycles/autoUuid";
import { mediaCleanup } from "./lifecycles/mediaCleanup";

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},
  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: any }) {
    strapi.log.info(`CRON_RESET_DAY ${process.env.CRON_RESET_DAY ?? "1"}`);
    strapi.db.lifecycles.subscribe(autoUuid);
    strapi.db.lifecycles.subscribe(mediaCleanup);

    // Update Users-Permissions Email Templates from ENV (Sender)
    try {
      const pluginStore = strapi.store({
        type: "plugin",
        name: "users-permissions",
        key: "email",
      });

      const emailConfig = await pluginStore.get();

      if (emailConfig && process.env.EMAIL_FROM) {
        // Update sender for Reset Password
        if (
          emailConfig.reset_password.options.from !== process.env.EMAIL_FROM
        ) {
          emailConfig.reset_password.options.from = process.env.EMAIL_FROM;
          emailConfig.reset_password.options.replyTo =
            process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM;
          strapi.log.info(
            `Updated Reset Password Email Sender to: ${process.env.EMAIL_FROM}`,
          );
        }

        // Update sender for Email Confirmation
        if (
          emailConfig.email_confirmation.options.from !== process.env.EMAIL_FROM
        ) {
          emailConfig.email_confirmation.options.from = process.env.EMAIL_FROM;
          emailConfig.email_confirmation.options.replyTo =
            process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM;
          strapi.log.info(
            `Updated Email Confirmation Email Sender to: ${process.env.EMAIL_FROM}`,
          );
        }

        await pluginStore.set({ value: emailConfig });
      }
    } catch (err) {
      strapi.log.error(
        "Failed to update users-permissions email templates from env",
        err,
      );
    }

    // Update Users-Permissions Advanced Settings from ENV
    try {
      const pluginStore = strapi.store({
        type: "plugin",
        name: "users-permissions",
        key: "advanced",
      });

      const config = await pluginStore.get();

      if (config) {
        let changed = false;

        if (
          process.env.AUTH_RESET_PASSWORD_PAGE &&
          config.email_reset_password !== process.env.AUTH_RESET_PASSWORD_PAGE
        ) {
          config.email_reset_password = process.env.AUTH_RESET_PASSWORD_PAGE;
          changed = true;
          strapi.log.info(
            `Updated Reset Password Page to: ${process.env.AUTH_RESET_PASSWORD_PAGE}`,
          );
        }

        if (
          process.env.AUTH_EMAIL_CONFIRMATION_REDIRECT &&
          config.email_confirmation_redirection !==
            process.env.AUTH_EMAIL_CONFIRMATION_REDIRECT
        ) {
          config.email_confirmation_redirection =
            process.env.AUTH_EMAIL_CONFIRMATION_REDIRECT;
          changed = true;
          strapi.log.info(
            `Updated Email Confirmation Redirect to: ${process.env.AUTH_EMAIL_CONFIRMATION_REDIRECT}`,
          );
        }

        // Force enable email confirmation if not already enabled
        if (config.email_confirmation !== true) {
          config.email_confirmation = true;
          changed = true;
          strapi.log.info("Force enabled Email Confirmation setting.");
        }

        if (changed) {
          await pluginStore.set({ value: config });
          strapi.log.info(
            "Users-Permissions advanced settings updated from environment variables.",
          );
        }
      }
    } catch (err) {
      strapi.log.error(
        "Failed to update users-permissions settings from env",
        err,
      );
    }

    // Seed Daily Rewards if empty
    const count = await strapi.entityService.count(
      "api::daily-reward.daily-reward",
    );
    if (count === 0) {
      strapi.log.info("Seeding Daily Rewards...");
      const rewards = [
        {
          day: 1,
          rewardType: "coins",
          rewardAmount: 100,
          name: "Day 1 Reward",
        },
        {
          day: 2,
          rewardType: "coins",
          rewardAmount: 200,
          name: "Day 2 Reward",
        },
        {
          day: 3,
          rewardType: "coins",
          rewardAmount: 300,
          name: "Day 3 Reward",
        },
        {
          day: 4,
          rewardType: "coins",
          rewardAmount: 400,
          name: "Day 4 Reward",
        },
        {
          day: 5,
          rewardType: "coins",
          rewardAmount: 500,
          name: "Day 5 Reward",
        },
        {
          day: 6,
          rewardType: "coins",
          rewardAmount: 600,
          name: "Day 6 Reward",
        },
        {
          day: 7,
          rewardType: "tickets",
          rewardAmount: 1,
          name: "Day 7 Big Reward",
        },
      ];

      for (const reward of rewards) {
        await strapi.entityService.create("api::daily-reward.daily-reward", {
          data: {
            ...reward,
            isActive: true,
          },
        });
      }
      strapi.log.info("Daily Rewards seeded successfully.");
    }
  },
};
