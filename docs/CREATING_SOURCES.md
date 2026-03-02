# 📚 Criando Fontes para o CODEX

Este guia explica como criar fontes de mangá para o CODEX. Uma fonte é um arquivo JSON que define como extrair mangás de um site específico.

## 📁 Estrutura do Arquivo

Toda fonte deve ter esta estrutura básica:

```json
{
  "id": "minha_fonte",
  "name": "Nome da Fonte",
  "baseUrl": "https://exemplo.com",
  "version": "1.0.0",
  "language": "pt-BR",
  "iconUrl": "https://exemplo.com/favicon.png",
  "search": { ... },
  "details": { ... },
  "chapters": { ... },
  "pages": { ... }
}
```

## 🔍 Campos Obrigatórios

| Campo | Descrição | Exemplo |
|-------|-----------|---------|
| `id` | ID único (snake_case) | `mangalivre_br` |
| `name` | Nome exibido na UI | `MangaLivre` |
| `baseUrl` | URL base do site | `https://mangalivre.blog` |
| `version` | Versão semver | `1.0.0` |
| `language` | Código do idioma | `pt-BR`, `en`, `es` |

## 🔎 Seção `search`

Define como buscar mangás no site:

```json
"search": {
  "urlPattern": "/?s={query}",
  "method": "GET",
  "selectors": {
    "container": ".manga-card",
    "title": ".manga-card-title",
    "cover": ".manga-cover-img",
    "coverAttr": "src",
    "url": ".manga-card-link",
    "urlAttr": "href"
  }
}
```

### Campos:
- `urlPattern`: Caminho da busca. `{query}` é substituído pelo termo.
- `method`: `GET` ou `POST`
- `container`: Seletor do card de cada resultado
- `title`: Seletor do título dentro do container
- `cover`: Seletor da imagem de capa
- `coverAttr`: Atributo da imagem (`src` ou `data-src`)
- `url`: Seletor do link para página do mangá
- `urlAttr`: Atributo do link (`href`)

## 📖 Seção `details`

Define como extrair detalhes da página do mangá:

```json
"details": {
  "selectors": {
    "title": ".manga-title",
    "description": ".synopsis-content p",
    "author": ".author-name",
    "status": ".manga-status",
    "genres": ".manga-tags .tag",
    "cover": ".manga-cover",
    "coverAttr": "src"
  }
}
```

## 📑 Seção `chapters`

Define como extrair a lista de capítulos:

```json
"chapters": {
  "selectors": {
    "container": ".chapter-item",
    "title": ".chapter-number",
    "date": ".chapter-date",
    "url": ".chapter-link",
    "urlAttr": "href"
  },
  "numberRegex": "Cap(?:ítulo)?[\\s.:]*(\\d+(?:\\.\\d+)?)"
}
```

### numberRegex
Regex para extrair número do capítulo do título.
- Capture group `(\\d+)` extrai o número
- Exemplo: `"Cap 42"` → `42`

## 🖼️ Seção `pages`

Define como extrair as páginas/imagens de um capítulo.

### Modo DOM (imagens no HTML):

```json
"pages": {
  "mode": "DOM",
  "selectors": {
    "container": ".chapter-images",
    "image": ".chapter-image img",
    "imageAttr": "src"
  }
}
```

### Modo SCRIPT (imagens em JavaScript):

Alguns sites guardam imagens em variáveis JS:

```json
"pages": {
  "mode": "SCRIPT",
  "scriptVariable": "imageList",
  "cdnVariable": "cdnUrl",
  "imageCombine": "{cdn}{image}"
}
```

- `scriptVariable`: Nome da variável com array de imagens
- `cdnVariable`: Nome da variável com URL do CDN
- `imageCombine`: Pattern para combinar CDN + imagem

## 🛠️ Como Encontrar Seletores

1. Abra o site no navegador
2. Pressione `F12` para abrir DevTools
3. Use o seletor de elementos (ícone do cursor)
4. Clique no elemento que quer
5. Copie o seletor CSS

### Dicas:
- Use classes específicas: `.manga-card` ao invés de `div`
- Evite seletores muito longos
- Teste seletores no console: `document.querySelectorAll('.manga-card')`

## ✅ Testando sua Fonte

1. Salve como `minha_fonte.json`
2. Abra o CODEX → Fontes
3. Clique em "Adicionar Fonte"
4. Selecione o arquivo
5. Teste a busca no Browse

## 📤 Publicando

Para compartilhar sua fonte:

1. Hospede o JSON em um servidor (GitHub Gist, Pastebin)
2. Compartilhe a URL direta do arquivo .json
3. Outros usuários podem adicionar via URL

## 🔧 Exemplo Completo

```json
{
  "id": "exemplo_manga",
  "name": "Exemplo Mangá",
  "baseUrl": "https://exemplo.com",
  "version": "1.0.0",
  "language": "pt-BR",
  "iconUrl": "https://exemplo.com/icon.png",
  "search": {
    "urlPattern": "/search?q={query}",
    "method": "GET",
    "selectors": {
      "container": ".manga-item",
      "title": ".title",
      "cover": ".cover img",
      "coverAttr": "src",
      "url": "a.link",
      "urlAttr": "href"
    }
  },
  "details": {
    "selectors": {
      "title": "h1.manga-title",
      "description": ".synopsis",
      "author": ".author",
      "genres": ".genres span",
      "cover": ".cover img",
      "coverAttr": "src"
    }
  },
  "chapters": {
    "selectors": {
      "container": ".chapter-list li",
      "title": ".chapter-name",
      "date": ".date",
      "url": "a",
      "urlAttr": "href"
    },
    "numberRegex": "Chapter (\\d+)"
  },
  "pages": {
    "mode": "DOM",
    "selectors": {
      "container": ".reader",
      "image": "img.page",
      "imageAttr": "src"
    }
  }
}
```

## ❓ FAQ

**P: Minha fonte não encontra resultados**  
R: Verifique os seletores no DevTools. O site pode ter mudado.

**P: As imagens não carregam**  
R: Verifique se precisa usar `data-src` ou se o site usa JavaScript.

**P: Como lidar com Cloudflare?**  
R: Infelizmente, sites com proteção Cloudflare podem não funcionar.

---

**Dúvidas?** Abra uma issue no repositório do CODEX!
