/* LoopRead — split into 4 files
   Part 3/4: views + collections management (reader/add/delete/hide/menu/nav)
*/

(() => {
  'use strict';

  const app = (window.LoopRead = window.LoopRead || {});
  const els = app.els;
  const state = app.state;

  const {
    isBlockHidden,
    setHiddenBlocks,
    formatContent,
    wrapWordsInElement,
    applyAllHighlights,
    clearHighlights,
    setHighlightToolEnabled,
    showConfirm,
    showToast,
    saveState,
    loadState,
    clampIndex,
    scrollTop,
  } = app;

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

    let shown = 0;

    blocks.forEach((b, i) => {
      if (isBlockHidden(i)) return;
      shown++;
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

    if (shown === 0) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.textContent = 'Alle Textblöcke dieser Sammlung sind ausgeblendet.';
      els.blocksContainer.appendChild(div);
      return;
    }

    applyAllHighlights();
  }

  function gotoNext() {
    if (!state.uid) return;
    if (!els.viewReader.classList.contains('view-active')) return;
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
    if (!els.viewReader.classList.contains('view-active')) return;
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

  // --- Delete collections (draft; applied on save) ---
  /** @type {{ marked:Set<number> } | null} */
  let deleteDraft = null;

  function resetDeleteDraft() {
    deleteDraft = { marked: new Set() };
    updateDeleteActions();
  }

  function clearDeleteDraft() {
    deleteDraft = null;
  }

  function snippet(text, maxLen = 80) {
    const s = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (s.length <= maxLen) return s;
    return s.slice(0, Math.max(0, maxLen - 1)) + '…';
  }

  function updateDeleteActions() {
    if (!els.btnDeleteSave) return;
    const n = deleteDraft?.marked?.size || 0;
    els.btnDeleteSave.disabled = n === 0;
    els.btnDeleteSave.textContent = n === 0 ? 'Speichern' : `Speichern (${n})`;
  }

  function toggleDeleteMark(idx) {
    if (!deleteDraft) return;

    if (deleteDraft.marked.has(idx)) {
      deleteDraft.marked.delete(idx);
      renderDeleteView();
      updateDeleteActions();
      return;
    }

    // No confirmation needed here: deletions are only applied when the user presses "Speichern".
    deleteDraft.marked.add(idx);
    renderDeleteView();
    updateDeleteActions();
  }

  function renderDeleteView() {
    if (!els.deleteCollections) return;

    els.deleteCollections.innerHTML = '';

    if (state.collections.length === 0) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.innerHTML = '<strong>Keine Sammlungen vorhanden.</strong>';
      els.deleteCollections.appendChild(div);
      updateDeleteActions();
      return;
    }

    state.collections.forEach((collection, idx) => {
      const card = document.createElement('div');
      card.className = 'collection-card';

      const isMarked = !!deleteDraft?.marked?.has(idx);
      if (isMarked) card.classList.add('is-marked');

      const title = document.createElement('div');
      title.className = 'collection-card-title';
      const blockCount = Array.isArray(collection) ? collection.length : 0;
      title.textContent = `Sammlung ${idx + 1} (${blockCount} Block${blockCount === 1 ? '' : 'e'})`;

      const preview = document.createElement('div');
      preview.className = 'collection-card-preview';

      const blocks = Array.isArray(collection) ? collection : [];
      const visibleBlocks = blocks.filter((_, bi) => !isBlockHidden(bi));
      const lines = visibleBlocks.slice(0, 2).map((b, bi) => {
        const t = (b?.title || '').trim() || `Block ${bi + 1}`;
        const c = snippet((b?.content || '').trim(), 90);
        return `${t}: ${c}`;
      });

      if (visibleBlocks.length > 2) lines.push('…');

      preview.textContent = lines.length ? lines.join('\n') : 'Diese Sammlung ist leer.';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'collection-del-btn';
      btn.textContent = isMarked ? '↩' : '✕';
      btn.setAttribute('aria-label', isMarked ? 'Löschung rückgängig machen' : 'Sammlung zum Löschen markieren');
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleDeleteMark(idx);
      });

      card.appendChild(title);
      card.appendChild(preview);
      card.appendChild(btn);

      if (isMarked) {
        const badge = document.createElement('div');
        badge.className = 'collection-card-badge';
        badge.textContent = 'Zum Löschen markiert';
        card.appendChild(badge);
      }

      els.deleteCollections.appendChild(card);
    });

    updateDeleteActions();
  }

  function countMarkedBefore(idx, marked) {
    let n = 0;
    for (const m of marked) if (m < idx) n++;
    return n;
  }

  function computeNewIndexAfterDeletion(oldIndex, marked, total) {
    if (total <= 0) return 0;
    if (!marked || marked.size === 0) return Math.max(0, Math.min(oldIndex, total - 1));

    const isDeleted = marked.has(oldIndex);

    if (!isDeleted) {
      return Math.max(0, oldIndex - countMarkedBefore(oldIndex, marked));
    }

    for (let j = oldIndex + 1; j < total; j++) {
      if (!marked.has(j)) return Math.max(0, j - countMarkedBefore(j, marked));
    }
    for (let j = oldIndex - 1; j >= 0; j--) {
      if (!marked.has(j)) return Math.max(0, j - countMarkedBefore(j, marked));
    }

    return 0;
  }

  function applyDeleteDraft() {
    const marked = deleteDraft?.marked;
    const count = marked?.size || 0;

    if (!marked || count === 0) {
      setView('reader');
      scrollTop();
      return;
    }

    const total = state.collections.length;
    const oldIdx = state.currentIndex;

    const newIdx = computeNewIndexAfterDeletion(oldIdx, marked, total);

    state.collections = state.collections.filter((_, idx) => !marked.has(idx));
    state.currentIndex = state.collections.length === 0 ? 0 : Math.min(newIdx, state.collections.length - 1);

    saveState();
    renderNav();
    renderBlocks();

    clearDeleteDraft();
    setView('reader');
    scrollTop();
    showToast(`Gelöscht: ${count} Sammlung(en).`);
  }

  function cancelDeleteDraft() {
    clearDeleteDraft();
    setView('reader');
    scrollTop();
  }

  // --- Hide blocks (draft; applied on save) ---
  /** @type {{ hidden:Set<number>, maxShown:number } | null} */
  let hideDraft = null;

  function maxBlocksAcrossCollections() {
    let max = 0;
    for (const c of state.collections) {
      const n = Array.isArray(c) ? c.length : 0;
      if (n > max) max = n;
    }
    return max;
  }

  function resetHideDraft() {
    const initial = Array.isArray(state.hiddenBlocks) ? state.hiddenBlocks : [];
    hideDraft = {
      hidden: new Set(app.normalizeHiddenBlocks(initial)),
      maxShown: Math.max(10, maxBlocksAcrossCollections(), 5),
    };
    updateHideActions();
  }

  function clearHideDraft() {
    hideDraft = null;
  }

  function setsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }

  function updateHideActions() {
    if (!els.btnHideSave || !hideDraft) return;
    const current = new Set(app.normalizeHiddenBlocks(state.hiddenBlocks));
    const changed = !setsEqual(current, hideDraft.hidden);
    els.btnHideSave.disabled = !changed;
  }

  function sampleTitleForBlockIndex(idx) {
    const current = state.collections[state.currentIndex];
    if (Array.isArray(current) && current[idx] && String(current[idx].title || '').trim()) {
      return String(current[idx].title || '').trim();
    }
    for (const c of state.collections) {
      if (Array.isArray(c) && c[idx] && String(c[idx].title || '').trim()) {
        return String(c[idx].title || '').trim();
      }
    }
    return '';
  }

  function renderHideView() {
    if (!els.hideBlocksList || !hideDraft) return;

    els.hideBlocksList.innerHTML = '';

    const total = hideDraft.maxShown;
    for (let i = 0; i < total; i++) {
      const row = document.createElement('div');
      row.className = 'hide-block-row';

      const meta = document.createElement('div');
      meta.className = 'hide-block-meta';

      const t = document.createElement('div');
      t.className = 'hide-block-title';
      t.textContent = `Textblock ${i + 1}`;
      meta.appendChild(t);

      const sample = sampleTitleForBlockIndex(i);
      const sub = document.createElement('div');
      sub.className = 'hide-block-sub';
      sub.textContent = sample ? `Beispiel: ${sample}` : 'Beispiel: –';
      meta.appendChild(sub);

      const toggle = document.createElement('label');
      toggle.className = 'hide-block-toggle';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = hideDraft.hidden.has(i);
      cb.addEventListener('change', () => {
        if (!hideDraft) return;
        if (cb.checked) hideDraft.hidden.add(i);
        else hideDraft.hidden.delete(i);
        updateHideActions();
      });

      const span = document.createElement('span');
      span.textContent = 'Ausblenden';

      toggle.appendChild(cb);
      toggle.appendChild(span);

      row.appendChild(meta);
      row.appendChild(toggle);

      els.hideBlocksList.appendChild(row);
    }

    updateHideActions();
  }

  function applyHideDraft() {
    if (!hideDraft) { setView('reader'); scrollTop(); return; }
    setHiddenBlocks(Array.from(hideDraft.hidden));
    saveState();
    renderBlocks();
    clearHideDraft();
    setView('reader');
    scrollTop();
    showToast('Ausgeblendete Textblöcke gespeichert.');
  }

  function cancelHideDraft() {
    clearHideDraft();
    setView('reader');
    scrollTop();
  }

  function setView(view) {
    if (!state.uid) {
      app.setAuthLocked(true);
      return;
    }

    const prev = state.activeView;
    state.activeView = view;

    // Leaving delete/hide views discards any draft changes.
    if (prev === 'delete' && view !== 'delete') {
      clearDeleteDraft();
    }
    if (prev === 'hide' && view !== 'hide') {
      clearHideDraft();
    }

    els.viewReader.classList.toggle('view-active', view === 'reader');
    els.viewAdd.classList.toggle('view-active', view === 'add');
    els.viewImport.classList.toggle('view-active', view === 'import');
    els.viewDelete.classList.toggle('view-active', view === 'delete');
    els.viewHide.classList.toggle('view-active', view === 'hide');

    const hasCollections = state.collections.length > 0;
    const inReader = (view === 'reader');

    els.btnPrev.disabled = !hasCollections || !inReader;
    els.btnNext.disabled = !hasCollections || !inReader;

    // Highlight tooling makes only sense in reader view.
    els.btnHighlightTool.disabled = !inReader;
    els.btnClearHighlights.disabled = !inReader;

    if (!inReader) setHighlightToolEnabled(false);

    if (view === 'add') {
      buildEditors(3);
      ensureExtraEditorIfNeeded();
      const first = els.editors.querySelector('input');
      if (first) first.focus();
    }

    if (view === 'import') {
      if (typeof app.resetImportForm === 'function') app.resetImportForm();
      els.importFile.focus();
    }

    if (view === 'delete') {
      if (prev !== 'delete') resetDeleteDraft();
      renderDeleteView();
      const firstBtn = els.deleteCollections?.querySelector?.('button');
      if (firstBtn) firstBtn.focus();
    }

    if (view === 'hide') {
      if (prev !== 'hide') resetHideDraft();
      renderHideView();
      const first = els.hideBlocksList?.querySelector?.('input');
      if (first) first.focus();
    }
  }

  // Expose
  app.renderNav = renderNav;
  app.renderBlocks = renderBlocks;

  app.gotoNext = gotoNext;
  app.gotoPrev = gotoPrev;

  app.openMenu = openMenu;
  app.closeMenu = closeMenu;

  app.buildEditors = buildEditors;
  app.ensureExtraEditorIfNeeded = ensureExtraEditorIfNeeded;
  app.saveNewCollection = saveNewCollection;

  app.loadSamples = loadSamples;
  app.clearAll = clearAll;

  app.resetDeleteDraft = resetDeleteDraft;
  app.renderDeleteView = renderDeleteView;
  app.applyDeleteDraft = applyDeleteDraft;
  app.cancelDeleteDraft = cancelDeleteDraft;

  app.resetHideDraft = resetHideDraft;
  app.renderHideView = renderHideView;
  app.applyHideDraft = applyHideDraft;
  app.cancelHideDraft = cancelHideDraft;

  app.setView = setView;

  // Some helpers used by other files
  app.closeMenu = closeMenu;
  app.openMenu = openMenu;
})();
