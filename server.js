/* Carton-Pro — static site server with an enquiry endpoint. */

const path = require('path');
const fs = require('fs');
const express = require('express');
const nodemailer = require('nodemailer');

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

/* ------------------------------------------------------------------ 404 */

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

app.listen(PORT, () => {
  console.log(`Carton-Pro running on port ${PORT} (${IS_PROD ? 'production' : 'development'})`);
});
