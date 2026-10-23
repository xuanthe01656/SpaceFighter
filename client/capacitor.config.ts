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
    SocialLogin: {
      providers: { google: true, apple: true, facebook: false, twitter: false },
    },
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
