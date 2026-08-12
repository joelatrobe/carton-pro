#!/usr/bin/env node
/* Generate the value for ADMIN_PASSWORD_HASH.
   Usage: node tools/hash-password.js 'the password'  */
const { hashPassword } = require('../lib/auth');
const pw = process.argv[2];
if (!pw) {
  console.error("Usage: node tools/hash-password.js 'the password'");
  process.exit(1);
}
if (pw.length < 12) {
  console.error('Use at least 12 characters; this is the only lock on the article manager.');
  process.exit(1);
}
console.log('\nSet this on the server as ADMIN_PASSWORD_HASH:\n');
console.log(hashPassword(pw));
console.log('\nAlso set SESSION_SECRET to a long random string, or everyone is signed out on each restart.\n');
