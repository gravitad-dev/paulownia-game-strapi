import { factories } from '@strapi/strapi';
import { getUuidControllerMethods } from '../../../helpers/uuidApi';

export default factories.createCoreController('api::level.level', ({ strapi }) => ({
  ...getUuidControllerMethods('api::level.level'),
}));

