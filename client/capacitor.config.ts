import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ban.astrocat',
  appName: 'Astro Cat PvP 4.0',
  webDir: 'dist',
  
  server: {
    iosScheme: 'https',
    androidScheme: 'https'
  },

  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '271365354200-divjlei917agdhao9na226dnhemtiq2b.apps.googleusercontent.com',
      iosClientId: '271365354200-73cqo1dnhg0vah523m0g61p2l9n856bk.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;