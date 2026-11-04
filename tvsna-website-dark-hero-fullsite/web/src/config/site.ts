export const site = {
  name: 'VMSNA',
  legalName: 'Vokkaliga Mahajana Sangam North America',
  tagline: 'Tamil Nadu Vokkaligas in North America',
  url: 'https://vmsna.org',
  email: 'info@vmsna.org',
  description:
    'A volunteer-run community of Tamil Nadu Vokkaliga families across the United States, Canada and India — preserving our language and heritage, and supporting each other.',
  social: {
    facebook: 'https://www.facebook.com/groups/tnvokkaligagowdasinusa',
    whatsapp: 'https://chat.whatsapp.com/JwIIRMDXq0NALtyJd9Cwe7',
  },
} as const;

export const primaryNav = [
  { label: 'About', href: '/about/' },
  { label: 'Leadership', href: '/leadership/' },
  { label: 'Chapters', href: '/chapters/' },
  { label: 'Events', href: '/events/' },
  { label: 'Media', href: '/media/' },
  { label: 'Support', href: '/support/' },
  { label: 'Donate', href: '/donate/' },
] as const;

export const footerNav = [
  {
    heading: 'Community',
    links: [
      { label: 'About us', href: '/about/' },
      { label: 'Leadership', href: '/leadership/' },
      { label: 'Chapters', href: '/chapters/' },
      { label: 'Events', href: '/events/' },
      { label: 'Media', href: '/media/' },
    ],
  },
  {
    heading: 'Membership',
    links: [
      { label: 'Why join', href: '/membership/' },
      { label: 'Become a member', href: '/join/' },
      { label: 'Member log in', href: '/login/' },
      { label: 'Member directory', href: '/directory/' },
      { label: 'Resources', href: '/resources/' },
      { label: 'Mentorship', href: '/mentorship/' },
    ],
  },
  {
    heading: 'Help and giving',
    links: [
      { label: 'Request support', href: '/support/' },
      { label: 'Donate', href: '/donate/' },
      { label: 'Contact us', href: '/contact/' },
    ],
  },
] as const;
