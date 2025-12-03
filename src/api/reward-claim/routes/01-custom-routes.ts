const customRoutes = {
  routes: [
    // Core CRUD routes
    {
      method: "GET",
      path: "/reward-claims",
      handler: "reward-claim.find",
    },
    {
      method: "GET",
      path: "/reward-claims/:id",
      handler: "reward-claim.findOne",
    },
    {
      method: "POST",
      path: "/reward-claims",
      handler: "reward-claim.create",
    },
    // Cancel claim by claimCode
    {
      method: "POST",
      path: "/reward-claims/cancel",
      handler: "reward-claim.cancel",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    // Reopen cancelled claim by claimCode
    {
      method: "POST",
      path: "/reward-claims/reopen",
      handler: "reward-claim.reopen",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    // Upload documents by claimCode
    {
      method: "POST",
      path: "/reward-claims/upload-documents",
      handler: "reward-claim.uploadDocuments",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    // Approve claim (admin only)
    {
      method: "POST",
      path: "/reward-claims/approve",
      handler: "reward-claim.approve",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    // Reject claim (admin only)
    {
      method: "POST",
      path: "/reward-claims/reject",
      handler: "reward-claim.reject",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    // Revert delivered claim (admin only)
    {
      method: "POST",
      path: "/reward-claims/revert",
      handler: "reward-claim.revert",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};

export default customRoutes;
