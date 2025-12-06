export default {
  routes: [
    {
     method: 'GET',
     path: '/gamedashboarddata/overview',
     handler: 'gamedashboarddata.getOverview',
     config: {
       policies: [],
       middlewares: [],
       auth: false,
     },
    },
    {
     method: 'GET',
     path: '/gamedashboarddata/sessions-over-time',
     handler: 'gamedashboarddata.getSessionsOverTime',
     config: {
       policies: [],
       middlewares: [],
       auth: false,
     },
    },
    {
     method: 'GET',
     path: '/gamedashboarddata/top-players',
     handler: 'gamedashboarddata.getTopPlayers',
     config: {
       policies: [],
       middlewares: [],
       auth: false,
     },
    },
    {
     method: 'GET',
     path: '/gamedashboarddata/economy',
     handler: 'gamedashboarddata.getEconomyStats',
     config: {
       policies: [],
       middlewares: [],
       auth: false,
     },
    },
  ],
};
