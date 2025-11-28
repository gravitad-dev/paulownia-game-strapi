import { factories } from "@strapi/strapi";
import { getUuidControllerMethods } from "../../../helpers/uuidApi";
import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  startOfYear,
  addDays,
  addMonths,
  addYears,
} from "date-fns";
import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";

const TIMEZONE = "Europe/Madrid";

export default factories.createCoreController(
  "api::player-stat.player-stat",
  ({ strapi }) => ({
    ...getUuidControllerMethods("api::player-stat.player-stat"),
    async exchangeCoinsToTickets(ctx) {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
      }
      const body = ctx.request.body?.data || {};
      const ticketsRequested = Number(body.ticketsRequested);
      if (!Number.isInteger(ticketsRequested) || ticketsRequested <= 0) {
        return ctx.badRequest("Invalid request", { reason: "invalid_request" });
      }
      const settingsRes = await strapi.entityService.findMany(
        "api::setting.setting",
        {
          sort: { updatedAt: "desc" },
          publicationState: "live",
          locale: "all",
          limit: 1,
        },
      );
      const settings = (
        Array.isArray(settingsRes) ? settingsRes[0] : settingsRes
      ) as any | undefined;
      let rateSource = 1000;
      let limitDisabled = false;
      let limitCount: number | null = null;
      let periodLabel: string = "monthly";
      if (settings) {
        rateSource = Number(settings.coinsPerTicket) || rateSource;
        limitDisabled = settings.exchangeLimitEnabled === false;
        if (!limitDisabled) {
          limitCount = Number(settings.exchangeLimitTickets) || 10;
          const period = String(
            settings.exchangeLimitPeriod || "monthly",
          ).toLowerCase();
          periodLabel =
            period === "daily"
              ? "daily"
              : period === "yearly"
                ? "yearly"
                : "monthly";
        }
      } else {
        return ctx.badRequest("Settings not configured", {
          reason: "settings_not_configured",
        });
      }
      let ticketsUsed = 0;
      let nextResetDate: string | null = null;
      if (!limitDisabled) {
        const now = new Date();
        const nowMadrid = utcToZonedTime(now, TIMEZONE);
        let periodStartMadrid: Date;
        let nextResetMadrid: Date;

        if (periodLabel === "daily") {
          periodStartMadrid = startOfDay(nowMadrid);
          nextResetMadrid = startOfDay(addDays(nowMadrid, 1));
        } else if (periodLabel === "yearly") {
          periodStartMadrid = startOfYear(nowMadrid);
          nextResetMadrid = startOfYear(addYears(nowMadrid, 1));
        } else {
          periodStartMadrid = startOfMonth(nowMadrid);
          nextResetMadrid = startOfMonth(addMonths(nowMadrid, 1));
        }

        const periodStart = zonedTimeToUtc(periodStartMadrid, TIMEZONE);
        nextResetDate = zonedTimeToUtc(nextResetMadrid, TIMEZONE).toISOString();

        const periodTx = await strapi.entityService.findMany(
          "api::user-transaction-history.user-transaction-history",
          {
            filters: {
              users_permissions_user: user.id,
              transactionType: "coins_to_tickets",
              executedAt: { $gte: periodStart },
            },
          },
        );
        ticketsUsed = (periodTx || []).reduce(
          (acc: number, it: any) => acc + (it.amountDelivered || 0),
          0,
        );
        const ticketsRemaining = Math.max(
          0,
          (limitCount as number) - ticketsUsed,
        );
        if (ticketsRemaining <= 0 || ticketsRequested > ticketsRemaining) {
          return ctx.badRequest("Exchange limit reached", {
            reason: "exchange_limit_reached",
            limitTickets: limitCount,
            period: periodLabel,
            ticketsUsed,
            ticketsRemaining,
            nextResetDate,
          });
        }
      }
      const ps = await strapi.db
        .query("api::player-stat.player-stat")
        .findOne({ where: { users_permissions_user: user.id } });
      const rate = rateSource;
      const coinsNeeded = ticketsRequested * rate;
      const availableCoins = ps?.coins || 0;
      if (!ps || availableCoins < coinsNeeded) {
        const maxTicketsPossible = Math.floor(availableCoins / rate);
        return ctx.badRequest("Insufficient coins", {
          reason: "insufficient_coins",
          maxTicketsPossible,
        });
      }
      const prev = { ...ps };
      await strapi.entityService.update("api::player-stat.player-stat", ps.id, {
        data: {
          coins: availableCoins - coinsNeeded,
          tickets: (ps.tickets || 0) + ticketsRequested,
          coinsSpent: (ps.coinsSpent || 0) + coinsNeeded,
          ticketsEarned: (ps.ticketsEarned || 0) + ticketsRequested,
        },
      });
      try {
        await strapi.entityService.create(
          "api::user-transaction-history.user-transaction-history",
          {
            data: {
              users_permissions_user: user.id,
              transactionType: "coins_to_tickets",
              currency: "coins",
              statusTransaction: "completed",
              coinsExchanged: coinsNeeded,
              amountDelivered: ticketsRequested,
              executedAt: new Date(),
            },
          },
        );
      } catch (e) {
        await strapi.entityService.update(
          "api::player-stat.player-stat",
          ps.id,
          {
            data: {
              coins: prev.coins ?? 0,
              tickets: prev.tickets ?? 0,
              coinsSpent: prev.coinsSpent ?? 0,
              ticketsEarned: prev.ticketsEarned ?? 0,
            },
          },
        );
        return ctx.badRequest("Failed to log transaction", {
          reason: "transaction_log_failed",
        });
      }
      const updated = await strapi.db
        .query("api::player-stat.player-stat")
        .findOne({ where: { users_permissions_user: user.id } });

      // re-calc now for aggregation windows using Madrid timezone
      const now2 = new Date();
      const nowMadrid = utcToZonedTime(now2, TIMEZONE);

      const startOfWeekMadrid = startOfWeek(nowMadrid, { weekStartsOn: 1 });
      const startOfMonthMadrid = startOfMonth(nowMadrid);
      const startOfYearMadrid = startOfYear(nowMadrid);

      const startOfWeekUtc = zonedTimeToUtc(startOfWeekMadrid, TIMEZONE);
      const startOfMonthUtc = zonedTimeToUtc(startOfMonthMadrid, TIMEZONE);
      const startOfYearUtc = zonedTimeToUtc(startOfYearMadrid, TIMEZONE);

      const weekTx = await strapi.entityService.findMany(
        "api::user-transaction-history.user-transaction-history",
        {
          filters: {
            users_permissions_user: user.id,
            transactionType: "coins_to_tickets",
            executedAt: { $gte: startOfWeekUtc },
          },
        },
      );
      const monthTx = await strapi.entityService.findMany(
        "api::user-transaction-history.user-transaction-history",
        {
          filters: {
            users_permissions_user: user.id,
            transactionType: "coins_to_tickets",
            executedAt: { $gte: startOfMonthUtc },
          },
        },
      );
      const yearTx = await strapi.entityService.findMany(
        "api::user-transaction-history.user-transaction-history",
        {
          filters: {
            users_permissions_user: user.id,
            transactionType: "coins_to_tickets",
            executedAt: { $gte: startOfYearUtc },
          },
        },
      );
      const totalTx = await strapi.entityService.findMany(
        "api::user-transaction-history.user-transaction-history",
        {
          filters: {
            users_permissions_user: user.id,
            transactionType: "coins_to_tickets",
          },
        },
      );
      const sum = (arr: any[]) =>
        arr.reduce(
          (acc, it) => ({
            coinsExchanged: acc.coinsExchanged + (it.coinsExchanged || 0),
            amountDelivered: acc.amountDelivered + (it.amountDelivered || 0),
          }),
          { coinsExchanged: 0, amountDelivered: 0 },
        );
      const weekSum = sum(weekTx || []);
      const monthSum = sum(monthTx || []);
      const yearSum = sum(yearTx || []);
      const totalSum = sum(totalTx || []);
      const history = await strapi.entityService.findMany(
        "api::user-transaction-history.user-transaction-history",
        {
          filters: {
            users_permissions_user: user.id,
            transactionType: "coins_to_tickets",
          },
          sort: { executedAt: "desc" },
          limit: 10,
        },
      );
      return {
        ticketsExchanged: ticketsRequested,
        coinsSpent: coinsNeeded,
        playerStats: {
          coins: updated?.coins || 0,
          tickets: updated?.tickets || 0,
        },
        limit: limitDisabled
          ? { unlimited: true }
          : {
              limitTickets: limitCount as number,
              period: periodLabel,
              ticketsUsed: ticketsUsed + ticketsRequested,
              ticketsRemaining: Math.max(
                0,
                (limitCount as number) - (ticketsUsed + ticketsRequested),
              ),
              nextResetDate: !limitDisabled
                ? (() => {
                    const now = new Date();
                    const nowMadrid = utcToZonedTime(now, TIMEZONE);
                    let nextResetMadrid: Date;
                    if (periodLabel === "daily") {
                      nextResetMadrid = startOfDay(addDays(nowMadrid, 1));
                    } else if (periodLabel === "yearly") {
                      nextResetMadrid = startOfYear(addYears(nowMadrid, 1));
                    } else {
                      nextResetMadrid = startOfMonth(addMonths(nowMadrid, 1));
                    }
                    return zonedTimeToUtc(
                      nextResetMadrid,
                      TIMEZONE,
                    ).toISOString();
                  })()
                : null,
            },
        stats: {
          week: {
            ticketsExchanged: weekSum.amountDelivered,
            coinsSpent: weekSum.coinsExchanged,
          },
          month: {
            ticketsExchanged: monthSum.amountDelivered,
            coinsSpent: monthSum.coinsExchanged,
          },
          year: {
            ticketsExchanged: yearSum.amountDelivered,
            coinsSpent: yearSum.coinsExchanged,
          },
          total: {
            ticketsExchanged: totalSum.amountDelivered,
            coinsSpent: totalSum.coinsExchanged,
          },
        },
        history: (history || []).map((h: any) => ({
          executedAt: h.executedAt,
          coinsExchanged: h.coinsExchanged,
          amountDelivered: h.amountDelivered,
          statusTransaction: h.statusTransaction,
        })),
      };
    },

    async exchangeCoinsToTicketsStatus(ctx) {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
      }
      const settingsRes = await strapi.entityService.findMany(
        "api::setting.setting",
        {
          sort: { updatedAt: "desc" },
          publicationState: "live",
          locale: "all",
          limit: 1,
        },
      );
      const settings = (
        Array.isArray(settingsRes) ? settingsRes[0] : settingsRes
      ) as any | undefined;
      let rateSource = 1000;
      let limitDisabled = false;
      let limitCount: number | null = null;
      let periodLabel: string = "monthly";
      if (settings) {
        rateSource = Number(settings.coinsPerTicket) || rateSource;
        limitDisabled = settings.exchangeLimitEnabled === false;
        if (!limitDisabled) {
          limitCount = Number(settings.exchangeLimitTickets) || 10;
          const period = String(
            settings.exchangeLimitPeriod || "monthly",
          ).toLowerCase();
          periodLabel =
            period === "daily"
              ? "daily"
              : period === "yearly"
                ? "yearly"
                : "monthly";
        }
      } else {
        return ctx.badRequest("Settings not configured", {
          reason: "settings_not_configured",
        });
      }
      const ps = await strapi.db
        .query("api::player-stat.player-stat")
        .findOne({ where: { users_permissions_user: user.id } });
      const rate = rateSource;
      const coins = ps?.coins || 0;
      const tickets = ps?.tickets || 0;
      const maxByCoins = Math.floor(coins / rate);
      let ticketsUsed = 0;
      let ticketsRemaining = Infinity;
      let nextResetDate: string | null = null;
      if (!limitDisabled) {
        const now = new Date();
        const nowMadrid = utcToZonedTime(now, TIMEZONE);
        let periodStartMadrid: Date;
        let nextResetMadrid: Date;

        if (periodLabel === "daily") {
          periodStartMadrid = startOfDay(nowMadrid);
          nextResetMadrid = startOfDay(addDays(nowMadrid, 1));
        } else if (periodLabel === "yearly") {
          periodStartMadrid = startOfYear(nowMadrid);
          nextResetMadrid = startOfYear(addYears(nowMadrid, 1));
        } else {
          periodStartMadrid = startOfMonth(nowMadrid);
          nextResetMadrid = startOfMonth(addMonths(nowMadrid, 1));
        }

        const periodStart = zonedTimeToUtc(periodStartMadrid, TIMEZONE);
        nextResetDate = zonedTimeToUtc(nextResetMadrid, TIMEZONE).toISOString();

        const periodTx = await strapi.entityService.findMany(
          "api::user-transaction-history.user-transaction-history",
          {
            filters: {
              users_permissions_user: user.id,
              transactionType: "coins_to_tickets",
              executedAt: { $gte: periodStart },
            },
          },
        );
        ticketsUsed = (periodTx || []).reduce(
          (acc: number, it: any) => acc + (it.amountDelivered || 0),
          0,
        );
        ticketsRemaining = Math.max(0, (limitCount as number) - ticketsUsed);
      }
      const canExchange = limitDisabled
        ? maxByCoins > 0
        : Math.min(maxByCoins, ticketsRemaining as number) > 0;
      const maxTicketsPossible = limitDisabled
        ? maxByCoins
        : Math.min(maxByCoins, ticketsRemaining as number);
      const history = await strapi.entityService.findMany(
        "api::user-transaction-history.user-transaction-history",
        {
          filters: {
            users_permissions_user: user.id,
            transactionType: "coins_to_tickets",
          },
          sort: { executedAt: "desc" },
          limit: 10,
        },
      );
      return {
        status: { canExchange, maxTicketsPossible },
        rate,
        playerStats: { coins, tickets },
        limit: limitDisabled
          ? { unlimited: true }
          : {
              limitTickets: limitCount as number,
              period: periodLabel,
              ticketsUsed,
              ticketsRemaining: ticketsRemaining as number,
              nextResetDate,
            },
        history: (history || []).map((h: any) => ({
          executedAt: h.executedAt,
          coinsExchanged: h.coinsExchanged,
          amountDelivered: h.amountDelivered,
          statusTransaction: h.statusTransaction,
        })),
      };
    },
  }),
);
