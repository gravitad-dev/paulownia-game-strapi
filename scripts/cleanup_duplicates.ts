
import { createStrapi } from "@strapi/strapi";

async function main() {
  const strapi = await createStrapi({ distDir: "./dist" }).load();

  try {
    console.log("🧹 Starting duplicate cleanup...");

    // 1. Get all user-achievements populated with achievement
    const userAchievements = await strapi.db.query("api::user-achievement.user-achievement").findMany({
      populate: ["achievement", "users_permissions_user"],
    });

    console.log(`📊 Total user-achievements: ${userAchievements.length}`);

    // 2. Group by User + Achievement UUID
    const grouped = {};
    
    for (const ua of userAchievements) {
      if (!ua.achievement || !ua.users_permissions_user) continue;
      
      const key = `${ua.users_permissions_user.id}_${ua.achievement.uuid}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(ua);
    }

    // 3. Identify and remove duplicates
    let removedCount = 0;
    
    for (const key in grouped) {
      const records = grouped[key];
      
      if (records.length > 1) {
        console.log(`⚠️ Found ${records.length} duplicates for key ${key}`);
        
        // Sort to find the best one to keep:
        // Priority: Claimed > Completed > Highest Progress > Newest
        records.sort((a, b) => {
          if (a.claimed !== b.claimed) return b.claimed ? 1 : -1; // Keep claimed
          if (a.completed !== b.completed) return b.completed ? 1 : -1; // Keep completed
          if (a.currentProgress !== b.currentProgress) return b.currentProgress - a.currentProgress; // Keep highest progress
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // Keep newest
        });

        const toKeep = records[0];
        const toRemove = records.slice(1);

        console.log(`   ✅ Keeping ID ${toKeep.id} (Claimed: ${toKeep.claimed}, Completed: ${toKeep.completed})`);
        
        for (const remove of toRemove) {
          console.log(`   🗑️ Removing ID ${remove.id} (Claimed: ${remove.claimed})`);
          await strapi.entityService.delete("api::user-achievement.user-achievement", remove.id);
          removedCount++;
        }
      }
    }

    console.log(`\n✅ Cleanup complete. Removed ${removedCount} duplicate records.`);

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    process.exit(0);
  }
}

main();
