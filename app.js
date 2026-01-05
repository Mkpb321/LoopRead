/* LoopRead — single-page app (Reader + Add + Import) with Firebase login and localStorage persistence */

(() => {
  'use strict';

  const STORAGE_KEY = 'loopread_v1_data';
  const STORAGE_INDEX_KEY = 'loopread_v1_index';

  const els = {
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    navIndex: document.getElementById('navIndex'),
    btnHighlightTool: document.getElementById('btnHighlightTool'),

    btnMenu: document.getElementById('btnMenu'),

    viewLogin: document.getElementById('view-login'),
    viewReader: document.getElementById('view-reader'),
    viewAdd: document.getElementById('view-add'),
    viewImport: document.getElementById('view-import'),

    blocksContainer: document.getElementById('blocksContainer'),

    menuOverlay: document.getElementById('menuOverlay'),
    menuDrawer: document.getElementById('menuDrawer'),
    menuToReader: document.getElementById('menuToReader'),
    menuToAdd: document.getElementById('menuToAdd'),
    menuToImport: document.getElementById('menuToImport'),
    menuLoadSample: document.getElementById('menuLoadSample'),
    menuClearAll: document.getElementById('menuClearAll'),
    menuLogout: document.getElementById('menuLogout'),

    addForm: document.getElementById('addForm'),
    editors: document.getElementById('editors'),
    btnCancel: document.getElementById('btnCancel'),

    importForm: document.getElementById('importForm'),
    importFile: document.getElementById('importFile'),
    importInfo: document.getElementById('importInfo'),
    btnImportCancel: document.getElementById('btnImportCancel'),

    toast: document.getElementById('toast'),

    confirmOverlay: document.getElementById('confirmOverlay'),
    confirmBox: document.getElementById('confirmBox'),
    confirmMsg: document.getElementById('confirmMsg'),
    confirmCancel: document.getElementById('confirmCancel'),
    confirmOk: document.getElementById('confirmOk'),

    loginForm: document.getElementById('loginForm'),
    loginEmail: document.getElementById('loginEmail'),
    loginPassword: document.getElementById('loginPassword'),
    btnLogin: document.getElementById('btnLogin'),
  };

  /** @type {{collections: Array<Array<{title:string, content:string}>>, currentIndex:number, menuOpen:boolean, uid:string|null}} */
  const state = {
    collections: [],
    currentIndex: 0,
    menuOpen: false,
    confirmOpen: false,
    uid: null,
    highlightToolEnabled: false,
  };

  // --- Toast (kein alert für Fehlermeldungen) ---
  let toastTimer = null;
  function showToast(message) {
    const msg = String(message || '').trim();
    if (!msg) return;

    els.toast.textContent = msg;
    els.toast.hidden = false;

    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      els.toast.hidden = true;
    }, 3400);
  }


  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => {
      switch (ch) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return ch;
      }
    });
  }

  // **bold** rendering (safe)
  function formatContent(raw) {
    const s = String(raw ?? '');
    let out = '';
    let i = 0;

    while (i < s.length) {
      const start = s.indexOf('**', i);
      if (start === -1) {
        out += escapeHtml(s.slice(i));
        break;
      }
      const end = s.indexOf('**', start + 2);
      if (end === -1) {
        out += escapeHtml(s.slice(i));
        break;
      }
      out += escapeHtml(s.slice(i, start));
      out += '<strong>' + escapeHtml(s.slice(start + 2, end)) + '</strong>';
      i = end + 2;
    }

    return out;
  }

  // --- Word highlighting (Tap-to-Mark; in-memory only) ---
  const highlight = {
    selections: new Map(), // wordKey -> { idx:number, color:string }
    nextIdx: 0,
  };

  function setHighlightToolEnabled(enabled) {
    const on = !!enabled;
    state.highlightToolEnabled = on;

    if (els.btnHighlightTool) {
      els.btnHighlightTool.classList.toggle('is-active', on);
      els.btnHighlightTool.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    document.body.classList.toggle('tool-highlight-active', on);

    if (on) {
      try { window.getSelection()?.removeAllRanges(); } catch {}
    }
  }


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

  function onWordTokenClick(e) {
    if (!state.highlightToolEnabled) return;
    if (!els.viewReader.classList.contains('view-active')) return;

    try { window.getSelection()?.removeAllRanges(); } catch {}

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

  // In-App Confirm (statt window.confirm)
  let confirmResolver = null;
  function showConfirm(message, okText = 'OK', cancelText = 'Abbrechen') {
    return new Promise((resolve) => {
      if (!els.confirmBox || !els.confirmOverlay) {
        resolve(false);
        return;
      }

      state.confirmOpen = true;
      confirmResolver = resolve;

      els.confirmMsg.textContent = String(message || '').trim();
      els.confirmOk.textContent = okText;
      els.confirmCancel.textContent = cancelText;

      els.confirmOverlay.hidden = false;
      els.confirmBox.classList.add('open');
      els.confirmBox.setAttribute('aria-hidden', 'false');

      // block background interactions
      document.body.style.overflow = 'hidden';

      els.confirmCancel.focus();
    });
  }

  function closeConfirm(result) {
    state.confirmOpen = false;

    if (els.confirmOverlay) els.confirmOverlay.hidden = true;
    if (els.confirmBox) {
      els.confirmBox.classList.remove('open');
      els.confirmBox.setAttribute('aria-hidden', 'true');
    }

    // restore scroll only if menu is not open
    if (!state.menuOpen) if (!state.confirmOpen) document.body.style.overflow = '';
    const r = confirmResolver;
    confirmResolver = null;
    if (typeof r === 'function') r(!!result);
  }

  function safeParse(jsonStr, fallback) {
    try { return JSON.parse(jsonStr); } catch { return fallback; }
  }

  function storageKey(baseKey) {
    const uid = state.uid || 'anon';
    return `${baseKey}_${uid}`;
  }

  function loadState() {
    const raw = localStorage.getItem(storageKey(STORAGE_KEY));
    const idxRaw = localStorage.getItem(storageKey(STORAGE_INDEX_KEY));

    if (raw) {
      const parsed = safeParse(raw, null);
      if (parsed && Array.isArray(parsed.collections)) {
        state.collections = parsed.collections;
      }
    }

    if (idxRaw !== null) {
      const idx = Number(idxRaw);
      if (Number.isFinite(idx)) state.currentIndex = idx;
    }

    clampIndex();
  }

  function saveState() {
    localStorage.setItem(storageKey(STORAGE_KEY), JSON.stringify({ collections: state.collections }));
    localStorage.setItem(storageKey(STORAGE_INDEX_KEY), String(state.currentIndex));
  }

  function clampIndex() {
    const n = state.collections.length;
    if (n === 0) { state.currentIndex = 0; return; }
    if (state.currentIndex < 0) state.currentIndex = 0;
    if (state.currentIndex >= n) state.currentIndex = n - 1;
  }

  function setAuthLocked(isLocked) {
    document.body.classList.toggle('auth-locked', isLocked);

    els.viewLogin.classList.toggle('view-active', isLocked);
    if (isLocked) {
      els.viewReader.classList.remove('view-active');
      els.viewAdd.classList.remove('view-active');
      els.viewImport.classList.remove('view-active');
    }
  }

  function resetInMemoryState() {
    state.collections = [];
    state.currentIndex = 0;
  }

  function setView(view) {
    if (!state.uid) {
      setAuthLocked(true);
      return;
    }

    els.viewReader.classList.toggle('view-active', view === 'reader');
    els.viewAdd.classList.toggle('view-active', view === 'add');
    els.viewImport.classList.toggle('view-active', view === 'import');

    const hasCollections = state.collections.length > 0;
    els.btnPrev.disabled = !hasCollections;
    els.btnNext.disabled = !hasCollections;

    if (view === 'add') {
      buildEditors(3);
      ensureExtraEditorIfNeeded();
      const first = els.editors.querySelector('input');
      if (first) first.focus();
    }

    if (view === 'import') {
      resetImportForm();
      els.importFile.focus();
    }
  }

  function renderNav() {
    const n = state.collections.length;
    els.navIndex.textContent = n === 0 ? '0/0' : `${state.currentIndex + 1}/${n}`;
  }

  function renderBlocks() {
    els.blocksContainer.innerHTML = '';

    if (state.collections.length === 0) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.innerHTML = `
        <strong>Keine Daten.</strong><br/>
        Öffne das Menü (☰) und lade Probedaten, importiere oder erstelle eine neue Blocksammlung.
      `;
      els.blocksContainer.appendChild(div);
      return;
    }

    const blocks = state.collections[state.currentIndex] || [];
    if (blocks.length === 0) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.textContent = 'Diese Blocksammlung ist leer.';
      els.blocksContainer.appendChild(div);
      return;
    }

    blocks.forEach((b, i) => {
      const article = document.createElement('article');
      article.className = 'block';

      const content = document.createElement('div');
      content.className = 'block-content';
      content.innerHTML = formatContent((b.content || '').trim());
      wrapWordsInElement(content);

      const footer = document.createElement('div');
      footer.className = 'block-footer';

      const titleLabel = document.createElement('div');
      titleLabel.className = 'block-title-label';
      titleLabel.textContent = (b.title || '').trim() || `Block ${i + 1}`;
      footer.appendChild(titleLabel);

      const sep = document.createElement('div');
      sep.className = 'block-sep';

      article.appendChild(content);
      article.appendChild(footer);
      article.appendChild(sep);

      els.blocksContainer.appendChild(article);
    });

    applyAllHighlights();
}

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function gotoNext() {
    if (!state.uid) return;
    const n = state.collections.length;
    if (n === 0) return;
    state.currentIndex = (state.currentIndex + 1) % n;
    saveState();
    renderNav();
    renderBlocks();
    scrollTop();
  }

  function gotoPrev() {
    if (!state.uid) return;
    const n = state.collections.length;
    if (n === 0) return;
    state.currentIndex = (state.currentIndex - 1 + n) % n;
    saveState();
    renderNav();
    renderBlocks();
    scrollTop();
  }

  // Drawer
  function openMenu() {
    if (!state.uid) return;
    state.menuOpen = true;
    els.menuOverlay.hidden = false;
    els.menuDrawer.classList.add('open');
    els.menuDrawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    els.menuToReader.focus();
  }

  function closeMenu() {
    state.menuOpen = false;
    els.menuDrawer.classList.remove('open');
    els.menuDrawer.setAttribute('aria-hidden', 'true');
    els.menuOverlay.hidden = true;
    document.body.style.overflow = '';
    els.btnMenu.focus();
  }

  // Add collection editors
  function buildEditors(minCount) {
    els.editors.innerHTML = '';
    for (let i = 0; i < minCount; i++) {
      els.editors.appendChild(createEditor(i));
    }
  }

  function createEditor(i) {
    const wrap = document.createElement('div');
    wrap.className = 'editor';
    wrap.dataset.index = String(i);

    const label = document.createElement('div');
    label.className = 'editor-label';
    label.textContent = `Textblock ${i + 1}`;
    wrap.appendChild(label);

    const input = document.createElement('input');
    input.className = 'input';
    input.type = 'text';
    input.placeholder = 'Titel';
    input.inputMode = 'text';
    input.autocomplete = 'off';

    const ta = document.createElement('textarea');
    ta.className = 'textarea';
    ta.placeholder = 'Inhalt';
    ta.spellcheck = false;

    const onAnyInput = () => ensureExtraEditorIfNeeded();
    input.addEventListener('input', onAnyInput);
    ta.addEventListener('input', onAnyInput);

    wrap.appendChild(input);
    wrap.appendChild(ta);

    return wrap;
  }

  function getEditorValues() {
    const nodes = Array.from(els.editors.querySelectorAll('.editor'));
    return nodes.map(n => {
      const title = (n.querySelector('input')?.value || '').trim();
      const content = (n.querySelector('textarea')?.value || '').trim();
      return { title, content };
    });
  }

  function allFilled(values) {
    if (values.length === 0) return false;
    return values.every(v => v.title.length > 0 && v.content.length > 0);
  }

  function ensureExtraEditorIfNeeded() {
    const values = getEditorValues();
    if (allFilled(values)) {
      els.editors.appendChild(createEditor(values.length));
    }
  }

  function saveNewCollection() {
    const values = getEditorValues().map(v => ({
      title: (v.title || '').trim(),
      content: (v.content || '').trim(),
    }));

    for (let i = 0; i < values.length; i++) {
      const t = values[i].title;
      const c = values[i].content;
      const any = (t.length > 0) || (c.length > 0);
      const both = (t.length > 0) && (c.length > 0);

      if (any && !both) {
        showToast(`Textblock ${i + 1}: Bitte Titel und Inhalt ausfüllen.`);
        return;
      }
    }

    const complete = values.filter(v => v.title.length > 0 && v.content.length > 0);
    if (complete.length === 0) {
      showToast('Bitte mindestens einen Textblock vollständig ausfüllen.');
      return;
    }

    state.collections.push(complete);
    state.currentIndex = state.collections.length - 1;
    saveState();
    renderNav();
    renderBlocks();
    setView('reader');
    closeMenu();
    scrollTop();
  }

  // Sample data
  function sampleCollections() {
    return [
      [
        { title: 'Deutsch', content: 'Dies ist ein kurzer Probetext mit Umlauten: äöü ÄÖÜ ß.\n\nLoopRead ist für platzsparendes Lesen gedacht.' },
        { title: 'Altgriechisch', content: 'Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν, καὶ θεὸς ἦν ὁ λόγος.' },
        { title: 'Hebräisch', content: 'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ' },
      ],
      [
        { title: 'Mischtext', content: 'Deutsch und Ελληνικά gemischt.\n\nΚαλημέρα!\n\nHinweis: Der Textblock nutzt Times New Roman (serif), damit auch diakritische Zeichen gut dargestellt werden.' },
        { title: 'Hebräisch (RTL)', content: 'שָׁלוֹם\n\nהטקסט אמור להציג ניקוד כראוי.' },
      ],
      [
        { title: 'Langtext', content: 'Ein längerer Textblock, um vertikales Scrollen zu testen.\n\n' + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(40) },
        { title: 'Zitat', content: '„Schlichtheit ist die höchste Stufe der Vollendung.“' },
        { title: 'Altgriechisch 2', content: 'πάντα ῥεῖ καὶ οὐδὲν μένει.' },
        { title: 'Hebräisch 2', content: 'אָדָם לְעָמָל יוּלָּד' },
      ],
      [
        { title: 'Notizen', content: '- Blocksammlungen blättern: unten oder per Swipe\n- Textblöcke: Titel klein, Text groß\n- Alles lokal gespeichert' },
      ],
    ];
  }

  async function loadSamples() {
    const ok = await showConfirm('Probedaten laden? Dabei werden deine aktuellen Daten gelöscht.', 'Laden', 'Abbrechen');
    if (!ok) return;

    state.collections = sampleCollections();
    state.currentIndex = 0;
    saveState();
    renderNav();
    renderBlocks();
    setView('reader');
    closeMenu();
    scrollTop();
  }

  async function clearAll() {
    const ok = await showConfirm('Alle Daten wirklich löschen?', 'Löschen', 'Abbrechen');
    if (!ok) return;

    state.collections = [];
    state.currentIndex = 0;
    saveState();
    renderNav();
    renderBlocks();
    setView('reader');
    closeMenu();
    scrollTop();
  }

  // Swipe navigation (disabled when menu open)
  function installSwipe() {
    let startX = 0, startY = 0, startT = 0;
    const thresholdX = 55;
    const restraint = 1.2;
    const allowedTime = 700;

    const onStart = (e) => {
      if (!els.viewReader.classList.contains('view-active')) return;
      if (state.menuOpen || state.confirmOpen) return;
      const touch = (e.touches && e.touches[0]) ? e.touches[0] : e;
      startX = touch.clientX;
      startY = touch.clientY;
      startT = Date.now();
    };

    const onEnd = (e) => {
      if (!els.viewReader.classList.contains('view-active')) return;
      if (state.menuOpen || state.confirmOpen) return;
      const touch = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e;
      const distX = touch.clientX - startX;
      const distY = touch.clientY - startY;
      const elapsed = Date.now() - startT;

      if (elapsed <= allowedTime && Math.abs(distX) >= thresholdX && Math.abs(distX) >= Math.abs(distY) * restraint) {
        if (distX < 0) gotoNext();
        else gotoPrev();
      }
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });

    let pointerDown = false;
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      pointerDown = true;
      onStart(e);
    }, { passive: true });

    document.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') return;
      if (!pointerDown) return;
      pointerDown = false;
      onEnd(e);
    }, { passive: true });
  }

  // --- Import ---
  function resetImportForm() {
    if (els.importFile) els.importFile.value = '';
    if (els.importInfo) els.importInfo.textContent = '';
    // default radio is already checked in HTML
  }

  function columnLetter(zeroBasedIndex) {
    // 0 -> A, 1 -> B, ...
    let n = zeroBasedIndex + 1;
    let s = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function isEmptyCell(v) {
    return String(v ?? '').trim().length === 0;
  }

  function isRowEmpty(row, lastColIdx) {
    for (let c = 0; c <= lastColIdx; c++) {
      if (!isEmptyCell(row?.[c])) return false;
    }
    return true;
  }

  async function parseWorkbookFromFile(file) {
    if (!window.XLSX) {
      throw new Error('Import-Bibliothek (XLSX) nicht geladen.');
    }
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    return wb;
  }

  async function runImport(file, mode) {
    let wb;
    try {
      wb = await parseWorkbookFromFile(file);
    } catch (e) {
      showToast(e?.message || 'Import fehlgeschlagen.');
      return;
    }

    const sheetNames = wb.SheetNames || [];
    if (sheetNames.length !== 1) {
      showToast('Import abgebrochen: Die Datei muss genau ein Tabellenblatt (Sheet) enthalten.');
      return;
    }

    const sheet = wb.Sheets[sheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

    if (!rows || rows.length === 0) {
      showToast('Import abgebrochen: Datei ist leer.');
      return;
    }

    const header = rows[0] || [];
    let lastTitleCol = -1;
    for (let c = 0; c < header.length; c++) {
      if (!isEmptyCell(header[c])) lastTitleCol = c;
    }
    if (lastTitleCol < 0) {
      showToast('Import abgebrochen: Keine Titel in Zeile 1 gefunden.');
      return;
    }

    // Header validation: no gaps within 0..lastTitleCol
    const titles = [];
    for (let c = 0; c <= lastTitleCol; c++) {
      const t = String(header[c] ?? '').trim();
      if (!t) {
        showToast(`Import abgebrochen: Titel fehlt in Zeile 1, Spalte ${columnLetter(c)}.`);
        return;
      }
      titles.push(t);
    }

    // Data rows start at index 1 (Excel row 2)
    let dataRows = rows.slice(1);

    // Ignore trailing empty rows at end
    while (dataRows.length > 0 && isRowEmpty(dataRows[dataRows.length - 1], lastTitleCol)) {
      dataRows.pop();
    }

    if (dataRows.length === 0) {
      showToast('Import abgebrochen: Keine Datenzeilen gefunden (ab Zeile 2).');
      return;
    }

    const imported = [];

    for (let r = 0; r < dataRows.length; r++) {
      const row = dataRows[r] || [];
      const excelRowNumber = r + 2; // since header is row 1

      // Empty row in the middle is not allowed
      if (isRowEmpty(row, lastTitleCol)) {
        showToast(`Import abgebrochen: Zeile ${excelRowNumber} ist leer.`);
        return;
      }

      const collection = [];
      for (let c = 0; c <= lastTitleCol; c++) {
        const raw = row[c];
        const content = String(raw ?? '').trim();
        if (!content) {
          showToast(`Import abgebrochen: Leerzelle in Zeile ${excelRowNumber}, Spalte ${columnLetter(c)} (Titel: "${titles[c]}").`);
          return;
        }
        collection.push({ title: titles[c], content });
      }

      imported.push(collection);
    }

    if (imported.length === 0) {
      showToast('Import abgebrochen: Keine gültigen Daten gefunden.');
      return;
    }

    if (mode === 'replace') {
      state.collections = imported;
      state.currentIndex = 0;
    } else {
      const oldLen = state.collections.length;
      state.collections = state.collections.concat(imported);
      state.currentIndex = oldLen; // springe zur ersten importierten Sammlung
      clampIndex();
    }

    saveState();
    renderNav();
    renderBlocks();
    setView('reader');
    closeMenu();
    scrollTop();

    showToast(`Import erfolgreich: ${imported.length} Blocksammlung(en) übernommen.`);
  }

  // Firebase Auth (Login only)
  // WICHTIG: Trage hier deine Firebase Web-App Konfiguration ein.
  const firebaseConfig = {
    apiKey: "AIzaSyBdyurJosE1H9iG6Inde7ptCb-aRBl6Hks",
    authDomain: "my-hobby-apps.firebaseapp.com",
    projectId: "my-hobby-apps",
    storageBucket: "my-hobby-apps.firebasestorage.app",
    messagingSenderId: "894079667150",
    appId: "1:894079667150:web:a63294d5a61097a17ef99f"
  };

  let firebaseReady = false;

  function initFirebase() {
    if (typeof window.firebase === 'undefined' || !window.firebase?.initializeApp) {
      showToast('Anmeldung derzeit nicht verfügbar.');
      return;
    }
    const looksPlaceholder = Object.values(firebaseConfig).some(v => String(v).includes('YOUR_'));
    if (looksPlaceholder) {
      // App bleibt auf Login-Screen, bis Konfiguration eingesetzt ist.
      showToast('Anmeldung ist nicht konfiguriert.');
      return;
    }
    try {
      if (!firebase.apps || firebase.apps.length === 0) firebase.initializeApp(firebaseConfig);
      firebaseReady = true;
    } catch (e) {
      firebaseReady = false;
      showToast('Anmeldung konnte nicht initialisiert werden.');
    }
  }

  function wireEvents() {
    els.btnPrev.addEventListener('click', gotoPrev);
    els.btnNext.addEventListener('click', gotoNext);

    if (els.btnHighlightTool) {
      els.btnHighlightTool.addEventListener('click', () => {
        setHighlightToolEnabled(!state.highlightToolEnabled);
      });
    }

    // Tap-to-highlight words inside reader blocks
    els.blocksContainer.addEventListener('click', onWordTokenClick);


    // When the highlight tool is active, block native text selection (incl. double click).
    document.addEventListener('selectstart', (ev) => {
      if (state.highlightToolEnabled) ev.preventDefault();
    }, true);

    els.btnMenu.addEventListener('click', openMenu);
    els.menuOverlay.addEventListener('click', closeMenu);

    // Confirm modal
    els.confirmOverlay.addEventListener('click', () => closeConfirm(false));
    els.confirmCancel.addEventListener('click', () => closeConfirm(false));
    els.confirmOk.addEventListener('click', () => closeConfirm(true));

    els.menuToReader.addEventListener('click', () => { setView('reader'); closeMenu(); });
    els.menuToAdd.addEventListener('click', () => { setView('add'); closeMenu(); });
    els.menuToImport.addEventListener('click', () => { setView('import'); closeMenu(); });

    els.menuLoadSample.addEventListener('click', loadSamples);
    els.menuClearAll.addEventListener('click', clearAll);

    els.menuLogout.addEventListener('click', () => {
      if (!firebaseReady) { showToast('Logout derzeit nicht verfügbar.'); return; }
      firebase.auth().signOut();
    });

    els.btnCancel.addEventListener('click', () => { setView('reader'); scrollTop(); });
    els.addForm.addEventListener('submit', (e) => { e.preventDefault(); saveNewCollection(); });

    els.importFile.addEventListener('change', () => {
      const f = els.importFile.files && els.importFile.files[0];
      els.importInfo.textContent = f ? `Ausgewählt: ${f.name}` : '';
    });

    els.btnImportCancel.addEventListener('click', () => { setView('reader'); scrollTop(); });

    els.importForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = els.importFile.files && els.importFile.files[0];
      if (!f) { showToast('Bitte eine Datei auswählen.'); return; }

      const mode = (document.querySelector('input[name="importMode"]:checked')?.value || 'append');
      await runImport(f, mode);
    });

    els.loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!firebaseReady) { showToast('Anmeldung derzeit nicht verfügbar.'); return; }
      const email = (els.loginEmail.value || '').trim();
      const password = (els.loginPassword.value || '');
      if (!email || !password) { showToast('Bitte E-Mail und Passwort eingeben.'); return; }

      try {
        els.btnLogin.disabled = true;
        await firebase.auth().signInWithEmailAndPassword(email, password);
      } catch (err) {
        // Keine Backend-Details an den Nutzer weitergeben
        showToast('Passwort oder Benutzername falsch.');
      } finally {
        els.btnLogin.disabled = false;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (state.confirmOpen) { closeConfirm(false); return; }
        if (!els.menuOverlay.hidden) closeMenu();
      }
      if (els.viewReader.classList.contains('view-active') && !state.menuOpen) {
        if (e.key === 'ArrowRight') gotoNext();
        if (e.key === 'ArrowLeft') gotoPrev();
      }
    });
  }

  function init() {
    // Default: locked until auth says otherwise
    setAuthLocked(true);

    initFirebase();
    wireEvents();
    installSwipe();

    setHighlightToolEnabled(false);

    if (firebaseReady) {
      firebase.auth().onAuthStateChanged((user) => {
        if (user && user.uid) {
          state.uid = user.uid;
          setAuthLocked(false);
          loadState();
          renderNav();
          renderBlocks();
          setView('reader');
        } else {
          state.uid = null;
          resetInMemoryState();
          renderNav();
          renderBlocks();
          setAuthLocked(true);
          try { closeMenu(); } catch {}
        }
      });
    }
  }

  init();
})();
