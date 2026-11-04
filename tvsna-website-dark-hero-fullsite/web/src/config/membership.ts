/*
  Membership tiers.

  PLACEHOLDER PRICING — agreed with the committee before launch. Changing a
  number here changes the pricing page; the Stripe price IDs that these map to
  live server-side in functions/src/config.ts and are never sent by the client.
*/

export interface Tier {
  id: 'student' | 'individual' | 'family' | 'life';
  name: string;
  price: number;
  cadence: 'year' | 'once';
  blurb: string;
  includes: string[];
  popular?: boolean;
}

export const tiers: Tier[] = [
  {
    id: 'student',
    name: 'Student',
    price: 20,
    cadence: 'year',
    blurb: 'For students in full-time education.',
    includes: ['Member directory', 'Mentorship network', 'Member event rates'],
  },
  {
    id: 'individual',
    name: 'Individual',
    price: 40,
    cadence: 'year',
    blurb: 'For one adult member.',
    includes: ['Member directory', 'Mentorship network', 'Member event rates', 'Vote at the AGM'],
  },
  {
    id: 'family',
    name: 'Family',
    price: 75,
    cadence: 'year',
    blurb: 'Two adults and children at home.',
    includes: [
      'Everything in Individual',
      'Both spouses listed in the directory',
      'Youth programmes and classes',
      'Scholarship eligibility',
    ],
    popular: true,
  },
  {
    id: 'life',
    name: 'Life',
    price: 1000,
    cadence: 'once',
    blurb: 'A one-time contribution, no renewals.',
    includes: [
      'Everything in Family, permanently',
      'Recognised as a founding supporter',
      'Available to members paying from India',
    ],
  },
];

export const benefits = [
  {
    title: 'The member directory',
    body: 'Search member families by profession, chapter and native place. You control exactly how much of your own profile other members can see.',
  },
  {
    title: 'Mentorship and introductions',
    body: 'Students and new arrivals are matched with members working in the field they are heading into.',
  },
  {
    title: 'Family assistance',
    body: 'Education, medical and employment support for member families, handled confidentially by the relevant committee.',
  },
  {
    title: 'Events and the convention',
    body: 'Member rates at chapter gatherings and the national convention, and early notice of registration.',
  },
  {
    title: 'Scholarships and youth programmes',
    body: 'Language classes, arts, and scholarships for the children of member families.',
  },
  {
    title: 'A vote in how it runs',
    body: 'Members elect the office bearers and may stand for any position themselves.',
  },
];
