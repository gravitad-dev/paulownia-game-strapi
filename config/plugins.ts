import path from 'path';

export default () => ({
  'game-dashboard': {
    enabled: true,
    resolve: path.resolve(process.cwd(), 'src', 'plugins', 'game-dashboard'),
  },
});
