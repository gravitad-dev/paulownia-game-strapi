export default async (ctx: any, next: any) => {
  const user = ctx.state?.user;

  if (!user) {
    ctx.status = 401;
    ctx.body = { error: "Authentication required" };
    return false;
  }

  // Try to get role type from the state first
  let roleType = user.role?.type;

  // If role type isn't populated, load the user with role from the database
  if (!roleType) {
    try {
      const fullUser = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        user.id,
        { populate: ["role"] },
      );
      roleType = (fullUser as any)?.role?.type;
    } catch (err) {
      ctx.status = 403;
      ctx.body = { error: "Access denied" };
      return false;
    }
  }

  if (roleType === "admin") {
    return true;
  }

  ctx.status = 403;
  ctx.body = { error: "Admin role required" };
  return false;
};
