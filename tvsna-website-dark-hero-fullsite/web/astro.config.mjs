import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

/** Routes that carry <meta name="robots" content="noindex">, kept out of the sitemap. */
const NOINDEX = /\/(login|account|admin|join\/submitted)\/?$/;

export default defineConfig({
  site: 'https://vmsna.org',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },

  /*
    The admin console is rebuilt in Phase 3. Until then /admin forwards to the
    legacy page, which is still served from web/public and still works.
  */
  redirects: {
    '/admin': '/admin.html',
  },

  integrations: [sitemap({ filter: (page) => !NOINDEX.test(page) })],
});
