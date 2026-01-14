/* LoopRead — single-page app (split into 4 files)
   Part 1/4: core (state, DOM refs, Firestore persistence, toast, confirm, helpers)
*/

(() => {
  'use strict';

  const app = (window.LoopRead = window.LoopRead || {});

  // --- DOM refs ---
  const els = {
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    btnMenu: document.getElementById('btnMenu'),

    navIndex: document.getElementById('navIndex'),

    blocksContainer: document.getElementById('blocksContainer'),

    viewReader: document.getElementById('view-reader'),
    viewAdd: document.getElementById('view-add'),
    viewImport: document.getElementById('view-import'),
    viewDelete: document.getElementById('view-delete'),
    viewHide: document.getElementById('view-hide'),
    viewLogin: document.getElementById('view-login'),
    viewProjects: document.getElementById('view-projects'),
    viewNotes: document.getElementById('view-notes'),
    viewHelp: document.getElementById('view-help'),

    editors: document.getElementById('editors'),
    addForm: document.getElementById('addForm'),
    btnSave: document.getElementById('btnSave'),
    btnCancel: document.getElementById('btnCancel'),

    importForm: document.getElementById('importForm'),
    importFile: document.getElementById('importFile'),
    importInfo: document.getElementById('importInfo'),
    btnImport: document.getElementById('btnImport'),
    btnImportCancel: document.getElementById('btnImportCancel'),
    btnExport: document.getElementById('btnExport'),

    deleteCollections: document.getElementById('deleteCollections'),
    btnDeleteSave: document.getElementById('btnDeleteSave'),
    btnDeleteCancel: document.getElementById('btnDeleteCancel'),

    hideBlocksList: document.getElementById('hideBlocksList'),
    btnHideSave: document.getElementById('btnHideSave'),
    btnHideCancel: document.getElementById('btnHideCancel'),

    notesList: document.getElementById('notesList'),
    btnNotesBack: document.getElementById('btnNotesBack'),

    btnHelpBack: document.getElementById('btnHelpBack'),

    // Projects
    projectNewName: document.getElementById('projectNewName'),
    btnCreateProject: document.getElementById('btnCreateProject'),
    projectsList: document.getElementById('projectsList'),
    btnProjectsBack: document.getElementById('btnProjectsBack'),

    // Drawer
    menuOverlay: document.getElementById('menuOverlay'),
    menuDrawer: document.getElementById('menuDrawer'),
    drawerProjectName: document.getElementById('drawerProjectName'),

    menuToReader: document.getElementById('menuToReader'),
    menuToAdd: document.getElementById('menuToAdd'),
    menuToImport: document.getElementById('menuToImport'),
    menuExport: document.getElementById('menuExport'),
    menuToDelete: document.getElementById('menuToDelete'),
    menuToHide: document.getElementById('menuToHide'),
    menuToProjects: document.getElementById('menuToProjects'),
    menuToNotes: document.getElementById('menuToNotes'),
    menuToHelp: document.getElementById('menuToHelp'),

    // menuClearAll intentionally removed (no "Alle Daten löschen" anymore)
    menuClearAll: document.getElementById('menuClearAll'),
    menuLogout: document.getElementById('menuLogout'),

    btnHighlightTool: document.getElementById('btnHighlightTool'),
    btnMarkerTool: document.getElementById('btnMarkerTool'),
    btnClearHighlights: document.getElementById('btnClearHighlights'),

    // Toast
    toast: document.getElementById('toast'),
    toastMsg: document.getElementById('toastMsg'),
    toastClose: document.getElementById('toastClose'),

    // Confirm
    confirmOverlay: document.getElementById('confirmOverlay'),
    confirmBox: document.getElementById('confirmBox'),
    confirmMsg: document.getElementById('confirmMsg'),
    confirmCancel: document.getElementById('confirmCancel'),
    confirmOk: document.getElementById('confirmOk'),

    // Marker note editor (overlay)
    markerNoteOverlay: document.getElementById('markerNoteOverlay'),
    markerNoteBox: document.getElementById('markerNoteBox'),
    markerNoteTitle: document.getElementById('markerNoteTitle'),
    markerNoteSub: document.getElementById('markerNoteSub'),
    markerNoteText: document.getElementById('markerNoteText'),
    markerNoteSave: document.getElementById('markerNoteSave'),
    markerNoteDelete: document.getElementById('markerNoteDelete'),
    markerNoteCancel: document.getElementById('markerNoteCancel'),

    // Login
    loginForm: document.getElementById('loginForm'),
    loginEmail: document.getElementById('loginEmail'),
    loginPassword: document.getElementById('loginPassword'),
    btnLogin: document.getElementById('btnLogin'),
  };

  /** Global app state (in-memory). Collections content comes from Firestore. */
  const state = {
    // Project-scoped data
    collections: [],       // Array<Array<{title:string, content:string}>>
    collectionIds: [],     // Array<string> aligned to collections[]
    collectionIdToIndex: {},

    hiddenBlocks: [],      // project-scoped, by block index (0-based)
    currentIndex: 0,

    markers: [],           // project-scoped, stored in Firestore; each marker uses collectionId (stable)
    pendingMarkerFocusId: null,

    // UI state
    menuOpen: false,
    confirmOpen: false,
    activeView: 'reader',
    highlightToolEnabled: false,
    markerToolEnabled: false,

    // Auth / multi-project
    uid: null,
    projects: [],          // Array<{id:string, name:string}>
    activeProjectId: null,

    // Notes view UI state (set by views)
    notesExpandedMarkerId: null,
  };

  // --- Hidden blocks (project-global; by index) ---
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

  // --- Markers (project-scoped; stored in Firestore) ---
  function normalizeMarkers(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    for (const mk of list) {
      if (!mk || typeof mk !== 'object') continue;

      const id = String(mk.id || '').trim();
      if (!id || seen.has(id)) continue;

      const collectionId = String(mk.collectionId || '').trim();
      const blockIndex = Math.trunc(Number(mk.blockIndex));
      const start = Math.trunc(Number(mk.start));
      const end = Math.trunc(Number(mk.end));

      if (!collectionId) continue;
      if (!Number.isFinite(blockIndex) || !Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (blockIndex < 0 || start < 0 || end < 0) continue;

      const s = Math.min(start, end);
      const e = Math.max(start, end);

      const note = String(mk.note || '');
      const text = String(mk.text || '');
      const createdAt = Number(mk.createdAt) || Date.now();
      const updatedAt = Number(mk.updatedAt) || createdAt;

      seen.add(id);
      out.push({ id, collectionId, blockIndex, start: s, end: e, note, text, createdAt, updatedAt });
    }
    // stable ordering: newest first
    out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return out;
  }

  // --- Collection id helpers ---
  function rebuildCollectionIndexMap() {
    const map = {};
    for (let i = 0; i < (state.collectionIds || []).length; i++) {
      const cid = state.collectionIds[i];
      if (cid) map[cid] = i;
    }
    state.collectionIdToIndex = map;
  }

  function getCollectionIndexById(collectionId) {
    const cid = String(collectionId || '').trim();
    if (!cid) return null;
    const idx = state.collectionIdToIndex?.[cid];
    return Number.isFinite(idx) ? idx : null;
  }

  function getCurrentCollectionId() {
    return state.collectionIds?.[state.currentIndex] || null;
  }

  // --- Toast ---
  let toastTimer = null;

  function hideToast() {
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = null;

    if (els.toastMsg) {
      els.toastMsg.textContent = '';
    } else if (els.toast) {
      els.toast.textContent = '';
    }

    if (els.toast) els.toast.hidden = true;
  }

  function showToast(message) {
    const msg = String(message || '').trim();
    if (!msg) return;

    if (els.toastMsg) {
      els.toastMsg.textContent = msg;
    } else if (els.toast) {
      els.toast.textContent = msg;
    }

    if (els.toast) els.toast.hidden = false;

    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => hideToast(), 3400);
  }

  // --- Formatting helpers ---
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

  // --- In-app confirm modal ---
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

    if (!state.menuOpen && !state.confirmOpen) document.body.style.overflow = '';

    const r = confirmResolver;
    confirmResolver = null;
    if (typeof r === 'function') r(!!result);
  }

  function safeParse(jsonStr, fallback) {
    try { return JSON.parse(jsonStr); } catch { return fallback; }
  }


// --- Local UI persistence (per browser, per user, per project) ---
// Stored locally by design:
//   - activeProjectId
//   - lastReadCollectionId (which collection the user is currently reading)
//   - hiddenBlocks (block indices hidden in the UI)
// This keeps device-specific reading progress/preferences out of Firestore.

const LS_PREFIX = 'loopread:loop-read:v1';

function lsKey(...parts) {
  return [LS_PREFIX, ...parts].join(':');
}

function safeLocalGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeLocalSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function safeLocalRemove(key) {
  try { localStorage.removeItem(key); } catch {}
}

function keyActiveProjectId() {
  if (!state.uid) return null;
  return lsKey('uid', state.uid, 'activeProjectId');
}

function keyHiddenBlocks(projectId) {
  if (!state.uid) return null;
  return lsKey('uid', state.uid, 'project', String(projectId), 'hiddenBlocks');
}

function keyLastReadCollectionId(projectId) {
  if (!state.uid) return null;
  return lsKey('uid', state.uid, 'project', String(projectId), 'lastReadCollectionId');
}

function loadLocalActiveProjectId() {
  const k = keyActiveProjectId();
  if (!k) return null;
  const v = (safeLocalGet(k) || '').trim();
  return v || null;
}

function persistLocalActiveProjectId(projectId) {
  const k = keyActiveProjectId();
  if (!k) return;
  if (!projectId) safeLocalRemove(k);
  else safeLocalSet(k, String(projectId));
}

function loadLocalHiddenBlocks(projectId) {
  const k = keyHiddenBlocks(projectId);
  if (!k) return [];
  const parsed = safeParse(safeLocalGet(k), []);
  return normalizeHiddenBlocks(parsed);
}

function persistLocalHiddenBlocks(projectId, list) {
  const k = keyHiddenBlocks(projectId);
  if (!k) return;
  safeLocalSet(k, JSON.stringify(normalizeHiddenBlocks(list)));
}

function loadLocalLastReadCollectionId(projectId) {
  const k = keyLastReadCollectionId(projectId);
  if (!k) return null;
  const v = (safeLocalGet(k) || '').trim();
  return v || null;
}

function persistLocalLastReadCollectionId(projectId, collectionId) {
  const k = keyLastReadCollectionId(projectId);
  if (!k) return;
  safeLocalSet(k, String(collectionId || ''));
}

function clearLocalProjectUiState(projectId) {
  const k1 = keyHiddenBlocks(projectId);
  const k2 = keyLastReadCollectionId(projectId);
  if (k1) safeLocalRemove(k1);
  if (k2) safeLocalRemove(k2);
}

  // --- Project helpers (in-memory) ---
  function normalizeProjects(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    for (const p of list) {
      if (!p || typeof p !== 'object') continue;
      const id = String(p.id || '').trim();
      const name = String(p.name || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name: name || id });
    }
    return out;
  }

  function getProjectById(projectId) {
    const pid = String(projectId || '').trim();
    if (!pid) return null;
    return (state.projects || []).find(p => p.id === pid) || null;
  }

  function getActiveProjectId() {
    return state.activeProjectId || (state.projects?.[0]?.id ?? null);
  }

  function getActiveProject() {
    const pid = getActiveProjectId();
    return pid ? getProjectById(pid) : null;
  }

  function updateProjectNameUI() {
    if (!els.drawerProjectName) return;
    const p = getActiveProject();
    const name = p?.name ? `– ${p.name}` : '';
    els.drawerProjectName.textContent = name;
  }

  // --- Firestore persistence layer ---
  // Requirements:
  //   - top-level collection: loop-read
  //   - per user doc: loop-read/{uid}
  //   - projects in: loop-read/{uid}/projects/{projectId}
  //   - collections in: .../projects/{projectId}/collections/{collectionId}
  //   - collection content stored in: .../projects/{projectId}/collections/{collectionId} (field: blocks[])
  //   - markers in: .../projects/{projectId}/markers/{markerId}
  //
  // No "1 document pro Projekt" (1MB Risiko): Daten sind pro Sammlung dokumentiert.

  function requireDb() {
    if (!state.uid) throw new Error('Nicht angemeldet.');
    if (!app.db || typeof app.db.collection !== 'function') throw new Error('Firestore ist nicht initialisiert.');
    return app.db;
  }

  function userDocRef() {
    const db = requireDb();
    return db.collection('loop-read').doc(state.uid);
  }

  function projectsColRef() {
    return userDocRef().collection('projects');
  }

  function projectDocRef(projectId) {
    return projectsColRef().doc(String(projectId));
  }

  function collectionsColRef(projectId) {
    return projectDocRef(projectId).collection('collections');
  }

  function collectionDocRef(projectId, collectionId) {
    return collectionsColRef(projectId).doc(String(collectionId));
  }


  function markersColRef(projectId) {
    return projectDocRef(projectId).collection('markers');
  }

  async function ensureUserDoc() {
    const now = Date.now();
    await userDocRef().set({ updatedAt: now }, { merge: true });
  }

  async function persistUserMeta(partial) {
    const now = Date.now();
    await userDocRef().set({ ...(partial || {}), updatedAt: now }, { merge: true });
  }

  function genId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async function setActiveProject(projectId) {
  const pid = String(projectId || '').trim();
  if (!pid) return;
  if (!getProjectById(pid)) return;

  state.activeProjectId = pid;
  persistLocalActiveProjectId(pid);
  updateProjectNameUI();
}

async function createProject(name) {
    const base = String(name || '').trim();
    const safeName = base || `Projekt ${Math.max(1, (state.projects || []).length + 1)}`;
    const id = genId('p');
    const now = Date.now();

    try {
      await ensureUserDoc();
      await projectDocRef(id).set({
        name: safeName,
        createdAt: now,
        updatedAt: now,
      }, { merge: true });

      state.projects = [...(state.projects || []), { id, name: safeName }];
      state.activeProjectId = id;
      persistLocalActiveProjectId(state.activeProjectId);
      updateProjectNameUI();
      persistLocalActiveProjectId(id);
      clearLocalProjectUiState(id);

      // Initialize in-memory project data
      state.collections = [];
      state.collectionIds = [];
      rebuildCollectionIndexMap();
      state.currentIndex = 0;
      setHiddenBlocks([]);
      state.markers = [];
      return id;
    } catch (e) {
      showToast('Projekt konnte nicht erstellt werden.');
      throw e;
    }
  }

  async function renameProject(projectId, newName) {
    const pid = String(projectId || '').trim();
    const nn = String(newName || '').trim();
    const p = getProjectById(pid);
    if (!p) return false;
    if (!nn) return false;

    const now = Date.now();
    try {
      await projectDocRef(pid).set({ name: nn, updatedAt: now }, { merge: true });
      p.name = nn;
      persistLocalActiveProjectId(state.activeProjectId);
      updateProjectNameUI();
      return true;
    } catch (e) {
      showToast('Projektname konnte nicht gespeichert werden.');
      return false;
    }
  }

  async function listDocRefs(querySnap) {
    return querySnap.docs.map(d => d.ref);
  }

  async function commitBatchDeletes(docRefs) {
    const db = requireDb();
    const CHUNK = 450;
    for (let i = 0; i < docRefs.length; i += CHUNK) {
      const batch = db.batch();
      for (const ref of docRefs.slice(i, i + CHUNK)) batch.delete(ref);
      await batch.commit();
    }
  }

  async function deleteCollectionDeep(projectId, collectionId) {
  // Delete collection document.
  await collectionDocRef(projectId, collectionId).delete();
}

  async function deleteMarkersForCollection(projectId, collectionId) {
    const q = markersColRef(projectId).where('collectionId', '==', String(collectionId));
    const snap = await q.get();
    await commitBatchDeletes(await listDocRefs(snap));
  }

  async function deleteProjectDeep(projectId) {
    const pid = String(projectId);

    // Delete collections
    const colsSnap = await collectionsColRef(pid).get();
    for (const d of colsSnap.docs) {
      await deleteCollectionDeep(pid, d.id);
    }

    // Delete markers
    const marksSnap = await markersColRef(pid).get();
    await commitBatchDeletes(await listDocRefs(marksSnap));

    // Delete project doc
    await projectDocRef(pid).delete();
  }

async function deleteProject(projectId) {
  const pid = String(projectId || '').trim();
  if (!pid) return false;
  if (!getProjectById(pid)) return false;

  try {
    await deleteProjectDeep(pid);

    // Local, per-browser UI state for the deleted project
    clearLocalProjectUiState(pid);

    // Update in-memory list
    state.projects = (state.projects || []).filter(p => p.id !== pid);

    // If no projects left, create a new empty one
    if (state.projects.length === 0) {
      await createProject('Standard');
      await loadState();
      return true;
    }

    // Switch active project if needed
    if (state.activeProjectId === pid) {
      state.activeProjectId = state.projects[0].id;
      persistLocalActiveProjectId(state.activeProjectId);
      updateProjectNameUI();
      await loadState();
    }

    return true;
  } catch (e) {
    showToast('Projekt konnte nicht gelöscht werden.');
    return false;
  }
}

  async function loadProjectsMeta() {
    if (!state.uid) return;

    try {
      await ensureUserDoc();
      // Active project is a device/browser preference (local only)
      state.activeProjectId = loadLocalActiveProjectId();


      // Load projects list
      const projSnap = await projectsColRef().orderBy('createdAt', 'asc').get();
      state.projects = projSnap.docs.map(d => {
        const data = d.data() || {};
        return { id: d.id, name: String(data.name || d.id) };
      });

      // Create initial project if empty
      if (!Array.isArray(state.projects) || state.projects.length === 0) {
        await createProject('Standard');
        // createProject already updates activeProjectId and state.projects
      }

      // Validate active project
      if (!state.activeProjectId || !getProjectById(state.activeProjectId)) {
        state.activeProjectId = state.projects[0].id;
        persistLocalActiveProjectId(state.activeProjectId);
      }

      persistLocalActiveProjectId(state.activeProjectId);
      updateProjectNameUI();
    } catch (e) {
      showToast('Konnte Projekte nicht laden.');
      throw e;
    }
  }

  async function loadState() {
    if (!state.uid) return;

    // reset
    setHiddenBlocks([]);
    state.collections = [];
    state.collectionIds = [];
    rebuildCollectionIndexMap();
    state.currentIndex = 0;
    state.markers = [];

    const pid = getActiveProjectId();
    if (!pid) return;

    try {
      // Project UI state is local-only (hidden blocks + last-read collection)

      // collections + blocks
      const colsSnap = await collectionsColRef(pid).orderBy('order', 'asc').get();

      const collections = [];
      const ids = [];

      const loaded = await Promise.all(colsSnap.docs.map(async (cd) => {
  const meta = cd.data() || {};
  let blocks = [];

  const raw = meta.blocks;
  if (Array.isArray(raw) && raw.length > 0) {
    blocks = raw.map(b => ({
      title: String((b && b.title) || ''),
      content: String((b && b.content) || ''),
    }));
  }

  return { id: cd.id, blocks, meta };
}));

// Ensure stable order via meta.order

loaded.sort((a, b) => (Number(a.meta.order) || 0) - (Number(b.meta.order) || 0));

for (const it of loaded) {
  ids.push(it.id);
  collections.push(Array.isArray(it.blocks) ? it.blocks : []);
}

      state.collectionIds = ids;
      state.collections = collections;
      rebuildCollectionIndexMap();
// Apply local-only UI state (per browser)
setHiddenBlocks(loadLocalHiddenBlocks(pid));
const lastCid = loadLocalLastReadCollectionId(pid);
if (lastCid) {
  const idx = getCollectionIndexById(lastCid);
  if (idx != null) state.currentIndex = idx;
}

clampIndex();

      // Initialize local-UI save baseline
      lastSavedHiddenBlocksJson = JSON.stringify(state.hiddenBlocks || []);
      lastSavedLastReadCid = getCurrentCollectionId() || null;

      // markers
      const marksSnap = await markersColRef(pid).orderBy('updatedAt', 'desc').get();
      const marks = marksSnap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
      state.markers = normalizeMarkers(marks);

      // Ensure tools are off on fresh load; highlight/marker decorations are view-driven
      if (typeof app.clearHighlights === 'function') app.clearHighlights();
      if (typeof app.setHighlightToolEnabled === 'function') app.setHighlightToolEnabled(false);
      if (typeof app.setMarkerToolEnabled === 'function') app.setMarkerToolEnabled(false);
    } catch (e) {
      showToast('Konnte Projektdaten nicht laden.');
      throw e;
    }
  }

  // --- Save minimal UI state locally (no Firestore writes) ---
let uiSaveTimer = null;
let lastSavedHiddenBlocksJson = '';
let lastSavedLastReadCid = null;

function persistLocalUiStateNow() {
  if (!state.uid) return;
  const pid = getActiveProjectId();
  if (!pid) return;

  const hiddenJson = JSON.stringify(state.hiddenBlocks || []);
  const lastReadCid = getCurrentCollectionId() || null;

  persistLocalHiddenBlocks(pid, state.hiddenBlocks || []);
  persistLocalLastReadCollectionId(pid, lastReadCid || '');

  lastSavedHiddenBlocksJson = hiddenJson;
  lastSavedLastReadCid = lastReadCid;
}

function saveState() {
  if (!state.uid) return;

  const pid = getActiveProjectId();
  if (!pid) return;

  const hiddenJson = JSON.stringify(state.hiddenBlocks || []);
  const lastReadCid = getCurrentCollectionId() || null;

  const hiddenChanged = hiddenJson !== lastSavedHiddenBlocksJson;
  const lastReadChanged = lastReadCid !== (lastSavedLastReadCid || null);

  if (!hiddenChanged && !lastReadChanged) return;

  // Hidden blocks should be persisted immediately (still local).
  if (hiddenChanged) {
    if (uiSaveTimer) { clearTimeout(uiSaveTimer); uiSaveTimer = null; }
    persistLocalUiStateNow();
    return;
  }

  // lastRead changes can be frequent during navigation: debounce a bit.
  if (uiSaveTimer) clearTimeout(uiSaveTimer);
  uiSaveTimer = setTimeout(() => {
    uiSaveTimer = null;
    persistLocalUiStateNow();
  }, 250);
}

  // --- Collection persistence helpers (content) ---
  async function createCollection(blocks, order) {
  const pid = getActiveProjectId();
  if (!pid) throw new Error('Kein Projekt aktiv.');
  const cid = genId('c');
  const now = Date.now();

  const items = Array.isArray(blocks) ? blocks : [];
  const normalized = items.map(b => ({
    title: String((b && b.title) || '').trim(),
    content: String((b && b.content) || '').trim(),
  }));

  await collectionDocRef(pid, cid).set({
    createdAt: now,
    updatedAt: now,
    order: Number.isFinite(order) ? Math.trunc(order) : 0,
    blocks: normalized,
  }, { merge: true });

  return cid;
}

  async function reindexCollections() {
    const pid = getActiveProjectId();
    if (!pid) return;
    const db = requireDb();

    const CHUNK = 450;
    const ids = state.collectionIds || [];

    for (let i = 0; i < ids.length; i += CHUNK) {
      const batch = db.batch();
      for (let j = i; j < Math.min(ids.length, i + CHUNK); j++) {
        const cid = ids[j];
        batch.set(collectionDocRef(pid, cid), { order: j, updatedAt: Date.now() }, { merge: true });
      }
      await batch.commit();
    }
  }

  async function appendCollections(collections) {
    const list = Array.isArray(collections) ? collections : [];
    if (list.length === 0) return;

    const startOrder = state.collections.length;

    for (let i = 0; i < list.length; i++) {
      const blocks = list[i];
      const cid = await createCollection(blocks, startOrder + i);
      state.collections.push(Array.isArray(blocks) ? blocks : []);
      state.collectionIds.push(cid);
    }
    rebuildCollectionIndexMap();
    clampIndex();
    saveState();
  }

  async function replaceCollections(collections) {
    const pid = getActiveProjectId();
    if (!pid) return;

    // Delete all existing collections + blocks
    const colsSnap = await collectionsColRef(pid).get();
    for (const d of colsSnap.docs) {
      await deleteCollectionDeep(pid, d.id);
    }

    // Clear markers (content changed)
    const marksSnap = await markersColRef(pid).get();
    await commitBatchDeletes(await listDocRefs(marksSnap));

    // Reset in-memory
    state.collections = [];
    state.collectionIds = [];
    rebuildCollectionIndexMap();
    state.currentIndex = 0;
    state.markers = [];
    state.notesExpandedMarkerId = null;

    // Create new
    await appendCollections(collections);

    // Ensure lastRead points to first (or null)
    saveState();
  }

  async function deleteCollectionsByIds(collectionIds) {
    const pid = getActiveProjectId();
    if (!pid) return;

    const ids = (collectionIds || []).map(x => String(x)).filter(Boolean);

    for (const cid of ids) {
      await deleteMarkersForCollection(pid, cid);
      await deleteCollectionDeep(pid, cid);
    }
  }

  async function deleteCollectionsByIndices(indices) {
    const marked = Array.isArray(indices) ? indices.map(i => Math.trunc(Number(i))).filter(i => Number.isFinite(i) && i >= 0) : [];
    if (marked.length === 0) return;

    // Convert to ids (stable)
    const ids = marked.map(i => state.collectionIds?.[i]).filter(Boolean);

    await deleteCollectionsByIds(ids);

    // Update in-memory arrays
    const markedSet = new Set(marked);
    state.collections = (state.collections || []).filter((_, idx) => !markedSet.has(idx));
    state.collectionIds = (state.collectionIds || []).filter((_, idx) => !markedSet.has(idx));
    rebuildCollectionIndexMap();

    // Remove local markers for deleted collections
    const idsSet = new Set(ids);
    state.markers = (state.markers || []).filter(m => !idsSet.has(m.collectionId));

    clampIndex();

    // Reindex order fields
    await reindexCollections();

    // Persist last read
    saveState();
  }

  // --- Marker persistence helpers ---
  async function persistMarkerUpsert(marker) {
    const pid = getActiveProjectId();
    if (!pid) return;

    const mk = marker || {};
    const id = String(mk.id || '').trim();
    const cid = String(mk.collectionId || '').trim();

    if (!id || !cid) return;

    const bi = Math.trunc(Number(mk.blockIndex));
    const st = Math.trunc(Number(mk.start));
    const en = Math.trunc(Number(mk.end));

    // Guard against invalid marker payloads (Firestore rejects NaN/Infinity)
    if (!Number.isFinite(bi) || !Number.isFinite(st) || !Number.isFinite(en)) {
      showToast('Ungültige Markierung.');
      return;
    }

    const data = {
      collectionId: cid,
      blockIndex: bi,
      start: st,
      end: en,
      note: String(mk.note || ''),
      text: String(mk.text || ''),
      createdAt: Number(mk.createdAt) || Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await markersColRef(pid).doc(id).set(data, { merge: true });
    } catch (e) {
      showToast('Konnte Markierung nicht speichern.');
      throw e;
    }
  }

  async function persistMarkerDelete(markerId) {
    const pid = getActiveProjectId();
    if (!pid) return;

    const id = String(markerId || '').trim();
    if (!id) return;

    try {
      await markersColRef(pid).doc(id).delete();
    } catch (e) {
      showToast('Konnte Markierung nicht löschen.');
      throw e;
    }
  }

  // --- Misc ---
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
      els.viewProjects?.classList.remove('view-active');
      els.viewNotes?.classList.remove('view-active');
      els.viewHelp?.classList.remove('view-active');
    }
  }

  function resetInMemoryState() {
    state.collections = [];
    state.collectionIds = [];
    rebuildCollectionIndexMap();
    state.currentIndex = 0;
    state.markers = [];
    state.pendingMarkerFocusId = null;
    state.notesExpandedMarkerId = null;
    setHiddenBlocks([]);

    if (typeof app.clearHighlights === 'function') app.clearHighlights();
    if (typeof app.setHighlightToolEnabled === 'function') app.setHighlightToolEnabled(false);
    if (typeof app.setMarkerToolEnabled === 'function') app.setMarkerToolEnabled(false);
  }

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  // --- Expose ---
  app.els = els;
  app.state = state;

  app.safeParse = safeParse;

  app.normalizeHiddenBlocks = normalizeHiddenBlocks;
  app.setHiddenBlocks = setHiddenBlocks;
  app.isBlockHidden = isBlockHidden;

  app.normalizeMarkers = normalizeMarkers;
  app.getCurrentCollectionId = getCurrentCollectionId;
  app.getCollectionIndexById = getCollectionIndexById;
  app.rebuildCollectionIndexMap = rebuildCollectionIndexMap;

  app.hideToast = hideToast;
  app.showToast = showToast;

  app.escapeHtml = escapeHtml;
  app.formatContent = formatContent;

  app.showConfirm = showConfirm;
  app.closeConfirm = closeConfirm;

  app.loadProjectsMeta = loadProjectsMeta;
  app.getProjectById = getProjectById;
  app.getActiveProjectId = getActiveProjectId;
  app.getActiveProject = getActiveProject;
  app.setActiveProject = setActiveProject;
  app.createProject = createProject;
  app.renameProject = renameProject;
  app.deleteProject = deleteProject;
  app.updateProjectNameUI = updateProjectNameUI;

  app.loadState = loadState;
  app.saveState = saveState;
  app.clampIndex = clampIndex;

  app.appendCollections = appendCollections;
  app.replaceCollections = replaceCollections;
  app.deleteCollectionsByIndices = deleteCollectionsByIndices;

  app.persistMarkerUpsert = persistMarkerUpsert;
  app.persistMarkerDelete = persistMarkerDelete;

  app.setAuthLocked = setAuthLocked;
  app.resetInMemoryState = resetInMemoryState;
  app.scrollTop = scrollTop;
})();
