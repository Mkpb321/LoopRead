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

  // --- PDF Export (current project; selectable text; full Unicode via embedded font) ---
  let _pdfFontB64 = null;
  let _pdfFontName = null;
  let _pdfFontFile = null;

  function arrayBufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function ensurePdfFont(doc) {
    // Prefer Times New Roman if the user provides it (cannot be bundled due to licensing).
    // Fallback to bundled DejaVu Serif (Times-like, full Unicode for Latin/Greek/Hebrew).
    if (!_pdfFontB64 || !_pdfFontName || !_pdfFontFile) {
      const candidates = [
        { url: 'fonts/TimesNewRoman.ttf', file: 'TimesNewRoman.ttf', name: 'TimesNewRoman' },
        { url: 'fonts/DejaVuSerif.ttf', file: 'DejaVuSerif.ttf', name: 'DejaVuSerif' },
        { url: 'fonts/DejaVuSans.ttf', file: 'DejaVuSans.ttf', name: 'DejaVuSans' }
      ];
      let loaded = false;
      for (const c of candidates) {
        try {
          const res = await fetch(c.url, { cache: 'force-cache' });
          if (!res || !res.ok) continue;
          const buf = await res.arrayBuffer();
          _pdfFontB64 = arrayBufferToBase64(buf);
          _pdfFontName = c.name;
          _pdfFontFile = c.file;
          loaded = true;
          break;
        } catch (_) { /* ignore */ }
      }
      if (!loaded) {
        throw new Error('Schriftart konnte nicht geladen werden. Bitte die App ueber einen Webserver bereitstellen.');
      }
    }

    // Register once per document.
    try {
      doc.addFileToVFS(_pdfFontFile, _pdfFontB64);
      doc.addFont(_pdfFontFile, _pdfFontName, 'normal');
      doc.setFont(_pdfFontName, 'normal');
    } catch (_) {
      // If the font is already registered, jsPDF may throw; ignore and set font.
      try { doc.setFont(_pdfFontName, 'normal'); } catch { /* ignore */ }
    }
  }
  function hasHebrew(s) {
    return /[\u0590-\u05FF]/.test(String(s ?? ''));
  }

  function isMostlyHebrew(s) {
    const str = String(s ?? '');
    let he = 0;
    let letters = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if ((code >= 0x0590 && code <= 0x05FF)) { he++; letters++; continue; }
      // Roughly count non-space visible chars as "letters".
      if (str[i] && str[i] !== ' ' && str[i] !== '\n' && str[i] !== '\t' && str[i] !== '\r') letters++;
    }
    if (letters === 0) return false;
    return he / letters >= 0.35;
  }

  function wrapText(doc, text, maxWidth) {
    const raw = String(text ?? '').replace(/\r\n/g, '\n');
    const paras = raw.split('\n');
    /** @type {string[]} */
    const out = [];

    const breakOverlong = (line) => {
      const s = String(line ?? '');
      if (!s) return [''];
      if (doc.getTextWidth(s) <= maxWidth + 0.5) return [s];
      const parts = [];
      let cur = '';
      for (const ch of s) {
        const next = cur + ch;
        if (cur && doc.getTextWidth(next) > maxWidth + 0.5) {
          parts.push(cur);
          cur = ch;
        } else {
          cur = next;
        }
      }
      if (cur) parts.push(cur);
      return parts.length ? parts : [''];
    };

    for (let p = 0; p < paras.length; p++) {
      const para = paras[p];
      if (para.trim() === '') {
        out.push('');
        continue;
      }
      const lines = doc.splitTextToSize(para, maxWidth) || [];
      for (const ln of lines) out.push(...breakOverlong(ln));
    }
    return out;
  }

  function measureLinesHeight(lineCount, fontSizePt, lineHeightFactor) {
    return lineCount * fontSizePt * lineHeightFactor;
  }

  function setDocRtl(doc, enabled) {
    if (typeof doc.setR2L === 'function') {
      try { doc.setR2L(!!enabled); } catch { /* ignore */ }
    }
  }

  function drawWrappedLines(doc, lines, xLeft, xRight, yStart, fontSizePt, lineHeightFactor, rtl) {
    let y = yStart;
    const step = fontSizePt * lineHeightFactor;
    setDocRtl(doc, rtl);
    for (const line of lines) {
      if (line === '') {
        y += step;
        continue;
      }
      if (rtl) {
        doc.text(String(line), xRight, y, { align: 'right' });
      } else {
        doc.text(String(line), xLeft, y);
      }
      y += step;
    }
    setDocRtl(doc, false);
    return y;
  }

  async function exportCurrentProjectAsPdf() {
    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) {
      showToast('PDF-Export-Bibliothek nicht geladen.');
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

    showToast('PDF wird erstellt …');

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWpt = doc.internal.pageSize.getWidth();
    const pageHpt = doc.internal.pageSize.getHeight();
    const paddingX = 56;
    const paddingTop = 84; // more top space
    const paddingBottom = 56;
    const contentW = pageWpt - paddingX * 2;
    const contentH = pageHpt - paddingTop - paddingBottom;

    try {
      await ensurePdfFont(doc);
    } catch (e) {
      showToast(e?.message || 'Schriftart fuer PDF konnte nicht geladen werden.');
      return;
    }

    const normalizeText = (t) => String(t ?? '').replace(/\r\n/g, '\n').trim();

    // Titelseite: Block-Titel der allerersten Sammlung als "Blockinhalt".
    const titlePageBlocks = (Array.isArray(state.collections[0]) ? state.collections[0] : [])
      .map(b => String(b?.title ?? '').trim())
      .filter(t => t.length > 0)
      .map(t => normalizeText(t));

    /** @type {{blocks:string[]}[]} */
    const pages = [];
    if (titlePageBlocks.length > 0) pages.push({ blocks: titlePageBlocks });
    for (let ci = 0; ci < state.collections.length; ci++) {
      const blocks = Array.isArray(state.collections[ci]) ? state.collections[ci] : [];
      const contents = blocks.map(b => normalizeText(b?.content ?? ''));
      pages.push({ blocks: contents });
    }

    // Blocks 2..n should be half the previous size (was 20).
    const OTHER_FS = 15;
    const OTHER_LH = 1.12;
    const FIRST_LH = 1.7;
    const GAP = 26; // bigger gap between blocks
    const FIRST_MIN = 10;
    const FIRST_MAX = 52;
    // Last-resort downscale if a page would overflow vertically.
    const OTHER_MIN = 10;

    const renderPage = (pageBlocks) => {
      const blocks = Array.isArray(pageBlocks) ? pageBlocks : [];
      const xLeft = paddingX;
      const xRight = pageWpt - paddingX;
      let y = paddingTop;

      // Prepare wrapped lines for blocks 2..n at fixed size.
      const wrappedOther = [];
      let otherTotalH = 0;
      doc.setFontSize(OTHER_FS);
      for (let i = 1; i < blocks.length; i++) {
        const txt = blocks[i] ?? '';
        const lines = wrapText(doc, txt, contentW);
        wrappedOther.push(lines);
        otherTotalH += measureLinesHeight(lines.length, OTHER_FS, OTHER_LH);
      }

      const gapsTotal = blocks.length > 1 ? (blocks.length - 1) * GAP : 0;

      // Determine best first-block font size so everything fits on one page.
      let bestFirstFs = FIRST_MIN;
      let firstLinesBest = [''];
      let lo = FIRST_MIN;
      let hi = FIRST_MAX;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        doc.setFontSize(mid);
        const lines0 = wrapText(doc, blocks[0] ?? '', contentW);
        const h0 = measureLinesHeight(lines0.length, mid, FIRST_LH);
        const total = h0 + otherTotalH + gapsTotal;
        if (total <= contentH + 0.5) {
          bestFirstFs = mid;
          firstLinesBest = lines0;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      // If still doesn't fit, shrink OTHER font as last resort (keeps 1 page per collection).
      let otherFs = OTHER_FS;
      let wrappedOtherFinal = wrappedOther;
      if (blocks.length > 1) {
        const fitsWith = (fsOther) => {
          doc.setFontSize(fsOther);
          let h = 0;
          const arr = [];
          for (let i = 1; i < blocks.length; i++) {
            const lines = wrapText(doc, blocks[i] ?? '', contentW);
            arr.push(lines);
            h += measureLinesHeight(lines.length, fsOther, OTHER_LH);
          }
          doc.setFontSize(bestFirstFs);
          const h0 = measureLinesHeight(firstLinesBest.length, bestFirstFs, FIRST_LH);
          return { ok: (h0 + h + gapsTotal) <= contentH + 0.5, arr, hOther: h };
        };

        let probe = fitsWith(otherFs);
        while (!probe.ok && otherFs > OTHER_MIN) {
          otherFs -= 1;
          probe = fitsWith(otherFs);
        }
        wrappedOtherFinal = probe.arr;
      }

      // Draw first block
      if (blocks.length > 0) {
        doc.setFontSize(bestFirstFs);
        const rtl0 = isMostlyHebrew(blocks[0] ?? '');
        y = drawWrappedLines(doc, firstLinesBest, xLeft, xRight, y, bestFirstFs, FIRST_LH, rtl0);
        if (blocks.length > 1) y += GAP;
      }

      // Draw remaining blocks
      doc.setFontSize(otherFs);
      for (let bi = 1; bi < blocks.length; bi++) {
        const lines = wrappedOtherFinal[bi - 1] || [''];
        const rtl = isMostlyHebrew(blocks[bi] ?? '');
        y = drawWrappedLines(doc, lines, xLeft, xRight, y, otherFs, OTHER_LH, rtl);
        if (bi < blocks.length - 1) y += GAP;
      }

      // Safety: if a line contains Hebrew but not "mostly" (mixed), keep alignment but avoid R2L flip.
      // (This keeps copy/paste more predictable for mixed content.)
      // We already handle rtl per block; mixed blocks remain LTR.
    };

    for (let i = 0; i < pages.length; i++) {
      if (i > 0) doc.addPage();
      renderPage(pages[i].blocks);
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
