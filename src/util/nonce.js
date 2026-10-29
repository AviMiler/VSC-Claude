/**
 * Random nonces for webview CSP and random tokens.
 */
const crypto = require('crypto');

/** @returns {string} 32 hex characters */
function createNonce() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = { createNonce };
