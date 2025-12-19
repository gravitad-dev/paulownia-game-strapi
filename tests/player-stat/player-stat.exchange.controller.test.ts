import { createStrapiMock } from "../helpers/strapi-mock";
import { mockCtx } from "../helpers/ctx-mock";
import { makePlayerStat } from "../helpers/factory";

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (_uid: string, builder: any) =>
      builder({ strapi: (global as any).strapi }),
  },
}));

jest.mock("../../src/helpers/uuidApi", () => ({
  getUuidControllerMethods: () => ({}),
}));

describe("PlayerStat Exchange Controller", () => {
  let controller: any;
  let strapi: ReturnType<typeof createStrapiMock>;
  const user = { id: 1 };

  beforeEach(async () => {
    strapi = createStrapiMock();
    (global as any).strapi = strapi;
    jest.resetModules();
    controller = (
      await import("../../src/api/player-stat/controllers/player-stat")
    ).default;
    jest.useRealTimers();
    delete (process.env as any).COINS_PER_TICKET;
    delete (process.env as any).COINS_TO_TICKETS_LIMIT;

    // Default Settings for all tests unless overridden in a specific test
    strapi.entityService.findMany.mockImplementation((uid: string) => {
      if (uid === "api::setting.setting") {
        return [
          {
            coinsPerTicket: 1000,
            exchangeLimitEnabled: true,
            exchangeLimitTickets: 10,
            exchangeLimitPeriod: "monthly",
          },
        ];
      }
      return [];
    });
  });

  test("retorna 401 si el usuario no está autenticado", async () => {
    const ctx = mockCtx();
    const res = await controller.exchangeCoinsToTickets(ctx);
    expect(res.status).toBe(401);
    expect(res.data?.reason).toBe("unauthorized");
  });

  test("retorna 400 invalid_request si ticketsRequested inválido", async () => {
    const ctx = mockCtx(user);
    ctx.request = { body: { data: { ticketsRequested: 0 } } };
    const res = await controller.exchangeCoinsToTickets(ctx);
    expect(res.status).toBe(400);
    expect(res.data?.reason).toBe("invalid_request");
  });

  test("retorna 400 insufficient_coins y maxTicketsPossible", async () => {
    const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
    const playerStat = makePlayerStat(user.id, 500, 0, 0, 0);
    psQuery.findOne.mockResolvedValue(playerStat);

    // Mock trxSelect to return low coins - causes INSUFFICIENT_COINS error
    strapi.db.mockTrx.select.mockResolvedValue([
      { id: 1, coins: 500, tickets: 0 },
    ]);

    const ctx = mockCtx(user);
    ctx.request = { body: { data: { ticketsRequested: 1 } } };
    const res = await controller.exchangeCoinsToTickets(ctx);
    expect(res.status).toBe(400);
    expect(res.data?.reason).toBe("insufficient_coins");
    expect(res.data?.maxTicketsPossible).toBe(0);
  });

  test("canje exitoso de 1 ticket con tasa por defecto 1000", async () => {
    const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
    const txQuery = strapi.db.query(
      "api::user-transaction-history.user-transaction-history",
    ) as any;

    const beforeStat = makePlayerStat(user.id, 2000, 5, 0, 0);
    psQuery.findOne.mockResolvedValueOnce(beforeStat);

    // Mock trxSelect - this is called during FOR UPDATE lock
    strapi.db.mockTrx.select.mockResolvedValue([
      {
        id: beforeStat.id,
        coins: 2000,
        tickets: 5,
        coins_spent: 0,
        tickets_earned: 0,
      },
    ]);

    // Mock transaction history query (inside trx) - no prior transactions for limit check
    txQuery.findMany.mockResolvedValue([]);

    // Mock the update and create inside transaction
    psQuery.update.mockResolvedValue({});
    txQuery.create.mockResolvedValue({});

    // After transaction - for aggregations
    strapi.entityService.findMany.mockImplementation(
      (uid: string, opts?: any) => {
        if (uid === "api::setting.setting") {
          return [
            {
              coinsPerTicket: 1000,
              exchangeLimitEnabled: true,
              exchangeLimitTickets: 10,
              exchangeLimitPeriod: "monthly",
            },
          ];
        }
        if (uid === "api::user-transaction-history.user-transaction-history") {
          if (opts?.limit === 10) {
            return [
              {
                executedAt: new Date(),
                coinsExchanged: 1000,
                amountDelivered: 1,
                statusTransaction: "completed",
              },
            ];
          }
          // For aggregation fetches
          return [
            {
              executedAt: new Date(),
              coinsExchanged: 1000,
              amountDelivered: 1,
            },
          ];
        }
        return [];
      },
    );

    const ctx = mockCtx(user);
    ctx.request = { body: { data: { ticketsRequested: 1 } } };
    const res = await controller.exchangeCoinsToTickets(ctx);
    expect(res.ticketsExchanged).toBe(1);
    expect(res.coinsSpent).toBe(1000);
    expect(res.playerStats).toEqual({ coins: 1000, tickets: 6 });
    expect(res.limit.limitTickets).toBe(10);
    expect(res.limit.ticketsUsed).toBe(1);
    expect(res.limit.ticketsRemaining).toBe(9);
  });

  test("canje exitoso de muchos tickets", async () => {
    const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
    const txQuery = strapi.db.query(
      "api::user-transaction-history.user-transaction-history",
    ) as any;

    const beforeStat = makePlayerStat(user.id, 500000, 10, 0, 0);
    psQuery.findOne.mockResolvedValueOnce(beforeStat);

    strapi.db.mockTrx.select.mockResolvedValue([
      {
        id: beforeStat.id,
        coins: 500000,
        tickets: 10,
        coins_spent: 0,
        tickets_earned: 0,
      },
    ]);

    txQuery.findMany.mockResolvedValue([]);
    psQuery.update.mockResolvedValue({});
    txQuery.create.mockResolvedValue({});

    strapi.entityService.findMany.mockImplementation((uid: string) => {
      if (uid === "api::setting.setting") {
        return [
          {
            coinsPerTicket: 1000,
            exchangeLimitEnabled: true,
            exchangeLimitTickets: 100000,
            exchangeLimitPeriod: "monthly",
          },
        ];
      }
      return [];
    });

    const ctx = mockCtx(user);
    ctx.request = { body: { data: { ticketsRequested: 500 } } };
    const res = await controller.exchangeCoinsToTickets(ctx);
    expect(res.ticketsExchanged).toBe(500);
    expect(res.coinsSpent).toBe(500000);
    expect(res.playerStats).toEqual({ coins: 0, tickets: 510 });
    expect(res.limit.limitTickets).toBe(100000);
    expect(res.limit.ticketsUsed).toBe(500);
    expect(res.limit.ticketsRemaining).toBe(99500);
  });

  test("rollback si falla la transacción", async () => {
    const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
    const txQuery = strapi.db.query(
      "api::user-transaction-history.user-transaction-history",
    ) as any;

    const beforeStat = makePlayerStat(user.id, 2000, 0, 0, 0);
    psQuery.findOne.mockResolvedValue(beforeStat);

    strapi.db.mockTrx.select.mockResolvedValue([
      {
        id: beforeStat.id,
        coins: 2000,
        tickets: 0,
        coins_spent: 0,
        tickets_earned: 0,
      },
    ]);

    txQuery.findMany.mockResolvedValue([]);
    psQuery.update.mockResolvedValue({});

    // Make transaction create fail
    txQuery.create.mockRejectedValue(new Error("fail"));

    const ctx = mockCtx(user);
    ctx.request = { body: { data: { ticketsRequested: 1 } } };
    const res = await controller.exchangeCoinsToTickets(ctx);
    expect(res.status).toBe(400);
    expect(res.data?.reason).toBe("transaction_failed");
  });

  test("agregados de semana/mes/año/total e histórico", async () => {
    const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
    const txQuery = strapi.db.query(
      "api::user-transaction-history.user-transaction-history",
    ) as any;

    const beforeStat = makePlayerStat(user.id, 10000, 0, 0, 0);
    psQuery.findOne.mockResolvedValueOnce(beforeStat);

    strapi.db.mockTrx.select.mockResolvedValue([
      {
        id: beforeStat.id,
        coins: 10000,
        tickets: 0,
        coins_spent: 0,
        tickets_earned: 0,
      },
    ]);

    txQuery.findMany.mockResolvedValue([]);
    psQuery.update.mockResolvedValue({});
    txQuery.create.mockResolvedValue({});

    const now = new Date();
    const txWeek = {
      executedAt: now,
      coinsExchanged: 1000,
      amountDelivered: 10,
      statusTransaction: "completed",
    };
    const txMonth = {
      executedAt: now,
      coinsExchanged: 2000,
      amountDelivered: 20,
      statusTransaction: "completed",
    };
    const txYear = {
      executedAt: now,
      coinsExchanged: 3000,
      amountDelivered: 30,
      statusTransaction: "completed",
    };
    const txTotal = {
      executedAt: now,
      coinsExchanged: 4000,
      amountDelivered: 40,
      statusTransaction: "completed",
    };

    strapi.entityService.findMany.mockImplementation(
      (uid: string, opts?: any) => {
        if (uid === "api::setting.setting") {
          return [
            {
              coinsPerTicket: 100,
              exchangeLimitEnabled: true,
              exchangeLimitTickets: 10000,
              exchangeLimitPeriod: "monthly",
            },
          ];
        }
        if (uid !== "api::user-transaction-history.user-transaction-history")
          return [];

        // History call (limit 10, sort desc)
        if (opts?.limit === 10 && opts?.sort?.executedAt === "desc") {
          return [txWeek, txMonth, txYear, txTotal];
        }

        // Aggregation calls return all tx
        return [txWeek, txMonth, txYear, txTotal];
      },
    );

    const ctx = mockCtx(user);
    ctx.request = { body: { data: { ticketsRequested: 100 } } };
    const res = await controller.exchangeCoinsToTickets(ctx);

    // The aggregation now sums all transactions in each period
    // Since all txs have "now" as executedAt, they all fall into week/month/year
    const expectedSum = 10 + 20 + 30 + 40;
    const expectedCoinsSum = 1000 + 2000 + 3000 + 4000;

    expect(res.stats.week).toEqual({
      ticketsExchanged: expectedSum,
      coinsSpent: expectedCoinsSum,
    });
    expect(res.stats.month).toEqual({
      ticketsExchanged: expectedSum,
      coinsSpent: expectedCoinsSum,
    });
    expect(res.stats.year).toEqual({
      ticketsExchanged: expectedSum,
      coinsSpent: expectedCoinsSum,
    });
    expect(res.stats.total).toEqual({
      ticketsExchanged: expectedSum,
      coinsSpent: expectedCoinsSum,
    });
    expect(res.history.length).toBe(4);
  });

  test("bloquea por tope mensual por defecto (10m) por suma de tickets", async () => {
    const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
    const txQuery = strapi.db.query(
      "api::user-transaction-history.user-transaction-history",
    ) as any;

    const beforeStat = makePlayerStat(user.id, 5000, 0, 0, 0);
    psQuery.findOne.mockResolvedValueOnce(beforeStat);

    strapi.db.mockTrx.select.mockResolvedValue([
      {
        id: beforeStat.id,
        coins: 5000,
        tickets: 0,
        coins_spent: 0,
        tickets_earned: 0,
      },
    ]);

    // Mock 10 transactions this month - limit reached
    const now = new Date();
    const txs = Array.from({ length: 10 }, () => ({
      executedAt: now,
      coinsExchanged: 1000,
      amountDelivered: 1,
      statusTransaction: "completed",
    }));

    // This is called inside the transaction for limit check
    txQuery.findMany.mockResolvedValue(txs);

    strapi.entityService.findMany.mockImplementation(
      (uid: string, opts?: any) => {
        if (uid === "api::setting.setting") {
          return [
            {
              coinsPerTicket: 1000,
              exchangeLimitEnabled: true,
              exchangeLimitTickets: 10,
              exchangeLimitPeriod: "monthly",
            },
          ];
        }
        return [];
      },
    );

    const ctx = mockCtx(user);
    ctx.request = { body: { data: { ticketsRequested: 1 } } };
    const res = await controller.exchangeCoinsToTickets(ctx);
    expect(res.status).toBe(400);
    expect(res.data?.reason).toBe("exchange_limit_reached");
    expect(res.data?.limitTickets).toBe(10);
    expect(res.data?.period).toBe("monthly");
  });

  test("bloquea por tope diario (10d)", async () => {
    const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
    const txQuery = strapi.db.query(
      "api::user-transaction-history.user-transaction-history",
    ) as any;

    const beforeStat = makePlayerStat(user.id, 5000, 0, 0, 0);
    psQuery.findOne.mockResolvedValueOnce(beforeStat);

    strapi.db.mockTrx.select.mockResolvedValue([
      {
        id: beforeStat.id,
        coins: 5000,
        tickets: 0,
        coins_spent: 0,
        tickets_earned: 0,
      },
    ]);

    const today = new Date();
    const txs = Array.from({ length: 10 }, () => ({
      executedAt: today,
      coinsExchanged: 1000,
      amountDelivered: 1,
      statusTransaction: "completed",
    }));

    txQuery.findMany.mockResolvedValue(txs);

    strapi.entityService.findMany.mockImplementation(
      (uid: string, opts?: any) => {
        if (uid === "api::setting.setting") {
          return [
            {
              coinsPerTicket: 1000,
              exchangeLimitEnabled: true,
              exchangeLimitTickets: 10,
              exchangeLimitPeriod: "daily",
            },
          ];
        }
        return [];
      },
    );

    const ctx = mockCtx(user);
    ctx.request = { body: { data: { ticketsRequested: 1 } } };
    const res = await controller.exchangeCoinsToTickets(ctx);
    expect(res.status).toBe(400);
    expect(res.data?.reason).toBe("exchange_limit_reached");
    expect(res.data?.period).toBe("daily");
  });

  test("bloquea por tope anual (10y)", async () => {
    const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
    const txQuery = strapi.db.query(
      "api::user-transaction-history.user-transaction-history",
    ) as any;

    const beforeStat = makePlayerStat(user.id, 5000, 0, 0, 0);
    psQuery.findOne.mockResolvedValueOnce(beforeStat);

    strapi.db.mockTrx.select.mockResolvedValue([
      {
        id: beforeStat.id,
        coins: 5000,
        tickets: 0,
        coins_spent: 0,
        tickets_earned: 0,
      },
    ]);

    const now = new Date();
    const txs = Array.from({ length: 10 }, () => ({
      executedAt: now,
      coinsExchanged: 1000,
      amountDelivered: 1,
      statusTransaction: "completed",
    }));

    txQuery.findMany.mockResolvedValue(txs);

    strapi.entityService.findMany.mockImplementation(
      (uid: string, opts?: any) => {
        if (uid === "api::setting.setting") {
          return [
            {
              coinsPerTicket: 1000,
              exchangeLimitEnabled: true,
              exchangeLimitTickets: 10,
              exchangeLimitPeriod: "yearly",
            },
          ];
        }
        return [];
      },
    );

    const ctx = mockCtx(user);
    ctx.request = { body: { data: { ticketsRequested: 1 } } };
    const res = await controller.exchangeCoinsToTickets(ctx);
    expect(res.status).toBe(400);
    expect(res.data?.reason).toBe("exchange_limit_reached");
    expect(res.data?.period).toBe("yearly");
  });

  test("permite canje cuando aún no se alcanza el tope", async () => {
    const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
    const txQuery = strapi.db.query(
      "api::user-transaction-history.user-transaction-history",
    ) as any;

    const beforeStat = makePlayerStat(user.id, 3000, 0, 0, 0);
    psQuery.findOne.mockResolvedValueOnce(beforeStat);

    strapi.db.mockTrx.select.mockResolvedValue([
      {
        id: beforeStat.id,
        coins: 3000,
        tickets: 0,
        coins_spent: 0,
        tickets_earned: 0,
      },
    ]);

    // 9 tickets used this month - 1 remaining
    const now = new Date();
    const txs = Array.from({ length: 9 }, () => ({
      executedAt: now,
      amountDelivered: 1,
    }));

    txQuery.findMany.mockResolvedValue(txs);
    psQuery.update.mockResolvedValue({});
    txQuery.create.mockResolvedValue({});

    strapi.entityService.findMany.mockImplementation(
      (uid: string, opts?: any) => {
        if (uid === "api::setting.setting") {
          return [
            {
              coinsPerTicket: 1000,
              exchangeLimitEnabled: true,
              exchangeLimitTickets: 10,
              exchangeLimitPeriod: "monthly",
            },
          ];
        }
        if (uid === "api::user-transaction-history.user-transaction-history") {
          return [];
        }
        return [];
      },
    );

    const ctx = mockCtx(user);
    ctx.request = { body: { data: { ticketsRequested: 1 } } };
    const res = await controller.exchangeCoinsToTickets(ctx);
    expect(res.ticketsExchanged).toBe(1);
    expect(res.coinsSpent).toBe(1000);
    expect(res.playerStats).toEqual({ coins: 2000, tickets: 1 });
  });

  test("bloquea si ticketsRequested supera el restante del tope", async () => {
    const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
    const txQuery = strapi.db.query(
      "api::user-transaction-history.user-transaction-history",
    ) as any;

    const beforeStat = makePlayerStat(user.id, 50000, 0, 0, 0);
    psQuery.findOne.mockResolvedValueOnce(beforeStat);

    strapi.db.mockTrx.select.mockResolvedValue([
      {
        id: beforeStat.id,
        coins: 50000,
        tickets: 0,
        coins_spent: 0,
        tickets_earned: 0,
      },
    ]);

    // 9 tickets used this month
    const now = new Date();
    const txs = Array.from({ length: 9 }, () => ({
      executedAt: now,
      amountDelivered: 1,
    }));

    txQuery.findMany.mockResolvedValue(txs);

    strapi.entityService.findMany.mockImplementation(
      (uid: string, opts?: any) => {
        if (uid === "api::setting.setting") {
          return [
            {
              coinsPerTicket: 1000,
              exchangeLimitEnabled: true,
              exchangeLimitTickets: 10,
              exchangeLimitPeriod: "monthly",
            },
          ];
        }
        return [];
      },
    );

    const ctx = mockCtx(user);
    // solicita 20, pero solo quedan 1 → debe bloquear
    ctx.request = { body: { data: { ticketsRequested: 20 } } };
    const res = await controller.exchangeCoinsToTickets(ctx);
    expect(res.status).toBe(400);
    expect(res.data?.reason).toBe("exchange_limit_reached");
  });

  test("sin límite por Settings permite canjes sin restricción y devuelve unlimited", async () => {
    const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
    const txQuery = strapi.db.query(
      "api::user-transaction-history.user-transaction-history",
    ) as any;

    const beforeStat = makePlayerStat(user.id, 10000, 0, 0, 0);
    psQuery.findOne.mockResolvedValueOnce(beforeStat);

    strapi.db.mockTrx.select.mockResolvedValue([
      {
        id: beforeStat.id,
        coins: 10000,
        tickets: 0,
        coins_spent: 0,
        tickets_earned: 0,
      },
    ]);

    txQuery.findMany.mockResolvedValue([]);
    psQuery.update.mockResolvedValue({});
    txQuery.create.mockResolvedValue({});

    strapi.entityService.findMany.mockImplementation(
      (uid: string, opts?: any) => {
        if (uid === "api::setting.setting") {
          return [{ coinsPerTicket: 100, exchangeLimitEnabled: false }];
        }
        if (uid === "api::user-transaction-history.user-transaction-history") {
          if (opts?.limit === 10) return [];
          return [];
        }
        return [];
      },
    );

    const ctx = mockCtx(user);
    ctx.request = { body: { data: { ticketsRequested: 100 } } };
    const res = await controller.exchangeCoinsToTickets(ctx);
    expect(res.ticketsExchanged).toBe(100);
    expect(res.limit.unlimited).toBe(true);
  });

  describe("Exchange Status", () => {
    test("retorna 401 si no autenticado", async () => {
      const res = await controller.exchangeCoinsToTicketsStatus(mockCtx());
      expect(res.status).toBe(401);
      expect(res.data?.reason).toBe("unauthorized");
    });

    test("status con límite mensual por Settings", async () => {
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue({ coins: 2000, tickets: 5 });

      strapi.entityService.findMany.mockImplementation(
        (uid: string, opts?: any) => {
          if (uid === "api::setting.setting")
            return [
              {
                coinsPerTicket: 1000,
                exchangeLimitEnabled: true,
                exchangeLimitTickets: 10,
                exchangeLimitPeriod: "monthly",
              },
            ];
          if (
            uid === "api::user-transaction-history.user-transaction-history"
          ) {
            if (opts?.filters?.executedAt?.$gte)
              return [{ amountDelivered: 3 }];
            if (opts?.limit === 10) return [];
          }
          return [];
        },
      );

      const res = await controller.exchangeCoinsToTicketsStatus(mockCtx(user));
      expect(res.rate).toBe(1000);
      expect(res.playerStats).toEqual({ coins: 2000, tickets: 5 });
      expect(res.limit).toEqual({
        limitTickets: 10,
        period: "monthly",
        ticketsUsed: 3,
        ticketsRemaining: 7,
        nextResetDate: expect.any(String),
      });
      expect(res.status.canExchange).toBe(true);
      expect(res.status.maxTicketsPossible).toBe(2); // min(2000/1000, 7)
    });

    test("status ilimitado por Settings (exchangeLimitEnabled=false)", async () => {
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue({ coins: 10000, tickets: 0 });

      strapi.entityService.findMany.mockImplementation(
        (uid: string, opts?: any) => {
          if (uid === "api::setting.setting")
            return [{ coinsPerTicket: 100, exchangeLimitEnabled: false }];
          if (
            uid === "api::user-transaction-history.user-transaction-history"
          ) {
            if (opts?.limit === 10) return [];
          }
          return [];
        },
      );

      const res = await controller.exchangeCoinsToTicketsStatus(mockCtx(user));
      expect(res.rate).toBe(100);
      expect(res.limit.unlimited).toBe(true);
      expect(res.status.maxTicketsPossible).toBe(10000 / 100);
    });

    test("usa defaults cuando no hay Settings", async () => {
      const psQuery = strapi.db.query("api::player-stat.player-stat") as any;
      psQuery.findOne.mockResolvedValue({ coins: 450, tickets: 23 });

      strapi.entityService.findMany.mockImplementation(() => []);

      const res = await controller.exchangeCoinsToTicketsStatus(mockCtx(user));
      // Now uses defaults instead of returning 400
      expect(res.rate).toBe(1000); // default rate
      expect(res.limit.limitTickets).toBe(10); // default limit
      expect(res.limit.period).toBe("monthly"); // default period
      expect(res.status.canExchange).toBe(false); // 450 coins < 1000 needed
      expect(res.status.maxTicketsPossible).toBe(0);
    });
  });
});
