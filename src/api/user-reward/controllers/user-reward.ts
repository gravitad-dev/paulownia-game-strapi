import { factories } from '@strapi/strapi';
import { getUuidControllerMethods } from '../../../helpers/uuidApi';

export default factories.createCoreController('api::user-reward.user-reward', ({ strapi }) => ({
  ...getUuidControllerMethods('api::user-reward.user-reward'),
}));

