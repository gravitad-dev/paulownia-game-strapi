import { createStrapi } from "@strapi/strapi";

async function main() {
  const strapi = await createStrapi({ distDir: "./dist" }).load();

  try {
    const uuid = "SVyMYe8JEDBIBAPDhleTdxdV";
    console.log(`🔍 Buscando recompensa con UUID: ${uuid}`);

    const userReward = await strapi.db
      .query("api::user-reward.user-reward")
      .findOne({
        where: { uuid },
        populate: ["reward_claim"],
      });

    if (!userReward) {
      console.log("❌ User reward not found");
      return;
    }

    console.log(
      `✅ Recompensa encontrada (ID: ${userReward.id}). hasClaim: ${userReward.hasClaim}`,
    );

    if (userReward.reward_claim) {
      console.log(
        `🗑️ Eliminando reclamo existente (ID: ${userReward.reward_claim.id})...`,
      );
      await strapi.entityService.delete(
        "api::reward-claim.reward-claim",
        userReward.reward_claim.id,
      );
    }

    console.log(`🔄 Reseteando flag hasClaim...`);
    await strapi.db.query("api::user-reward.user-reward").update({
      where: { id: userReward.id },
      data: { hasClaim: false },
    });

    console.log("✅ Reset completado exitosamente.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
