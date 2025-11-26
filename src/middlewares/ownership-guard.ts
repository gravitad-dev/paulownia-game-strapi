import type { Context } from "koa";

export default (_config: any, { strapi }: { strapi: any }) => {
  return async (ctx: Context, next: () => Promise<void>) => {
    const path = ctx.request.path;

    if (!path.startsWith("/api")) {
      return next();
    }

    let user = (ctx.state as any).user;
    if (!user) {
      try {
        const authHeader =
          (ctx.request as any).headers?.authorization ||
          (ctx as any).headers?.authorization ||
          "";
        const token =
          typeof authHeader === "string" && authHeader.startsWith("Bearer ")
            ? authHeader.slice(7)
            : null;
        if (token) {
          const jwtSvc = strapi.service("plugin::users-permissions.jwt");
          const payload = await jwtSvc.verify(token);
          const userSvc = strapi.service("plugin::users-permissions.user");
          const fetched = await userSvc.fetchAuthenticatedUser(payload?.id);
          if (fetched) {
            (ctx.state as any).user = fetched;
            user = fetched;
          }
        }
      } catch {}
    }
    if (!user) {
      return next();
    }

    const { isAdmin, documentId: userDocumentId } = await getUserRoleAndDocId(
      user.id,
      strapi,
    );
    if (isAdmin) {
      return next();
    }

    if (path.startsWith("/api/users")) {
      let paramId = (ctx.params as any)?.id;
      if (!paramId) {
        const parts = path.split("/");
        if (parts.length >= 4) paramId = parts[3];
      }
      if (paramId === "me" || path.endsWith("/me")) {
        return next();
      }
      if (paramId && String(paramId) !== String(user.id)) {
        return (ctx as any).forbidden("No autorizado");
      }
      return next();
    }

    const route = (ctx.state as any).route;
    let uid: string | null = null;

    if (route?.info?.apiName) {
      const apiName = route.info.apiName;
      uid = `api::${apiName}.${apiName}`;
    } else if (route?.handler && typeof route.handler === "string") {
      const controller = route.handler.split(".")[0];
      uid = `api::${controller}.${controller}`;
    } else {
      const match = path.match(/^\/api\/([a-z0-9-]+)(?:\/|$)/i);
      if (match) {
        const segment = match[1];
        uid = resolveUidFromSegment(segment, strapi);
      }
    }

    if (!uid) {
      return next();
    }

    const model = strapi.getModel(uid);

    if (!model) {
      return next();
    }

    const hasOwner = !!model.attributes?.users_permissions_user;
    if (!hasOwner) {
      return next();
    }

    const method = ctx.method.toUpperCase();
    let docIdParam =
      (ctx.params as any)?.id || (ctx.params as any)?.documentId || null;
    let uuidParam = (ctx.params as any)?.uuid || null;
    const openRead = isOpenRead(uid);

    // Fallback: extract UUID from path if not in params
    if (!uuidParam && path.includes('/uuid/')) {
      const parts = path.split('/uuid/');
      if (parts.length > 1) {
        uuidParam = parts[1].split('/')[0]; // Get the segment after /uuid/
      }
    }

    if (!docIdParam && !uuidParam) {
      const parts = path.split("/");
      if (parts.length >= 4) {
        const last = parts[3];
        if (last && last !== "uuid") {
          docIdParam = last;
        }
      }
    }

    if (uuidParam) {
      const entity = await strapi.db.query(uid).findOne({
        where: { uuid: uuidParam },
        populate: ["users_permissions_user"],
      });
      if (!entity) {
        return (ctx as any).notFound();
      }
      if (method === "GET" && openRead) {
        return next();
      }
      const ownerId =
        entity.users_permissions_user?.id ?? entity.users_permissions_user;
      const ownerDocId = entity.users_permissions_user?.documentId;
      if (!ownerId && !ownerDocId) {
        return (ctx as any).forbidden("No autorizado");
      }
      if (
        String(ownerId) !== String(user.id) &&
        String(ownerDocId) !== String(userDocumentId)
      ) {
        return (ctx as any).forbidden("No autorizado");
      }
      return next();
    }

    if (docIdParam && ["GET", "PUT", "PATCH", "DELETE"].includes(method)) {
      const entity = await strapi
        .service(uid as any)
        .findOne(docIdParam, { populate: ["users_permissions_user"] });
      if (!entity) {
        return (ctx as any).notFound();
      }
      if (method === "GET" && openRead) {
        return next();
      }
      const ownerId =
        (entity as any).users_permissions_user?.id ??
        (entity as any).users_permissions_user;
      const ownerDocId = (entity as any).users_permissions_user?.documentId;
      if (
        String(ownerId) !== String(user.id) &&
        String(ownerDocId) !== String(userDocumentId)
      ) {
        return (ctx as any).forbidden("No autorizado");
      }
      return next();
    }

    if (method === "GET") {
      const q: any = ctx.query || {};
      const filters = q.filters || {};
      if (!openRead) {
        ctx.query = {
          ...q,
          filters: {
            ...filters,
            users_permissions_user: { documentId: userDocumentId },
          },
        } as any;
      }
    }

    if (method === "POST") {
      const body: any = (ctx.request as any).body || {};
      if (body && typeof body === "object") {
        const data = body.data ?? body;
        if (data && typeof data === "object") {
          if (
            data.users_permissions_user &&
            String(data.users_permissions_user) !== String(userDocumentId)
          ) {
            return (ctx as any).forbidden("No autorizado");
          }
          data.users_permissions_user = userDocumentId;
          if (body.data) body.data = data;
          else (ctx.request as any).body = data;
        }
      }
    }

    await next();
  };
};

function resolveUidFromSegment(segment: string, strapi: any): string | null {
  try {
    const entries = Object.entries(strapi.contentTypes || {}) as Array<
      [string, any]
    >;
    for (const [candidateUid, model] of entries) {
      const info = (model as any)?.info || {};
      if (info.pluralName === segment || info.singularName === segment) {
        return candidateUid as string;
      }
    }
    return `api::${segment}.${segment}`;
  } catch {
    return `api::${segment}.${segment}`;
  }
}

async function getUserRoleAndDocId(
  userId: number | string,
  strapi: any,
): Promise<{ isAdmin: boolean; documentId: string | null }> {
  try {
    const fullUser = await strapi.entityService.findOne(
      "plugin::users-permissions.user",
      userId,
      { populate: ["role"] },
    );
    const roleName = fullUser?.role?.name;
    const isAdmin = String(roleName).toLowerCase() === "admin";
    return { isAdmin, documentId: fullUser?.documentId ?? null };
  } catch {
    return { isAdmin: false, documentId: null };
  }
}

function isOpenRead(uid: string | null): boolean {
  if (!uid) return false;
  const OPEN: string[] = [
    "api::player-stat.player-stat",
    "api::user-game-history.user-game-history",
    "api::user-achievement.user-achievement",
    "api::user-daily-reward.user-daily-reward",
    "api::user-reward.user-reward",
  ];
  return OPEN.includes(uid);
}
