import { factories } from '@strapi/strapi';
import { getUuidControllerMethods } from '../../../helpers/uuidApi';

export default factories.createCoreController('api::user-achievement.user-achievement', ({ strapi }) => ({
  ...getUuidControllerMethods('api::user-achievement.user-achievement'),
}));

