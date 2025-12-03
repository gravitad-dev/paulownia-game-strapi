export default {
  routes: [
    {
      method: 'POST',
      path: '/exchangeCoinsToTickets',
      handler: 'player-stat.exchangeCoinsToTickets',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/exchangeCoinsToTickets/status',
      handler: 'player-stat.exchangeCoinsToTicketsStatus',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
