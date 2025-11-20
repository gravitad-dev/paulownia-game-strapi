import { factories } from '@strapi/strapi';
import { getUuidControllerMethods } from '../../../helpers/uuidApi';

export default factories.createCoreController('api::achievement.achievement', ({ strapi }) => ({
  ...getUuidControllerMethods('api::achievement.achievement'),
}));
