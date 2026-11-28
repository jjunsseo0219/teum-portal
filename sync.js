(function () {
  'use strict';

  const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const ALLOWED_SET = new Set(ALPHABET.split(''));
  const SYNC_CODE_KEY = 'teum_sync_code_v1';
  const DEVICE_ID_KEY = 'teum_sync_device_v1';
  const LAST_SYNC_KEY = 'teum_sync_last_at_v1';
  const ADMIN_HINT_KEY = 'teum_admin_hint_v1';
  const CHANNEL_NAME = 'teum-sync-v1';
  const SNAPSHOT_HASH_PREFIX = '#teum-snap=';
  const PUSH_DEBOUNCE_MS = 450;

  let callbacks = {
    getSnapshot: () => ({}),
    applySnapshot: () => {},
    onStatusChange: () => {},
    onPublicUpdate: () => {}
  };

  let deviceId = '';
  let activeCode = '';
  let lastSyncedAt = 0;
  let lastAppliedRemoteAt = 0;
  let statusState = 'idle'; // idle | connecting | connected | syncing | error
  let statusMode = 'local-only'; // cloud | local-only
  let statusMessage = '';
  let isApplyingRemote = false;
  let pushTimer = null;
  let unsubscribeRemote = null;
  let unsubscribePublic = null;
  let channel = null;
  let firebaseApp = null;
  let firestoreCtx = null;
  let authCtx = null;
  let adminActive = false;
  let publicOverrides = {
    posts: [],
    deletedPostIds: [],
    forest: [],
    deletedForestIds: [],
    updatedAt: 0
  };
  let qrFactoryPromise = null;

  function loadDeviceId() {
    try {
      let id = localStorage.getItem(DEVICE_ID_KEY);
      if (id && id.length >= 8) return id;
      const bytes = new Uint8Array(8);
      (window.crypto || window.msCrypto).getRandomValues(bytes);
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(DEVICE_ID_KEY, id);
      return id;
    } catch (e) {
      return `dev-${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  function loadLastSyncAt() {
    try {
      const v = Number(localStorage.getItem(LAST_SYNC_KEY) || '0');
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch (e) {
      return 0;
    }
  }

  function saveLastSyncAt(ts) {
    lastSyncedAt = Number(ts) || Date.now();
    try {
      localStorage.setItem(LAST_SYNC_KEY, String(lastSyncedAt));
    } catch (e) {}
  }

  function generateCode() {
    const bytes = new Uint8Array(8);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    let raw = '';
    for (let i = 0; i < 8; i++) {
      raw += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  }

  function normalizeCode(raw) {
    const cleaned = String(raw || '')
      .toUpperCase()
      .replace(/[\s-]+/g, '')
      .replace(/0/g, 'O')
      .replace(/1/g, 'I');
    if (cleaned.length !== 8) return null;
    for (let i = 0; i < cleaned.length; i++) {
      if (!ALLOWED_SET.has(cleaned[i])) return null;
    }
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
  }

  async function sha256Hex(str) {
    try {
      if (window.crypto && window.crypto.subtle && window.TextEncoder) {
        const data = new TextEncoder().encode(str);
        const buf = await window.crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) {}
    // Fallback deterministic 64-hex digest for insecure origins without crypto.subtle
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    let out = '';
    for (let round = 0; round < 8; round++) {
      let a = h1 ^ (round * 0x27d4eb2d);
      let b = h2 ^ (round * 0x165667b1);
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        a = Math.imul(a ^ c, 0x01000193) >>> 0;
        b = Math.imul(b ^ (c + round), 0x85ebca6b) >>> 0;
      }
      out += a.toString(16).padStart(8, '0');
      h1 = a;
      h2 = b;
    }
    return out;
  }

  function getFirebaseConfig() {
    const cfg = window.TEUM_SYNC_CONFIG || {};
    const fb = cfg.firebase && typeof cfg.firebase === 'object' ? cfg.firebase : {};
    return fb;
  }

  function isCloudConfigured() {
    const fb = getFirebaseConfig();
    return Boolean(
      String(fb.projectId || '').trim() &&
      String(fb.apiKey || '').trim()
    );
  }

  function getCollectionName() {
    const cfg = window.TEUM_SYNC_CONFIG || {};
    return String(cfg.collection || 'teum_sync').trim() || 'teum_sync';
  }

  function getPublicCollectionName() {
    const cfg = window.TEUM_SYNC_CONFIG || {};
    return String(cfg.publicCollection || 'teum_public').trim() || 'teum_public';
  }

  function getPublicDocId() {
    const cfg = window.TEUM_SYNC_CONFIG || {};
    return String(cfg.publicDocId || 'portal').trim() || 'portal';
  }

  function getAdminEmail() {
    const cfg = window.TEUM_SYNC_CONFIG || {};
    return String(cfg.adminEmail || 'admin@teum.seojeon').trim() || 'admin@teum.seojeon';
  }

  function getAdminPrefix() {
    const cfg = window.TEUM_SYNC_CONFIG || {};
    return String(cfg.adminPrefix || 'TEUM-ADMIN-').toUpperCase();
  }

  function normalizeAdminCode(raw) {
    const cleaned = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    const prefix = getAdminPrefix();
    if (!cleaned.startsWith(prefix)) return null;
    if (cleaned.length < prefix.length + 6) return null;
    return cleaned;
  }

  async function ensureFirebaseApp() {
    if (firebaseApp) return firebaseApp;
    const fb = getFirebaseConfig();
    const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
    const existing = getApps();
    firebaseApp = existing.length ? existing[0] : initializeApp(fb);
    return firebaseApp;
  }

  async function ensureFirestore() {
    if (firestoreCtx) return firestoreCtx;
    const [app, fs] = await Promise.all([
      ensureFirebaseApp(),
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')
    ]);
    const db = fs.getFirestore(app);
    firestoreCtx = { db, fs };
    return firestoreCtx;
  }

  async function ensureAuth() {
    if (authCtx) return authCtx;
    const [app, fa] = await Promise.all([
      ensureFirebaseApp(),
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js')
    ]);
    const auth = fa.getAuth(app);
    authCtx = { auth, fa };
    return authCtx;
  }

  function emitStatus() {
    try {
      callbacks.onStatusChange(getStatus());
    } catch (e) {}
  }

  function setStatus(nextState, nextMsg) {
    statusState = nextState;
    statusMode = isCloudConfigured() ? 'cloud' : 'local-only';
    statusMessage = nextMsg || '';
    emitStatus();
  }

  function getStatus() {
    return {
      code: activeCode,
      state: statusState,
      mode: isCloudConfigured() ? 'cloud' : 'local-only',
      cloudConfigured: isCloudConfigured(),
      adminActive,
      lastSyncedAt,
      message: statusMessage,
      deviceId
    };
  }

  function normalizePublicDoc(data) {
    const d = data && typeof data === 'object' ? data : {};
    return {
      posts: Array.isArray(d.posts) ? d.posts : [],
      deletedPostIds: Array.isArray(d.deletedPostIds) ? d.deletedPostIds : [],
      forest: Array.isArray(d.forest) ? d.forest : [],
      deletedForestIds: Array.isArray(d.deletedForestIds) ? d.deletedForestIds : [],
      updatedAt: Number(d.updatedAt || 0)
    };
  }

  async function subscribePublicPortal() {
    if (!isCloudConfigured() || unsubscribePublic) return;
    try {
      const { db, fs } = await ensureFirestore();
      const docRef = fs.doc(db, getPublicCollectionName(), getPublicDocId());
      unsubscribePublic = fs.onSnapshot(
        docRef,
        (docSnap) => {
          publicOverrides = docSnap.exists()
            ? normalizePublicDoc(docSnap.data())
            : normalizePublicDoc(null);
          try {
            callbacks.onPublicUpdate(publicOverrides);
          } catch (e) {}
        },
        () => {}
      );
    } catch (e) {}
  }

  async function restoreAdminIfHinted() {
    if (!isCloudConfigured()) return;
    let hinted = false;
    try {
      hinted = localStorage.getItem(ADMIN_HINT_KEY) === '1';
    } catch (e) {}
    if (!hinted) return;
    try {
      const { auth, fa } = await ensureAuth();
      fa.onAuthStateChanged(auth, (user) => {
        const nextActive = Boolean(user);
        if (nextActive !== adminActive) {
          adminActive = nextActive;
          if (!nextActive) {
            try { localStorage.removeItem(ADMIN_HINT_KEY); } catch (e) {}
          }
          emitStatus();
        }
      });
    } catch (e) {}
  }

  async function activateAdmin(raw) {
    const adminCode = normalizeAdminCode(raw);
    if (!adminCode) {
      return { ok: false, error: '관리자 코드 형식이 올바르지 않습니다.' };
    }
    if (!isCloudConfigured()) {
      return { ok: false, error: '클라우드 연결이 설정되지 않았습니다.' };
    }
    try {
      const { auth, fa } = await ensureAuth();
      await fa.signInWithEmailAndPassword(auth, getAdminEmail(), adminCode);
      adminActive = true;
      try {
        localStorage.setItem(ADMIN_HINT_KEY, '1');
      } catch (e) {}
      emitStatus();
      return { ok: true, admin: true };
    } catch (err) {
      return { ok: false, error: '관리자 코드가 올바르지 않습니다.' };
    }
  }

  async function signOutAdmin() {
    adminActive = false;
    try {
      localStorage.removeItem(ADMIN_HINT_KEY);
    } catch (e) {}
    try {
      if (authCtx && authCtx.auth && authCtx.fa) {
        await authCtx.fa.signOut(authCtx.auth);
      } else if (isCloudConfigured()) {
        const { auth, fa } = await ensureAuth();
        await fa.signOut(auth);
      }
    } catch (e) {}
    emitStatus();
  }

  function isAdminActive() {
    return adminActive;
  }

  function getPublicOverrides() {
    return publicOverrides;
  }

  async function savePublicOverrides(next) {
    if (!adminActive) {
      return { ok: false, error: '관리자 권한이 필요합니다.' };
    }
    if (!isCloudConfigured()) {
      return { ok: false, error: '클라우드 연결이 설정되지 않았습니다.' };
    }
    try {
      const { db, fs } = await ensureFirestore();
      const docRef = fs.doc(db, getPublicCollectionName(), getPublicDocId());
      const clean = {
        posts: Array.isArray(next.posts) ? next.posts : [],
        deletedPostIds: Array.isArray(next.deletedPostIds) ? next.deletedPostIds : [],
        forest: Array.isArray(next.forest) ? next.forest : [],
        deletedForestIds: Array.isArray(next.deletedForestIds) ? next.deletedForestIds : [],
        updatedAt: Date.now(),
        version: 1
      };
      await fs.setDoc(docRef, clean);
      publicOverrides = normalizePublicDoc(clean);
      try {
        callbacks.onPublicUpdate(publicOverrides);
      } catch (e) {}
      return { ok: true, data: publicOverrides };
    } catch (err) {
      return { ok: false, error: (err && err.message) || '저장에 실패했습니다.' };
    }
  }

  function safeApplyRemote(payload, remoteTs) {
    if (!payload || typeof payload !== 'object') return;
    isApplyingRemote = true;
    try {
      callbacks.applySnapshot(payload);
      if (remoteTs) {
        lastAppliedRemoteAt = Math.max(lastAppliedRemoteAt, Number(remoteTs) || 0);
        saveLastSyncAt(remoteTs);
      } else {
        saveLastSyncAt(Date.now());
      }
    } finally {
      isApplyingRemote = false;
    }
  }

  function detachRemote() {
    if (pushTimer) {
      window.clearTimeout(pushTimer);
      pushTimer = null;
    }
    if (typeof unsubscribeRemote === 'function') {
      try { unsubscribeRemote(); } catch (e) {}
      unsubscribeRemote = null;
    }
  }

  async function pushToCloud(docRef, fs, payload) {
    const ts = Date.now();
    setStatus('syncing', '');
    await fs.setDoc(docRef, {
      payload,
      updatedAt: ts,
      deviceId,
      version: 1
    });
    saveLastSyncAt(ts);
    setStatus('connected', '');
  }

  async function attachRoom(code, opts) {
    const mode = (opts && opts.mode) || 'resume'; // create | join | resume
    detachRemote();

    activeCode = code;
    try {
      localStorage.setItem(SYNC_CODE_KEY, code);
    } catch (e) {}

    if (!isCloudConfigured()) {
      saveLastSyncAt(Date.now());
      setStatus('connected', '클라우드 키 미입력: 같은 기기 탭 동기화 · 설정 링크 모드');
      return { ok: true, mode: 'local-only', code };
    }

    setStatus('connecting', '클라우드 연결 중...');
    try {
      const [{ db, fs }, roomId] = await Promise.all([ensureFirestore(), sha256Hex(code)]);
      const docRef = fs.doc(db, getCollectionName(), roomId);
      const snap = await fs.getDoc(docRef);

      if (snap.exists()) {
        const data = snap.data() || {};
        const remoteAt = Number(data.updatedAt || 0);
        if (mode === 'join') {
          if (data.payload) safeApplyRemote(data.payload, remoteAt);
        } else if (mode === 'create') {
          await pushToCloud(docRef, fs, callbacks.getSnapshot());
        } else {
          // resume
          if (remoteAt > lastSyncedAt && data.payload) {
            safeApplyRemote(data.payload, remoteAt);
          } else {
            await pushToCloud(docRef, fs, callbacks.getSnapshot());
          }
        }
      } else {
        await pushToCloud(docRef, fs, callbacks.getSnapshot());
      }

      unsubscribeRemote = fs.onSnapshot(
        docRef,
        (docSnap) => {
          if (!docSnap.exists()) return;
          const data = docSnap.data() || {};
          if (data.deviceId === deviceId) return;
          const remoteAt = Number(data.updatedAt || 0);
          if (remoteAt && remoteAt <= lastAppliedRemoteAt) return;
          if (data.payload) {
            safeApplyRemote(data.payload, remoteAt || Date.now());
            setStatus('connected', '');
          }
        },
        (err) => {
          setStatus('error', (err && err.message) || '실시간 수신 오류가 발생했습니다.');
        }
      );

      setStatus('connected', '');
      return { ok: true, mode: 'cloud', code };
    } catch (err) {
      setStatus('error', (err && err.message) || '클라우드 연결에 실패했습니다.');
      return { ok: false, error: (err && err.message) || '연결 실패' };
    }
  }

  function broadcastLocal(payload) {
    if (!channel) return;
    try {
      channel.postMessage({
        type: 'TEUM_SYNC_LOCAL',
        code: activeCode,
        deviceId,
        updatedAt: Date.now(),
        payload
      });
    } catch (e) {}
  }

  function schedulePush() {
    if (isApplyingRemote) return;
    const payload = callbacks.getSnapshot();
    broadcastLocal(payload);

    if (!activeCode) return;
    if (!isCloudConfigured()) {
      saveLastSyncAt(Date.now());
      emitStatus();
      return;
    }

    if (pushTimer) window.clearTimeout(pushTimer);
    setStatus('syncing', '');
    pushTimer = window.setTimeout(async () => {
      pushTimer = null;
      if (!activeCode || !isCloudConfigured()) return;
      try {
        const [{ db, fs }, roomId] = await Promise.all([ensureFirestore(), sha256Hex(activeCode)]);
        const docRef = fs.doc(db, getCollectionName(), roomId);
        await pushToCloud(docRef, fs, callbacks.getSnapshot());
      } catch (err) {
        setStatus('error', (err && err.message) || '저장 동기화에 실패했습니다.');
      }
    }, PUSH_DEBOUNCE_MS);
  }

  async function forceSyncNow() {
    if (!activeCode) return { ok: false, error: '연결된 코드가 없습니다.' };
    if (!isCloudConfigured()) {
      broadcastLocal(callbacks.getSnapshot());
      saveLastSyncAt(Date.now());
      emitStatus();
      return { ok: true, mode: 'local-only' };
    }
    try {
      const [{ db, fs }, roomId] = await Promise.all([ensureFirestore(), sha256Hex(activeCode)]);
      const docRef = fs.doc(db, getCollectionName(), roomId);
      await pushToCloud(docRef, fs, callbacks.getSnapshot());
      return { ok: true, mode: 'cloud' };
    } catch (err) {
      setStatus('error', (err && err.message) || '동기화 실패');
      return { ok: false, error: (err && err.message) || '동기화 실패' };
    }
  }

  async function createCode() {
    const code = generateCode();
    return attachRoom(code, { mode: 'create' });
  }

  async function connectCode(raw) {
    const adminCode = normalizeAdminCode(raw);
    if (adminCode) {
      return activateAdmin(adminCode);
    }
    const norm = normalizeCode(raw);
    if (!norm) {
      return { ok: false, error: '8자리 동기화 코드(예: ABCD-2345) 또는 관리자 코드를 확인해 주세요.' };
    }
    return attachRoom(norm, { mode: 'join' });
  }

  function disconnect() {
    detachRemote();
    activeCode = '';
    lastSyncedAt = 0;
    lastAppliedRemoteAt = 0;
    try {
      localStorage.removeItem(SYNC_CODE_KEY);
      localStorage.removeItem(LAST_SYNC_KEY);
    } catch (e) {}
    setStatus('idle', '');
  }

  function encodeBase64Url(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function decodeBase64Url(token) {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64 + '==='.slice((b64.length + 3) % 4);
    const bin = atob(pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function getBaseUrl() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  function getSyncUrl(code) {
    const c = normalizeCode(code || activeCode);
    if (!c) return getBaseUrl();
    return `${getBaseUrl()}?sync=${encodeURIComponent(c)}`;
  }

  function buildSnapshotUrl() {
    const payload = callbacks.getSnapshot();
    const token = encodeBase64Url(JSON.stringify(payload));
    return `${getBaseUrl()}${SNAPSHOT_HASH_PREFIX}${token}`;
  }

  function applySnapshotHash(hashStr) {
    const h = String(hashStr || window.location.hash || '');
    if (!h.startsWith(SNAPSHOT_HASH_PREFIX)) return false;
    try {
      const token = h.slice(SNAPSHOT_HASH_PREFIX.length);
      const parsed = JSON.parse(decodeBase64Url(token));
      if (parsed && typeof parsed === 'object') {
        safeApplyRemote(parsed, Date.now());
        setStatus(activeCode ? 'connected' : 'idle', '공유 링크에서 설정을 불러왔습니다.');
        return true;
      }
    } catch (e) {}
    return false;
  }

  async function renderQrSvg(container, text) {
    if (!container) return false;
    container.textContent = 'QR 생성 중...';
    try {
      if (!qrFactoryPromise) {
        qrFactoryPromise = import('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm')
          .then((mod) => mod.default || mod);
      }
      const qrcode = await qrFactoryPromise;
      const qr = qrcode(0, 'M');
      qr.addData(String(text || ''));
      qr.make();
      const svgMarkup = qr.createSvgTag({ cellSize: 5, margin: 4, scalable: true });
      const doc = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml');
      const svgEl = doc.documentElement;
      if (svgEl && svgEl.tagName.toLowerCase() === 'svg') {
        svgEl.setAttribute('aria-label', '기기 동기화 QR 코드');
        svgEl.style.width = '100%';
        svgEl.style.height = 'auto';
        svgEl.style.display = 'block';
        container.replaceChildren(document.importNode(svgEl, true));
        return true;
      }
    } catch (e) {}
    container.textContent = '오프라인 상태라 QR 이미지를 불러오지 못했습니다. 아래 코드나 링크를 복사해 주세요.';
    return false;
  }

  function init(opts) {
    callbacks = {
      getSnapshot: (opts && opts.getSnapshot) || (() => ({})),
      applySnapshot: (opts && opts.applySnapshot) || (() => {}),
      onStatusChange: (opts && opts.onStatusChange) || (() => {}),
      onPublicUpdate: (opts && opts.onPublicUpdate) || (() => {})
    };
    deviceId = loadDeviceId();
    lastSyncedAt = loadLastSyncAt();

    subscribePublicPortal();
    restoreAdminIfHinted();

    if ('BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = (ev) => {
          const msg = ev && ev.data;
          if (!msg || msg.type !== 'TEUM_SYNC_LOCAL') return;
          if (msg.deviceId === deviceId) return;
          if (msg.code && activeCode && msg.code !== activeCode) return;
          if (msg.payload) {
            safeApplyRemote(msg.payload, msg.updatedAt || Date.now());
            emitStatus();
          }
        };
      } catch (e) {}
    }

    const hashImported = applySnapshotHash(window.location.hash);

    const urlParams = new URLSearchParams(window.location.search);
    const urlSyncParam = urlParams.get('sync');
    const urlCode = urlSyncParam ? normalizeCode(urlSyncParam) : null;

    if (urlSyncParam || hashImported) {
      try {
        urlParams.delete('sync');
        const qs = urlParams.toString();
        const cleanUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
        window.history.replaceState(null, '', cleanUrl);
      } catch (e) {}
    }

    if (urlCode) {
      attachRoom(urlCode, { mode: 'join' });
      return;
    }

    let savedCode = '';
    try {
      savedCode = normalizeCode(localStorage.getItem(SYNC_CODE_KEY) || '') || '';
    } catch (e) {}

    if (savedCode) {
      attachRoom(savedCode, { mode: 'resume' });
    } else {
      setStatus('idle', hashImported ? '공유 링크에서 설정을 불러왔습니다.' : '');
    }
  }

  window.TEUM_SYNC = {
    init,
    getStatus,
    createCode,
    connectCode,
    disconnect,
    activateAdmin,
    signOutAdmin,
    isAdminActive,
    getPublicOverrides,
    savePublicOverrides,
    schedulePush,
    forceSyncNow,
    getSyncUrl,
    buildSnapshotUrl,
    renderQrSvg,
    normalizeCode
  };
})();
