# Editing the leadership page

The leadership page is built from one file per person in
`web/src/content/officers/`. You do not need to install anything or use a
terminal — it can all be done on github.com.

## What is there now

All sixteen board members are listed with their **name and role only**, taken
from the Executive Board Members sheet. Nothing else was filled in, because
nothing else was known — and a guessed home town or profession on a real
person's page is worse than a blank one.

| Section | People |
| --- | --- |
| Executive board | President, Vice President, Secretary, Treasurer, three Members at Large |
| Directors | IT Director, Communication Director |
| Advisory committee | Seven members |

Until someone has a short bio, their card is **not** a link and no profile page
is generated for them. Adding `bioShort` is what publishes their profile. That
way the page never shows sixteen near-empty pages that look unfinished.

## Adding details for one person

1. Go to `web/src/content/officers/` on github.com and click their file.
2. Click the pencil icon.
3. Add any of the optional fields between the two `---` lines.
4. Write their biography below the second `---`.
5. "Commit changes" → "Create a new branch" → "Propose changes".

A preview build runs on the pull request and comments a link, so you can see
the page before anyone else does.

### The fields

Required, already filled in:

```yaml
tier: executive        # executive | office-bearer | committee-chair | chapter-lead | advisor
role: "President"
order: 1               # position within the section
name: "Nandeesh Rangaswamy"
```

Optional — add whatever you have, leave out what you do not:

```yaml
honorific: "Dr"        # kept out of the monogram, so "Dr Nandeesh Rangaswamy" still shows NR
nameTamil: "நந்தீஷ்"   # shown under the name, in a Tamil serif
term: "2025-2027"
city: "Dallas"
state: "TX"
country: US            # US | CA | IN
nativePlace: "Odaipatti, Theni district"
profession: "Cardiologist"
contactRole: president@vmsna.org
linkedin: "https://linkedin.com/in/..."
focus: ["Youth and education", "Convention"]
bioShort: "Up to 280 characters. Shown on the card, and publishes their profile page."
quote: "Up to 200 characters, shown as a pull quote."
```

Two things to be careful with:

- **`contactRole` must be a routed alias**, like `president@vmsna.org`, never
  somebody's personal address. This page is public and is read by scrapers.
- **Ask each person before publishing their details.** Native place and
  profession are ordinary on a community site, but they are still that
  person's information to share.

## Adding a photo

Photographs are not wired up yet — the page uses monogram circles, which is
why it looks deliberate without them. When you are ready to add portraits:

- one photo per person, portrait orientation, at least 1200×1500
- head and shoulders, roughly centred
- ask permission first

Send them to the IT Director rather than committing them directly; they need
resizing, EXIF stripping (phone photos carry GPS coordinates) and a shared
tone treatment so twenty photographs of varying quality read as one set.

## When the board changes

- **Someone leaves:** set `current: false` on their file. They drop off the
  page but keep their URL, so nothing that linked to them breaks.
- **Someone joins:** copy `_TEMPLATE.md.txt` to a new file named after them,
  e.g. `jane-doe.md`.
- **Reordering:** change the `order` numbers within a section.

## If the build fails

The pull request will tell you. The usual causes:

- a missing `"` around a value containing a comma or a colon
- `tier` or `country` not one of the allowed values
- `bioShort` longer than 280 characters

The error names the file and the field. A malformed entry cannot reach the
live site — which is the point of the check.
