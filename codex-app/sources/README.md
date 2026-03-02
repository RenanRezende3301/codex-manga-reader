# 🧩 CODEX Custom Sources

CODEX relies on a **Declarative Source Protocol**, meaning you can add unlimited manga providers just by dropping `.js` scripts into this folder.

This architecture ensures the app never breaks when a website changes its layout—you just update the tiny source file!

## 🚀 How to Create a New Source

1. Copy the `template.js` file and rename it (e.g., `my-custom-site.js`).
2. Open the file in any text editor.
3. Fill in the **Metadata** at the top (Name, URL, Language). **Ensure the `id` is completely unique.**
4. Implement the 4 core scraping functions using the injected `cheerio` (jQuery-like) library:
   - `search(query)`
   - `getDetails(mangaUrl)`
   - `getChapters(mangaUrl)`
   - `getPages(chapterUrl)`

### 🛠️ Injected Utilities

To bypass Cloudflare and complex protections, DO NOT use standard `fetch`. Always use the utilities provided by the CODEX engine at the top of your script:

```javascript
const { cheerio, fetchPage, makeAbsoluteUrl, extractText, extractAttr } = require('./lib/utils');
```

- **`fetchPage(url, referrerBaseUrl)`**: Fetches the HTML of a page using CODEX's stealth systems.
- **`makeAbsoluteUrl(path, baseUrl)`**: Converts relative image paths (`/uploads/1.jpg`) into absolute paths.
- **`extractText($element)`**: Safely extracts and trims text from a jQuery object without throwing null errors.
- **`extractAttr($element, attrName)`**: Safely extracts attributes (like `src` or `href`).

## ⚙️ How to Activate Your Source

Once you've written your script:
1. Open [`sources-config.json`](./sources-config.json).
2. Add your filename to the `active` array:
   ```json
   {
     "active": [
       "mangalivre.js",
       "weebcentral.js",
       "my-custom-site.js"
     ]
   }
   ```
3. Restart the CODEX application. Your new source will automatically appear in the "Browse" and "Sources" tabs!
