/**
 * CODEX Source Plugin Utilities
 * 
 * Shared helpers available to all source plugins.
 * Usage: const { axios, cheerio, extractText, makeAbsoluteUrl, DEFAULT_HEADERS } = require('./lib/utils');
 */

const axios = require('axios');
const cheerio = require('cheerio');

// Default headers that simulate a real browser
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

/**
 * Make a URL absolute if it's relative.
 * @param {string} url - The URL to make absolute
 * @param {string} baseUrl - The base URL to prepend
 * @returns {string} The absolute URL
 */
function makeAbsoluteUrl(url, baseUrl) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const urlPath = url.startsWith('/') ? url : `/${url}`;
  return `${base}${urlPath}`;
}

/**
 * Safely extract text from a Cheerio element, stripping scripts, styles, and SVGs.
 * @param {import('cheerio').Cheerio} $el - The Cheerio element
 * @returns {string} The clean text content
 */
function extractText($el) {
  if (!$el || $el.length === 0) return '';
  const $clone = $el.clone();
  $clone.find('script, style, svg').remove();
  return $clone.text().replace(/\s+/g, ' ').trim();
}

/**
 * Extract an attribute value from a Cheerio element.
 * @param {import('cheerio').Cheerio} $el - The Cheerio element
 * @param {string} attr - The attribute name
 * @returns {string} The attribute value or empty string
 */
function extractAttr($el, attr) {
  return $el.attr(attr) || '';
}

/**
 * Perform a GET request with default browser headers.
 * @param {string} url - The URL to fetch
 * @param {string} referer - The referer URL
 * @param {object} [extraHeaders] - Additional headers to merge
 * @returns {Promise<string>} The response HTML
 */
async function fetchPage(url, referer, extraHeaders = {}) {
  const response = await axios.get(url, {
    headers: { ...DEFAULT_HEADERS, Referer: referer, ...extraHeaders },
    timeout: 30000,
  });
  return response.data;
}

/**
 * Perform a POST request with default browser headers.
 * @param {string} url - The URL to post to
 * @param {string} body - The POST body
 * @param {string} referer - The referer URL
 * @param {object} [extraHeaders] - Additional headers to merge
 * @returns {Promise<string>} The response HTML
 */
async function postPage(url, body, referer, extraHeaders = {}) {
  const response = await axios.post(url, body, {
    headers: {
      ...DEFAULT_HEADERS,
      Referer: referer,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...extraHeaders,
    },
    timeout: 30000,
  });
  return response.data;
}

module.exports = {
  axios,
  cheerio,
  DEFAULT_HEADERS,
  makeAbsoluteUrl,
  extractText,
  extractAttr,
  fetchPage,
  postPage,
};
