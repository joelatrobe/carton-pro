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

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

/* --------------------------------------------------------------- static */

app.use(express.static(__dirname, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (/\.(woff2|mp4|jpg|png|svg)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

/* ------------------------------------------------------------- enquiries */

const DATA_DIR = path.join(__dirname, 'data');
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
  return String(value == null ? '' : value).trim().slice(0, max || 2000);
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
    name: clean(body.name, 120),
    company: clean(body.company, 160),
    email: clean(body.email, 160),
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
        subject: `Website enquiry: ${entry.name}${entry.company ? ', ' + entry.company : ''}`,
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
