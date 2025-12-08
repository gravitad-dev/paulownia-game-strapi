const utils = require("@strapi/utils");
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
