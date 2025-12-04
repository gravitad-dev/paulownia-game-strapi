import { factories } from "@strapi/strapi";
import { getUuidControllerMethods } from "../../../helpers/uuidApi";

export default factories.createCoreController(
  "api::level.level",
  ({ strapi }) => ({
    ...getUuidControllerMethods("api::level.level"),

    async myLevels(ctx) {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
      }

      // 1. Parse Query Params
      const { filters = {}, sort, pagination } = ctx.query as any;

      // 2. Separate Status Filter from DB Filters
      // We clone filters to avoid mutating the original object if needed elsewhere
      const statusFilter = filters.status;
      const dbFilters = { ...filters };
      delete dbFilters.status;

      // 3. Fetch Levels (Apply DB filters & DB sort)
      // We fetch all matching levels first because status filtering happens in memory
      // If sort does NOT include status, we can let DB handle sorting initially
      const sortParam = sort ?? { date: "asc" };

      const levels = await strapi.entityService.findMany("api::level.level", {
        filters: dbFilters,
        populate: ["cover", "puzzleImage"],
        sort: sortParam,
        publicationState: "live",
      });

      // 4. Fetch User Levels (Batch Optimization)
      // Fetch all user levels for this user to avoid N+1 queries
      const userLevels = await strapi.db
        .query("api::user-level.user-level")
        .findMany({
          where: { users_permissions_user: user.id },
          populate: ["level"],
        });

      // Create a map for quick lookup: levelId -> userLevel
      const userLevelMap = new Map();
      (userLevels || []).forEach((ul: any) => {
        if (ul.level) {
          const levelId = typeof ul.level === "object" ? ul.level.id : ul.level;
          userLevelMap.set(levelId, ul);
        }
      });

      // 5. Map & Compute Status
      let formattedLevels = (levels || []).map((lvl: any) => {
        const ul = userLevelMap.get(lvl.id);
        const isActive = !!lvl.isActive;
        const rawStatus = isActive
          ? (ul?.levelStatus ?? "blocked")
          : "disabled";
        const status = (rawStatus || "").trim();

        return {
          id: lvl.id,
          documentId: lvl.documentId,
          uuid: lvl.uuid,
          name: lvl.name,
          description: lvl.description,
          difficulty: lvl.difficulty,
          cover: lvl.cover,
          puzzleImage: lvl.puzzleImage,
          isActive,
          status,
          lastPlayed: ul?.lastPlayed ?? null,
          createdAt: lvl.createdAt,
          updatedAt: lvl.updatedAt,
          publishedAt: lvl.publishedAt,
          date: lvl.date,
        };
      });

      // 6. Apply Status Filter (In-Memory)
      if (statusFilter) {
        if (typeof statusFilter === "string") {
          formattedLevels = formattedLevels.filter(
            (l: any) => l.status === statusFilter,
          );
        } else {
          // Handle operators like $eq, $ne, $in
          if (statusFilter.$eq) {
            formattedLevels = formattedLevels.filter(
              (l: any) => l.status === statusFilter.$eq,
            );
          }
          if (statusFilter.$ne) {
            formattedLevels = formattedLevels.filter(
              (l: any) => l.status !== statusFilter.$ne,
            );
          }
          if (statusFilter.$in && Array.isArray(statusFilter.$in)) {
            formattedLevels = formattedLevels.filter((l: any) =>
              statusFilter.$in.includes(l.status),
            );
          }
          if (statusFilter.$notIn && Array.isArray(statusFilter.$notIn)) {
            formattedLevels = formattedLevels.filter(
              (l: any) => !statusFilter.$notIn.includes(l.status),
            );
          }
        }
      }

      // 7. Apply Sort (In-Memory if needed)
      // If user requested sorting by status, OR mixed sorting, we sort again in memory
      // to ensure correct order. Strapi's DB sort is already applied for other fields,
      // but status sort must be applied on top.
      // For simplicity, if 'sort' param exists, we re-sort everything in memory
      // to guarantee consistency between DB and computed fields.
      if (sort) {
        const sortFields = Array.isArray(sort) ? sort : [sort];
        formattedLevels.sort((a: any, b: any) => {
          for (const s of sortFields) {
            const [field, order] = s.split(":");
            const direction = order === "desc" ? -1 : 1;

            const valA = a[field];
            const valB = b[field];

            if (valA < valB) return -1 * direction;
            if (valA > valB) return 1 * direction;
          }
          return 0;
        });
      }

      // 8. Pagination
      const page =
        pagination?.page && parseInt(pagination.page) > 0
          ? parseInt(pagination.page)
          : 1;
      const pageSize =
        pagination?.pageSize && parseInt(pagination.pageSize) > 0
          ? parseInt(pagination.pageSize)
          : 25;

      // Support start/limit as well if provided (Strapi v4/v5 often supports both)
      // but page/pageSize is standard for meta.pagination response
      const total = formattedLevels.length;
      const pageCount = Math.ceil(total / pageSize);

      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      const paginatedData = formattedLevels.slice(start, end);

      return {
        data: paginatedData,
        meta: {
          pagination: {
            page,
            pageSize,
            pageCount,
            total,
          },
        },
      };
    },

    async unlock(ctx) {
      const idOrUuid = (ctx.params as any)?.uuid ?? (ctx.params as any)?.id;
      const id = idOrUuid;
      const { password } = ctx.request.body;
      const user = ctx.state.user;

      if (!user) {
        return ctx.unauthorized("You must be logged in to unlock a level");
      }

      // Find level by UUID (need to select password as it's private)
      const level = await strapi.db.query("api::level.level").findOne({
        where: { uuid: id },
        select: ["id", "uuid", "name", "password"],
      });

      if (!level) {
        return ctx.notFound("Level not found");
      }

      // Check password
      if (level.password !== password) {
        return ctx.badRequest("Invalid password");
      }

      // Check if UserLevel already exists
      let userLevel = await strapi.db
        .query("api::user-level.user-level")
        .findOne({
          where: {
            level: level.id,
            users_permissions_user: user.id,
          },
        });

      if (userLevel) {
        if (
          userLevel.levelStatus !== "available" &&
          userLevel.levelStatus !== "won"
        ) {
          userLevel = await strapi.entityService.update(
            "api::user-level.user-level",
            userLevel.id,
            {
              data: {
                levelStatus: "available",
                publishedAt: userLevel?.publishedAt || new Date(),
              },
            },
          );
          return ctx.send({
            message: "Level unlocked successfully",
            userLevel,
          });
        } else {
          return ctx.send({ message: "Level already unlocked", userLevel });
        }
      } else {
        // Create new UserLevel
        userLevel = await strapi.entityService.create(
          "api::user-level.user-level",
          {
            data: {
              level: level.id,
              users_permissions_user: user.id,
              levelStatus: "available",
              publishedAt: new Date(),
            } as any,
          },
        );
        return ctx.send({ message: "Level unlocked successfully", userLevel });
      }
    },
  }),
);
