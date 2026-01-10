/* LoopRead — split into 4 files
   Part 2/4: word highlighting tool
*/

(() => {
  'use strict';

  const app = (window.LoopRead = window.LoopRead || {});
  const els = app.els;
  const state = app.state;

  // --- Word highlighting (Tap-to-Mark; in-memory only) ---
  const highlight = {
    selections: new Map(), // wordKey -> { idx:number, color:string }
    nextIdx: 0,
  };

  function normalizeWord(raw) {
    return String(raw ?? '')
      .normalize('NFKC')
      .toLocaleLowerCase();
  }

  function highlightColor(idx) {
    // Golden-angle stepping yields well-separated adjacent colors and scales to hundreds.
    const golden = 137.508;
    const h = (idx * golden) % 360;

    // Slight staggering improves distinguishability of neighboring selections.
    const lightnessCycle = [86, 80, 74, 90, 78];
    const saturationCycle = [88, 84, 90, 82, 86];
    const l = lightnessCycle[idx % lightnessCycle.length];
    const s = saturationCycle[idx % saturationCycle.length];

    return `hsl(${h.toFixed(1)}, ${s}%, ${l}%)`;
  }

  const WORD_RE = /[\p{L}\p{M}\p{N}]+(?:[’'_-][\p{L}\p{M}\p{N}]+)*/gu;
  const WORD_RE_TEST = /[\p{L}\p{M}\p{N}]+(?:[’'_-][\p{L}\p{M}\p{N}]+)*/u;

  function wrapWordsInElement(rootEl) {
    if (!rootEl) return;

    const walker = document.createTreeWalker(
      rootEl,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const v = node.nodeValue;
          if (!v || !WORD_RE_TEST.test(v)) return NodeFilter.FILTER_REJECT;
          const p = node.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          if (p.closest('.word-token')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    for (const node of textNodes) {
      const text = node.nodeValue;
      if (!text) continue;

      const frag = document.createDocumentFragment();
      let last = 0;

      WORD_RE.lastIndex = 0;
      let m;
      while ((m = WORD_RE.exec(text)) !== null) {
        const start = m.index;
        const rawWord = m[0];

        if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)));

        const span = document.createElement('span');
        span.className = 'word-token';
        span.dataset.word = normalizeWord(rawWord);
        span.textContent = rawWord;
        frag.appendChild(span);

        last = start + rawWord.length;
      }

      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));

      node.parentNode?.replaceChild(frag, node);
    }
  }

  function getWordNodes(wordKey) {
    if (!els.blocksContainer) return [];
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return Array.from(els.blocksContainer.querySelectorAll(`[data-word="${CSS.escape(wordKey)}"]`));
    }
    return Array.from(els.blocksContainer.querySelectorAll('[data-word]')).filter(n => n.dataset.word === wordKey);
  }

  function replaceTokenElement(oldEl, tagName) {
    const el = document.createElement(tagName);
    el.className = oldEl.className;
    el.dataset.word = oldEl.dataset.word;
    el.textContent = oldEl.textContent;
    return el;
  }

  function applyHighlightToWord(wordKey) {
    const sel = highlight.selections.get(wordKey);
    const nodes = getWordNodes(wordKey);

    for (const n of nodes) {
      const isMarked = (n.tagName === 'MARK');

      if (sel) {
        if (!isMarked) {
          const repl = replaceTokenElement(n, 'mark');
          repl.style.setProperty('--hl-color', sel.color);
          n.replaceWith(repl);
        } else {
          n.style.setProperty('--hl-color', sel.color);
        }
      } else {
        if (isMarked) {
          const repl = replaceTokenElement(n, 'span');
          repl.style.removeProperty('--hl-color');
          n.replaceWith(repl);
        }
      }
    }
  }

  function applyAllHighlights() {
    for (const wordKey of highlight.selections.keys()) {
      applyHighlightToWord(wordKey);
    }
  }

  function clearHighlights() {
    highlight.selections.clear();
    highlight.nextIdx = 0;

    if (!els.blocksContainer) return;
    const marks = Array.from(els.blocksContainer.querySelectorAll('mark.word-token'));
    for (const m of marks) {
      const repl = replaceTokenElement(m, 'span');
      m.replaceWith(repl);
    }
  }

  function onWordTokenClick(e) {
    if (!state.highlightToolEnabled) return;
    if (!els.viewReader.classList.contains('view-active')) return;

    const targetEl = (e.target && e.target.nodeType === Node.ELEMENT_NODE)
      ? e.target
      : e.target?.parentElement;

    const token = targetEl?.closest?.('.word-token');
    if (!token || !els.blocksContainer.contains(token)) return;

    const wordKey = token.dataset.word;
    if (!wordKey) return;

    if (highlight.selections.has(wordKey)) {
      highlight.selections.delete(wordKey);
      applyHighlightToWord(wordKey);
    } else {
      const idx = highlight.nextIdx++;
      const color = highlightColor(idx);
      highlight.selections.set(wordKey, { idx, color });
      applyHighlightToWord(wordKey);
    }
  }

  function setHighlightToolEnabled(enabled) {
    state.highlightToolEnabled = !!enabled;
    document.body.classList.toggle('tool-highlight-active', state.highlightToolEnabled);

    if (els.btnHighlightTool) {
      els.btnHighlightTool.classList.toggle('is-active', state.highlightToolEnabled);
      els.btnHighlightTool.setAttribute('aria-pressed', state.highlightToolEnabled ? 'true' : 'false');
    }
  }

  function toggleHighlightTool() {
    setHighlightToolEnabled(!state.highlightToolEnabled);
  }

  function isEditableTarget(target) {
    const el = (target && target.nodeType === Node.ELEMENT_NODE) ? target : target?.parentElement;
    if (!el) return false;
    return !!el.closest('input, textarea, [contenteditable=""], [contenteditable="true"], select, option');
  }

  function onGlobalSelectStart(e) {
    if (!state.highlightToolEnabled) return;
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
  }

  // Expose
  app.highlight = highlight;

  app.wrapWordsInElement = wrapWordsInElement;
  app.applyAllHighlights = applyAllHighlights;
  app.clearHighlights = clearHighlights;

  app.onWordTokenClick = onWordTokenClick;

  app.setHighlightToolEnabled = setHighlightToolEnabled;
  app.toggleHighlightTool = toggleHighlightTool;

  app.onGlobalSelectStart = onGlobalSelectStart;
})();
