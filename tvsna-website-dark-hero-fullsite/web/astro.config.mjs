import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://vmsna.org',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },

  /*
    The member area is rebuilt in Phase 2. Until then these routes forward to
    the legacy pages, which are still served verbatim from web/public and still
    work. That keeps every call to action on the new site live rather than
    dead-ending, and the redirects are deleted when the real routes land.
  */
  redirects: {
    '/join': '/membership.html',
    '/login': '/membership.html',
    '/directory': '/dashboard.html',
    '/account': '/dashboard.html',
    '/admin': '/admin.html',
  },

  integrations: [sitemap({ filter: (page) => !/\/(join|login|directory|account|admin)\/?$/.test(page) })],
});
