import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

/**
 * Routes that carry <meta name="robots" content="noindex">, kept out of the
 * sitemap. The admin arm matches the whole subtree, not just /admin/ itself.
 */
const NOINDEX = /\/(login|account|join\/submitted)\/?$|\/admin(\/|$)/;

export default defineConfig({
  site: 'https://vmsna.org',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },

  integrations: [sitemap({ filter: (page) => !NOINDEX.test(page) })],
});
