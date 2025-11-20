import { factories } from '@strapi/strapi';
import { getUuidControllerMethods } from '../../../helpers/uuidApi';

export default factories.createCoreController('api::daily-reward.daily-reward', ({ strapi }) => ({
  ...getUuidControllerMethods('api::daily-reward.daily-reward'),
}));

