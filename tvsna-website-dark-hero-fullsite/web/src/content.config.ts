import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/*
  Content lives in git, not Firestore: it changes a few times a year, it wants
  version history and review, and prerendering it costs nothing at runtime.
  The Zod schemas below turn a volunteer's typo into a failed build instead of
  an "undefined" rendered to the public — which is how the old About page came
  to ship four entries reading "Name Placeholder".
*/

const events = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/events' }),
  schema: z.object({
    title: z.string(),
    start: z.coerce.date(),
    end: z.coerce.date().optional(),
    /** Free text: "Dallas, Texas" or "Virtual". */
    location: z.string(),
    chapter: z.string().default('National'),
    summary: z.string().max(280),
    registrationUrl: z.string().url().optional(),
    /** Set once the event has happened and a recap exists. */
    recap: z.boolean().default(false),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

const chapters = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/chapters' }),
  schema: z.object({
    name: z.string(),
    order: z.number().int(),
    country: z.enum(['US', 'CA', 'IN', 'Multiple']),
    regions: z.array(z.string()),
    blurb: z.string().max(220),
    contactRole: z.string().optional(),
  }),
});

const officers = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/officers' }),
  schema: z.object({
    term: z.string().regex(/^\d{4}-\d{4}$/),
    tier: z.enum(['executive', 'office-bearer', 'committee-chair', 'chapter-lead', 'advisor']),
    role: z.string(),
    order: z.number().int(),
    name: z.string(),
    nameTamil: z.string().optional(),
    city: z.string(),
    state: z.string(),
    country: z.enum(['US', 'CA', 'IN']),
    nativePlace: z.string(),
    profession: z.string(),
    /** Routed alias such as president@vmsna.org — never a personal address. */
    contactRole: z.string().optional(),
    linkedin: z.string().url().optional(),
    committees: z.array(z.string()).default([]),
    focus: z.array(z.string()).max(3).default([]),
    bioShort: z.string().max(280),
    quote: z.string().max(200).optional(),
    current: z.boolean().default(true),
    /** Sample content shipped so the layout can be reviewed before real
        profiles arrive. Rendered with a visible notice; must be removed. */
    placeholder: z.boolean().default(false),
  }),
});

export const collections = { events, chapters, officers };
