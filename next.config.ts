/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Origins allowed to request dev-only assets.
   *
   * `next dev` BLOCKS cross-origin requests to `/_next/*` — it answers them
   * 403 — and the failure is a quiet one: the page HTML is served normally, so
   * the route renders, and only the JS chunks are refused. What you see is an
   * app stuck forever on its first loading screen with no error anywhere on the
   * page. Measured on this app, same chunk, two hosts:
   *
   *   Host: localhost              → 200, 675 bytes
   *   Host: <id>.ngrok-free.app    → 403,  12 bytes
   *
   * THE TUNNEL DOMAINS ARE THE POINT. A headset needs https for WebXR to exist
   * at all (`navigator.xr` is gated on a secure context), so testing /vr on a
   * real device means tunnelling the dev server — and ngrok issues a NEW random
   * subdomain per session, so naming one host is useless. The wildcards cover
   * every session; the doc for this option documents `*.example.com` form.
   *
   * `next start` is unaffected — the restriction is dev-only — so a production
   * build served through the same tunnel never needed this.
   */
  allowedDevOrigins: [
    // This LAN origin (silences the cross-origin dev request warning / block).
    '172.16.1.117',
    // ngrok, across its current and legacy domains.
    '*.ngrok-free.app',
    '*.ngrok.app',
    '*.ngrok.io',
    '*.ngrok-free.dev',
  ],
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
