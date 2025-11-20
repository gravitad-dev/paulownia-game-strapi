import { factories } from '@strapi/strapi';
import { getUuidControllerMethods } from '../../../helpers/uuidApi';

export default factories.createCoreController('api::user-daily-reward.user-daily-reward', ({ strapi }) => ({
  ...getUuidControllerMethods('api::user-daily-reward.user-daily-reward'),
}));

