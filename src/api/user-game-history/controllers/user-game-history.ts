import { factories } from '@strapi/strapi';
import { getUuidControllerMethods } from '../../../helpers/uuidApi';

export default factories.createCoreController('api::user-game-history.user-game-history', ({ strapi }) => ({
  ...getUuidControllerMethods('api::user-game-history.user-game-history'),
}));

