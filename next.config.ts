/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the dev server to be reached from this LAN origin (silences the
  // cross-origin dev request warning / block).
  allowedDevOrigins: ['172.16.1.117'],
  turbopack: {
    rules: {
      "*.glsl": {
        loaders: ["raw-loader"],
        as: "*.js",
      },
    },
  },
  async redirects() {
    // Read the intended route globally
    const entryRoute = process.env.NEXT_PUBLIC_ENTRY_ROUTE;
    if (entryRoute) {
      return [
        {
          source: '/',
          destination: entryRoute, // Force exterior/root visits here
          permanent: false,        // Keep false for dev flexibility
        },
        {
          source: '/extract-pos',
          destination: entryRoute, // Redirect /interior to entry route as well
          permanent: false,
        },
          {
          source: '/interior/:nodeId',
          destination: entryRoute, // Redirect any direct interior visit to the entry route
          permanent: false,
        }
      ];
    }
    return [];
  },
};

export default nextConfig;
