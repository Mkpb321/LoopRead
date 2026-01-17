/* LoopRead — split into 4 files
   Part 4/4: import/export, auth, wiring, init
*/

(() => {
  'use strict';

  const app = (window.LoopRead = window.LoopRead || {});
  const els = app.els;
  const state = app.state;

  const {
    showToast,
    saveState,
    loadState,
    renderNav,
    renderBlocks,
    setView,
    closeMenu,
    openMenu,
    gotoNext,
    gotoPrev,
    toggleHighlightTool,
    toggleMarkerTool,
    clearHighlights,
    onGlobalSelectStart,
    onWordTokenClick,
    onNotesListClick,
    closeConfirm,
    applyDeleteDraft,
    cancelDeleteDraft,
    applyHideDraft,
    cancelHideDraft,
    setHighlightToolEnabled,
    loadProjectsMeta,
    renderProjectsView,
    onProjectsListClick,
    createProjectFromUI,
  } = app;

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
    if (sheetNames.length === 0) {
      showToast('Import abgebrochen: Keine Tabellenblätter gefunden.');
      return;
    }

    const sheetErr = (sheetName, msg) => `Import abgebrochen (Sheet \"${sheetName}\"): ${msg}`;

    const parseSheetToCollections = (sheet, sheetName) => {
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

      if (!rows || rows.length === 0) {
        throw new Error(sheetErr(sheetName, 'Tabellenblatt ist leer.'));
      }

      const header = rows[0] || [];
      let lastTitleCol = -1;
      for (let c = 0; c < header.length; c++) {
        if (!isEmptyCell(header[c])) lastTitleCol = c;
      }
      if (lastTitleCol < 0) {
        throw new Error(sheetErr(sheetName, 'Keine Titel in Zeile 1 gefunden.'));
      }

      // Header validation: no gaps within 0..lastTitleCol
      const titles = [];
      for (let c = 0; c <= lastTitleCol; c++) {
        const t = String(header[c] ?? '').trim();
        if (!t) {
          throw new Error(sheetErr(sheetName, `Titel fehlt in Zeile 1, Spalte ${columnLetter(c)}.`));
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
        throw new Error(sheetErr(sheetName, 'Keine Datenzeilen gefunden (ab Zeile 2).'));
      }

      const imported = [];

      for (let r = 0; r < dataRows.length; r++) {
        const row = dataRows[r] || [];
        const excelRowNumber = r + 2; // since header is row 1

        // Empty row in the middle is not allowed
        if (isRowEmpty(row, lastTitleCol)) {
          throw new Error(sheetErr(sheetName, `Zeile ${excelRowNumber} ist leer.`));
        }

        const collection = [];
        for (let c = 0; c <= lastTitleCol; c++) {
          const raw = row[c];
          const content = String(raw ?? '').trim();
          if (!content) {
            throw new Error(sheetErr(sheetName, `Leerzelle in Zeile ${excelRowNumber}, Spalte ${columnLetter(c)} (Titel: \"${titles[c]}\").`));
          }
          collection.push({ title: titles[c], content });
        }

        imported.push(collection);
      }

      if (imported.length === 0) {
        throw new Error(sheetErr(sheetName, 'Keine gültigen Daten gefunden.'));
      }

      return imported;
    };

    /** @type {Array<Array<{title:string, content:string}>>} */
    const importedAll = [];

    try {
      for (const sheetName of sheetNames) {
        const sheet = wb.Sheets[sheetName];
        if (!sheet) throw new Error(sheetErr(sheetName, 'Tabellenblatt konnte nicht gelesen werden.'));
        const importedSheet = parseSheetToCollections(sheet, sheetName);
        importedAll.push(...importedSheet);
      }
    } catch (e) {
      showToast(e?.message || 'Import fehlgeschlagen.');
      return;
    }

    if (importedAll.length === 0) {
      showToast('Import abgebrochen: Keine gültigen Daten gefunden.');
      return;
    }

    if (mode === 'replace') {
      // Replace current project data in Firestore (Sammlungen + Markierungen)
      try {
        await app.replaceCollections(importedAll);
      } catch {
        return;
      }
      state.currentIndex = 0;
    } else {
      // Append in Firestore and jump to first imported collection
      const oldLen = state.collections.length;
      state.currentIndex = oldLen; // springe zur ersten importierten Sammlung
      try {
        await app.appendCollections(importedAll);
      } catch {
        return;
      }
      app.clampIndex();
    }

    saveState();
    renderNav();
    renderBlocks();
    setView('reader');
    closeMenu();
    app.scrollTop();

showToast(`Import erfolgreich: ${importedAll.length} Blocksammlung(en) aus ${sheetNames.length} Tabellenblatt(ern) übernommen.`);
  }

  // --- Export (Excel .xlsx; import-kompatibel) ---
  function sanitizeSheetName(value) {
    // Excel constraints: max 31 chars; cannot contain : \ / ? * [ ]
    let s = String(value || '').trim();
    s = s.replace(/[:\\\/\?\*\[\]]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    if (!s) s = 'Sheet';
    if (s.length > 31) s = s.slice(0, 31).trim();
    if (!s) s = 'Sheet';
    return s;
  }

  function uniqueSheetName(base, used) {
    let name = sanitizeSheetName(base);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    for (let i = 2; i < 10_000; i++) {
      const suffix = `_${i}`;
      const maxBase = 31 - suffix.length;
      const candidate = sanitizeSheetName(name.slice(0, maxBase)) + suffix;
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
    // Fallback (should never happen)
    const fallback = `Sheet_${Date.now()}`;
    used.add(fallback.slice(0, 31));
    return fallback.slice(0, 31);
  }

  function triggerDownloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function formatLocalTimestampForFilename(date = new Date()) {
    // Use the device's local time zone for the export filename.
    const pad2 = (n) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad2(date.getMonth() + 1);
    const d = pad2(date.getDate());
    const hh = pad2(date.getHours());
    const mm = pad2(date.getMinutes());
    const ss = pad2(date.getSeconds());
    // Format: YYYY-MM-DD-HHmmss (no separators within the time component)
    return `${y}-${m}-${d}-${hh}${mm}${ss}`;
  }

  function exportAllAsXlsx() {
    if (!window.XLSX) {
      showToast('Export-Bibliothek (XLSX) nicht geladen.');
      return;
    }
    if (!Array.isArray(state.collections) || state.collections.length === 0) {
      showToast('Keine Sammlungen zum Exportieren vorhanden.');
      return;
    }

    // Group by exact title sequence (order-sensitive)
    /** @type {Map<string, {titles:string[], collections:Array<Array<{title:string, content:string}>>}>} */
    const groups = new Map();

    for (const col of state.collections) {
      const titles = (col || []).map(b => String(b?.title ?? '').trim());
      const sig = titles.join('\u0001'); // order-sensitive signature
      if (!groups.has(sig)) groups.set(sig, { titles, collections: [] });
      groups.get(sig).collections.push(col);
    }

    const wb = XLSX.utils.book_new();
    const usedNames = new Set();
    let sheetIndex = 0;

    for (const g of groups.values()) {
      sheetIndex++;
      const titles = g.titles;
      if (!titles.length) continue;

      const aoa = [];
      aoa.push(titles);

      for (const col of g.collections) {
        const row = (col || []).map(b => String(b?.content ?? '').trim());
        // Safety: enforce same shape as header
        if (row.length !== titles.length) {
          showToast('Export abgebrochen: Uneinheitliche Blockanzahl innerhalb einer Titel-Gruppe.');
          return;
        }
        aoa.push(row);
      }

      const hint = sanitizeSheetName(titles.slice(0, 3).join(' - '));
      const baseName = groups.size === 1 ? 'Export' : `${sheetIndex} ${hint}`;
      const sheetName = uniqueSheetName(baseName, usedNames);

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    if ((wb.SheetNames || []).length === 0) {
      showToast('Export abgebrochen: Keine gültigen Daten gefunden.');
      return;
    }

    const filename = `loopread_export_${formatLocalTimestampForFilename()}.xlsx`;
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    triggerDownloadBlob(filename, blob);

    showToast(`Export gestartet: 1 Excel-Datei mit ${wb.SheetNames.length} Tabellenblatt(ern).`);
  }

  function sanitizeFilenamePart(s) {
    const raw = String(s ?? '').trim();
    if (!raw) return 'projekt';
    // Replace unsafe filename chars with underscore
    return raw.replace(/[^a-zA-Z0-9\u00C0-\u017F._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'projekt';
  }

  async function exportCurrentProjectAsPdf() {
    const jsPDF = window.jspdf?.jsPDF;
    const html2canvas = window.html2canvas;
    if (!jsPDF || !html2canvas) {
      showToast('PDF-Export-Bibliotheken nicht geladen.');
      return;
    }

    const project = app.getActiveProject?.();
    if (!project?.id) {
      showToast('Kein aktives Projekt.');
      return;
    }
    if (!Array.isArray(state.collections) || state.collections.length === 0) {
      showToast('Keine Sammlungen zum Exportieren vorhanden.');
      return;
    }

    // NOTE: Für Griechisch/Hebräisch/Unicode ist jsPDF-Textausgabe mit Standard-Fonts
    // nicht ausreichend. Wir rendern pro Seite HTML (mit Unicode-Webfonts) und
    // rasterisieren via html2canvas in die PDF. So bleiben Schriftzeichen korrekt.

    showToast('PDF wird erstellt …');

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWpt = doc.internal.pageSize.getWidth();
    const pageHpt = doc.internal.pageSize.getHeight();

    // A4 in CSS-Pixel (bei 96dpi): 595pt -> ~794px
    const PT_TO_PX = 96 / 72;
    const pageWpx = Math.round(pageWpt * PT_TO_PX);
    const pageHpx = Math.round(pageHpt * PT_TO_PX);

    const paddingPt = 56;
    const paddingPx = Math.round(paddingPt * PT_TO_PX);

    const normalizeText = (t) => String(t ?? '').replace(/\r\n/g, '\n');

    // Titelseite: nutze die Block-Titel der allerersten Sammlung als "Blockinhalt".
    const titlePageBlocks = (Array.isArray(state.collections[0]) ? state.collections[0] : [])
      .map(b => String(b?.title ?? '').trim())
      .filter(t => t.length > 0)
      .map(t => normalizeText(t));

    const pages = [];
    if (titlePageBlocks.length > 0) {
      pages.push({ kind: 'title', blocks: titlePageBlocks });
    }
    for (let ci = 0; ci < state.collections.length; ci++) {
      const blocks = Array.isArray(state.collections[ci]) ? state.collections[ci] : [];
      const contents = blocks.map(b => normalizeText(b?.content ?? '').trim());
      pages.push({ kind: 'collection', blocks: contents });
    }

    const root = document.createElement('div');
    root.id = 'pdfRenderRoot';
    root.setAttribute('aria-hidden', 'true');
    Object.assign(root.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: `${pageWpx}px`,
      height: 'auto',
      zIndex: '-1',
      pointerEvents: 'none'
    });

    const style = document.createElement('style');
    style.textContent = `
      #pdfRenderRoot .pdf-page {
        width: ${pageWpx}px;
        height: ${pageHpx}px;
        box-sizing: border-box;
        padding: ${paddingPx}px;
        background: #ffffff;
        color: #111111;
        border-radius: 0;
      }

      #pdfRenderRoot .pdf-content {
        width: 100%;
        height: ${pageHpx - paddingPx * 2}px;
        box-sizing: border-box;
        overflow: hidden;
        font-family: "Noto Serif", "Noto Sans Hebrew", "Noto Sans", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        font-variant-ligatures: none;
      }

      #pdfRenderRoot .pdf-block {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
        hyphens: auto;
        margin: 0 0 18px 0;
        text-align: start;
        direction: auto;
        unicode-bidi: plaintext;
      }

      #pdfRenderRoot .pdf-block:last-child { margin-bottom: 0; }

      #pdfRenderRoot .pdf-block-first {
        font-size: var(--pdf-first-fs, 24px);
        line-height: 1.4;
      }

      #pdfRenderRoot .pdf-block-other {
        font-size: var(--pdf-other-fs, 20px);
        line-height: 1.15;
      }
    `;

    root.appendChild(style);
    document.body.appendChild(root);

    // Ensure webfonts are loaded before rendering (but don't block forever).
    try {
      if (document.fonts && document.fonts.ready) {
        await Promise.race([
          document.fonts.ready,
          new Promise(r => setTimeout(r, 2500))
        ]);
      }
    } catch (_) {
      // ignore
    }

    const makePageDom = (blockTexts) => {
      const page = document.createElement('div');
      page.className = 'pdf-page';
      const content = document.createElement('div');
      content.className = 'pdf-content';
      page.appendChild(content);

      const texts = Array.isArray(blockTexts) ? blockTexts : [];
      for (let i = 0; i < texts.length; i++) {
        const b = document.createElement('div');
        b.className = 'pdf-block ' + (i === 0 ? 'pdf-block-first' : 'pdf-block-other');
        b.textContent = texts[i] ?? '';
        content.appendChild(b);
      }

      // Defaults
      page.style.setProperty('--pdf-other-fs', '20px');
      page.style.setProperty('--pdf-first-fs', '24px');
      return page;
    };

    const forceReflow = (el) => {
      // eslint-disable-next-line no-unused-expressions
      el.offsetHeight;
    };

    const fitFontsToSinglePage = (pageEl) => {
      const content = pageEl.querySelector('.pdf-content');
      if (!content) return;
      const blocks = Array.from(pageEl.querySelectorAll('.pdf-block'));
      if (blocks.length === 0) return;

      const MIN_FIRST = 12;
      const MAX_FIRST = 46;
      const MIN_OTHER = 12;
      const MAX_OTHER = 20;

      const fits = () => (content.scrollHeight <= content.clientHeight + 1);

      for (let other = MAX_OTHER; other >= MIN_OTHER; other--) {
        pageEl.style.setProperty('--pdf-other-fs', `${other}px`);
        // Binary-search best possible first font size.
        let lo = MIN_FIRST;
        let hi = MAX_FIRST;
        let best = MIN_FIRST;
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          pageEl.style.setProperty('--pdf-first-fs', `${mid}px`);
          forceReflow(content);
          if (fits()) {
            best = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }

        pageEl.style.setProperty('--pdf-first-fs', `${best}px`);
        forceReflow(content);
        if (fits()) return;
      }
    };

    try {
      for (let i = 0; i < pages.length; i++) {
        const model = pages[i];
        const pageEl = makePageDom(model.blocks);
        root.appendChild(pageEl);

        // Fit content so it never overflows the page.
        fitFontsToSinglePage(pageEl);

        const canvas = await html2canvas(pageEl, {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true
        });

        const imgData = canvas.toDataURL('image/png');
        if (i > 0) doc.addPage();
        doc.addImage(imgData, 'PNG', 0, 0, pageWpt, pageHpt);

        root.removeChild(pageEl);
        // yield to keep UI responsive for larger projects
        await new Promise(r => setTimeout(r, 0));
      }
    } finally {
      document.body.removeChild(root);
    }

    const filename = `loopread_${sanitizeFilenamePart(project.name)}_${formatLocalTimestampForFilename()}.pdf`;
    const blob = doc.output('blob');
    triggerDownloadBlob(filename, blob);
    showToast('PDF-Export gestartet.');
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
    // Firestore (Compat)
    app.db = firebase.firestore();
      firebaseReady = true;
    } catch (e) {
      firebaseReady = false;
      showToast('Anmeldung konnte nicht initialisiert werden.');
    }
  }

  function wireEvents() {
    els.btnPrev.addEventListener('click', gotoPrev);
    els.btnNext.addEventListener('click', gotoNext);

    if (els.btnHighlightTool) els.btnHighlightTool.addEventListener('click', toggleHighlightTool);
    if (els.btnMarkerTool) els.btnMarkerTool.addEventListener('click', toggleMarkerTool);
    if (els.btnClearHighlights) els.btnClearHighlights.addEventListener('click', clearHighlights);

    document.addEventListener('selectstart', onGlobalSelectStart, true);

    // Tap-to-highlight words inside reader blocks
    els.blocksContainer.addEventListener('click', onWordTokenClick);

    els.btnMenu.addEventListener('click', openMenu);
    els.menuOverlay.addEventListener('click', closeMenu);

    // Confirm modal
    els.confirmOverlay.addEventListener('click', () => closeConfirm(false));
    els.confirmCancel.addEventListener('click', () => closeConfirm(false));
    els.confirmOk.addEventListener('click', () => closeConfirm(true));

    // Toast close
    if (els.toastClose) {
      els.toastClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        app.hideToast();
      });
    }

    els.menuToProjects?.addEventListener('click', () => { setView('projects'); closeMenu(); });
    els.menuToReader.addEventListener('click', () => { setView('reader'); closeMenu(); });
    els.menuToAdd.addEventListener('click', () => { setView('add'); closeMenu(); });
    els.menuToImport.addEventListener('click', () => { setView('import'); closeMenu(); });
    els.menuExport.addEventListener('click', () => { closeMenu(); exportAllAsXlsx(); });
    els.menuExportPdf?.addEventListener('click', () => { closeMenu(); exportCurrentProjectAsPdf(); });
    els.menuToDelete.addEventListener('click', () => { setView('delete'); closeMenu(); });
    els.menuToHide.addEventListener('click', () => { setView('hide'); closeMenu(); });
    els.menuToNotes?.addEventListener('click', () => { setView('notes'); closeMenu(); });
    els.menuToHelp?.addEventListener('click', () => { setView('help'); closeMenu(); });

    els.menuLogout.addEventListener('click', () => {
      if (!firebaseReady) { showToast('Logout derzeit nicht verfügbar.'); return; }
      firebase.auth().signOut();
    });


    // Projects view
    if (els.btnCreateProject) {
      els.btnCreateProject.addEventListener('click', () => { createProjectFromUI(); });
    }
    if (els.projectsList) {
      els.projectsList.addEventListener('click', onProjectsListClick);
    }
    if (els.btnProjectsBack) {
      els.btnProjectsBack.addEventListener('click', () => { setView('reader'); scrollTop(); });
    }

    els.btnCancel.addEventListener('click', () => { setView('reader'); app.scrollTop(); });
    els.addForm.addEventListener('submit', (e) => { e.preventDefault(); app.saveNewCollection(); });

    els.importFile.addEventListener('change', () => {
      const f = els.importFile.files && els.importFile.files[0];
      els.importInfo.textContent = f ? `Ausgewählt: ${f.name}` : '';
    });

    els.btnImportCancel.addEventListener('click', () => { setView('reader'); app.scrollTop(); });
    els.btnExport.addEventListener('click', exportAllAsXlsx);

    els.btnDeleteCancel.addEventListener('click', cancelDeleteDraft);
    els.btnDeleteSave.addEventListener('click', applyDeleteDraft);

    els.btnHideCancel.addEventListener('click', cancelHideDraft);
    els.btnNotesBack?.addEventListener('click', () => { setView('reader'); app.scrollTop(); });
    els.btnHelpBack?.addEventListener('click', () => { setView('reader'); app.scrollTop(); });

    els.notesList?.addEventListener('click', onNotesListClick);
    els.btnHideSave.addEventListener('click', applyHideDraft);

    els.importForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = els.importFile.files && els.importFile.files[0];
      if (!f) { showToast('Bitte eine Datei auswählen.'); return; }

      const mode = (document.querySelector('input[name=\"importMode\"]:checked')?.value || 'append');
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
        if (!els.menuOverlay.hidden) { closeMenu(); return; }
      }

      const inReader = els.viewReader.classList.contains('view-active');
      const noteOpen = !!(els.markerNoteBox && els.markerNoteBox.classList && els.markerNoteBox.classList.contains('open'));

      // Keyboard shortcuts only in reader view and only when no modal is open.
      if (inReader && !state.menuOpen && !state.confirmOpen && !noteOpen) {
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) {
          const k = String(e.key || '').toLowerCase();

          // Esc = disable all tools (highlight + marker)
          if (k === 'escape') {
            // Tool APIs live in app.highlight.js
            setHighlightToolEnabled(false);
            if (typeof app.setMarkerToolEnabled === 'function') app.setMarkerToolEnabled(false);
            e.preventDefault();
            return;
          }

          // h = toggle highlight tool
          if (k === 'h') {
            toggleHighlightTool();
            e.preventDefault();
            return;
          }

          // m = toggle marker tool
          if (k === 'm') {
            toggleMarkerTool();
            e.preventDefault();
            return;
          }

          // Del = same as "X" button (clear highlights)
          if (e.key === 'Delete') {
            clearHighlights();
            e.preventDefault();
            return;
          }
        }
      }

      // Reader navigation (disabled while marker note dialog is open)
      if (inReader && !state.menuOpen && !noteOpen) {
        if (e.key === 'ArrowRight') gotoNext();
        if (e.key === 'ArrowLeft') gotoPrev();
      }
    });
  }

  function init() {
    // Default: locked until auth says otherwise
    app.setAuthLocked(true);

    // Default: highlight tool ON
    setHighlightToolEnabled(true);

    initFirebase();
    wireEvents();
    installSwipe();

    if (firebaseReady) {
      firebase.auth().onAuthStateChanged(async (user) => {
        if (user && user.uid) {
          state.uid = user.uid;
          app.setAuthLocked(false);
          try {
            await loadProjectsMeta();
            await loadState();
          } catch {
            // loadProjectsMeta/loadState already show toast on errors
          }
          renderNav();
          renderBlocks();
          setView('reader');
          // Ensure the tool is active on entry
          setHighlightToolEnabled(true);
        } else {
          state.uid = null;
          app.resetInMemoryState();
          renderNav();
          renderBlocks();
          app.setAuthLocked(true);
          try { closeMenu(); } catch {}
        }
      });
    }
  }

  // Expose for other parts
  app.resetImportForm = resetImportForm;
  app.runImport = runImport;
  app.exportAllAsXlsx = exportAllAsXlsx;

  init();
})();
