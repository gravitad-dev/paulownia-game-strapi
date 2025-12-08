import { createStrapi } from "@strapi/strapi";

async function listAdminRoutes() {
  // Initialize Strapi instance pointing to the dist directory
  const strapi = await createStrapi({ distDir: "./dist" }).load();

  console.log("--- Plugin Routes ---");
  const plugins = strapi.plugins;
  const enabledPlugins = strapi.config.get('enabledPlugins') as any;
  console.log('Enabled plugins keys:', Object.keys(enabledPlugins || {}));
  if (enabledPlugins && enabledPlugins['game-dashboard']) {
    const p = enabledPlugins['game-dashboard'];
    console.log('game-dashboard pathToPlugin:', p.pathToPlugin);
    console.log('game-dashboard resolved export:', p);
  }

  if (plugins["game-dashboard"]) {
    console.log("Game Dashboard plugin found!");
    console.log("Keys:", Object.keys(plugins["game-dashboard"]));
    console.log(
      "Routes:",
      JSON.stringify(plugins["game-dashboard"].routes, null, 2),
    );
  } else {
    console.log("Game Dashboard plugin NOT found in strapi.plugins");
  }

  for (const pluginName in plugins) {
    const plugin = plugins[pluginName];
    if (plugin.routes) {
      // plugin.routes can be an object or array
      const routes = plugin.routes;

      // Iterate keys if it's an object
      for (const key in routes) {
        const routeGroup = routes[key];

        // Check for admin routes
        if (routeGroup.type === "admin") {
          console.log(`Plugin: ${pluginName} (Group: ${key})`);

          if (Array.isArray(routeGroup.routes)) {
            routeGroup.routes.forEach((route: any) => {
              console.log(`  ${route.method} ${route.path}`);
            });
          }
        }
      }
    }
  }

  process.exit(0);
}

listAdminRoutes();
