import { createStrapiMock } from "../helpers/strapi-mock";

describe("Tarea Cron de Ranking", () => {
  let strapi: ReturnType<typeof createStrapiMock>;

  beforeEach(async () => {
    strapi = createStrapiMock();
    (global as any).strapi = strapi;
    jest.resetModules();
    
    // Mock the cron task file import
    // We'll need to import the function that defines the tasks
    // Since we haven't modified cron-tasks.ts yet to export the specific function easier, 
    // we might need to structure the test to mock the logic or wait until we implement the cron.
    // For now, let's assume we'll export a 'generateRanking' function or similar from a helper or the cron file itself if possible,
    // or we'll test the logic by extracting it. 
    // To make it testable, I'll implement the logic in a separate service or just test the cron function if I can access it.
    // Actually, the cron-tasks.ts exports a default function that returns the tasks. 
    // I'll modify cron-tasks.ts to export the ranking logic function specifically for testing, or just test the side effects.
  });

  test("should create a ranking entry with top players", async () => {
    // Setup mock data
    const players = [
      { id: 3, highestScore: 1200, users_permissions_user: { username: "player3" } },
      { id: 1, highestScore: 1000, users_permissions_user: { username: "player1" } },
      { id: 2, highestScore: 800, users_permissions_user: { username: "player2" } },
    ];

    strapi.entityService.findMany.mockResolvedValue(players);
    strapi.entityService.create.mockResolvedValue({ id: 1 });

    // Define the logic here to test it before putting it into the cron file
    // or import it if we had it.
    // For this TDD approach, I'll define the function here as if it was the one I'm going to implement.
    
    const generateRanking = async ({ strapi }: { strapi: any }) => {
      const players = await strapi.entityService.findMany("api::player-stat.player-stat", {
        sort: { highestScore: "desc" },
        limit: 100,
        populate: { users_permissions_user: true },
      });

      const topPlayers = players.map((p: any, index: number) => ({
        rank: index + 1,
        username: p.users_permissions_user?.username || "Unknown",
        score: p.highestScore,
      }));

      await strapi.entityService.create("api::ranking.ranking", {
        data: {
          timestamp: new Date(),
          topPlayers,
        },
      });
    };

    await generateRanking({ strapi });

    // Assertions
    expect(strapi.entityService.findMany).toHaveBeenCalledWith("api::player-stat.player-stat", {
      sort: { highestScore: "desc" },
      limit: 100,
      populate: { users_permissions_user: true },
    });

    expect(strapi.entityService.create).toHaveBeenCalledWith("api::ranking.ranking", expect.objectContaining({
      data: expect.objectContaining({
        topPlayers: expect.arrayContaining([
          { rank: 1, username: "player1", score: 1000 },
          { rank: 2, username: "player2", score: 800 },
          { rank: 3, username: "player3", score: 1200 },
        ].sort((a, b) => b.score - a.score).map((p, i) => ({ ...p, rank: i + 1 })))
      })
    }));
  });
});
