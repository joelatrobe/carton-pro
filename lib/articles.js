/* Carton-Pro — article storage and rendering.
 *
 * Articles live as JSON on the data disk, not in the web root, and their
 * pages are rendered on request from a template. Body text is escaped first
 * and formatted second, so nothing an author types can become markup.
 */

const fs = require('fs');
const path = require('path');

function store(dataDir) {
  const file = path.join(dataDir, 'articles.json');

  function readAll() {
    try {
      if (!fs.existsSync(file)) return [];
      const list = JSON.parse(fs.readFileSync(file, 'utf8'));
      return Array.isArray(list) ? list : [];
    } catch (err) {
      console.error('Could not read articles:', err.message);
      return [];
    }
  }

  function writeAll(list) {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
    fs.renameSync(tmp, file);          // atomic, so a crash cannot truncate it
  }

  return { readAll, writeAll, file };
}

/* ---------------------------------------------------------------- slugs */

function slugify(title) {
  return String(title)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'article';
}

function uniqueSlug(title, list, ignoreId) {
  const base = slugify(title);
  let slug = base;
  let n = 2;
  while (list.some((a) => a.slug === slug && a.id !== ignoreId)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

/* --------------------------------------------------------------- output */

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Escape first, then allow a deliberately small set of shapes: a blank line
   starts a paragraph, "## " a subheading, "- " a list. Nothing else. */
/* [text](/somewhere) after escaping, so the href can only ever be a path on
   this site, a phone number or an email address. An author cannot link out,
   which also means they cannot smuggle in a javascript: URL. */
function inlineLinks(escaped) {
  return escaped.replace(
    /\[([^\]<>]{1,120})\]\((\/(?!\/)[a-z0-9/_.#-]{0,120}|tel:\+?[0-9]{5,15}|mailto:[^\s()<>]{3,80})\)/gi,
    (m, text, href) => `<a href="${href}">${text}</a>`
  );
}

function renderBody(body) {
  const blocks = String(body || '').replace(/\r\n/g, '\n').split(/\n{2,}/);
  const out = [];

  blocks.forEach((raw) => {
    const block = raw.trim();
    if (!block) return;

    /* [image: /uploads/x.jpg | optional caption] on its own line. The path
       is checked against the uploads folder, so a body cannot point an
       <img> at somewhere else. */
    const pic = /^\[image:\s*((?:\/uploads\/|\/assets\/img\/)[a-z0-9][a-z0-9.-]{0,80}\.(?:jpg|png|webp))\s*(?:\|\s*([^\]]*))?\]$/i.exec(block);
    if (pic) {
      const caption = (pic[2] || '').trim();
      out.push(
        `<figure class="article__figure">` +
        `<img src="${escapeHtml(pic[1])}" alt="${escapeHtml(caption)}" loading="lazy">` +
        (caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '') +
        `</figure>`
      );
      return;
    }

    if (block.startsWith('## ')) {
      out.push(`<h2 class="subhead u-mt-l">${escapeHtml(block.slice(3).trim())}</h2>`);
      return;
    }

    const lines = block.split('\n');
    if (lines.every((l) => l.trim().startsWith('- '))) {
      const items = lines
        .map((l) => `<li>${escapeHtml(l.trim().slice(2).trim())}</li>`)
        .join('\n        ');
      out.push(`<ul class="article__list">\n        ${items}\n      </ul>`);
      return;
    }

    out.push(`<p>${inlineLinks(escapeHtml(block).replace(/\n/g, '<br>'))}</p>`);
  });

  return out.join('\n      ');
}

function excerpt(article, max) {
  const source = article.standfirst || String(article.body || '').split(/\n{2,}/)[0] || '';
  const flat = source.replace(/\s+/g, ' ').trim();
  const limit = max || 165;
  return flat.length > limit ? `${flat.slice(0, limit - 1).trimEnd()}…` : flat;
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

module.exports = {
  store,
  slugify,
  uniqueSlug,
  escapeHtml,
  renderBody,
  excerpt,
  formatDate
};
