export default ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  url: env("URL", "https://paulownia-strapi.gravitad.com"),
  proxy: true,
  app: {
    keys: env.array('APP_KEYS'),
  },
  cron: {
    enabled: true,
    tasks: require('./cron-tasks').default({ env }),
  },
});
