export default {
  routes: [
    {
      method: "POST",
      path: "/exchangeCoinsToTickets",
      handler: "player-stat.exchangeCoinsToTickets"
    },
    {
      method: "GET",
      path: "/exchangeCoinsToTickets/status",
      handler: "player-stat.exchangeCoinsToTicketsStatus"
    },
  ],
};
