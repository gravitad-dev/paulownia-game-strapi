import { getUuidRoutes } from '../../../helpers/uuidApi';

const customRoutes = {
  routes: [
    {
      method: 'POST',
      path: '/rewards/spin',
      handler: 'reward.spin',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};

export default {
  routes: [
    ...getUuidRoutes('reward').routes,
    ...customRoutes.routes,
  ],
};
