# Website vs. Bylaws — alignment review

Compared: `VMSNA-Bylaw Draft.pdf` (8 pages, 14 articles) against the website as
it stands at commit `6e7dd3f`.

**No site code has been changed.** This is the change list for review first.

Items are grouped by what kind of decision they need. Section A is the website
being wrong. Section C is the website promising things the bylaws do not
establish — those need a board decision, and two of them may need whoever is
advising on the 501(c)(3).

---

## A. The website contradicts the bylaws

### A1. The site says Tamil. The bylaws say Kannada. — *biggest item*

| | |
| --- | --- |
| Bylaws §2.1 | "celebrates our **Kannada language**, cultural traditions, values, and agricultural heritage" |
| Bylaws §3.1 | "preserve, celebrate, and pass on the **Kannada language** … of the Vokkaliga community **with historical roots in Karnataka and Tamil Nadu**" |
| Site | "Tamil Nadu Vokkaligas" throughout; the heritage language is implicitly Tamil |

The bylaws define VMSNA as a **Kannada-language** organisation serving
Vokkaligas from **both Karnataka and Tamil Nadu**. The website serves Tamil
Nadu Vokkaligas only and never mentions Kannada or Karnataka once.

This is not a wording tweak. It changes who the organisation is for.

Affected (14 places):

- `config/site.ts:4` tagline — "Tamil Nadu Vokkaligas in North America"
- `config/site.ts:8` site description
- `pages/index.astro:36` homepage kicker; `:87`, `:93` mission section
- `pages/about.astro:8`, `:21`, `:24`, `:46`
- `pages/membership.astro:43`, `:79`
- `pages/join.astro:9`, `pages/login.astro:46`
- `components/layout/SiteFooter.astro:14`, `i18n/index.ts:61`

Knock-on effects if this changes:

- **The whole i18n scaffolding is for Tamil.** Noto Serif Tamil is wired to
  `:lang(ta)`, the locale list is `['en','ta']`, and the officer schema field
  is `nameTamil`. If the heritage language is Kannada, that becomes Kannada
  (`kn`, Noto Serif Kannada), or both.
- The resource "Tamil classes and learning materials" becomes Kannada, or both.
- The "India" chapter currently lists `regions: ["Tamil Nadu", "Karnataka"]` —
  the only place Karnataka appears anywhere on the site.

**I have not guessed at this.** It is possible the bylaw draft broadened the
scope deliberately, or that "Kannada" is an error carried in from another
organisation's bylaws. It needs an answer from the board before I touch the
copy. See "Decisions needed" at the end.

### A2. Membership eligibility is far narrower on the site than in the bylaws

| | |
| --- | --- |
| Bylaws §6.1 | "open to individuals and families who **support and promote the mission**, purposes, cultural heritage, and activities of the VMSNA, **without regard to nationality or place of origin**" |
| Site `membership.astro:79` | "Any family of Tamil Nadu Vokkaliga (Gowda) origin living in the United States or Canada" |
| Site `membership.astro:43` | "we check that you are a Tamil Nadu Vokkaliga family, **which is the only eligibility requirement**" |

The bylaws open membership to anyone who supports the mission. The site tells
people they must be of Vokkaliga origin. As written, the site is turning away
people the bylaws admit.

This also undercuts the rationale for the **approve-then-pay** flow I built.
That design assumed the committee was checking an ancestry criterion only a
human could judge. If the real criterion is "supports the mission", the review
step is either a much lighter touch or unnecessary friction.

Change: rewrite the eligibility copy to §6.1, and decide whether committee
review stays. I would keep it — a review step is still useful for spam and for
welcoming people properly — but its stated purpose must change.

### A3. Membership runs to 31 December. The site sells rolling 12-month subscriptions

| | |
| --- | --- |
| Bylaws §6.5 | Fiscal year is 1 January – 31 December |
| Bylaws §6.6 | "Regardless of the date on which an individual or family joins during the year, the annual membership shall **expire on December 31 of that same year**" |
| Bylaws §6.7 | "**No prorated** membership dues or extension into the following fiscal year" |
| Site | Stripe annual subscriptions renewing on the anniversary of joining |

Someone joining in November currently gets 12 months. Under the bylaws they
get six weeks, at full price.

This is the largest *code* change on the list. Options:

1. **Anchor subscriptions to 1 January** (Stripe `billing_cycle_anchor`), so
   everyone renews together on the calendar year. Closest to the bylaws, and
   Stripe supports it natively. Note that by default Stripe would prorate the
   first partial period — which §6.7 forbids — so proration must be disabled.
2. **One-time annual payments** that expire 31 December, with a renewal
   prompt each January. Simpler and matches §6.6 exactly, but loses
   auto-renewal and will cost the treasurer chasing time.

I would take option 1 with proration off. Either way, `grandfatherMemberships`
should then set the complimentary period to a 31 December date, which it
roughly already does.

Also unstated on the site: §6.4 "**Membership dues shall be non-refundable**".
That belongs on the checkout and the billing page.

### A4. Governance bodies are named differently

| Bylaws | Site | Where |
| --- | --- | --- |
| **Executive Committee** (§7.5) | "Executive board" | `pages/leadership/index.astro` |
| **Advisory Board** (§7.1, §7.2) | "Executive advisory committee" | same |

The bylaws are consistent throughout: two bodies, the **Advisory Board** and
the **Executive Committee**. The site uses neither name.

Note this cuts against the rename you asked for an hour ago. "Executive
advisory committee" is not a body the bylaws recognise — under §7.1 it would
be the **Advisory Board**. Worth confirming which you want before I change it
again.

The "Directors" section (IT, Communication) is fine but should be framed as
what §7.7 calls them: administrative roles appointed annually by the Executive
Committee, not a third governing body.

### A5. The Advisory Board has 4 seats in the bylaws and 7 people on the sheet

Bylaws §7.2: "The Advisory Board shall consist of **four (4) Members**. The
number … may be changed in the future **only through an amendment**."

The board sheet you sent lists **seven** advisory members: Vijay Dasappa,
Dr Suresh Paramasivam, Prabhakar Murugesan, Suganthi Raghu, Kavitha
Krishnakumar, Sanjeev Palanisamy, Vanathi.

This is an organisational discrepancy, not a website bug — the site is
faithfully showing what you gave me. Either the bylaws need amending to seven,
or the group is something other than the Advisory Board (an informal advisory
panel, say), in which case the page should say so. I cannot resolve it from
here.

### A6. Students can vote under the bylaws; the site says they cannot

Bylaws §8.1: "Any individual who is **18 years of age or older** and is an
active member … shall be eligible to vote". §6.3: Student membership is for
full-time students **18 or older**.

So every student member can vote. But `config/membership.ts:34` lists
"Vote at the AGM" as an **Individual**-tier benefit only, implying students
and family members cannot. That is wrong on two counts — it should be on every
tier, or on none as a benefit distinction.

### A7. "AGM" is not what the bylaws call it

The bylaws say **General Body Meeting** throughout (§10.3). The site says
"AGM" (`config/membership.ts:34`). Use the bylaws' term.

---

## B. The bylaws require something the site does not do

### B1. Volunteer positions must be published to members

Bylaws §7.8: "**All volunteering positions within VMSNA shall be made known to
all members.**"

There is nowhere on the site that lists open volunteer or committee positions.
This is a positive obligation the site currently does not meet.

Suggested: a "Volunteer with us" section under `/resources/` or a small page,
fed by a content collection so the Secretary can keep it current.

### B2. General Body Meetings are invisible

Bylaws §10.3 requires a GBM in the last quarter of the second year of each
term, preferably alongside the convention, with **14 days' notice** including
the agenda. §10.3 also lets members compel one by written request of a
majority.

The site has no mention of General Body Meetings, no notice mechanism, and no
place agendas or minutes live. The Events system could carry the meeting; the
notice could go out through the existing member email path.

### B3. Terms of office are not shown

Bylaws §8.2: terms are **two years**; §8.3: the incoming board takes office
**1 January** following an election in the last quarter.

The `term` field exists on every officer record and is empty, so the
leadership page shows no term at all. Once you tell me the current term I can
populate all 16 in one change.

---

## C. The site promises things the bylaws do not establish

These need a board decision, and the first two may need whoever is advising on
the 501(c)(3). **I am not qualified to advise on this and am not doing so** —
I am flagging that the website is making commitments the governing document
does not cover.

### C1. Member welfare and hardship assistance

The site offers **education, medical, employment and other assistance** as a
headline feature — `/support/` with four intake forms, "Family assistance" as
a membership benefit, and donations described as funding "direct assistance to
member families".

The bylaws do not establish any assistance programme: no committee, no
criteria, no provision for disbursing funds to members. §4.1 permits
"charitable … programs" generally, but it also states that **no part of the
net earnings shall inure to the benefit of any member**.

A charity distributing money to its own dues-paying members is a well-known
area of scrutiny. This may be entirely fine — or it may need the programme
constituted properly, with a defined charitable class and criteria. It should
not rest on website copy alone.

### C2. Scholarships restricted to member families

`config/membership.ts:44` lists "Scholarship eligibility" as a **Family tier
benefit**, and the donate page says donations fund scholarships. The same
private-benefit question applies, more sharply: a scholarship available only
to the children of paying members is a benefit of membership, not obviously a
charitable programme.

The bylaws do not mention scholarships at all.

### C3. Chapters are not in the bylaws

The site is organised around **seven chapters** (East & Northeast, Southeast,
Midwest, West, South, Canada, India), with chapter pages, a chapter field on
events, and a `chapter-lead` officer tier.

The bylaws describe only the Advisory Board, the Executive Committee, and
sub-committees appointed under §7.7. Chapters appear nowhere.

If chapters are informal regional groupings, that is fine and the site should
not imply constitutional standing. If they are meant to be structural, the
bylaws need a chapter article.

Separately: the organisation is "North America" and §6.1 admits members
regardless of origin — but an **India chapter** sits oddly with the name. A
region of members, rather than a chapter, may be the better framing.

### C4. "Not a religious organisation"

I added a section to `/about/` stating VMSNA is a cultural organisation, not a
religious one, with no affiliation to any temple or religious trust. This
followed your instruction to remove religious impression, and it is consistent
with §4.1 and §6.1 — but it is a positioning statement the bylaws do not make.
Worth a board sign-off, since it is the sort of sentence people quote back.

---

## D. Smaller factual corrections

| # | Bylaws | Site now | Change |
| --- | --- | --- | --- |
| D1 | §1.1 legal name is "Vokkaliga Mahajana Sangam North America **incorporated**" | Footer and receipts use the name without "Inc." | Use the full legal name on donation receipts and the footer's copyright line |
| D2 | §6.3 Student = full-time students **18 or older** | "For students in full-time education" | Add the age condition |
| D3 | §6.3 Family = spouses or partners and their children **in the same household** | "Two adults and children at home" | Match the bylaws' wording, including "partners" |
| D4 | §6.4 dues are set by the **Executive Committee** | Prices presented as fixed | Note that dues are set annually by the EC |
| D5 | §2.1 / §3.1 vision and mission | Homepage and About use copy I wrote | Replace with the bylaws' own vision and mission, which are better and are the approved text |
| D6 | §3.1 "engage and educate our **youth**", "inclusive and welcoming", "connections with the **broader community**" | Site covers youth and inclusion but not outward connection | Add the outward-facing strand — it is in the mission and currently missing |

Not website changes, but noted from the bylaws for completeness: §9.4(c)
requires **two officer signatures for any payment over $500**, and §6.4
requires dues to be deposited into the operating account. Both are relevant to
how the Stripe payout account is configured.

---

## E. Already aligned

Worth recording so it does not get re-litigated:

- Three membership categories — Family, Individual, Student (§6.2) ✓
- Lifetime membership dues are permitted (§6.4), so the Life tier is fine ✓
- 501(c)(3) framing on the donate page (§4.1) ✓
- Executive Committee of seven — four officers plus three Members-at-Large
  (§7.5) — exactly matches the board sheet ✓
- "Member-at-Large" naming ✓
- Two-year terms (§8.2) — the field exists, it just needs values ✓
- Approve-then-pay remains compatible with §6.1, though its purpose changes
  (see A2) ✓

---

## F. Two things in the draft itself

Offered as a courtesy, not website matters:

- **§8.13 has contradictory numbers.** "shall occupy one of the three (4) AB
  positions, leaving the remaining two (3) positions" — the words say three
  and two, the numerals say four and three. The numerals are consistent with
  §7.2's four-member board; the words look like leftovers from when the board
  was three.
- **§7.1** reads "The Advisory shall primarily provide governance" — missing
  "Board".

---

## Decisions needed before I change anything

1. **Kannada or Tamil?** (A1) This determines the site's identity, the i18n
   work, and the language-class resources. Nothing else should move until this
   is settled.
2. **Is membership open to anyone supporting the mission, as §6.1 says?** (A2)
   And if so, what is the committee actually reviewing?
3. **Calendar-year membership: anchor Stripe to 1 January, or one-time annual
   payments?** (A3) My recommendation is anchored subscriptions with proration
   disabled.
4. **"Advisory Board" or "Executive advisory committee"?** (A4) And is the
   seven-person group the four-seat Advisory Board of §7.2, or something
   else? (A5)
5. **What is the current term?** (B3)
6. **Do C1 and C2 have a basis I have not seen** — a separate policy, or
   advice already taken? If not, they should probably be softened on the site
   until they do.

Items in D, and A6/A7, I can fix immediately on your word — they are small and
uncontroversial.
