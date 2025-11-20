import { factories } from '@strapi/strapi';
import { getUuidControllerMethods } from '../../../helpers/uuidApi';

export default factories.createCoreController('api::log-history.log-history', ({ strapi }) => ({
  ...getUuidControllerMethods('api::log-history.log-history'),
}));

