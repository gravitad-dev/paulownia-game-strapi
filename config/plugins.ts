import path from "path";

export default ({ env }) => ({
  "game-dashboard": {
    enabled: true,
    resolve: path.resolve(process.cwd(), "src", "plugins", "game-dashboard"),
  },
  email: {
    config: {
      provider: "nodemailer",
      providerOptions: {
        host: env("SMTP_HOST", "smtp.example.com"),
        port: env.int("SMTP_PORT", 587),
        secure: env.bool("SMTP_SECURE", false),
        requireTLS: env.bool("SMTP_REQUIRE_TLS", true),
        connectionTimeout: env.int("SMTP_CONNECTION_TIMEOUT", 10000),
        socketTimeout: env.int("SMTP_SOCKET_TIMEOUT", 10000),
        auth: {
          user: env("SMTP_USERNAME"),
          pass: env("SMTP_PASSWORD"),
        },
        tls: {
          rejectUnauthorized: env.bool("SMTP_TLS_REJECT_UNAUTHORIZED", true),
        },
        pool: env.bool("SMTP_POOL", false),
        maxConnections: env.int("SMTP_MAX_CONNECTIONS", 1),
        maxMessages: env.int("SMTP_MAX_MESSAGES", 10),
      },
      settings: {
        defaultFrom: env("EMAIL_FROM", "no-reply@example.com"),
        defaultReplyTo: env("EMAIL_REPLY_TO", "no-reply@example.com"),
      },
    },
  },
  upload: {
    config: {
      provider: "cloudinary",
      providerOptions: {
        cloud_name: env("CLOUDINARY_NAME"),
        api_key: env("CLOUDINARY_KEY"),
        api_secret: env("CLOUDINARY_SECRET"),
      },
      actionOptions: {
        upload: {
          folder: "Paulownia_Game",
        },
        uploadStream: {
          folder: "Paulownia_Game",
        },
        delete: {},
      },
    },
  },
});
