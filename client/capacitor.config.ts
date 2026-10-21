import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.theIT.spacefighter4',
  appName: 'Astro Cat PvP 4.0',
  webDir: 'dist',
  server: {
    // WKWebView cannot register http/https as custom iOS asset schemes.
    iosScheme: 'capacitor',
    androidScheme: 'http'
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '528039759292-052m13c4bffv1t5vskvdvmjdl9n23gb8.apps.googleusercontent.com',
      iosClientId: '528039759292-pag6tj2v0h9omdlkdh3lfne82ahpvpep.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
