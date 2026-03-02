/**
 * CODEX Custom Source Template
 * -------------------------------------------------------------------
 * Make a copy of this file and rename it to your source's name.
 * e.g., `my-manga-site.js`
 * 
 * CODEX automatically injects `lib/utils.js` functions for you:
 * - cheerio: Parse HTML like jQuery.
 * - fetchPage: Fetches a URL with cloudflare bypass and headers.
 * - makeAbsoluteUrl: Converts `/image.png` to `https://site.com/image.png`
 * - extractText: Robust text extraction from a cheerio element.
 * - extractAttr: Robust attribute extraction from a cheerio element.
 */
const { cheerio, fetchPage, makeAbsoluteUrl, extractText, extractAttr } = require('./lib/utils');

// 1. Mandatory Plugin Metadata
const id = 'unique_id_for_this_plugin_en'; // E.g., 'mangalivre_br' (Must be unique!)
const name = 'My Manga Site'; // The display name in the app
const baseUrl = 'https://example-manga.com'; // The base URL of the website
const version = '1.0.0'; // Version of your plugin
const language = 'en'; // ISO language code (e.g., 'en', 'pt-BR')
const iconUrl = 'https://example-manga.com/favicon.ico'; // URL to the site's icon

/**
 * 2. Search Function
 * Called when the user types in the Browse page search bar.
 * @param {string} query - The user's search term (e.g., "Naruto")
 * @returns {Array} List of MangaCard objects
 */
async function search(query) {
  // Example implementation:
  const url = `${baseUrl}/search?q=${encodeURIComponent(query)}`;
  const html = await fetchPage(url, baseUrl);
  const $ = cheerio.load(html);
  const results = [];

  $('.search-result-item').each((_, element) => {
    const $el = $(element);
    const title = extractText($el.find('.title'));
    const mangaUrl = makeAbsoluteUrl(extractAttr($el.find('a'), 'href'), baseUrl);

    if (title && mangaUrl) {
      results.push({
        title,
        url: mangaUrl,
        thumbnailUrl: extractAttr($el.find('img'), 'src') || undefined,
        sourceId: id,
      });
    }
  });

  return results;
}

/**
 * 3. Get Manga Details
 * Called when the user clicks on a Manga Card to view its details.
 * @param {string} mangaUrl - The absolute URL of the manga page
 * @returns {Object} MangaDetails object
 */
async function getDetails(mangaUrl) {
  const html = await fetchPage(mangaUrl, baseUrl);
  const $ = cheerio.load(html);

  return {
    title: extractText($('.manga-title')),
    description: extractText($('.synopsis')),
    author: extractText($('.author-name')),
    artist: extractText($('.artist-name')),
    status: extractText($('.status-badge')),
    genres: $('.genres .badge').map((_, el) => extractText($(el))).get().filter(Boolean),
    thumbnailUrl: extractAttr($('.cover-img'), 'src'),
  };
}

/**
 * 4. Get Chapters List
 * Called to populate the chapter list on the Manga Details page.
 * @param {string} mangaUrl - The absolute URL of the manga page
 * @returns {Array} List of Chapter objects
 */
async function getChapters(mangaUrl) {
  const html = await fetchPage(mangaUrl, baseUrl);
  const $ = cheerio.load(html);
  const chapters = [];

  $('.chapter-list-item').each((_, element) => {
    const $el = $(element);
    const name = extractText($el.find('.chapter-name'));
    const sourceUrl = makeAbsoluteUrl(extractAttr($el.find('a'), 'href'), baseUrl);

    // Attempt to parse chapter number (e.g., "Chapter 123" -> 123)
    let chapterNumber = 0;
    const match = name.match(/[\d]+(?:\.[\d]+)?/);
    if (match) chapterNumber = parseFloat(match[0]);

    if (name && sourceUrl) {
      chapters.push({
        name,
        sourceUrl,
        chapterNumber,
        date: extractText($el.find('.chapter-date')) || undefined,
      });
    }
  });

  // CODEX expects chapters in descending order (newest first).
  // If the website lists oldest first, you might need to: return chapters.reverse();
  return chapters;
}

/**
 * 5. Get Pages
 * Called when the user opens a chapter to read.
 * @param {string} chapterUrl - The absolute URL of the chapter page
 * @returns {Array<string>} Array of absolute image URLs
 */
async function getPages(chapterUrl) {
  const html = await fetchPage(chapterUrl, baseUrl);
  const $ = cheerio.load(html);
  const pages = [];

  $('.reader-images img').each((_, element) => {
    // Websites often hide the real image in `data-src` or `data-lazy` to prevent scraping.
    const src = extractAttr($(element), 'data-src') || extractAttr($(element), 'src');

    if (src) {
      pages.push(makeAbsoluteUrl(src, baseUrl));
    }
  });

  return pages;
}

// 6. Export the Module
// Important: Do NOT change these variable names. CODEX looks for exactly these exports.
module.exports = {
  id,
  name,
  baseUrl,
  version,
  language,
  iconUrl,
  search,
  getDetails,
  getChapters,
  getPages,
};
