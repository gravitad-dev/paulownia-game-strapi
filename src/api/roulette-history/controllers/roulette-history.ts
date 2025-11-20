import { factories } from '@strapi/strapi';
import { getUuidControllerMethods } from '../../../helpers/uuidApi';

export default factories.createCoreController('api::roulette-history.roulette-history', ({ strapi }) => ({
  ...getUuidControllerMethods('api::roulette-history.roulette-history'),
}));

