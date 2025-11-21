export default ({ env }: { env: (key: string, def?: any) => any }) => {
  const dayStr = String(env("CRON_RESET_DAY", "1")).toLowerCase();
  const hourStr = String(env("CRON_RESET_HOUR", "0"));

  const resetTask = async ({ strapi }: { strapi: any }) => {
    const startedAt = new Date().toISOString();
    console.log("Running monthly daily reward reset...");
    try {
      const beforeCount = await strapi.entityService.count(
        "api::user-daily-reward.user-daily-reward",
        { filters: {} }
      );
      const delRes = await strapi.db
        .query("api::user-daily-reward.user-daily-reward")
        .deleteMany({ where: {} });
      const afterCount = await strapi.entityService.count(
        "api::user-daily-reward.user-daily-reward",
        { filters: {} }
      );
      const deleted = typeof delRes?.count === "number" ? delRes.count : beforeCount - afterCount;
      const finishedAt = new Date().toISOString();
      const stats = {
        mode: dayStr,
        expr: null,
        beforeCount,
        deleted,
        afterCount,
        startedAt,
        finishedAt,
      };
      console.log("Monthly daily reward reset completed.", stats);
    } catch (error) {
      console.error("Error in monthly daily reward reset:", error);
    }
  };

  const tasks: Record<string, any> = {};

  if (dayStr === "test") {
    tasks["* * * * *"] = resetTask;
    return tasks;
  }

  if (dayStr === "off" || dayStr === "disabled" || dayStr === "false") {
    return tasks;
  }

  const day = parseInt(dayStr, 10);
  const hour = parseInt(hourStr, 10);
  const validDay = Number.isFinite(day) && day >= 1 && day <= 31 ? day : 1;
  const validHourMadrid = Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 0;

  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', timeZoneName: 'short' }).formatToParts(new Date());
  const tzPart = parts.find(p => p.type === 'timeZoneName');
  const m = tzPart && tzPart.value.match(/GMT([+-]\d+)/);
  const offsetHours = m ? parseInt(m[1], 10) : 1;
  const utcHour = ((validHourMadrid - offsetHours) % 24 + 24) % 24;
  const expr = `0 ${utcHour} ${validDay} * *`;
  tasks[expr] = resetTask;
  return tasks;
};
