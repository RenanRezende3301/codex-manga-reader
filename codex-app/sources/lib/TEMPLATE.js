/**
 * =====================================================
 * CODEX Source Plugin Template
 * =====================================================
 * 
 * Copy this file to create a new source for CODEX.
 * Rename it to your source's ID (e.g., "mysource.js").
 * Place it in the "sources/" directory.
 * 
 * REQUIRED EXPORTS:
 *   - id, name, baseUrl, version, language
 *   - search(query)
 *   - getChapters(mangaUrl) 
 *   - getPages(chapterUrl)
 * 
 * OPTIONAL EXPORTS:
 *   - iconUrl
 *   - getDetails(mangaUrl)
 * 
 * AVAILABLE UTILITIES (from './lib/utils'):
 *   - axios          → HTTP client (already configured)
 *   - cheerio        → HTML parser (jQuery-like)
 *   - fetchPage(url, referer, extraHeaders?)  → GET request, returns HTML string
 *   - postPage(url, body, referer, extraHeaders?)  → POST request, returns HTML string
 *   - makeAbsoluteUrl(url, baseUrl)  → Convert relative URL to absolute
 *   - extractText($el)  → Get clean text from Cheerio element (strips SVG/CSS)
 *   - extractAttr($el, attr)  → Get attribute value from Cheerio element
 *   - DEFAULT_HEADERS  → Standard browser headers object
 */

const { cheerio, fetchPage, makeAbsoluteUrl, extractText, extractAttr } = require('./lib/utils');

// ============================================================
// METADATA — Fill in your source's information
// ============================================================

const id = 'your_source_id';          // Unique identifier (lowercase, no spaces)
const name = 'Your Source Name';       // Display name
const baseUrl = 'https://example.com'; // Base URL of the website
const version = '1.0.0';              // Plugin version
const language = 'en';                 // Language code (en, pt-BR, es, etc.)
const iconUrl = '';                    // URL to the site's favicon (optional)

// ============================================================
// SEARCH — Find manga by name
// ============================================================
// Must return an array of objects with this shape:
// [{ title, url, thumbnailUrl?, status?, rating?, sourceId }]

async function search(query) {
  const url = `${baseUrl}/search?q=${encodeURIComponent(query)}`;
  const html = await fetchPage(url, baseUrl);
  const $ = cheerio.load(html);
  const results = [];

  // Adapt the CSS selectors below to match the target website
  $('.search-result').each((_, element) => {
    const $el = $(element);
    const title = extractText($el.find('.title'));
    const mangaUrl = makeAbsoluteUrl(extractAttr($el.find('a'), 'href'), baseUrl);
    const thumbnailUrl = extractAttr($el.find('img'), 'src');

    if (title && mangaUrl) {
      results.push({
        title,
        url: mangaUrl,
        thumbnailUrl: thumbnailUrl || undefined,
        sourceId: id,
      });
    }
  });

  return results;
}

// ============================================================
// CHAPTERS — Get all chapters for a manga
// ============================================================
// Must return an array of objects with this shape:
// [{ name, sourceUrl, chapterNumber, date? }]

async function getChapters(mangaUrl) {
  const html = await fetchPage(mangaUrl, baseUrl);
  const $ = cheerio.load(html);
  const chapters = [];

  // Adapt the CSS selectors below to match the target website
  $('.chapter-item').each((_, element) => {
    const $el = $(element);
    const name = extractText($el.find('.chapter-name'));
    const sourceUrl = makeAbsoluteUrl(extractAttr($el.find('a'), 'href'), baseUrl);
    const date = extractText($el.find('.chapter-date'));

    // Extract chapter number from the name
    let chapterNumber = 0;
    const match = name.match(/Chapter\s*(\d+(?:\.\d+)?)/i);
    if (match) chapterNumber = parseFloat(match[1]);

    if (name && sourceUrl) {
      chapters.push({ name, sourceUrl, chapterNumber, date: date || undefined });
    }
  });

  return chapters;
}

// ============================================================
// PAGES — Get all image URLs for a chapter
// ============================================================
// Must return an array of image URL strings:
// ['https://cdn.example.com/page1.jpg', 'https://cdn.example.com/page2.jpg', ...]

async function getPages(chapterUrl) {
  const html = await fetchPage(chapterUrl, baseUrl);
  const $ = cheerio.load(html);
  const pages = [];

  // Adapt the CSS selectors below to match the target website
  $('.reader-container img').each((_, element) => {
    const src = $(element).attr('src') || $(element).attr('data-src') || '';
    if (src) {
      pages.push(makeAbsoluteUrl(src, baseUrl));
    }
  });

  return pages;
}

// ============================================================
// DETAILS (optional) — Get detailed manga information
// ============================================================
// Returns: { title, description?, author?, artist?, status?, genres?, thumbnailUrl? }

async function getDetails(mangaUrl) {
  const html = await fetchPage(mangaUrl, baseUrl);
  const $ = cheerio.load(html);

  return {
    title: extractText($('.manga-title')),
    description: extractText($('.synopsis')),
    author: extractText($('.author')),
    status: extractText($('.status')),
    genres: $('.genre-tag').map((_, el) => extractText($(el))).get().filter(Boolean),
    thumbnailUrl: extractAttr($('.cover img'), 'src'),
  };
}

// ============================================================
// EXPORT — Do not modify the structure below
// ============================================================

module.exports = {
  id,
  name,
  baseUrl,
  version,
  language,
  iconUrl,
  search,
  getChapters,
  getPages,
  getDetails,
};
