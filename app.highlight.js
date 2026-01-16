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
    let l = lightnessCycle[idx % lightnessCycle.length];
    let s = saturationCycle[idx % saturationCycle.length];

    // Avoid very light yellow highlights: they are hard to distinguish from the app background.
    // Yellow-ish hues are roughly 45°–85° in HSL.
    if (h >= 45 && h <= 85 && l > 70) {
      l = 62;
      s = Math.max(s, 92);
    }

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
    // preserve all dataset attributes (e.g., token indices / marker ids)
    for (const [k, v] of Object.entries(oldEl.dataset || {})) {
      el.dataset[k] = v;
    }
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
    if (!els.viewReader.classList.contains('view-active')) return;

    const targetEl = (e.target && e.target.nodeType === Node.ELEMENT_NODE)
      ? e.target
      : e.target?.parentElement;

    const token = targetEl?.closest?.('.word-token');
    if (!token || !els.blocksContainer.contains(token)) return;

    // Marker tool has precedence when active
    if (state.markerToolEnabled) {
      const handled = onMarkerTokenClick(token);
      if (handled) return;
    }

    if (!state.highlightToolEnabled) return;

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
      // Visual state can be suppressed while marker tool is active.
      const showActive = state.highlightToolEnabled && !state.markerToolEnabled;
      els.btnHighlightTool.classList.toggle('is-active', showActive);
      els.btnHighlightTool.setAttribute('aria-pressed', showActive ? 'true' : 'false');
    }
  }

  function toggleHighlightTool() {
    // Tools are mutually exclusive: highlight, marker, or none.
    // Clicking the active tool turns it off.
    const willEnable = !state.highlightToolEnabled;
    if (willEnable) {
      // enable highlight, disable marker
      setMarkerToolEnabled(false);
      setHighlightToolEnabled(true);
    } else {
      setHighlightToolEnabled(false);
    }
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

  

  // --- Marker tool (continuous word-span marks with optional notes; project-scoped persistence via state.markers) ---
  const marker = {
    pendingStart: null, // { blockIndex:number, tokenIndex:number }
  };

  function setMarkerToolEnabled(enabled) {
    state.markerToolEnabled = !!enabled;

    document.body.classList.toggle('tool-marker-active', state.markerToolEnabled);
    if (els.btnMarkerTool) {
      els.btnMarkerTool.classList.toggle('is-active', state.markerToolEnabled);
      els.btnMarkerTool.setAttribute('aria-pressed', state.markerToolEnabled ? 'true' : 'false');
    }

    if (!state.markerToolEnabled) {
      clearPendingMarkerStart();
      removeMarkerDecorations();
      // restore highlight button visual state (highlight tool remains enabled/disabled as-is)
      if (els.btnHighlightTool) {
        els.btnHighlightTool.classList.toggle('is-active', !!state.highlightToolEnabled);
        els.btnHighlightTool.setAttribute('aria-pressed', state.highlightToolEnabled ? 'true' : 'false');
      }
    } else {
      applyAllMarkers();
      // hide highlight button active state while in marker mode
      if (els.btnHighlightTool) {
        els.btnHighlightTool.classList.remove('is-active');
        els.btnHighlightTool.setAttribute('aria-pressed', 'false');
      }
    }
  }

  function toggleMarkerTool() {
    // Tools are mutually exclusive: highlight, marker, or none.
    // Clicking the active tool turns it off.
    const willEnable = !state.markerToolEnabled;
    if (willEnable) {
      // enable marker, disable highlight
      setHighlightToolEnabled(false);
      setMarkerToolEnabled(true);
    } else {
      setMarkerToolEnabled(false);
    }
  }

  function clearPendingMarkerStart() {
    marker.pendingStart = null;
    if (!els.blocksContainer) return;
    els.blocksContainer.querySelectorAll('.marker-pending-start').forEach(el => el.classList.remove('marker-pending-start'));
  }

  function getMarkersForCurrentCollection() {
    const cid = app.getCurrentCollectionId?.();
    if (!cid) return [];
    return (state.markers || []).filter(m => m.collectionId === cid);
  }

  function getMarkerById(markerId) {
    const id = String(markerId || '').trim();
    if (!id) return null;
    return (state.markers || []).find(m => m.id === id) || null;
  }

  function removeMarkerDecorations() {
    if (!els.blocksContainer) return;
    els.blocksContainer.querySelectorAll('.word-token.marker-token').forEach(el => el.classList.remove('marker-token'));
    els.blocksContainer.querySelectorAll('.word-token[data-marker-id]').forEach(el => delete el.dataset.markerId);
    els.blocksContainer.querySelectorAll('.marker-jump').forEach(el => el.classList.remove('marker-jump'));
  }

  function applyMarkerToRange(mk) {
    const b = mk.blockIndex;
    for (let ti = mk.start; ti <= mk.end; ti++) {
      const el = els.blocksContainer.querySelector(`.word-token[data-block-index="${b}"][data-token-index="${ti}"]`);
      if (!el) continue;
      el.classList.add('marker-token');
      el.dataset.markerId = mk.id;
    }
  }

  function applyAllMarkers() {
    if (!els.blocksContainer) return;
    if (!state.markerToolEnabled) {
      removeMarkerDecorations();
      return;
    }
    removeMarkerDecorations();

    const marks = getMarkersForCurrentCollection();
    for (const mk of marks) applyMarkerToRange(mk);
  }

  function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    return !(aEnd < bStart || aStart > bEnd);
  }

  function hasOverlapInBlock(blockIndex, start, end) {
    const marks = getMarkersForCurrentCollection().filter(m => m.blockIndex === blockIndex);
    for (const mk of marks) {
      if (rangesOverlap(start, end, mk.start, mk.end)) return true;
    }
    return false;
  }

  function extractTextForRange(blockIndex, start, end) {
    const words = [];
    for (let ti = start; ti <= end; ti++) {
      const el = els.blocksContainer.querySelector(`.word-token[data-block-index="${blockIndex}"][data-token-index="${ti}"]`);
      if (!el) continue;
      words.push(el.textContent || '');
    }
    return words.join(' ').trim();
  }

  function createMarker(blockIndex, start, end) {
    const s = Math.min(start, end);
    const e = Math.max(start, end);

    if (hasOverlapInBlock(blockIndex, s, e)) {
      app.showToast('Markierung überschneidet sich mit einer bestehenden Markierung.');
      return null;
    }

    const id = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const text = extractTextForRange(blockIndex, s, e);
    const now = Date.now();
    const mk = { id, collectionId: (app.getCurrentCollectionId?.() || ''), blockIndex, start: s, end: e, note: '', text, createdAt: now, updatedAt: now };

    state.markers = [mk, ...(state.markers || [])];
    app.persistMarkerUpsert?.(mk).catch(() => {});
    applyAllMarkers();
      if (app.state?.activeView === 'notes') app.renderNotesView?.();
    // Immediately open note editor for the freshly created mark.
    openMarkerNoteEditor(mk.id);
    return mk;
  }

  function deleteMarker(markerId) {
    const id = String(markerId || '').trim();
    if (!id) return;
    const before = (state.markers || []).length;
    state.markers = (state.markers || []).filter(m => m.id !== id);
    if (state.markers.length !== before) {
      app.persistMarkerDelete?.(id).catch(() => {});
      applyAllMarkers();
      if (app.state?.activeView === 'notes') app.renderNotesView?.();
    }
  }

  function openMarkerNoteEditor(markerId) {
    const mk = getMarkerById(markerId);
    if (!mk) return;

    if (!els.markerNoteBox || !els.markerNoteOverlay || !els.markerNoteText) return;

    els.markerNoteTitle.textContent = 'Markierung';
    const idx = app.getCollectionIndexById?.(mk.collectionId);
    const colNo = (idx == null) ? '?' : (idx + 1);
    els.markerNoteSub.textContent = `Sammlung ${colNo} · Block ${mk.blockIndex + 1} · „${(mk.text || '').slice(0, 120)}${(mk.text || '').length > 120 ? '…' : ''}“`;

    els.markerNoteText.value = mk.note || '';
    els.markerNoteBox.dataset.markerId = mk.id;

    els.markerNoteOverlay.hidden = false;
    els.markerNoteBox.classList.add('open');
    els.markerNoteBox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    setTimeout(() => els.markerNoteText?.focus?.(), 0);
  }

  function closeMarkerNoteEditor() {
    if (!els.markerNoteBox || !els.markerNoteOverlay) return;
    els.markerNoteOverlay.hidden = true;
    els.markerNoteBox.classList.remove('open');
    els.markerNoteBox.setAttribute('aria-hidden', 'true');
    delete els.markerNoteBox.dataset.markerId;
    if (!state.menuOpen && !state.confirmOpen) document.body.style.overflow = '';
  }

  function saveMarkerNoteFromEditor() {
    const box = els.markerNoteBox;
    if (!box) return;
    const id = String(box.dataset.markerId || '').trim();
    const mk = getMarkerById(id);
    if (!mk) { closeMarkerNoteEditor(); return; }
    mk.note = String(els.markerNoteText.value || '');
    mk.updatedAt = Date.now();

    // keep stable ordering (newest updated first)
    state.markers = (state.markers || []).filter(m => m.id !== mk.id);
    state.markers = [mk, ...state.markers];

    app.persistMarkerUpsert?.(mk).catch(() => {});
    // If user is in notes overview, refresh immediately
    if (app.state?.activeView === 'notes') app.renderNotesView?.();
    closeMarkerNoteEditor();
  }

  async function deleteMarkerFromEditor() {
    const box = els.markerNoteBox;
    if (!box) return;
    const id = String(box.dataset.markerId || '').trim();
    if (!id) { closeMarkerNoteEditor(); return; }
    // Close the note editor first; otherwise its overlay can block confirm clicks.
    closeMarkerNoteEditor();
    const ok = await app.showConfirm?.('Markierung wirklich löschen? (Notiz wird ebenfalls entfernt)');
    if (!ok) return;
    deleteMarker(id);
  }

  function initMarkerNoteEditorEvents() {
    if (!els.markerNoteOverlay || !els.markerNoteCancel || !els.markerNoteSave || !els.markerNoteDelete) return;

    els.markerNoteOverlay.addEventListener('click', closeMarkerNoteEditor);
    els.markerNoteCancel.addEventListener('click', closeMarkerNoteEditor);
    els.markerNoteSave.addEventListener('click', saveMarkerNoteFromEditor);
    els.markerNoteDelete.addEventListener('click', deleteMarkerFromEditor);

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (els.markerNoteBox?.classList?.contains('open')) closeMarkerNoteEditor();
    });
  }

  function onMarkerTokenClick(token) {
    if (!state.markerToolEnabled) return false;

    // If clicking an existing marker, open note editor.
    const existingId = token.dataset.markerId;
    if (existingId) {
      openMarkerNoteEditor(existingId);
      return true;
    }

    const blockIndex = Number(token.dataset.blockIndex);
    const tokenIndex = Number(token.dataset.tokenIndex);
    if (!Number.isFinite(blockIndex) || !Number.isFinite(tokenIndex)) return false;

    // first tap: set start
    if (!marker.pendingStart) {
      clearPendingMarkerStart();
      marker.pendingStart = { blockIndex, tokenIndex };
      token.classList.add('marker-pending-start');
      return true;
    }

    // second tap: must be within same block; otherwise restart at new position
    if (marker.pendingStart.blockIndex !== blockIndex) {
      clearPendingMarkerStart();
      marker.pendingStart = { blockIndex, tokenIndex };
      token.classList.add('marker-pending-start');
      return true;
    }

    const start = marker.pendingStart.tokenIndex;
    const end = tokenIndex;

    clearPendingMarkerStart();
    createMarker(blockIndex, start, end);
    return true;
  }

  function focusMarkerInView(markerId) {
    const mk = getMarkerById(markerId);
    if (!mk) return;

    // ensure marker decoration exists (needed for query by marker-id)
    if (!state.markerToolEnabled) setMarkerToolEnabled(true);
    applyAllMarkers();

    const el = els.blocksContainer?.querySelector(`.word-token[data-marker-id="${mk.id}"]`);
    if (!el) {
      app.showToast('Markierung ist aktuell nicht sichtbar (evtl. ausgeblendeter Textblock).');
      return;
    }

    el.classList.add('marker-jump');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => el.classList.remove('marker-jump'), 1200);
  }

  // Initialize editor events once
  initMarkerNoteEditorEvents();

// Expose
  app.highlight = highlight;

  app.wrapWordsInElement = wrapWordsInElement;
  app.applyAllHighlights = applyAllHighlights;
  app.clearHighlights = clearHighlights;

  app.onWordTokenClick = onWordTokenClick;

  app.setHighlightToolEnabled = setHighlightToolEnabled;
  app.toggleHighlightTool = toggleHighlightTool;

  app.setMarkerToolEnabled = setMarkerToolEnabled;
  app.toggleMarkerTool = toggleMarkerTool;
  app.applyAllMarkers = applyAllMarkers;
  app.deleteMarker = deleteMarker;
  app.openMarkerNoteEditor = openMarkerNoteEditor;
  app.focusMarkerInView = focusMarkerInView;

  app.onGlobalSelectStart = onGlobalSelectStart;
})();
