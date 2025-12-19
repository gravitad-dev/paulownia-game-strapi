const utils = require("@strapi/utils");
const { generateUuid } = require("../../helpers/uuidGenerator");
const path = require("path");
const fs = require("fs");
const emailHelper = require("../../helpers/email");
const { ApplicationError } = utils.errors;

module.exports = (plugin) => {
  // Add lifecycle hooks to validate username
  const originalLifecycles = plugin.contentTypes["user"].lifecycles || {};

  plugin.contentTypes["user"].lifecycles = {
    ...originalLifecycles,

    async beforeCreate(event) {
      if (originalLifecycles.beforeCreate) {
        await originalLifecycles.beforeCreate(event);
      }
      const { data } = event.params;
      validateUsername(data.username);
    },

    async beforeUpdate(event) {
      if (originalLifecycles.beforeUpdate) {
        await originalLifecycles.beforeUpdate(event);
      }
      const { data } = event.params;
      if (data.username) {
        validateUsername(data.username);
      }
    },

    async afterUpdate(event) {
      if (originalLifecycles.afterUpdate) {
        await originalLifecycles.afterUpdate(event);
      }

      const { result, params } = event;

      // If user is being confirmed, send welcome notification
      if (params.data && params.data.confirmed === true) {
        try {
          // @ts-ignore
          await strapi
            .service("api::notification.notification")
            .createWelcomeNotification(result);
        } catch (error) {
          strapi.log.error("Failed to create welcome notification", error);
        }
      }
    },
  };

  plugin.controllers.user.me = async (ctx) => {
    if (!ctx.state.user) {
      return ctx.unauthorized();
    }

    // @ts-ignore
    const user: any = await strapi
      .documents("plugin::users-permissions.user")
      .findFirst({
        filters: {
          id: ctx.state.user.id,
        },
        // @ts-ignore
        fields: [
          "id",
          "documentId",
          "username",
          "email",
          "confirmed",
          "blocked",
          "createdAt",
          "updatedAt",
          "name",
          "lastname",
          "phone",
          "address",
          "city",
          "zipcode",
          "country",
          "age",
          "isPremium",
        ],
        populate: {
          avatar: {
            fields: [
              "url",
              "name",
              "alternativeText",
              "width",
              "height",
              "formats",
            ],
          },
          guardiands: {
            fields: [
              "documentId",
              "name",
              "lastName",
              "email",
              "phone",
              "address",
              "city",
              "zipcode",
              "country",
              "DNI",
              "publishedAt",
            ],
          },
        },
      });

    if (!user) {
      return ctx.notFound();
    }

    // Deduplicate guardians: prefer draft (latest) over published if both exist
    if (user.guardiands && Array.isArray(user.guardiands)) {
      const uniqueGuardians = new Map();
      user.guardiands.forEach((g) => {
        const existing = uniqueGuardians.get(g.documentId);
        if (!existing) {
          uniqueGuardians.set(g.documentId, g);
        } else {
          // If current is draft (publishedAt is null) and existing is published, replace with draft
          if (!g.publishedAt && existing.publishedAt) {
            uniqueGuardians.set(g.documentId, g);
          }
        }
      });
      user.guardiands = Array.from(uniqueGuardians.values()).map((g: any) => {
        const { publishedAt, ...rest } = g;
        return rest;
      });
    }

    ctx.body = user;
  };

  // --------------------------------------------------------------------------------
  // OVERRIDE: Auth Controller (Forgot Password & Reset Password with Expiration)
  // --------------------------------------------------------------------------------

  // V5: controllers are factories; wrap and extend the returned controller
  const originalAuthFactory = plugin.controllers.auth;
  plugin.controllers.auth = ({ strapi }) => {
    const originalAuth = originalAuthFactory({ strapi });

    // 1. Customize forgotPassword: validar usuario, generar token, enviar email y responder rápido
    originalAuth.forgotPassword = async (ctx) => {
      const { email } = ctx.request.body;

      const user = await strapi
        .query("plugin::users-permissions.user")
        .findOne({ where: { email: email.toLowerCase() } });

      if (!user) {
        return ctx.badRequest("User not found");
      }

      if (user.blocked) {
        return ctx.badRequest("User is blocked");
      }

      const resetPasswordToken = generateUuid(64);
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      await strapi.query("plugin::users-permissions.user").update({
        where: { id: user.id },
        data: {
          resetPasswordToken,
          resetPasswordExpires: expiresAt,
        },
      });

      const resetPageUrl =
        process.env.AUTH_RESET_PASSWORD_PAGE || strapi.config.get("server.url");
      const templatesDir = emailHelper.getTemplatesDir();
      const resetTplPath =
        process.env.RESET_PASSWORD_TEMPLATE_PATH ||
        path.resolve(templatesDir, "reset-password-email.html");
      let htmlSource = emailHelper.readTemplate(
        resetTplPath,
        `<!doctype html><html><body><a href="<%= URL %>?code=<%= TOKEN %>">Reset</a></body></html>`,
      );
      htmlSource = emailHelper.normalizeTemplateImagesToCid(htmlSource);
      let html = emailHelper.applyVariables(htmlSource, {
        URL: resetPageUrl,
        TOKEN: resetPasswordToken,
        CODE: resetPasswordToken,
        resetUrl: `${resetPageUrl}?code=${resetPasswordToken}`,
        userName: emailHelper.getUserDisplayName(user),
        appName: emailHelper.getAppName(),
        supportEmail: emailHelper.getSupportEmail(),
        expiresIn: "1 hora",
        logoUrl: "cid:logo",
        year: String(new Date().getFullYear()),
      });

      const to = email;
      const subject = "Restablecer contraseña";
      const from = process.env.EMAIL_FROM || "no-reply@example.com";
      const replyTo = process.env.EMAIL_REPLY_TO || from;

      const attachments = emailHelper.getLogoAttachments(templatesDir);
      try {
        void emailHelper.sendEmail(strapi, {
          to,
          from,
          replyTo,
          subject,
          html,
          attachments,
        });
      } catch (err) {
        strapi.log.error("Failed to send reset password email", err);
      }

      ctx.send({ ok: true });
    };

    originalAuth.sendEmailConfirmation = async (ctx) => {
      const { email } = ctx.request.body;
      const user = await strapi
        .query("plugin::users-permissions.user")
        .findOne({ where: { email: email.toLowerCase() } });
      if (!user) {
        return ctx.badRequest("User not found");
      }
      if (user.confirmed) {
        return ctx.badRequest("Already confirmed");
      }
      if (user.blocked) {
        return ctx.badRequest("User is blocked");
      }
      const confirmationToken = generateUuid(64);
      await strapi.query("plugin::users-permissions.user").update({
        where: { id: user.id },
        data: { confirmationToken },
      });
      const confirmUrl =
        process.env.AUTH_EMAIL_CONFIRMATION_REDIRECT ||
        strapi.config.get("server.url");
      const templatesDir = emailHelper.getTemplatesDir();
      const confirmTplPath =
        process.env.EMAIL_CONFIRMATION_TEMPLATE_PATH ||
        path.resolve(templatesDir, "email-confirmation-email.html");
      let htmlSource = emailHelper.readTemplate(
        confirmTplPath,
        `<!doctype html><html><body><a href="<%= URL %>?code=<%= CODE %>">Confirm</a></body></html>`,
      );
      htmlSource = emailHelper.normalizeTemplateImagesToCid(htmlSource);
      let html = emailHelper.applyVariables(htmlSource, {
        URL: confirmUrl,
        CODE: confirmationToken,
        TOKEN: confirmationToken,
        confirmUrl: `${confirmUrl}?code=${confirmationToken}`,
        userName: emailHelper.getUserDisplayName(user),
        appName: emailHelper.getAppName(),
        supportEmail: emailHelper.getSupportEmail(),
        logoUrl: "cid:logo",
        year: String(new Date().getFullYear()),
      });
      const to = email;
      const subject = "Confirmar cuenta";
      const from = process.env.EMAIL_FROM || "no-reply@example.com";
      const replyTo = process.env.EMAIL_REPLY_TO || from;
      const attachments = emailHelper.getLogoAttachments(templatesDir);
      try {
        void emailHelper.sendEmail(strapi, {
          to,
          from,
          replyTo,
          subject,
          html,
          attachments,
        });
      } catch (err) {
        strapi.log.error("Failed to send confirmation email", err);
      }
      ctx.send({ ok: true });
    };

    // 2. Customize resetPassword to check expiration
    const superResetPassword = originalAuth.resetPassword;
    originalAuth.resetPassword = async (ctx) => {
      const { code } = ctx.request.body;

      // Find user with this token
      const user = await strapi
        .query("plugin::users-permissions.user")
        .findOne({ where: { resetPasswordToken: code } });

      if (!user) {
        return ctx.badRequest("Incorrect code provided");
      }

      // Check expiration
      if (user.resetPasswordExpires) {
        const now = new Date();
        const expiresAt = new Date(user.resetPasswordExpires);

        if (now > expiresAt) {
          return ctx.badRequest(
            "Reset token has expired. Please request a new one.",
          );
        }
      }

      // If valid, proceed with original reset
      await superResetPassword(ctx);

      // Clear expiration after successful reset
      await strapi.query("plugin::users-permissions.user").update({
        where: { id: user.id },
        data: {
          resetPasswordExpires: null,
        },
      });
    };

    return originalAuth;
  };

  const originalUserServiceFactory = plugin.services.user;
  plugin.services.user = ({ strapi }) => {
    const originalUserService = originalUserServiceFactory({ strapi });
    originalUserService.sendConfirmationEmail = async (user) => {
      const confirmationToken = generateUuid(64);
      await strapi
        .query("plugin::users-permissions.user")
        .update({ where: { id: user.id }, data: { confirmationToken } });

      const apiPrefix = strapi.config.get("api.rest.prefix");
      const defaultApiConfirmUrl = `${strapi.config.get("server.absoluteUrl")}${apiPrefix}/auth/email-confirmation`;
      const baseUrl =
        process.env.AUTH_EMAIL_CONFIRMATION_REDIRECT || defaultApiConfirmUrl;
      const confirmUrl = process.env.AUTH_EMAIL_CONFIRMATION_REDIRECT
        ? `${baseUrl}?code=${confirmationToken}`
        : `${baseUrl}?confirmation=${confirmationToken}`;

      const templatesDir = emailHelper.getTemplatesDir();
      const confirmTplPath =
        process.env.EMAIL_CONFIRMATION_TEMPLATE_PATH ||
        path.resolve(templatesDir, "email-confirmation-email.html");
      let htmlSource = emailHelper.readTemplate(
        confirmTplPath,
        `<!doctype html><html><body><a href="<%= URL %>?confirmation=<%= CODE %>">Confirm</a></body></html>`,
      );
      htmlSource = emailHelper.normalizeTemplateImagesToCid(htmlSource);
      const html = emailHelper.applyVariables(htmlSource, {
        URL: baseUrl,
        CODE: confirmationToken,
        TOKEN: confirmationToken,
        confirmUrl,
        userName: emailHelper.getUserDisplayName(user),
        appName: emailHelper.getAppName(),
        supportEmail: emailHelper.getSupportEmail(),
        logoUrl: "cid:logo",
        year: String(new Date().getFullYear()),
      });

      const to = user.email;
      const subject = "Confirmar cuenta";
      const from = process.env.EMAIL_FROM || "no-reply@example.com";
      const replyTo = process.env.EMAIL_REPLY_TO || from;
      const attachments = emailHelper.getLogoAttachments(templatesDir);
      await emailHelper.sendEmail(strapi, {
        to,
        from,
        replyTo,
        subject,
        html,
        attachments,
      });
    };
    return originalUserService;
  };

  return plugin;
};

function validateUsername(username) {
  if (!username) return;

  // Validate maximum length (50 characters)
  if (username.length > 50) {
    throw new ApplicationError("Username must be 50 characters or less");
  }

  // Validate minimum length
  if (username.length < 3) {
    throw new ApplicationError("Username must be at least 3 characters");
  }

  // Validate allowed characters (alphanumeric, hyphens, underscores)
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPattern.test(username)) {
    throw new ApplicationError(
      "Username can only contain letters, numbers, hyphens, and underscores",
    );
  }

  // Prevent XSS - explicitly reject dangerous characters
  const dangerousChars = [
    "<",
    ">",
    '"',
    "'",
    "&",
    "/",
    "\\",
    "(",
    ")",
    "{",
    "}",
    "[",
    "]",
  ];
  const hasDangerousChar = dangerousChars.some((char) =>
    username.includes(char),
  );

  if (hasDangerousChar) {
    throw new ApplicationError("Username contains invalid characters");
  }

  // Additional check: prevent script-like patterns
  const scriptPatterns = [
    /script/i,
    /javascript/i,
    /onerror/i,
    /onload/i,
    /eval/i,
  ];

  const hasScriptPattern = scriptPatterns.some((pattern) =>
    pattern.test(username),
  );
  if (hasScriptPattern) {
    throw new ApplicationError("Username contains forbidden patterns");
  }
}
