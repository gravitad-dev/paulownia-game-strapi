import { PLUGIN_ID } from "./pluginId";
import PluginIcon from "./components/PluginIcon";

export default {
  register(app: any) {
    app.addMenuLink({
      to: `/plugins/${PLUGIN_ID}`,
      icon: PluginIcon,
      intlLabel: {
        id: `${PLUGIN_ID}.plugin.name`,
        defaultMessage: "Game Dashboard",
      },
      Component: async () => {
        const component = await import("./pages/App");
        return component;
      },
      permissions: [],
    });

    app.registerPlugin({
      id: PLUGIN_ID,
      name: PLUGIN_ID,
    });
  },

  bootstrap() {},

  async registerTrads({ locales }: { locales: string[] }) {
    return Promise.all(
      locales.map(async (locale) => {
        return {
          data: {
            [`${PLUGIN_ID}.plugin.name`]: "Game Dashboard",
          },
          locale,
        };
      }),
    );
  },
};
