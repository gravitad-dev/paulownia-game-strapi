import { factories } from '@strapi/strapi';
import { getUuidControllerMethods } from '../../../helpers/uuidApi';

export default factories.createCoreController('api::user-transaction-history.user-transaction-history', ({ strapi }) => ({
  ...getUuidControllerMethods('api::user-transaction-history.user-transaction-history'),
}));

