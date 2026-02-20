/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Externalize pino to prevent webpack from bundling it
    // Pino uses worker threads (via thread-stream) that break when bundled
    serverComponentsExternalPackages: ['pino', 'pino-pretty'],
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // NAVIGATION REDESIGN — Phase 1 Redirects (February 2026)
  // ═══════════════════════════════════════════════════════════════════════════════
  //
  // All old routes permanently redirect (308) to their new equivalents.
  // This ensures bookmarks, shared links, and cached navigation state continue
  // to work after the navigation restructure.
  //
  // Next.js redirects run BEFORE page resolution, so they take priority
  // even when old page files still exist at the source path.
  // Query params in destination URLs are fully supported.
  //
  // See NAVIGATION_REDESIGN_PLAN.md for full redirect mapping.
  // ═══════════════════════════════════════════════════════════════════════════════
  async redirects() {
    return [
      // ─── Hub → Home ──────────────────────────────────────────────────────────
      {
        source: '/hub',
        destination: '/home',
        permanent: true,
      },

      // ─── Discover → Inbox ────────────────────────────────────────────────────
      // Base route redirect
      {
        source: '/discover',
        destination: '/inbox',
        permanent: true,
      },
      // Category detail redirect: /discover/[category] → /inbox/[category]
      {
        source: '/discover/:category',
        destination: '/inbox/:category',
        permanent: true,
      },
      // Email detail redirect: /discover/[cat]/[emailId] → /inbox/[cat]/[emailId]
      {
        source: '/discover/:category/:emailId',
        destination: '/inbox/:category/:emailId',
        permanent: true,
      },

      // ─── Actions → Tasks ────────────────────────────────────────────────────
      {
        source: '/actions',
        destination: '/tasks',
        permanent: true,
      },

      // ─── Events → Calendar ───────────────────────────────────────────────────
      {
        source: '/events',
        destination: '/calendar',
        permanent: true,
      },

      // ─── Timeline → Calendar ─────────────────────────────────────────────────
      {
        source: '/timeline',
        destination: '/calendar',
        permanent: true,
      },

      // ─── Campaigns → Tasks ───────────────────────────────────────────────────
      // IMPORTANT: /campaigns/new must come BEFORE /campaigns/:id to avoid
      // the :id wildcard matching "new" as an ID.
      {
        source: '/campaigns/new',
        destination: '/tasks/campaigns/new',
        permanent: true,
      },
      {
        source: '/campaigns/:id',
        destination: '/tasks/campaigns/:id',
        permanent: true,
      },
      // Base campaigns route → tasks with campaigns tab
      {
        source: '/campaigns',
        destination: '/tasks?tab=campaigns',
        permanent: true,
      },

      // ─── Templates → Tasks ───────────────────────────────────────────────────
      {
        source: '/templates',
        destination: '/tasks?tab=templates',
        permanent: true,
      },

      // ─── Clients → Contacts ──────────────────────────────────────────────────
      // Detail route must come before base route
      {
        source: '/clients/:id',
        destination: '/contacts/:id',
        permanent: true,
      },
      {
        source: '/clients',
        destination: '/contacts?tab=clients',
        permanent: true,
      },

      // ─── Archive → Inbox ─────────────────────────────────────────────────────
      {
        source: '/archive',
        destination: '/inbox?tab=archive',
        permanent: true,
      },
    ];
  },

  // Webpack configuration to address cache serialization warnings
  webpack: (config, { dev }) => {
    if (dev) {
      // Optimize filesystem cache to reduce serialization warnings
      // "Serializing big strings impacts deserialization performance"
      config.cache = {
        ...config.cache,
        type: 'filesystem',
        compression: false, // Disable compression to speed up cache operations
      };
    }
    return config;
  },
};

export default nextConfig;
