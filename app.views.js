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
    applyAllMarkers,
    setMarkerToolEnabled,
    focusMarkerInView,
    showConfirm,
    showToast,
    saveState,
    loadState,
    clampIndex,
    scrollTop,
    loadProjectsMeta,
    getActiveProject,
    setActiveProject,
    createProject,
    renameProject,
    updateProjectNameUI,
    getReaderFontSizes,
    setReaderFontSizes
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
        Öffne das Menü (☰) und importiere Daten oder erstelle eine neue Blocksammlung.
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
      const hidden = i > 0 && isBlockHidden(i);

      const article = document.createElement('article');
      article.className = 'block';
      if (hidden) article.classList.add('block-text-hidden');

      const content = document.createElement('div');
      content.className = 'block-content';
      if (hidden) content.classList.add('is-project-hidden');
      content.innerHTML = formatContent((b.content || '').trim());
      wrapWordsInElement(content);
      // assign stable token indices for marker spans (per block)
      const tokens = content.querySelectorAll('.word-token');
      tokens.forEach((t, ti) => {
        t.dataset.blockIndex = String(i);
        t.dataset.tokenIndex = String(ti);
      });

      const footer = document.createElement('div');
      footer.className = 'block-footer';

      const titleLabel = document.createElement('div');
      titleLabel.className = 'block-title-label';
      titleLabel.textContent = (b.title || '').trim() || `Block ${i + 1}`;
      footer.appendChild(titleLabel);

      if (i > 0) {
        const toggle = document.createElement('button');
        toggle.className = 'block-visibility-toggle';
        toggle.type = 'button';
        toggle.dataset.blockIndex = String(i);
        toggle.setAttribute('aria-pressed', hidden ? 'true' : 'false');
        toggle.setAttribute('aria-label', hidden ? `Textblock ${i + 1} einblenden` : `Textblock ${i + 1} ausblenden`);
        toggle.textContent = '';
        toggle.dataset.hidden = hidden ? 'true' : 'false';
        toggle.addEventListener('click', () => {
          const nextHidden = new Set(state.hiddenBlocks || []);
          if (nextHidden.has(i)) nextHidden.delete(i);
          else nextHidden.add(i);
          setHiddenBlocks(Array.from(nextHidden));
          saveState();
          renderBlocks();
        });
        footer.appendChild(toggle);
      }

      const sep = document.createElement('div');
      sep.className = 'block-sep';

      article.appendChild(content);
      article.appendChild(footer);
      article.appendChild(sep);

      els.blocksContainer.appendChild(article);
    });

    applyAllHighlights();
    applyAllMarkers?.();

    if (state.pendingMarkerFocusId) {
      const id = state.pendingMarkerFocusId;
      state.pendingMarkerFocusId = null;
      setTimeout(() => focusMarkerInView?.(id), 0);
    }
  }


  // --- Markers / Notes (project-scoped) ---
  function renderNotesView() {
    if (!els.notesList) return;
    els.notesList.innerHTML = '';

    const marks = Array.isArray(state.markers) ? state.markers.slice() : [];
    if (marks.length === 0) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.innerHTML = '<strong>Keine Markierungen vorhanden.</strong>';
      els.notesList.appendChild(div);
      return;
    }

    for (const mk of marks) {
      // skip malformed markers
      if (!mk.collectionId || mk.blockIndex == null) continue;

      const card = document.createElement('div');
      card.className = 'note-card';
      card.dataset.markerId = mk.id;

      const head = document.createElement('div');
      head.className = 'note-card-head';

      const title = document.createElement('div');
      title.className = 'note-card-title';
      const cIdx = app.getCollectionIndexById?.(mk.collectionId);
      const cNo = (cIdx == null) ? '?' : (cIdx + 1);
      title.textContent = `Sammlung ${cNo} · Block ${mk.blockIndex + 1}`;

      const actions = document.createElement('div');
      actions.className = 'note-card-actions';

      const btnToggle = document.createElement('button');
      btnToggle.className = 'btn btn-ghost';
      btnToggle.type = 'button';
      btnToggle.dataset.action = 'toggle';
      const expanded = state.notesExpandedMarkerId === mk.id;
      btnToggle.textContent = expanded ? 'Ausblenden' : 'Anzeigen';

      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn btn-ghost';
      btnEdit.type = 'button';
      btnEdit.dataset.action = 'edit';
      btnEdit.textContent = 'Bearbeiten';

      const btnDel = document.createElement('button');
      btnDel.className = 'btn btn-danger';
      btnDel.type = 'button';
      btnDel.dataset.action = 'delete';
      btnDel.textContent = 'Löschen';

      actions.appendChild(btnToggle);
      actions.appendChild(btnEdit);
      actions.appendChild(btnDel);

      head.appendChild(title);
      head.appendChild(actions);

      const body = document.createElement('div');
      body.className = 'note-card-body';

      const ex = document.createElement('div');
      ex.className = 'note-card-excerpt';
      ex.textContent = mk.text ? `„${mk.text}“` : '(ohne Textauszug)';

      const note = document.createElement('div');
      note.className = 'note-card-note';
      note.textContent = mk.note && String(mk.note).trim().length > 0 ? mk.note : 'Keine Notiz';

      body.appendChild(ex);
      body.appendChild(note);

      const preview = document.createElement('div');
      preview.className = 'note-card-preview';
      preview.hidden = state.notesExpandedMarkerId !== mk.id;

      if (!preview.hidden) {
        renderMarkerPreview(preview, mk);
      }

      card.appendChild(head);
      card.appendChild(body);
      card.appendChild(preview);

      els.notesList.appendChild(card);
    }
  }

  function renderMarkerPreview(container, mk) {
    container.innerHTML = '';
    const cIdx = app.getCollectionIndexById?.(mk.collectionId);
    const col = (cIdx == null) ? null : state.collections?.[cIdx];
    if (!Array.isArray(col) || col.length === 0) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.textContent = 'Diese Sammlung ist leer.';
      container.appendChild(div);
      return;
    }

    // Render the entire collection (read-only) and visually mark the marker range.
    col.forEach((blk, bi) => {
      const article = document.createElement('article');
      article.className = 'block';
      article.dataset.blockIndex = String(bi);

      const content = document.createElement('div');
      content.className = 'block-content note-preview';
      content.innerHTML = formatContent(String((blk && blk.content) || '').trim());
      article.appendChild(content);
      container.appendChild(article);

      // Tokenize words for accurate marker styling.
      wrapWordsInElement(content);
      const tokens = Array.from(content.querySelectorAll('.word-token'));
      tokens.forEach((t, ti) => {
        t.dataset.blockIndex = String(bi);
        t.dataset.tokenIndex = String(ti);
      });

      if (bi === mk.blockIndex) {
        for (let ti = mk.start; ti <= mk.end; ti++) {
          const el = content.querySelector(`.word-token[data-token-index="${ti}"]`);
          if (!el) continue;
          el.classList.add('marker-token');
        }
      }
    });

    // Scroll marker into view inside this preview.
    const jump = container.querySelector('.marker-token');
    if (jump) {
      setTimeout(() => {
        try { jump.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* ignore */ }
      }, 0);
    }
  }

  function navigateToMarker(markerId) {
    const id = String(markerId || '').trim();
    if (!id) return;
    const mk = (state.markers || []).find(m => m.id === id);
    if (!mk) {
      showToast('Markierung nicht gefunden.');
      return;
    }

    // Switch to collection
    const cIdx = app.getCollectionIndexById?.(mk.collectionId);
    if (cIdx == null) { showToast('Sammlung nicht gefunden.'); return; }
    state.currentIndex = cIdx;
    app.clampIndex();

    // Ensure marker tool is enabled so the mark is visible
    setMarkerToolEnabled?.(true);

    // Focus after render
    state.pendingMarkerFocusId = id;

    // Render reader content
    setView('reader');
    renderNav();
    renderBlocks();

    // Persist navigation index
    app.saveState?.();
  }
  async function onNotesListClick(e) {
    const btn = e.target?.closest?.('button');
    const card = e.target?.closest?.('.note-card');
    const id = (btn?.closest?.('.note-card') || card)?.dataset?.markerId;

    if (!id) return;

    const action = btn?.dataset?.action;

    if (action === 'delete') {
      const ok = await showConfirm('Markierung wirklich löschen? (Notiz wird ebenfalls entfernt)');
      if (!ok) return;
      app.deleteMarker?.(id);
      if (state.notesExpandedMarkerId === id) state.notesExpandedMarkerId = null;
      renderNotesView();
      return;
    }

    if (action === 'toggle') {
      state.notesExpandedMarkerId = (state.notesExpandedMarkerId === id) ? null : id;
      renderNotesView();
      return;
    }

    if (action === 'edit') {
      app.openMarkerNoteEditor?.(id);
      return;
    }

    // Klick auf Karte selbst macht nichts (Bearbeiten nur über Button)
    return;
  }


  // --- Flashcards (browser-local stack; markers across projects) ---
  function resetFlashcardsState() {
    state.flashcards.queue = [];
    state.flashcards.total = 0;
    state.flashcards.revealed = false;

    // Default selection: active project (if any)
    const pid = state.activeProjectId;
    state.flashcards.selectedProjectIds = pid ? [pid] : [];
  }

  function setFlashcardsMode(mode) {
    const isStudy = mode === 'study';
    els.flashcardsSelectArea && (els.flashcardsSelectArea.hidden = isStudy);
    els.flashcardsStudyArea && (els.flashcardsStudyArea.hidden = !isStudy);

    // Defensive: ensure grading UI never shows unless the current card is revealed.
    if (isStudy) {
      if (els.flashcardBack) els.flashcardBack.hidden = !state.flashcards.revealed;
      if (els.flashcardsAnswerActions) els.flashcardsAnswerActions.hidden = !state.flashcards.revealed;
    }
  }

  function selectedProjectSet() {
    const arr = Array.isArray(state.flashcards.selectedProjectIds) ? state.flashcards.selectedProjectIds : [];
    return new Set(arr.map(x => String(x || '').trim()).filter(Boolean));
  }

  function updateFlashcardsBuildButton() {
    if (!els.btnFlashcardsBuild) return;
    const n = selectedProjectSet().size;
    els.btnFlashcardsBuild.disabled = n === 0;
  }

  async function renderFlashcardsProjectsSelect() {
    if (!els.flashcardsProjectsList) return;

    await loadProjectsMeta();
    updateProjectNameUI();

    const projects = Array.isArray(state.projects) ? state.projects : [];
    els.flashcardsProjectsList.innerHTML = '';

    if (projects.length === 0) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.innerHTML = '<strong>Keine Projekte vorhanden.</strong><br/>Erstelle zuerst ein Projekt.';
      els.flashcardsProjectsList.appendChild(div);
      updateFlashcardsBuildButton();
      return;
    }

    const sel = selectedProjectSet();

    for (const p of projects) {
      const row = document.createElement('div');
      row.className = 'flash-project-row';

      const name = document.createElement('div');
      name.className = 'flash-project-name';
      name.textContent = (p.name || p.id) + (p.id === state.activeProjectId ? ' · Aktiv' : '');

      const toggle = document.createElement('label');
      toggle.className = 'flash-project-toggle';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = sel.has(p.id);
      cb.addEventListener('change', () => {
        const next = selectedProjectSet();
        if (cb.checked) next.add(p.id);
        else next.delete(p.id);
        state.flashcards.selectedProjectIds = Array.from(next);
        updateFlashcardsBuildButton();
      });

      const span = document.createElement('span');
      span.textContent = 'Auswählen';

      toggle.appendChild(cb);
      toggle.appendChild(span);

      row.appendChild(name);
      row.appendChild(toggle);

      els.flashcardsProjectsList.appendChild(row);
    }

    updateFlashcardsBuildButton();
  }

  function renderFlashcardCurrent() {
    const q = Array.isArray(state.flashcards.queue) ? state.flashcards.queue : [];
    const total = Number(state.flashcards.total) || q.length;

    if (!els.flashcardsProgress || !els.flashcardFront || !els.flashcardBack || !els.flashcardsAnswerActions) return;

    if (q.length === 0) {
      els.flashcardsProgress.textContent = 'Stapel ist leer.';
      els.flashcardFront.textContent = 'Fertig.';
      els.flashcardBack.textContent = '';
      els.flashcardBack.hidden = true;
      els.flashcardsAnswerActions.hidden = true;
      state.flashcards.revealed = false;
      return;
    }

    const card = q[0];
    els.flashcardsProgress.textContent = `Noch ${q.length} von ${total}`;

    els.flashcardFront.textContent = String(card?.front ?? '').trim();
    els.flashcardBack.textContent = String(card?.back ?? '').trim();

    els.flashcardBack.hidden = !state.flashcards.revealed;
    els.flashcardsAnswerActions.hidden = !state.flashcards.revealed;

    els.flashcardCard?.setAttribute('aria-label', state.flashcards.revealed ? 'Antwort bewerten' : 'Karte aufdecken');
  }

  function countChars(s, ch) {
    const str = String(s ?? '');
    const re = new RegExp(`\\${ch}`, 'g');
    const m = str.match(re);
    return m ? m.length : 0;
  }

  function makeCardFromNote(noteText, projectId, markerId) {
    const raw = String(noteText ?? '');
    const cClose = countChars(raw, '}');
    const cOpen = countChars(raw, '{');
    if (cClose !== 1) return null;
    if (cOpen !== 0) return null;

    const idx = raw.indexOf('}');
    if (idx < 0) return null;

    const front = raw.slice(0, idx).trim();
    const back = raw.slice(idx + 1).trim();

    // keep even if one side is empty; the user controls note quality
    return { front, back, projectId: String(projectId || ''), markerId: String(markerId || '') };
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  async function buildFlashcardsStackFromSelection() {
    const sel = Array.from(selectedProjectSet());
    if (sel.length === 0) {
      showToast('Bitte mindestens ein Projekt auswählen.');
      return;
    }

    els.btnFlashcardsBuild && (els.btnFlashcardsBuild.disabled = true);
    showToast('Erzeuge Stapel…');

    try {
      const all = await Promise.all(sel.map(async (pid) => {
        const marks = await app.fetchMarkersForProject?.(pid);
        return { pid, marks: Array.isArray(marks) ? marks : [] };
      }));

      const cards = [];
      for (const { pid, marks } of all) {
        for (const mk of marks) {
          const note = mk && mk.note != null ? String(mk.note) : '';
          if (!note.trim()) continue;
          const card = makeCardFromNote(note, pid, mk.id);
          if (card) cards.push(card);
        }
      }

      if (cards.length === 0) {
        showToast('Keine passenden Notizen gefunden (genau ein } und kein {).');
        resetFlashcardsState();
        setFlashcardsMode('select');
        await renderFlashcardsProjectsSelect();
        return;
      }

      shuffleInPlace(cards);

      const stack = {
        queue: cards,
        total: cards.length,
        projectIds: sel,
        createdAt: Date.now(),
      };

      app.persistLocalFlashcardsStack?.(stack);

      state.flashcards.queue = stack.queue;
      state.flashcards.total = stack.total;
      state.flashcards.revealed = false;

      setFlashcardsMode('study');
      renderFlashcardCurrent();
      showToast(`Stapel erstellt: ${cards.length} Karte${cards.length === 1 ? '' : 'n'}.`);
    } finally {
      updateFlashcardsBuildButton();
    }
  }

  function revealFlashcard() {
    const q = Array.isArray(state.flashcards.queue) ? state.flashcards.queue : [];
    if (q.length === 0) return;
    if (state.flashcards.revealed) return;
    state.flashcards.revealed = true;
    renderFlashcardCurrent();
  }

  function answerFlashcard(isRight) {
    const q = Array.isArray(state.flashcards.queue) ? state.flashcards.queue : [];
    if (q.length === 0) return;
    if (!state.flashcards.revealed) return;

    const total = Number(state.flashcards.total) || q.length;

    if (isRight) {
      q.shift();
    } else {
      q.push(q.shift());
    }

    state.flashcards.queue = q;
    state.flashcards.total = total;
    state.flashcards.revealed = false;

    if (q.length === 0) {
      app.clearLocalFlashcardsStack?.();
      showToast('Stapel abgeschlossen.');
      setFlashcardsMode('select');
      // keep selection from previous stack if available
      if (!Array.isArray(state.flashcards.selectedProjectIds) || state.flashcards.selectedProjectIds.length === 0) {
        resetFlashcardsState();
      }
      renderFlashcardsProjectsSelect();
      return;
    }

    app.persistLocalFlashcardsStack?.({
      queue: q,
      total,
      projectIds: Array.isArray(state.flashcards.selectedProjectIds) ? state.flashcards.selectedProjectIds : [],
      createdAt: Date.now(),
    });

    renderFlashcardCurrent();
  }

  async function renderFlashcardsView() {
    if (!els.viewFlashcards) return;

    // If no selection exists (fresh entry), default to current project.
    if (!Array.isArray(state.flashcards.selectedProjectIds) || state.flashcards.selectedProjectIds.length === 0) {
      const pid = state.activeProjectId;
      state.flashcards.selectedProjectIds = pid ? [pid] : [];
    }

    const q = Array.isArray(state.flashcards.queue) ? state.flashcards.queue : [];
    if (q.length > 0) {
      setFlashcardsMode('study');
      renderFlashcardCurrent();
      return;
    }

    setFlashcardsMode('select');
    await renderFlashcardsProjectsSelect();
  }

  // Resume prompt (3-way: continue / new / cancel)
  let flashResumeResolver = null;

  function closeFlashResumePrompt(result) {
    if (!flashResumeResolver) return;
    const resolve = flashResumeResolver;
    flashResumeResolver = null;

    if (els.flashResumeOverlay) els.flashResumeOverlay.hidden = true;
    if (els.flashResumeBox) {
      els.flashResumeBox.classList.remove('open');
      els.flashResumeBox.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
    resolve(result);
  }

  function showFlashResumePrompt(message) {
    if (!els.flashResumeBox || !els.flashResumeOverlay || !els.flashResumeMsg) {
      // Fallback: behave as "new"
      return Promise.resolve('new');
    }

    if (flashResumeResolver) {
      closeFlashResumePrompt(null);
    }

    els.flashResumeMsg.textContent = String(message || '');

    els.flashResumeOverlay.hidden = false;
    els.flashResumeBox.classList.add('open');
    els.flashResumeBox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    try { els.flashResumeContinue?.focus(); } catch { /* ignore */ }

    return new Promise((resolve) => { flashResumeResolver = resolve; });
  }

  function initFlashResumePrompt() {
    if (!els.flashResumeOverlay || !els.flashResumeBox) return;

    els.flashResumeOverlay.addEventListener('click', () => closeFlashResumePrompt(null));
    els.flashResumeCancel?.addEventListener('click', () => closeFlashResumePrompt(null));
    els.flashResumeNew?.addEventListener('click', () => closeFlashResumePrompt('new'));
    els.flashResumeContinue?.addEventListener('click', () => closeFlashResumePrompt('continue'));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && flashResumeResolver) {
        e.preventDefault();
        closeFlashResumePrompt(null);
      }
    });
  }

  initFlashResumePrompt();

  function loadStackIntoState(stack) {
    const q = Array.isArray(stack?.queue) ? stack.queue : [];
    state.flashcards.queue = q;
    state.flashcards.total = Number(stack?.total) || q.length;
    state.flashcards.revealed = false;
    if (Array.isArray(stack?.projectIds) && stack.projectIds.length) {
      state.flashcards.selectedProjectIds = stack.projectIds.map(x => String(x || '').trim()).filter(Boolean);
    }
  }

  async function openFlashcardsEntry() {
    const existing = app.loadLocalFlashcardsStack?.();

    if (existing && Array.isArray(existing.queue) && existing.queue.length > 0) {
      const msg = `Du hast noch einen unvollständigen Stapel (${existing.queue.length} Karte${existing.queue.length === 1 ? '' : 'n'}).\n\nFortfahren oder neuen Stapel erstellen?`;
      const choice = await showFlashResumePrompt(msg);

      if (choice === 'continue') {
        loadStackIntoState(existing);
        setView('flashcards');
        return;
      }

      if (choice === 'new') {
        app.clearLocalFlashcardsStack?.();
        resetFlashcardsState();
        setView('flashcards');
        return;
      }

      // Cancel: stay where you are
      return;
    }

    // No existing stack -> go to selection
    if (!Array.isArray(state.flashcards.selectedProjectIds) || state.flashcards.selectedProjectIds.length === 0) {
      const pid = state.activeProjectId;
      state.flashcards.selectedProjectIds = pid ? [pid] : [];
    }
    setView('flashcards');
  }



  function renderSettingsView() {
    const sizes = getReaderFontSizes?.() || { firstBlockPx: 35, otherBlocksPx: 14 };
    if (els.settingsFontSizeSummary) {
      els.settingsFontSizeSummary.textContent = `Erster sichtbarer Textblock: ${sizes.firstBlockPx} px · Weitere Textblöcke: ${sizes.otherBlocksPx} px`;
    }
  }

  function openFontSizeDialog() {
    if (!els.fontSizeBox || !els.fontSizeOverlay) return;

    const sizes = getReaderFontSizes?.() || { firstBlockPx: 35, otherBlocksPx: 14 };
    if (els.fontSizeFirstInput) els.fontSizeFirstInput.value = String(sizes.firstBlockPx);
    if (els.fontSizeOtherInput) els.fontSizeOtherInput.value = String(sizes.otherBlocksPx);

    state.fontSizeDialogOpen = true;
    els.fontSizeOverlay.hidden = false;
    els.fontSizeBox.classList.add('open');
    els.fontSizeBox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    try { els.fontSizeFirstInput?.focus(); } catch { /* ignore */ }
  }

  function closeFontSizeDialog(restoreFocus = true) {
    if (!els.fontSizeBox || !els.fontSizeOverlay) return;

    state.fontSizeDialogOpen = false;
    els.fontSizeOverlay.hidden = true;
    els.fontSizeBox.classList.remove('open');
    els.fontSizeBox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    if (restoreFocus) {
      try { els.btnSettingsFontSize?.focus(); } catch { /* ignore */ }
    }
  }

  function saveFontSizeDialog() {
    const first = Math.round(Number(els.fontSizeFirstInput?.value));
    const other = Math.round(Number(els.fontSizeOtherInput?.value));

    if (!Number.isFinite(first) || !Number.isFinite(other) || first <= 0 || other <= 0) {
      showToast('Bitte gültige Schriftgrößen größer als 0 eingeben.');
      return;
    }

    setReaderFontSizes?.({
      firstBlockPx: first,
      otherBlocksPx: other,
    });

    renderSettingsView();
    renderBlocks();
    closeFontSizeDialog(false);
    showToast('Schriftgröße gespeichert.');
  }


  // --- Projects (top-level grouping) ---
  async function renderProjectsView() {
    if (!els.projectsList) return;

    els.projectsList.innerHTML = '<div class="empty">Lade…</div>';

    await loadProjectsMeta();
    updateProjectNameUI();

    els.projectsList.innerHTML = '';

    if (!Array.isArray(state.projects) || state.projects.length === 0) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.innerHTML = '<strong>Keine Projekte.</strong><br/>Erstelle ein neues Projekt.';
      els.projectsList.appendChild(div);
      return;
    }

    for (const p of state.projects) {
      const card = document.createElement('div');
      card.className = 'project-card';

      const top = document.createElement('div');
      top.className = 'project-card-top';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'input';
      input.value = p.name || p.id;
      input.setAttribute('autocomplete', 'off');
      input.dataset.projectId = p.id;

      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          ev.stopPropagation();
          input.blur();
        }
      });
      input.addEventListener('click', (ev) => ev.stopPropagation());

      top.appendChild(input);

      if (p.id === state.activeProjectId) {
        const badge = document.createElement('span');
        badge.className = 'project-badge';
        badge.textContent = 'Aktiv';
        top.appendChild(badge);
      }

      const actions = document.createElement('div');
      actions.className = 'project-actions';

      const btnLoad = document.createElement('button');
      btnLoad.type = 'button';
      btnLoad.className = 'btn btn-ghost';
      btnLoad.textContent = 'Laden';
      btnLoad.dataset.action = 'load';
      btnLoad.dataset.projectId = p.id;
      btnLoad.disabled = (p.id === state.activeProjectId);

      const btnRename = document.createElement('button');
      btnRename.type = 'button';
      btnRename.className = 'btn';
      btnRename.textContent = 'Umbenennen';
      btnRename.dataset.action = 'rename';
      btnRename.dataset.projectId = p.id;

      const btnDelete = document.createElement('button');
      btnDelete.type = 'button';
      btnDelete.className = 'btn btn-ghost';
      btnDelete.textContent = 'Löschen';
      btnDelete.dataset.action = 'delete';
      btnDelete.dataset.projectId = p.id;

      actions.appendChild(btnLoad);
      actions.appendChild(btnRename);
      actions.appendChild(btnDelete);

      card.appendChild(top);
      card.appendChild(actions);

      els.projectsList.appendChild(card);
    }
  }

  async function createProjectFromUI() {
    const name = els.projectNewName ? els.projectNewName.value : '';
    const id = await createProject(name);
    if (els.projectNewName) els.projectNewName.value = '';
    await loadState();
    renderNav();
    renderBlocks();
    setView('reader');
    scrollTop();
    return id;
  }

  async function renameProjectFromUI(projectId) {
    const input = Array.from(els.projectsList?.querySelectorAll('input[data-project-id]') || []).find(el => el.dataset.projectId === projectId);
    const name = input ? input.value : '';
    if (!(await renameProject(projectId, name))) {
      showToast('Projektname ungültig.');
      return false;
    }
    renderProjectsView();
    return true;
  }

  async function loadProjectFromUI(projectId) {
    await setActiveProject(projectId);
    await loadState();
    renderNav();
    renderBlocks();
    setView('reader');
    scrollTop();
  }

  function onProjectsListClick(e) {
    const btn = e.target.closest('button[data-action][data-project-id]');
    if (!btn) return;

    const action = btn.dataset.action;
    const pid = btn.dataset.projectId;

    if (action === 'load') loadProjectFromUI(pid);
    if (action === 'rename') renameProjectFromUI(pid);
    if (action === 'delete') deleteProjectFromUI(pid);
  }

  async function deleteProjectFromUI(projectId) {
    const pid = String(projectId || '').trim();
    if (!pid) return;

    const p = (state.projects || []).find(x => x.id === pid);
    const name = p?.name || pid;

    const ok = await showConfirm(`Projekt „${name}“ wirklich löschen?

Dabei werden Sammlungen und Markierungen endgültig entfernt.`, 'Löschen', 'Abbrechen');
    if (!ok) return;

    const done = await app.deleteProject?.(pid);
    if (!done) return;

    // refresh project list and reader state (active project may have changed)
    await loadProjectsMeta();
    updateProjectNameUI();
    await loadState();
    renderNav();
    renderBlocks();

    // stay in projects view; list will refresh
    renderProjectsView();
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

  async function saveNewCollection() {
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

    const newIndex = state.collections.length;
    state.currentIndex = newIndex;

    try {
      await app.appendCollections([complete]);
    } catch {
      // Core shows a toast on failure.
      return;
    }

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

  async function applyDeleteDraft() {
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
    const indices = Array.from(marked).sort((a, b) => a - b);

    try {
      await app.deleteCollectionsByIndices(indices);
    } catch {
      // Errors are already toasted in core.
      return;
    }

    state.currentIndex = state.collections.length === 0 ? 0 : Math.min(newIdx, state.collections.length - 1);
    saveState();
    renderNav();
    renderBlocks();

    clearDeleteDraft();
    setView('reader');
    scrollTop();
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
    if (!hideDraft) { setView('settings'); scrollTop(); return; }
    setHiddenBlocks(Array.from(hideDraft.hidden));
    saveState();
    renderBlocks();
    clearHideDraft();
    setView('settings');
    scrollTop();
  }

  function cancelHideDraft() {
    clearHideDraft();
    setView('settings');
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
    els.viewProjects?.classList.toggle('view-active', view === 'projects');
    els.viewNotes?.classList.toggle('view-active', view === 'notes');
    els.viewHelp?.classList.toggle('view-active', view === 'help');
    els.viewFlashcards?.classList.toggle('view-active', view === 'flashcards');
    els.viewSettings?.classList.toggle('view-active', view === 'settings');

    const hasCollections = state.collections.length > 0;
    const inReader = (view === 'reader');

    // Used by CSS to hide reader-only controls without shifting layout.
    document.body.classList.toggle('is-reader', inReader);

    els.btnPrev.disabled = !hasCollections || !inReader;
    els.btnNext.disabled = !hasCollections || !inReader;

    // Tool buttons are only usable in reader view, but tool *state* should persist across views.
    els.btnHighlightTool.disabled = !inReader;
    els.btnMarkerTool && (els.btnMarkerTool.disabled = !inReader);
    els.btnClearHighlights.disabled = !inReader;

    if (view === 'projects') {
      renderProjectsView();
    }

    if (view === 'notes') {
      renderNotesView();
    }

    if (view === 'flashcards') {
      renderFlashcardsView();
    }

    if (view === 'settings') {
      renderSettingsView();
      els.btnSettingsHideBlocks?.focus();
    }

    // Do not change active tool state when leaving reader; it should restore when returning.

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


  app.resetDeleteDraft = resetDeleteDraft;
  app.renderDeleteView = renderDeleteView;
  app.applyDeleteDraft = applyDeleteDraft;
  app.cancelDeleteDraft = cancelDeleteDraft;

  app.resetHideDraft = resetHideDraft;
  app.renderHideView = renderHideView;
  app.applyHideDraft = applyHideDraft;
  app.cancelHideDraft = cancelHideDraft;

  app.setView = setView;
  app.renderProjectsView = renderProjectsView;
  app.onProjectsListClick = onProjectsListClick;
  app.createProjectFromUI = createProjectFromUI;

  // Notes/markers overview
  app.renderNotesView = renderNotesView;
  app.onNotesListClick = onNotesListClick;
  // Flashcards
  app.renderSettingsView = renderSettingsView;
  app.openFontSizeDialog = openFontSizeDialog;
  app.closeFontSizeDialog = closeFontSizeDialog;
  app.saveFontSizeDialog = saveFontSizeDialog;

  app.renderFlashcardsView = renderFlashcardsView;
  app.openFlashcardsEntry = openFlashcardsEntry;
  app.buildFlashcardsStackFromSelection = buildFlashcardsStackFromSelection;
  app.revealFlashcard = revealFlashcard;
  app.answerFlashcard = answerFlashcard;
  app.resetFlashcardsState = resetFlashcardsState;

  // Some helpers used by other files
  app.closeMenu = closeMenu;
  app.openMenu = openMenu;
})();
