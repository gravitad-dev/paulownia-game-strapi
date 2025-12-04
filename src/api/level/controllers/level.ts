import { factories } from '@strapi/strapi';
import { getUuidControllerMethods } from '../../../helpers/uuidApi';

export default factories.createCoreController('api::level.level', ({ strapi }) => ({
  ...getUuidControllerMethods('api::level.level'),

  async unlock(ctx) {
    const { id } = ctx.params;
    const { password } = ctx.request.body;
    const user = ctx.state.user;

    if (!user) {
      return ctx.unauthorized('You must be logged in to unlock a level');
    }

    // Find level by UUID (need to select password as it's private)
    const level = await strapi.db.query('api::level.level').findOne({
      where: { uuid: id },
      select: ['id', 'uuid', 'name', 'password'],
    });

    if (!level) {
      return ctx.notFound('Level not found');
    }

    // Check password
    if (level.password !== password) {
      return ctx.badRequest('Invalid password');
    }

    // Check if UserLevel already exists
    let userLevel = await strapi.db.query('api::user-level.user-level').findOne({
      where: {
        level: level.id,
        users_permissions_user: user.id,
      },
    });

    if (userLevel) {
      if (userLevel.levelStatus !== 'available  ' && userLevel.levelStatus !== 'won') {
         userLevel = await strapi.entityService.update('api::user-level.user-level', userLevel.id, {
          data: {
            levelStatus: 'available  ',
          },
        });
        return ctx.send({ message: 'Level unlocked successfully', userLevel });
      } else {
         return ctx.send({ message: 'Level already unlocked', userLevel });
      }
    } else {
      // Create new UserLevel
      userLevel = await strapi.entityService.create('api::user-level.user-level', {
        data: {
          level: level.id,
          users_permissions_user: user.id,
          levelStatus: 'available  ',
        } as any,
      });
      return ctx.send({ message: 'Level unlocked successfully', userLevel });
    }
  },
}));

