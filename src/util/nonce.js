// Nonce: random tokens for webview CSP nonces and control request ids.
const crypto = require('crypto');

/**
 * @param {number} [bytes]
 * @returns {string}
 */
function nonce(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = { nonce };
