/**
 * guardiand controller
 */

import { factories } from '@strapi/strapi'
import { getUuidControllerMethods } from '../../../helpers/uuidApi';

export default factories.createCoreController('api::guardiand.guardiand', ({ strapi }) => ({
  ...getUuidControllerMethods('api::guardiand.guardiand'),
}));
