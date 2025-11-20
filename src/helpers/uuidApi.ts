/**
 * Helper to generate UUID-based controller methods.
 * @param {string} uid - The Content Type UID (e.g., 'api::achievement.achievement')
 * @returns {Object} - The controller methods
 */
declare const strapi: any;

export const getUuidControllerMethods = (uid: string) => ({
  async findOneByUuid(this: any, ctx: any) {
    const { uuid } = ctx.params;

    // First find the entity by UUID to get its documentId
    const entity = await strapi.db.query(uid).findOne({
      where: { uuid },
    });

    if (!entity) {
      return ctx.notFound();
    }

    // Use the service to get the full entity with populate support
    const result = await strapi.service(uid as any).findOne(entity.documentId, ctx.query);
    
    const sanitized = await this.sanitizeOutput(result, ctx);
    return this.transformResponse(sanitized);
  },

  async updateByUuid(this: any, ctx: any) {
    const { uuid } = ctx.params;
    const { body } = ctx.request;

    // Find the entity by UUID to get its documentId (required for v5 service update)
    const entity = await strapi.db.query(uid).findOne({
      where: { uuid },
    });

    if (!entity) {
      return ctx.notFound();
    }

    // Use the core service to update
    const updated = await strapi.service(uid as any).update(entity.documentId, { data: body });
    
    const sanitized = await this.sanitizeOutput(updated, ctx);
    return this.transformResponse(sanitized);
  },

  async deleteByUuid(this: any, ctx: any) {
    const { uuid } = ctx.params;

    const entity = await strapi.db.query(uid).findOne({
      where: { uuid },
    });

    if (!entity) {
      return ctx.notFound();
    }

    const deleted = await strapi.service(uid as any).delete(entity.documentId);
    
    const sanitized = await this.sanitizeOutput(deleted, ctx);
    return this.transformResponse(sanitized);
  },
});

/**
 * Helper to generate UUID-based routes.
 * @param {string} apiName - The API name (e.g., 'achievement')
 * @param {string} uid - The Content Type UID (e.g., 'api::achievement.achievement')
 * @returns {Object} - The routes configuration
 */
export const getUuidRoutes = (apiName: string) => {
  const apiNamePlural = apiName.endsWith('y')
    ? `${apiName.slice(0, -1)}ies`
    : `${apiName}s`;
  return {
    routes: [
      {
        method: 'GET',
        path: `/${apiNamePlural}/uuid/:uuid`,
        handler: `${apiName}.findOneByUuid`,
      },
      {
        method: 'PUT',
        path: `/${apiNamePlural}/uuid/:uuid`,
        handler: `${apiName}.updateByUuid`,
      },
      {
        method: 'DELETE',
        path: `/${apiNamePlural}/uuid/:uuid`,
        handler: `${apiName}.deleteByUuid`,
      },
    ],
  };
};
