/* ============================================================
   DGO v2.2 — Native Safe DOM Builder & HTML TreeWalker Sanitizer
   ============================================================ */

const Sanitizer = (() => {
  const TAG_SAFELIST = [
    'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
    'ul', 'ol', 'li', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 
    'blockquote', 'a', 'img'
  ];

  const ATTRIBUTE_SAFELIST = {
    'a': ['href', 'title', 'target', 'class', 'style'],
    'img': ['src', 'alt', 'title', 'class', 'style', 'width', 'height'],
    'span': ['class', 'style'],
    'div': ['class', 'style'],
    'p': ['class', 'style'],
    'td': ['style', 'class', 'colspan', 'rowspan'],
    'th': ['style', 'class', 'colspan', 'rowspan'],
    'table': ['style', 'class']
  };

  /**
   * Deep HTML Sanitization using native browser DOMParser and TreeWalker.
   * Prevents standard, nested, and mutation-based XSS vectors.
   */
  function cleanHTML(htmlString) {
    if (!htmlString || typeof htmlString !== 'string') return '';
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const body = doc.body || doc.createElement('body');

    const treeWalker = document.createTreeWalker(
      body,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT,
      null,
      false
    );

    const nodesToRemove = [];
    let currentNode = treeWalker.nextNode();

    while (currentNode) {
      if (currentNode.nodeType === Node.COMMENT_NODE) {
        nodesToRemove.push(currentNode);
      } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
        const tagName = currentNode.tagName.toLowerCase();
        
        if (!TAG_SAFELIST.includes(tagName)) {
          nodesToRemove.push(currentNode);
        } else {
          const attrs = Array.from(currentNode.attributes);
          const allowedAttrs = ATTRIBUTE_SAFELIST[tagName] || [];

          for (const attr of attrs) {
            const attrName = attr.name.toLowerCase();
            const isStyleOrClass = ['style', 'class'].includes(attrName);

            if (!isStyleOrClass && !allowedAttrs.includes(attrName)) {
              currentNode.removeAttribute(attr.name);
            } else if (attrName === 'href' || attrName === 'src') {
              const urlValue = attr.value.trim().toLowerCase();
              if (urlValue.startsWith('javascript:') || urlValue.startsWith('data:') || urlValue.startsWith('vbscript:')) {
                currentNode.removeAttribute(attr.name);
              }
            }
          }
        }
      }
      currentNode = treeWalker.nextNode();
    }

    nodesToRemove.forEach(node => {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    });

    return body.innerHTML;
  }

  /**
   * Safe DOM-based Row Creator - bypasses innerHTML concatenation vectors entirely.
   */
  function createSafeRow(cellsSpec) {
    const tr = document.createElement('tr');
    cellsSpec.forEach(cell => {
      const td = document.createElement('td');
      if (cell.isHTML) {
        td.innerHTML = cleanHTML(cell.content);
      } else {
        td.textContent = cell.content;
      }
      if (cell.className) td.className = cell.className;
      if (cell.style) td.style.cssText = cell.style;
      tr.appendChild(td);
    });
    return tr;
  }

  /**
   * Attribute-safe URL for href/src sinks. Allows http/https/mailto/tel and
   * relative URLs; neutralizes javascript:/data:/vbscript: (and any other
   * scheme) and attribute-encodes the value so it cannot break out of quotes.
   */
  function safeUrl(url) {
    const raw = String(url == null ? '' : url).trim();
    if (!raw) return '';
    const scheme = (raw.match(/^([a-z][a-z0-9+.-]*):/i) || [])[1];
    if (scheme && !['http', 'https', 'mailto', 'tel'].includes(scheme.toLowerCase())) {
      return '#';
    }
    return raw
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return {
    escape: (str) => {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },
    cleanHTML,
    safeUrl,
    createRow: createSafeRow
  };
})();

window.Sanitizer = Sanitizer;
