/* Carton-Pro — static site server with an enquiry endpoint. */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const nodemailer = require('nodemailer');
const auth = require('./lib/auth');
const articles = require('./lib/articles');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));

/* ------------------------------------------------------------- security */

app.disable('x-powered-by');

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  /* The pages carry an inline class-flag script and JSON-LD blocks, and the
     page heads set their poster as an inline style. No user input is ever
     rendered into markup, so inline is not an injection route here. */
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://maps.gstatic.com https://*.googleapis.com https://*.ggpht.com",
  "media-src 'self'",
  "frame-src https://www.google.com",
  "connect-src 'self'",
  'upgrade-insecure-requests'
].join('; ');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (IS_PROD) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

/* --------------------------------------------------------- private paths */
/* express.static is pointed at the project root, so everything that is not
   the website itself has to be refused explicitly. Without this the repo,
   the server source and the dependency manifest are all downloadable. */

const PRIVATE = [
  /^\/\./,                      // dotfiles and dot directories, .git included
  /^\/data(\/|$)/,
  /^\/lib(\/|$)/,
  /^\/templates(\/|$)/,
  /^\/docs(\/|$)/,
  /^\/node_modules(\/|$)/,
  /^\/server\.js$/,
  /^\/package(-lock)?\.json$/,
  /^\/render\.yaml$/,
  /\.(md|log|bak|sh|yml|yaml)$/i
];

app.use((req, res, next) => {
  let pathname;
  try {
    pathname = decodeURIComponent(req.path);
  } catch (err) {
    return res.status(400).send('Bad request');
  }
  if (PRIVATE.some((rule) => rule.test(pathname))) {
    return res.status(404).sendFile(path.join(__dirname, '404.html'));
  }
  next();
});

/* --------------------------------------------------------------- static */

app.use(express.static(__dirname, {
  extensions: ['html'],
  dotfiles: 'deny',
  index: 'index.html',
  setHeaders(res, filePath) {
    if (/\.(woff2|mp4|jpg|png|svg)$/.test(filePath)) {
      /* Fingerprinted or stable assets; when one really changes it is given
         a new filename rather than a new cache policy. */
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\.(html|css|js)$/.test(filePath)) {
      /* Markup, styles and behaviour keep their names across edits, so they
         must be revalidated or a visitor sits on yesterday's stylesheet. */
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

/* ------------------------------------------------------------- enquiries */

/* Enquiries hold personal data, so they are written outside the directory
   express.static serves. DATA_DIR lets the host point this at a real disk. */
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'carton-pro-data');
const LOG_FILE = path.join(DATA_DIR, 'enquiries.json');

function appendEnquiry(entry) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    let list = [];
    if (fs.existsSync(LOG_FILE)) {
      list = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    }
    list.push(entry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(list, null, 2));
  } catch (err) {
    console.error('Could not write enquiry log:', err.message);
  }
}

/* Mail is optional. Without SMTP credentials the enquiry is still logged and
   the visitor still gets a success response, so the form never looks broken. */
let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE) === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined
  });
}

const ENQUIRY_TO = process.env.ENQUIRY_TO || 'enquiries@rhoward.co.uk';
const ENQUIRY_FROM = process.env.ENQUIRY_FROM || 'website@rhoward.co.uk';

function clean(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max || 2000);
}

/* Header fields must not carry line breaks either, or a crafted name could
   append its own mail headers. */
function cleanHeader(value, max) {
  return clean(value, max).replace(/[\r\n]+/g, ' ');
}

/* Simple in-memory rate limit: 5 enquiries per IP per 15 minutes. */
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const window = 15 * 60 * 1000;
  const list = (hits.get(ip) || []).filter((t) => now - t < window);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

app.post('/api/enquiry', async (req, res) => {
  const body = req.body || {};

  if (clean(body.company_website)) {
    return res.json({ ok: true });           // honeypot tripped
  }

  if (rateLimited(req.ip)) {
    return res.status(429).json({ error: 'Too many enquiries from this connection.' });
  }

  const entry = {
    enquiryType: cleanHeader(body.enquiry_type, 40) || 'Quote request',
    name: cleanHeader(body.name, 120),
    company: cleanHeader(body.company, 160),
    email: cleanHeader(body.email, 160),
    phone: clean(body.phone, 60),
    sector: clean(body.sector, 80),
    quantity: clean(body.quantity, 80),
    message: clean(body.message, 4000),
    receivedAt: new Date().toISOString()
  };

  if (!entry.name || !entry.email || !entry.message) {
    return res.status(400).json({ error: 'Please complete your name, email and enquiry details.' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(entry.email)) {
    return res.status(400).json({ error: 'Please check the email address.' });
  }

  appendEnquiry(entry);

  if (transporter) {
    const lines = [
      `Type:     ${entry.enquiryType}`,
      `Name:     ${entry.name}`,
      `Company:  ${entry.company || 'Not given'}`,
      `Email:    ${entry.email}`,
      `Phone:    ${entry.phone || 'Not given'}`,
      `Sector:   ${entry.sector || 'Not given'}`,
      `Run:      ${entry.quantity || 'Not given'}`,
      '',
      entry.message
    ].join('\n');

    try {
      await transporter.sendMail({
        to: ENQUIRY_TO,
        from: ENQUIRY_FROM,
        replyTo: entry.email,
        subject: `${entry.enquiryType}: ${entry.name}${entry.company ? ', ' + entry.company : ''}`,
        text: lines
      });
    } catch (err) {
      console.error('Enquiry email failed:', err.message);
      // The enquiry is logged, so still report success to the visitor.
    }
  }

  res.json({ ok: true });
});

/* -------------------------------------------------------------- articles */

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const store = articles.store(DATA_DIR);
const SITE = process.env.SITE_ORIGIN || 'https://www.rhoward.co.uk';

function template() {
  /* Read per request in development so an edit shows without a restart. */
  if (IS_PROD && template._cache) return template._cache;
  template._cache = fs.readFileSync(path.join(__dirname, 'templates', 'page.html'), 'utf8');
  return template._cache;
}

function renderPage(fields) {
  let html = template();
  const values = {
    TITLE: fields.title,
    DESC: fields.description,
    CANONICAL: fields.canonical,
    OGIMAGE: fields.image || `${SITE}/assets/img/og-image.jpg`,
    HEADEXTRA: fields.headExtra || '',
    MAIN: fields.main
  };
  Object.keys(values).forEach((k) => {
    const safe = k === 'MAIN' || k === 'HEADEXTRA' ? values[k] : articles.escapeHtml(values[k]);
    html = html.split(`{{${k}}}`).join(safe);
  });
  return html;
}

/* JSON.stringify leaves < and > alone, so a title containing </script>
   would close the element and everything after it would run. */
function jsonLd(obj) {
  return JSON.stringify(obj, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function published(list) {
  return list.filter((a) => a.published)
             .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function cardFor(a) {
  /* An empty framed box reads as a broken image, so a card without a
     picture simply does without one. */
  const media = a.image
    ? `<span class="post__media"><img src="${articles.escapeHtml(a.image)}" alt="" loading="lazy"></span>`
    : '';
  return `<article class="post">
          <a class="post__link" href="/articles/${articles.escapeHtml(a.slug)}">
            ${media}
            <span class="post__meta">${articles.escapeHtml(articles.formatDate(a.date))}</span>
            <h2 class="post__title">${articles.escapeHtml(a.title)}</h2>
            <p class="post__excerpt">${articles.escapeHtml(articles.excerpt(a))}</p>
            <span class="arrow-link">Read the article <span aria-hidden="true">&rarr;</span></span>
          </a>
        </article>`;
}

app.get(['/articles', '/articles.html'], (req, res) => {
  const list = published(store.readAll());
  const body = list.length
    ? `<div class="posts">\n        ${list.map(cardFor).join('\n        ')}\n      </div>`
    : `<p class="standfirst">There are no articles yet. Check back shortly.</p>`;

  res.type('html').send(renderPage({
    title: 'Articles | Carton Packaging Insight | Carton-Pro',
    description: 'News and technical articles from Carton-Pro in Peterborough on folding carton packaging, litho printing, board, finishing and certification.',
    canonical: `${SITE}/articles`,
    main: `  <section class="page-head">
    <div class="wrap">
      <h1 class="headline">Articles</h1>
      <p class="standfirst">Notes from the works on board, print, finishing and the standards we hold to.</p>
    </div>
  </section>

  <section class="band">
    <div class="wrap">
      ${body}
    </div>
  </section>`
  }));
});

app.get('/articles/:slug', (req, res, next) => {
  const list = store.readAll();
  const a = list.find((x) => x.slug === req.params.slug && x.published);
  if (!a) return next();

  const hero = a.image
    ? `<figure class="article__hero"><img src="${articles.escapeHtml(a.image)}" alt="${articles.escapeHtml(a.imageAlt || '')}"></figure>`
    : '';

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    datePublished: a.date,
    dateModified: a.updatedAt || a.date,
    author: { '@type': 'Organization', name: 'R Howard' },
    publisher: {
      '@type': 'Organization',
      name: 'R Howard',
      alternateName: 'Carton-Pro',
      url: `${SITE}/`
    },
    mainEntityOfPage: `${SITE}/articles/${a.slug}`
  };
  if (a.image) ld.image = `${SITE}${a.image}`;

  res.type('html').send(renderPage({
    title: `${a.title} | Carton-Pro`,
    description: articles.excerpt(a, 155),
    canonical: `${SITE}/articles/${a.slug}`,
    image: a.image ? `${SITE}${a.image}` : null,
    headExtra: `<script type="application/ld+json">\n${jsonLd(ld)}\n</script>`,
    main: `  <section class="page-head page-head--article">
    <div class="wrap wrap--narrow">
      <p class="label"><a href="/articles">Articles</a></p>
      <h1 class="headline">${articles.escapeHtml(a.title)}</h1>
      <p class="article__date">${articles.escapeHtml(articles.formatDate(a.date))}</p>
    </div>
  </section>

  <section class="band">
    <div class="wrap wrap--narrow article">
      ${hero}
      ${a.standfirst ? `<p class="standfirst">${articles.escapeHtml(a.standfirst)}</p>` : ''}
      ${articles.renderBody(a.body)}
      <p class="u-mt-l"><a class="arrow-link" href="/articles">All articles <span aria-hidden="true">&rarr;</span></a></p>
    </div>
  </section>`
  }));
});

/* Uploaded images live on the data disk, so they need an explicit route. */
app.get('/uploads/:name', (req, res, next) => {
  if (!/^[a-z0-9][a-z0-9-]{0,80}\.(jpg|png|webp)$/i.test(req.params.name)) return next();
  const file = path.join(UPLOAD_DIR, req.params.name);
  if (!file.startsWith(UPLOAD_DIR + path.sep)) return next();
  if (!fs.existsSync(file)) return next();
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(file);
});

/* ----------------------------------------------------------- admin api */

const ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH || '';

/* Images arrive as data URLs on a JSON body, which avoids a multipart
   dependency. 6MB of base64 is roughly a 4.5MB photograph. */
const adminJson = express.json({ limit: '6mb' });

const loginHits = new Map();
function loginBlocked(ip) {
  const now = Date.now();
  const list = (loginHits.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  loginHits.set(ip, list);
  return list.length >= 8;
}
function noteLogin(ip) {
  const list = loginHits.get(ip) || [];
  list.push(Date.now());
  loginHits.set(ip, list);
}

function signedIn(req) {
  const jar = auth.parseCookies(req.headers.cookie);
  return !!auth.readSession(jar[auth.SESSION_COOKIE]);
}

function requireAdmin(req, res, next) {
  if (!signedIn(req)) return res.status(401).json({ error: 'Please sign in again.' });
  /* The session cookie is SameSite=Lax, and this header cannot be set by a
     cross-site form post, so together they see off CSRF. */
  if (req.headers['x-cp-admin'] !== '1') return res.status(403).json({ error: 'Bad request origin.' });
  next();
}

app.post('/api/admin/login', adminJson, (req, res) => {
  if (!ADMIN_HASH) {
    return res.status(503).json({ error: 'No admin password is configured on the server yet.' });
  }
  if (loginBlocked(req.ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again in fifteen minutes.' });
  }
  noteLogin(req.ip);

  if (!auth.verifyPassword((req.body || {}).password, ADMIN_HASH)) {
    return res.status(401).json({ error: 'That password is not right.' });
  }

  loginHits.delete(req.ip);
  res.cookie(auth.SESSION_COOKIE, auth.issueSession(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: auth.SESSION_HOURS * 3600 * 1000,
    path: '/'
  });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie(auth.SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/admin/session', (req, res) => {
  res.json({ signedIn: signedIn(req), configured: !!ADMIN_HASH });
});

app.get('/api/admin/articles', requireAdmin, (req, res) => {
  res.json({ articles: store.readAll().sort((a, b) => String(b.date).localeCompare(String(a.date))) });
});

function cleanArticle(body, list, existing) {
  const title = String(body.title || '').trim().slice(0, 160);
  if (!title) return { error: 'An article needs a title.' };
  const text = String(body.body || '').trim().slice(0, 60000);
  if (!text) return { error: 'An article needs some body text.' };

  const id = existing ? existing.id : crypto.randomUUID();
  return {
    article: {
      id,
      slug: articles.uniqueSlug(body.slug || title, list, id),
      title,
      standfirst: String(body.standfirst || '').trim().slice(0, 400),
      body: text,
      image: typeof body.image === 'string' ? body.image.slice(0, 200) : (existing ? existing.image : ''),
      imageAlt: String(body.imageAlt || '').trim().slice(0, 240),
      published: body.published !== false,
      date: String(body.date || '').slice(0, 10) || (existing && existing.date) || new Date().toISOString().slice(0, 10),
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };
}

app.post('/api/admin/articles', requireAdmin, adminJson, (req, res) => {
  const list = store.readAll();
  const out = cleanArticle(req.body || {}, list, null);
  if (out.error) return res.status(400).json({ error: out.error });
  list.push(out.article);
  store.writeAll(list);
  res.json({ ok: true, article: out.article });
});

app.put('/api/admin/articles/:id', requireAdmin, adminJson, (req, res) => {
  const list = store.readAll();
  const i = list.findIndex((a) => a.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'That article no longer exists.' });
  const out = cleanArticle(req.body || {}, list, list[i]);
  if (out.error) return res.status(400).json({ error: out.error });
  list[i] = out.article;
  store.writeAll(list);
  res.json({ ok: true, article: out.article });
});

app.delete('/api/admin/articles/:id', requireAdmin, (req, res) => {
  const list = store.readAll();
  const next = list.filter((a) => a.id !== req.params.id);
  if (next.length === list.length) return res.status(404).json({ error: 'That article no longer exists.' });
  store.writeAll(next);
  res.json({ ok: true });
});

/* Only these three, and the magic bytes have to agree with the claim. */
const IMAGE_KINDS = [
  { ext: 'jpg',  mime: 'image/jpeg', magic: [0xFF, 0xD8, 0xFF] },
  { ext: 'png',  mime: 'image/png',  magic: [0x89, 0x50, 0x4E, 0x47] },
  { ext: 'webp', mime: 'image/webp', magic: [0x52, 0x49, 0x46, 0x46] }
];

function saveUpload(dataUrl) {
  const m = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return { error: 'That did not look like an image file.' };

  const kind = IMAGE_KINDS.find((k) => k.mime === m[1]);
  if (!kind) return { error: 'Images must be JPEG, PNG or WebP.' };

  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 4.5 * 1024 * 1024) return { error: 'That image is over 4.5MB. Please shrink it first.' };
  if (!kind.magic.every((b, n) => buf[n] === b)) {
    return { error: `That file is not really a ${kind.ext.toUpperCase()}.` };
  }

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `img-${crypto.randomBytes(6).toString('hex')}.${kind.ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return { url: `/uploads/${name}` };
}

/* Pictures belong to the site, not to one article, so they can be uploaded
   before an article exists and reused across several. */
app.post('/api/admin/uploads', requireAdmin, adminJson, (req, res) => {
  const out = saveUpload((req.body || {}).image);
  if (out.error) return res.status(400).json({ error: out.error });
  res.json({ ok: true, url: out.url });
});

app.get('/api/admin/uploads', requireAdmin, (req, res) => {
  let uploads = [];
  try {
    uploads = fs.readdirSync(UPLOAD_DIR)
      .filter((n) => /\.(jpg|png|webp)$/i.test(n))
      .map((n) => ({ url: `/uploads/${n}`, at: fs.statSync(path.join(UPLOAD_DIR, n)).mtimeMs }))
      .sort((a, b) => b.at - a.at)
      .slice(0, 60);
  } catch (err) { /* nothing uploaded yet */ }
  res.json({ uploads });
});

/* ------------------------------------------------------------------ 404 */

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

app.listen(PORT, () => {
  console.log(`Carton-Pro running on port ${PORT} (${IS_PROD ? 'production' : 'development'})`);
});
