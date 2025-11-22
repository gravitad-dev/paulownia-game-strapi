
import { createStrapi } from "@strapi/strapi";

async function main() {
  const strapi = await createStrapi({ distDir: "./dist" }).load();

  try {
    const userEmail = "synergiart.websupp@gmail.com";
    const achievementUuid = "596DXFvmMDtoV4DhvfrgL2X4";

    console.log(`🔍 Inspecting user-achievements for user: ${userEmail} and achievement UUID: ${achievementUuid}`);

    // 1. Find User
    const user = await strapi.db.query("plugin::users-permissions.user").findOne({
      where: { email: userEmail },
    });

    if (!user) {
      console.error("❌ User not found");
      process.exit(1);
    }
    console.log(`✅ User found: ID ${user.id}`);

    // 2. Find Achievements with that UUID
    const achievements = await strapi.db.query("api::achievement.achievement").findMany({
      where: { uuid: achievementUuid },
    });
    console.log(`📊 Found ${achievements.length} achievements with UUID ${achievementUuid}:`);
    achievements.forEach(a => console.log(`   - ID: ${a.id}, DocumentId: ${a.documentId}, Title: ${a.title}`));

    // 3. Find User Achievements linked to ANY of those achievements
    const achievementIds = achievements.map(a => a.id);
    const userAchievements = await strapi.db.query("api::user-achievement.user-achievement").findMany({
      where: {
        users_permissions_user: user.id,
        achievement: {
          id: { $in: achievementIds }
        }
      },
      populate: ["achievement"]
    });

    console.log(`\n📋 Found ${userAchievements.length} user-achievements records:`);
    userAchievements.forEach(ua => {
      console.log(`   - ID: ${ua.id}`);
      console.log(`     DocumentId: ${ua.documentId}`);
      console.log(`     Achievement ID: ${ua.achievement?.id}`);
      console.log(`     Completed: ${ua.completed}`);
      console.log(`     Claimed: ${ua.claimed}`);
      console.log(`     ClaimedAt: ${ua.claimedAt}`);
      console.log("     -------------------");
    });

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    process.exit(0);
  }
}

main();
