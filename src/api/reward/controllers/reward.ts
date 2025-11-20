import { factories } from '@strapi/strapi';
import { getUuidControllerMethods } from '../../../helpers/uuidApi';

export default factories.createCoreController('api::reward.reward', ({ strapi }) => ({
  ...getUuidControllerMethods('api::reward.reward'),
}));

