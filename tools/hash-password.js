#!/usr/bin/env node
/* Carton-Pro — set the article manager password.
 *
 *   node tools/hash-password.js              suggest one and hash it
 *   node tools/hash-password.js 'your words' hash one you have chosen
 *
 * A short password is easy to type and easy to break. A few plain words is
 * easy to type and hard to break, so that is what this suggests: all
 * lowercase, no punctuation to remember, nothing to mistype.
 */

const crypto = require('crypto');
const { hashPassword } = require('../lib/auth');

const WORDS = require('../lib/wordlist');

function pick(list) {
  /* randomInt is drawn from the same source as key material, not Math.random,
     which is predictable enough to enumerate. */
  return list[crypto.randomInt(0, list.length)];
}

function suggest() {
  const words = [pick(WORDS), pick(WORDS), pick(WORDS), pick(WORDS)];
  return `${words.join('-')}-${crypto.randomInt(10, 100)}`;
}

/* Rough guide only: how many guesses this shape implies, assuming the
   attacker knows exactly how it was built. */
function strengthNote(pw) {
  if (!/^[a-z]+(-[a-z]+){3}-\d\d$/.test(pw)) return null;
  const bits = Math.log2(Math.pow(WORDS.length, 4) * 90);
  /* Cost of one guess against this hash, measured rather than assumed. */
  const t0 = Date.now();
  hashPassword('measure-the-cost-of-a-guess');
  const perGuess = Math.max(Date.now() - t0, 1) / 1000;
  const years = (Math.pow(2, bits - 1) * perGuess) / (60 * 60 * 24 * 365);
  const cores = 10000;
  return `About ${bits.toFixed(0)} bits, even assuming the attacker knows this exact recipe and word list.\n`
       + ` Offline  If the hash itself leaked, cracking it would take roughly ${Math.round(years / cores).toLocaleString('en-GB')} years on ${cores.toLocaleString('en-GB')} CPU cores.`;
}

const given = process.argv[2];
const password = given || suggest();

if (given && given.length < 12) {
  console.error('\nThat is under 12 characters. Four words and a number is easier to type and far harder to guess.');
  console.error(`Try: ${suggest()}\n`);
  process.exit(1);
}

const hash = hashPassword(password);

console.log('\n──────────────────────────────────────────────────────────────');
console.log(' Password  ' + password);
const note = strengthNote(password);
if (note) console.log(' Strength  ' + note);
console.log('──────────────────────────────────────────────────────────────');
console.log('\nGive the password above to whoever writes the articles.');
console.log('Set these on the server (Render → Environment):\n');
console.log('ADMIN_PASSWORD_HASH=' + hash);
console.log('SESSION_SECRET=' + crypto.randomBytes(32).toString('hex'));
console.log('\nThe password itself is never stored anywhere. If it is lost, run');
console.log('this again and replace ADMIN_PASSWORD_HASH.\n');
