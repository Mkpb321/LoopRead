/* LoopRead — single-page app (split into 4 files)
   Part 1/4: core (state, DOM refs, storage, toast, confirm, helpers)
*/

(() => {
  'use strict';

  const app = (window.LoopRead = window.LoopRead || {});

  const STORAGE_KEY = 'loopread_v1_data';
  const STORAGE_INDEX_KEY = 'loopread_v1_index';

  const els = {
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    navIndex: document.getElementById('navIndex'),
    btnMenu: document.getElementById('btnMenu'),

    btnHighlightTool: document.getElementById('btnHighlightTool'),
    btnClearHighlights: document.getElementById('btnClearHighlights'),

    viewLogin: document.getElementById('view-login'),
    viewReader: document.getElementById('view-reader'),
    viewAdd: document.getElementById('view-add'),
    viewImport: document.getElementById('view-import'),
    viewDelete: document.getElementById('view-delete'),

    viewHide: document.getElementById('view-hide'),

    hideBlocksList: document.getElementById('hideBlocksList'),

    btnHideSave: document.getElementById('btnHideSave'),
    btnHideCancel: document.getElementById('btnHideCancel'),

    blocksContainer: document.getElementById('blocksContainer'),

    deleteCollections: document.getElementById('deleteCollections'),

    menuOverlay: document.getElementById('menuOverlay'),
    menuDrawer: document.getElementById('menuDrawer'),
    menuToReader: document.getElementById('menuToReader'),
    menuToAdd: document.getElementById('menuToAdd'),
    menuToImport: document.getElementById('menuToImport'),
    menuExport: document.getElementById('menuExport'),
    menuToDelete: document.getElementById('menuToDelete'),
    menuToHide: document.getElementById('menuToHide'),
    menuLoadSample: document.getElementById('menuLoadSample'),
    menuClearAll: document.getElementById('menuClearAll'),
    menuLogout: document.getElementById('menuLogout'),

    addForm: document.getElementById('addForm'),
    editors: document.getElementById('editors'),
    btnCancel: document.getElementById('btnCancel'),

    importForm: document.getElementById('importForm'),
    importFile: document.getElementById('importFile'),
    importInfo: document.getElementById('importInfo'),
    btnExport: document.getElementById('btnExport'),
    btnImportCancel: document.getElementById('btnImportCancel'),

    btnDeleteSave: document.getElementById('btnDeleteSave'),
    btnDeleteCancel: document.getElementById('btnDeleteCancel'),

    toast: document.getElementById('toast'),
    toastMsg: document.getElementById('toastMsg'),
    toastClose: document.getElementById('toastClose'),

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

  /** @type {{collections: Array<Array<{title:string, content:string}>>, hiddenBlocks:number[], currentIndex:number, menuOpen:boolean, uid:string|null, confirmOpen:boolean, activeView:string, highlightToolEnabled:boolean}} */
  const state = {
    collections: [],
    hiddenBlocks: [],
    currentIndex: 0,
    menuOpen: false,
    confirmOpen: false,
    uid: null,
    activeView: 'reader',
    highlightToolEnabled: false,
  };

  // --- Global hidden text blocks (by index; 0-based) ---
  let hiddenBlocksSet = new Set();

  function normalizeHiddenBlocks(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    for (const v of list) {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      const i = Math.trunc(n);
      if (i < 0) continue;
      if (seen.has(i)) continue;
      seen.add(i);
      out.push(i);
    }
    out.sort((a, b) => a - b);
    return out;
  }

  function setHiddenBlocks(list) {
    state.hiddenBlocks = normalizeHiddenBlocks(list);
    hiddenBlocksSet = new Set(state.hiddenBlocks);
  }

  function isBlockHidden(idx) {
    return hiddenBlocksSet.has(idx);
  }

  // --- Toast (kein alert für Fehlermeldungen) ---
  let toastTimer = null;

  function hideToast() {
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = null;

    if (els.toastMsg) {
      els.toastMsg.textContent = '';
    } else if (els.toast) {
      // Fallback if markup was not upgraded for some reason
      els.toast.textContent = '';
    }

    if (els.toast) els.toast.hidden = true;
  }

  function showToast(message) {
    const msg = String(message || '').trim();
    if (!msg) return;

    if (els.toastMsg) {
      els.toastMsg.textContent = msg;
    } else {
      // Fallback if markup was not upgraded for some reason
      els.toast.textContent = msg;
    }

    els.toast.hidden = false;

    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      hideToast();
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
    setHiddenBlocks([]);
    const raw = localStorage.getItem(storageKey(STORAGE_KEY));
    const idxRaw = localStorage.getItem(storageKey(STORAGE_INDEX_KEY));

    if (raw) {
      const parsed = safeParse(raw, null);
      if (parsed && Array.isArray(parsed.collections)) {
        state.collections = parsed.collections;
        if (Array.isArray(parsed.hiddenBlocks)) setHiddenBlocks(parsed.hiddenBlocks);
      } else if (parsed && Array.isArray(parsed.hiddenBlocks)) {
        setHiddenBlocks(parsed.hiddenBlocks);
      }
    }

    if (idxRaw !== null) {
      const idx = Number(idxRaw);
      if (Number.isFinite(idx)) state.currentIndex = idx;
    }

    clampIndex();
  }

  function saveState() {
    localStorage.setItem(storageKey(STORAGE_KEY), JSON.stringify({ collections: state.collections, hiddenBlocks: state.hiddenBlocks }));
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
      els.viewDelete.classList.remove('view-active');
      els.viewHide.classList.remove('view-active');
    }
  }

  function resetInMemoryState() {
    state.collections = [];
    state.currentIndex = 0;
    setHiddenBlocks([]);
    // cross-file functions live on app
    if (typeof app.clearHighlights === 'function') app.clearHighlights();
    if (typeof app.setHighlightToolEnabled === 'function') app.setHighlightToolEnabled(false);
  }

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  // Expose core to app namespace
  app.STORAGE_KEY = STORAGE_KEY;
  app.STORAGE_INDEX_KEY = STORAGE_INDEX_KEY;

  app.els = els;
  app.state = state;

  app.normalizeHiddenBlocks = normalizeHiddenBlocks;
  app.setHiddenBlocks = setHiddenBlocks;
  app.isBlockHidden = isBlockHidden;

  app.hideToast = hideToast;
  app.showToast = showToast;

  app.escapeHtml = escapeHtml;
  app.formatContent = formatContent;

  app.showConfirm = showConfirm;
  app.closeConfirm = closeConfirm;

  app.safeParse = safeParse;
  app.storageKey = storageKey;
  app.loadState = loadState;
  app.saveState = saveState;
  app.clampIndex = clampIndex;

  app.setAuthLocked = setAuthLocked;
  app.resetInMemoryState = resetInMemoryState;
  app.scrollTop = scrollTop;
})();
