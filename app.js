/* LoopRead — single-page app (Reader + Add) with localStorage persistence */

(() => {
  'use strict';

  const STORAGE_KEY = 'loopread_v1_data';
  const STORAGE_INDEX_KEY = 'loopread_v1_index';

  const els = {
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    navIndex: document.getElementById('navIndex'),
    btnMenu: document.getElementById('btnMenu'),

    viewReader: document.getElementById('view-reader'),
    viewAdd: document.getElementById('view-add'),
    blocksContainer: document.getElementById('blocksContainer'),

    menuOverlay: document.getElementById('menuOverlay'),
    menuDrawer: document.getElementById('menuDrawer'),
    menuToReader: document.getElementById('menuToReader'),
    menuToAdd: document.getElementById('menuToAdd'),
    menuLoadSample: document.getElementById('menuLoadSample'),
    menuClearAll: document.getElementById('menuClearAll'),

    addForm: document.getElementById('addForm'),
    editors: document.getElementById('editors'),
    btnCancel: document.getElementById('btnCancel'),
  };

  /** @type {{collections: Array<Array<{title:string, content:string}>>, currentIndex:number}} */
  const state = {
    collections: [],
    currentIndex: 0,
  };

  function safeParse(jsonStr, fallback) {
    try { return JSON.parse(jsonStr); } catch { return fallback; }
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const idxRaw = localStorage.getItem(STORAGE_INDEX_KEY);

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ collections: state.collections }));
    localStorage.setItem(STORAGE_INDEX_KEY, String(state.currentIndex));
  }

  function clampIndex() {
    const n = state.collections.length;
    if (n === 0) {
      state.currentIndex = 0;
      return;
    }
    if (state.currentIndex < 0) state.currentIndex = 0;
    if (state.currentIndex >= n) state.currentIndex = n - 1;
  }

  function setView(view) {
    const isReader = view === 'reader';
    els.viewReader.classList.toggle('view-active', isReader);
    els.viewAdd.classList.toggle('view-active', !isReader);

    // Keep nav always visible, but disable prev/next when no data
    const hasCollections = state.collections.length > 0;
    els.btnPrev.disabled = !hasCollections;
    els.btnNext.disabled = !hasCollections;

    if (!isReader) {
      buildEditors(3);
      ensureExtraEditorIfNeeded();
      // Focus first field for quicker entry
      const first = els.editors.querySelector('input');
      if (first) first.focus();
    }
  }

  function renderNav() {
    const n = state.collections.length;
    if (n === 0) {
      els.navIndex.textContent = '0/0';
      return;
    }
    els.navIndex.textContent = `${state.currentIndex + 1}/${n}`;
  }

  function renderBlocks() {
    els.blocksContainer.innerHTML = '';

    if (state.collections.length === 0) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.innerHTML = `
        <strong>Keine Daten.</strong><br/>
        Öffne das Menü (☰) und lade Probedaten oder erstelle eine neue Blocksammlung.
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

      const title = document.createElement('div');
      title.className = 'block-title';
      title.textContent = (b.title || '').trim() || `Block ${i + 1}`;

      const content = document.createElement('div');
      content.className = 'block-content';
      content.textContent = (b.content || '').trim();

      article.appendChild(title);
      article.appendChild(content);

      els.blocksContainer.appendChild(article);

      if (i !== blocks.length - 1) {
        const hr = document.createElement('hr');
        hr.className = 'sep';
        els.blocksContainer.appendChild(hr);
      }
    });
  }

  function gotoNext() {
    const n = state.collections.length;
    if (n === 0) return;
    state.currentIndex = (state.currentIndex + 1) % n;
    saveState();
    renderNav();
    renderBlocks();
    scrollTop();
  }

  function gotoPrev() {
    const n = state.collections.length;
    if (n === 0) return;
    state.currentIndex = (state.currentIndex - 1 + n) % n;
    saveState();
    renderNav();
    renderBlocks();
    scrollTop();
  }

  function scrollTop() {
    // Keep it simple: scroll to top of main content
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  /* Drawer */
  function openMenu() {
    els.menuOverlay.hidden = false;
    els.menuDrawer.classList.add('open');
    els.menuDrawer.setAttribute('aria-hidden', 'false');
    // trap focus lightly
    els.menuToReader.focus();
  }

  function closeMenu() {
    els.menuDrawer.classList.remove('open');
    els.menuDrawer.setAttribute('aria-hidden', 'true');
    els.menuOverlay.hidden = true;
    els.btnMenu.focus();
  }

  /* Add collection editors */
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
    const values = getEditorValues()
      .map(v => ({ title: v.title.trim(), content: v.content.trim() }))
      .filter(v => v.title.length > 0 && v.content.length > 0);

    if (values.length === 0) {
      alert('Bitte mindestens einen Textblock mit Titel und Inhalt ausfüllen.');
      return;
    }

    state.collections.push(values);
    state.currentIndex = state.collections.length - 1;
    saveState();
    renderNav();
    renderBlocks();
    setView('reader');
    closeMenu(); // safe even if closed
    scrollTop();
  }

  /* Sample data */
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
        { title: 'Notizen', content: '- Blocksammlungen blättern: oben oder per Swipe\n- Textblöcke: Titel klein, Text groß\n- Alles lokal gespeichert' },
      ],
    ];
  }

  function loadSamples() {
    const ok = confirm('Probedaten laden? Dabei werden deine aktuellen Daten gelöscht.');
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

  function clearAll() {
    const ok = confirm('Alle Daten wirklich löschen?');
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

  /* Swipe navigation */
  function installSwipe() {
    let startX = 0, startY = 0, startT = 0;
    const thresholdX = 55;     // px
    const restraint = 1.2;     // dx must be > dy * restraint
    const allowedTime = 700;   // ms

    const onStart = (e) => {
      if (!els.viewReader.classList.contains('view-active')) return;
      const touch = (e.touches && e.touches[0]) ? e.touches[0] : e;
      startX = touch.clientX;
      startY = touch.clientY;
      startT = Date.now();
    };

    const onEnd = (e) => {
      if (!els.viewReader.classList.contains('view-active')) return;
      const touch = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e;
      const distX = touch.clientX - startX;
      const distY = touch.clientY - startY;
      const elapsed = Date.now() - startT;

      if (elapsed <= allowedTime && Math.abs(distX) >= thresholdX && Math.abs(distX) >= Math.abs(distY) * restraint) {
        if (distX < 0) gotoNext();
        else gotoPrev();
      }
    };

    // touch + pointer fallback
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });

    // Pointer events (for some desktop browsers)
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

  /* Wiring */
  function wireEvents() {
    els.btnPrev.addEventListener('click', gotoPrev);
    els.btnNext.addEventListener('click', gotoNext);

    els.btnMenu.addEventListener('click', openMenu);
    els.menuOverlay.addEventListener('click', closeMenu);

    els.menuToReader.addEventListener('click', () => {
      setView('reader');
      closeMenu();
    });

    els.menuToAdd.addEventListener('click', () => {
      setView('add');
      closeMenu();
    });

    els.menuLoadSample.addEventListener('click', loadSamples);
    els.menuClearAll.addEventListener('click', clearAll);

    els.btnCancel.addEventListener('click', () => {
      setView('reader');
      scrollTop();
    });

    els.addForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveNewCollection();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Close menu or leave add view
        if (!els.menuOverlay.hidden) closeMenu();
      }
      // Small convenience: arrow keys on desktop
      if (els.viewReader.classList.contains('view-active')) {
        if (e.key === 'ArrowRight') gotoNext();
        if (e.key === 'ArrowLeft') gotoPrev();
      }
    });
  }

  function init() {
    loadState();
    renderNav();
    renderBlocks();
    wireEvents();
    installSwipe();
    setView('reader');
  }

  init();
})();
