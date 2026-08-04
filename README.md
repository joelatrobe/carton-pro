# Carton-Pro (R Howard Ltd)

Responsive marketing site for www.rhoward.co.uk / www.cartonpro.co.uk, built to the
Carton-Pro Brand Guidelines V1.0 (July 2026).

## Pages

Four sections in the nav. The logo is the route home, so there is no Home link.

| Path | Purpose |
| --- | --- |
| `index.html` | Home. Reached by clicking the logo |
| `services.html` | Capability, five stage process, the three sectors, production spec |
| `about.html` | Company history, and accreditations at `#accreditations` |
| `sustainability.html` | FSC board, paperboard facts, recycling |
| `contact.html` | Enquiry form and contact details |
| `faq.html` | Frequently asked questions. Footer only, deliberately not in the nav |
| `privacy.html` | Privacy policy |
| `404.html` | Not found |

The Customer item at the right of the nav is an outbound link to
`https://esko.okta.com/`, opening in a new tab. It is not a portal we host. The
same link appears in the footer as "Customer sign in".

## Brand implementation

Taken from the guidelines PDF, section by section.

- **Colour (2.1)** Carton Navy `#14244C`, Carton Pale `#B7C6DE`, Mill White `#EDF0F3`,
  Press Black `#191C26`, plus the permitted navy tints from 2.3.
- **No sub-range colour.** Press Red, Bone and Graphite (2.2) are deliberately unused.
  Everything that needs telling apart from its neighbour uses a tint of Carton Navy
  instead of a second hue: the three sector tabs are `.tab-a` (navy), `.tab-b` (70%)
  and `.tab-c` (50%). Accents that were red are now navy on light panels and Carton
  Pale on navy ones. If the sub-range system is ever wanted back, it goes in at
  `.tab-a` / `.tab-b` / `.tab-c` and nowhere else.
- **Proportion (2.3)** Navy holds whole panels and dominates; white is used as a
  material rather than a gap; sub-range colour stays incidental. No gradients.
- **Logo (1.1, 1.2, 1.5)** The lockup is built in CSS from real proportions: endorsement
  cap height 0.275X, descriptor 0.30X, R HOWARD tracked to 220, flush left, no rule or
  divider. Reversed white on navy for the masthead, Carton Pale in the footer.
- **Typography (3.1)** Barmeno Medium is self-hosted from the licensed OTF supplied in
  the logo animation package, converted to WOFF2 (19 KB). It sets the lockup, all
  headings and the tracked-out labels.
- **The carton pattern** `assets/cartons-tile.svg` is a seamless isometric tile drawn
  from scratch, with the Barmeno WOFF2 embedded as base64 so it renders correctly when
  loaded as a CSS background. Each carton carries the current lockup, R Howard
  endorsement included, white out of navy per 1.4, on the top face as in the
  photography. It is the fallback behind the hero photograph.

## Known gaps to close before launch

1. **The hero photograph** is `assets/img/hero-cartons.jpg`, resized from
   `Free_Grid_Box_4.jpg` to 2400px wide at quality 78, which takes it from 6.6 MB to
   791 KB. It is preloaded in `index.html` because a CSS background is otherwise
   discovered late, and it is the page's largest paint. Re-run the same `sips` step
   if the shot is ever replaced.
   `assets/cartons-tile.svg` is the drawn stand-in built before the photograph
   arrived. It is no longer loaded anywhere, but it is a seamless carton pattern with
   the current lockup on it, so it is worth keeping for social or print use.
2. **Barmeno Regular and Bold.** Only Medium was available. Headings therefore sit at
   Medium rather than the Bold specified in 3.1, and body copy falls back to Source Sans 3.
   Supplying the other two weights as WOFF2 into `assets/fonts/` and adding two
   `@font-face` rules puts the whole page on the brand face.
3. **Barmeno web licence.** Barmeno is a Berthold face. Confirm the licence covers
   webfont embedding before the site goes public.
4. **Favicon.** Uses the Carton Pale rule mark on navy, because the wordmark is
   unreadable at 16 px. Worth a sign-off, or replace with a supplied mark.
5. **Company number and VAT number** are not in the footer because they were not
   available. Add them to the `.foot__bottom` block on every page.
6. **Master logo artwork.** The lockup is set in Barmeno rather than placed as the
   outlined master artwork (1.1). If the SVG is available, swap it into the `.lockup`
   markup for exact fidelity.

## Running locally

```bash
npm install
npm start
```

Serves on `http://localhost:3000`, or `PORT=4420 node server.js`.

## Enquiry form

`POST /api/enquiry` validates, rate limits (5 per IP per 15 minutes), screens a
honeypot field, appends to `data/enquiries.json` and emails when SMTP is configured.
Without SMTP credentials the enquiry is still logged and the visitor still sees a
success message, so the form never appears broken.

Environment variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
`SMTP_PASS`, `ENQUIRY_TO`, `ENQUIRY_FROM`.

Note that Render's free tier wipes the disk on redeploy, so `data/enquiries.json` is a
convenience log rather than a record. Configure SMTP before launch.

## Deploying

`render.yaml` is a Render blueprint. Push to GitHub, create a Blueprint service, then
set the SMTP variables in the dashboard. Point `www.rhoward.co.uk` at the service and
add `cartonpro.co.uk` as a redirect.

## Contact page

Order is: details alongside a Google Maps embed, then "Speed things up", then the
enquiry form on its own at `#enquiry`. The map is a keyless
`google.com/maps?q=...&output=embed` iframe, lazy loaded. It is third-party content
that can set cookies, which is why the privacy policy names it. If the map is ever
removed, take that row out of the cookies table too.

## Sector cards

No numbering. The three sectors are not a sequence, so each card is headed by a line
drawing of something we actually make for that sector, all sharing one stroke style:

| Sector | Drawing |
| --- | --- |
| Food and drink | A cup, with dashed rolled rim and body creases |
| Beauty, home and personal care | A tissue box in three quarter view, with the oval slot on the top face |
| Pharmaceutical | A folding carton die line, creases dashed at x=28, 58, 88, 118 |

Cups are part of the food and drink range and are named in both the copy and the format
list. On the die line, the net's right edge is x=140, so any added detail has to sit
inside a single panel rather than straddle a crease.

Real product photography would beat the drawings. Ask the client for pack shots.

## Reach

R Howard delivers across the UK **and into Europe**. The site said "nationwide" in
several places, which undersold it. Schema `areaServed` now lists both the United
Kingdom and Europe. If you touch delivery copy, keep both in.

## Light panels

The closing CTA on every page is Carton Pale, not Press Black, and so is the spec
strip under the hero. Text on Carton Pale must be full `--navy`: `--navy-70` only
reaches 3.3:1 against it, which fails for body copy and small tracked labels. That is
why `.cta .standfirst`, `.cta .label`, `.cta .datalist__key` and `.specs__key` all
override to `--navy`. Everything on those panels currently measures 8.76:1.

## Naming

R Howard is the company. Carton-Pro is the name it prints under. The site never
calls R Howard a former name, because it is not one. Schema uses
`name: "R Howard"`, `legalName: "R Howard Ltd"`, `alternateName: "Carton-Pro"`.

## Social

LinkedIn is live at `https://www.linkedin.com/company/r-howard-limited`. Instagram
is a `<span class="social__pending">` rather than a link, because the account does
not exist yet. When it does, swap that span for the same anchor markup LinkedIn
uses, in all six footers.

## SEO

Per-page titles and meta descriptions, canonicals, Open Graph tags, `robots.txt`,
`sitemap.xml`, and JSON-LD: `LocalBusiness` on the home and contact pages, `Service` on
services, and `AboutPage` and `WebPage` elsewhere.
Update the phone, address and opening hours in every JSON-LD block together if they change.

Merging the sector pages into `services.html` concentrates the sector keywords on one
page rather than three. If sector search traffic matters later, they can be split back
out with the anchors becoming full pages.

Things done specifically for answer engines and AI search:

- The FSSC 22000 and FSC text appears once, on `about.html#accreditations`. The home
  page summarises and links to it. Repeating those paragraphs across pages split the
  signal and gave two URLs competing for the same query, so do not paste them back.
- `faq.html` carries the FAQ and its `FAQPage` JSON-LD. The
  questions are the ones buyers actually ask (minimum order, colours, samples,
  finishing, certification, FSC labelling, sectors) and each answer is a complete
  sentence that stands on its own when quoted out of context. Keep the visible text
  and the schema identical if either changes.
- `sameAs` on the home and contact `LocalBusiness` blocks points at the LinkedIn
  company page, which helps search and AI tie the site, the company and the address
  together as one entity.
