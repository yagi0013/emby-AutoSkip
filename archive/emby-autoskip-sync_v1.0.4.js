// ==UserScript==
// @name         Emby AutoSkip - Settings Sync Plugin
// @namespace    local.emby.autoskip
// @version      1.0.4
// @description  Optional encrypted settings sync for Emby AutoSkip
// @match        http://*/*
// @match        https://*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (!/\/web(?:\/|$)/i.test(location.pathname)) return;

  const TAG = '[Emby AutoSkip Sync]';
  const PLUGIN_VERSION = '1.0.4';
  const API_VERSION = 1;
  const PROFILE_KEY = 'emby-autoskip-sync-profile-v1';
  const API_BASE_KEY = 'emby-autoskip-sync-api-base-v1';
  const SYNC_CODE_PREFIX = 'EAS1';
  const SYNC_ID_BYTES = 16;
  const SYNC_SECRET_BYTES = 32;
  const REQUEST_TIMEOUT_MS = 10000;
  const PUSH_DELAY_MS = 1500;
  const POLL_INTERVAL_MS = 60000;
  const API_ENTRY_PATH = '/index.php';
  const API_TOKEN_HEADER = 'X-Emby-AutoSkip-Token';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const externalConfig = (
    window.EmbyAutoSkipSyncConfig &&
    typeof window.EmbyAutoSkipSyncConfig === 'object'
  )
    ? window.EmbyAutoSkipSyncConfig
    : {};
  const DEFAULT_API_BASE = String(
    externalConfig.apiBase || ''
  ).trim();

  const runtime = {
    host: null,
    root: null,
    profile: null,
    status: 'disconnected',
    statusLabel: '同期していません',
    statusDetail: '',
    busy: false,
    lastError: '',
    pendingRemote: null,
    revealCode: false,
    changeGeneration: 0,
    pushTimer: 0,
    pollTimer: 0,
    unsubscribe: null
  };

  class SyncApiError extends Error {
    constructor(message, status = 0, code = '') {
      super(message);
      this.name = 'SyncApiError';
      this.status = status;
      this.code = code;
    }
  }

  const isRecord = value => (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );

  function bytesToBase64Url(bytes) {
    let binary = '';

    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }

    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  function base64UrlToBytes(value) {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) {
      throw new Error('同期コードの形式が不正です');
    }

    const padded = value
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  }

  function createSyncCode(syncId, secret) {
    return [
      SYNC_CODE_PREFIX,
      syncId,
      bytesToBase64Url(secret)
    ].join('.');
  }

  function parseSyncCode(raw) {
    const parts = String(raw || '').trim().split('.');

    if (
      parts.length !== 3 ||
      parts[0] !== SYNC_CODE_PREFIX
    ) {
      throw new Error('同期コードの形式が不正です');
    }

    const syncIdBytes = base64UrlToBytes(parts[1]);
    const secret = base64UrlToBytes(parts[2]);

    if (
      syncIdBytes.length !== SYNC_ID_BYTES ||
      secret.length !== SYNC_SECRET_BYTES
    ) {
      throw new Error('同期コードの長さが不正です');
    }

    return {
      syncId: parts[1],
      secret,
      normalized: createSyncCode(parts[1], secret)
    };
  }

  function randomBytes(length) {
    const bytes = new Uint8Array(length);

    crypto.getRandomValues(bytes);
    return bytes;
  }

  function hasCryptoSupport() {
    return !!(
      window.crypto?.subtle &&
      typeof window.crypto.getRandomValues === 'function'
    );
  }

  function currentServerNamespace() {
    return runtime.profile?.serverNamespace ||
      runtime.host?.getServerNamespace?.() || 'test';
  }

  async function deriveKeys(secret) {
    const material = await crypto.subtle.importKey(
      'raw',
      secret,
      'HKDF',
      false,
      ['deriveBits', 'deriveKey']
    );
    const salt = encoder.encode('emby-autoskip-sync-v1');
    const encryptionKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info: encoder.encode('settings-encryption')
      },
      material,
      {name: 'AES-GCM', length: 256},
      false,
      ['encrypt', 'decrypt']
    );
    const authBits = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info: encoder.encode('api-authentication')
      },
      material,
      256
    );

    return {
      encryptionKey,
      authToken: bytesToBase64Url(new Uint8Array(authBits))
    };
  }

  async function encryptSnapshot(snapshot, secret, syncId) {
    const {encryptionKey} = await deriveKeys(secret);
    const iv = randomBytes(12);
    const payload = {
      format: 'emby-autoskip-sync-payload',
      formatVersion: 1,
      serverNamespace: currentServerNamespace(),
      snapshot
    };
    const plaintext = encoder.encode(JSON.stringify(payload));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: encoder.encode(`${SYNC_CODE_PREFIX}:${syncId}`)
      },
      encryptionKey,
      plaintext
    );

    return {
      version: 1,
      algorithm: 'AES-GCM',
      iv: bytesToBase64Url(iv),
      ciphertext: bytesToBase64Url(new Uint8Array(ciphertext))
    };
  }

  async function decryptSnapshot(
    envelope,
    secret,
    syncId,
    options = {}
  ) {
    if (
      !isRecord(envelope) ||
      envelope.version !== 1 ||
      envelope.algorithm !== 'AES-GCM' ||
      typeof envelope.iv !== 'string' ||
      typeof envelope.ciphertext !== 'string'
    ) {
      throw new Error('同期データの暗号化形式が不正です');
    }

    const iv = base64UrlToBytes(envelope.iv);
    const ciphertext = base64UrlToBytes(envelope.ciphertext);

    if (iv.length !== 12) {
      throw new Error('同期データの暗号化形式が不正です');
    }

    const {encryptionKey} = await deriveKeys(secret);
    let plaintext;

    try {
      plaintext = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv,
          additionalData: encoder.encode(`${SYNC_CODE_PREFIX}:${syncId}`)
        },
        encryptionKey,
        ciphertext
      );
    } catch (_) {
      throw new Error('同期コードまたは同期データが不正です');
    }

    let payload;

    try {
      payload = JSON.parse(decoder.decode(plaintext));
    } catch (_) {
      throw new Error('同期データを読み取れません');
    }

    if (
      !isRecord(payload) ||
      payload.format !== 'emby-autoskip-sync-payload' ||
      payload.formatVersion !== 1 ||
      !isRecord(payload.snapshot)
    ) {
      throw new Error('対応していない同期データです');
    }

    const currentNamespace = options.serverNamespace ||
      currentServerNamespace();

    if (payload.serverNamespace !== currentNamespace) {
      throw new Error(
        'この同期コードは別のEmbyサーバー用です'
      );
    }

    const snapshot = payload.snapshot;
    const validateSnapshot = options.validateSnapshot ||
      runtime.host?.validateSnapshot;

    if (typeof validateSnapshot !== 'function') {
      throw new Error('同期データを検証できません');
    }

    validateSnapshot(snapshot);
    return snapshot;
  }

  function normalizeApiBase(raw) {
    let url;

    try {
      url = new URL(String(raw || '').trim());
    } catch (_) {
      throw new Error('同期API URLを入力してください');
    }

    if (url.protocol !== 'https:') {
      throw new Error('同期APIはHTTPS URLを指定してください');
    }

    if (url.username || url.password) {
      throw new Error('認証情報を含む同期API URLは使用できません');
    }

    url.hash = '';
    url.search = '';
    return url.href.replace(/\/$/, '');
  }

  function currentApiBase() {
    if (runtime.profile?.apiBase) return runtime.profile.apiBase;

    try {
      return DEFAULT_API_BASE ||
        localStorage.getItem(API_BASE_KEY) || '';
    } catch (_) {
      return DEFAULT_API_BASE;
    }
  }

  function saveApiBase(value) {
    try {
      localStorage.setItem(API_BASE_KEY, value);
    } catch (_) {}
  }

  function loadProfile() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(PROFILE_KEY) || 'null'
      );

      if (
        !isRecord(saved) ||
        saved.version !== 1 ||
        typeof saved.apiBase !== 'string' ||
        typeof saved.syncId !== 'string' ||
        typeof saved.secret !== 'string' ||
        typeof saved.serverNamespace !== 'string' ||
        !saved.serverNamespace ||
        !Number.isInteger(saved.revision) ||
        saved.revision < 0
      ) return null;

      const parsed = parseSyncCode(
        createSyncCode(
          saved.syncId,
          base64UrlToBytes(saved.secret)
        )
      );

      return {
        version: 1,
        apiBase: normalizeApiBase(saved.apiBase),
        syncId: parsed.syncId,
        secret: bytesToBase64Url(parsed.secret),
        serverNamespace: saved.serverNamespace,
        revision: saved.revision,
        dirty: saved.dirty === true,
        lastSyncedAt: typeof saved.lastSyncedAt === 'string'
          ? saved.lastSyncedAt
          : ''
      };
    } catch (error) {
      console.warn(TAG, '同期設定を読み込めません', error);
      return null;
    }
  }

  function saveProfile() {
    if (!runtime.profile) return;

    try {
      localStorage.setItem(
        PROFILE_KEY,
        JSON.stringify(runtime.profile)
      );
    } catch (error) {
      throw new Error(`同期設定を保存できません: ${error.message}`);
    }
  }

  function removeProfile() {
    try {
      localStorage.removeItem(PROFILE_KEY);
    } catch (_) {}

    runtime.profile = null;
    runtime.pendingRemote = null;
    runtime.revealCode = false;
  }

  function profileSecret() {
    if (!runtime.profile) throw new Error('同期設定がありません');
    return base64UrlToBytes(runtime.profile.secret);
  }

  function profileSyncCode() {
    return createSyncCode(
      runtime.profile.syncId,
      profileSecret()
    );
  }

  async function apiRequest(
    apiBase,
    path,
    {method = 'GET', token = '', body = null} = {}
  ) {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );
    const headers = {'Accept': 'application/json'};

    if (token) headers[API_TOKEN_HEADER] = token;
    if (body !== null) headers['Content-Type'] = 'application/json';

    try {
      const response = await fetch(`${apiBase}${API_ENTRY_PATH}${path}`, {
        method,
        headers,
        body: body === null ? undefined : JSON.stringify(body),
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal
      });
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await response.json()
        : null;

      if (!response.ok) {
        throw new SyncApiError(
          String(data?.message || `同期API HTTP ${response.status}`),
          response.status,
          String(data?.code || '')
        );
      }

      return data;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new SyncApiError('同期APIが応答しませんでした');
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function validateRemoteRecord(data) {
    if (
      !isRecord(data) ||
      !Number.isInteger(data.revision) ||
      data.revision < 1 ||
      !isRecord(data.envelope)
    ) {
      throw new Error('同期APIの応答形式が不正です');
    }

    return data;
  }

  async function credentials(secret = profileSecret()) {
    return deriveKeys(secret);
  }

  async function fetchRemote(profile = runtime.profile) {
    const secret = base64UrlToBytes(profile.secret);
    const {authToken} = await credentials(secret);
    const data = await apiRequest(
      profile.apiBase,
      `/v1/sync/${encodeURIComponent(profile.syncId)}`,
      {token: authToken}
    );

    return validateRemoteRecord(data);
  }

  function formatLastSynced(value) {
    if (!value) return '未完了';

    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '不明';

    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function setStatus(state, label, detail = '') {
    runtime.status = state;
    runtime.statusLabel = label;
    runtime.statusDetail = detail;
    runtime.host.setStatus({state, label, detail});
  }

  function errorMessage(error) {
    if (error instanceof SyncApiError) return error.message;
    return String(error?.message || error || '不明なエラー');
  }

  function setFailure(error) {
    runtime.lastError = errorMessage(error);
    const authorizationError = error instanceof SyncApiError &&
      (error.status === 401 || error.status === 403);

    setStatus(
      authorizationError ? 'error' : 'warning',
      authorizationError
        ? '同期コードを確認してください'
        : '同期できませんでした',
      authorizationError ? '' : '自動再試行します'
    );
    render();
  }

  async function createRemote(apiBase) {
    const syncIdBytes = randomBytes(SYNC_ID_BYTES);
    const secret = randomBytes(SYNC_SECRET_BYTES);
    const syncId = bytesToBase64Url(syncIdBytes);
    const {authToken} = await credentials(secret);
    const envelope = await encryptSnapshot(
      runtime.host.getSnapshot(),
      secret,
      syncId
    );
    const data = validateRemoteRecord(
      await apiRequest(apiBase, '/v1/sync', {
        method: 'POST',
        body: {syncId, authToken, envelope}
      })
    );

    runtime.profile = {
      version: 1,
      apiBase,
      syncId,
      secret: bytesToBase64Url(secret),
      serverNamespace: currentServerNamespace(),
      revision: data.revision,
      dirty: false,
      lastSyncedAt: new Date().toISOString()
    };
    runtime.revealCode = true;
    saveProfile();
    beginWatchingChanges();
    startPolling();
    setStatus('healthy', '正常に同期しています');
    render();
  }

  async function joinRemote(apiBase, rawCode) {
    const parsed = parseSyncCode(rawCode);
    const {authToken} = await credentials(parsed.secret);
    const temporaryProfile = {
      apiBase,
      syncId: parsed.syncId,
      secret: bytesToBase64Url(parsed.secret),
      serverNamespace: currentServerNamespace()
    };
    const data = validateRemoteRecord(
      await apiRequest(
        apiBase,
        `/v1/sync/${encodeURIComponent(parsed.syncId)}`,
        {token: authToken}
      )
    );
    const snapshot = await decryptSnapshot(
      data.envelope,
      parsed.secret,
      parsed.syncId
    );
    const accepted = window.confirm(
      '同期データが見つかりました。現在の設定をJSONへ書き出してから、同期データを適用します。よろしいですか？'
    );

    if (!accepted) return;

    runtime.host.downloadBackup();
    runtime.profile = {
      version: 1,
      ...temporaryProfile,
      revision: data.revision,
      dirty: false,
      lastSyncedAt: new Date().toISOString()
    };
    saveProfile();
    runtime.host.applySnapshot(snapshot);
    beginWatchingChanges();
    startPolling();
    setStatus(
      'healthy',
      '正常に同期しています',
      `最終同期 ${formatLastSynced(runtime.profile.lastSyncedAt)}`
    );
    render();
  }

  async function runVersionedUpload(
    getGeneration,
    getSnapshot,
    upload
  ) {
    const generation = getGeneration();
    const snapshot = getSnapshot();
    const result = await upload(snapshot);

    return {
      result,
      changedDuringUpload: getGeneration() !== generation
    };
  }

  async function pushCurrent(baseRevision = runtime.profile.revision) {
    const secret = profileSecret();
    const {authToken} = await credentials(secret);
    const {result, changedDuringUpload} = await runVersionedUpload(
      () => runtime.changeGeneration,
      () => runtime.host.getSnapshot(),
      async snapshot => {
        const envelope = await encryptSnapshot(
          snapshot,
          secret,
          runtime.profile.syncId
        );

        return apiRequest(
          runtime.profile.apiBase,
          `/v1/sync/${encodeURIComponent(runtime.profile.syncId)}`,
          {
            method: 'PUT',
            token: authToken,
            body: {baseRevision, envelope}
          }
        );
      }
    );
    const validated = validateRemoteRecord(result);

    runtime.profile.revision = validated.revision;
    runtime.profile.dirty = changedDuringUpload;
    runtime.profile.lastSyncedAt = new Date().toISOString();
    runtime.pendingRemote = null;
    saveProfile();

    if (changedDuringUpload) {
      setStatus(
        'pending',
        '同期待ちの変更があります',
        `最終同期 ${formatLastSynced(runtime.profile.lastSyncedAt)}`
      );
      render();
      schedulePush();
      return;
    }

    setStatus(
      'healthy',
      '正常に同期しています',
      `最終同期 ${formatLastSynced(runtime.profile.lastSyncedAt)}`
    );
    render();
  }

  async function applyRemote(remote, makeBackup = false) {
    const snapshot = await decryptSnapshot(
      remote.envelope,
      profileSecret(),
      runtime.profile.syncId
    );

    if (makeBackup) runtime.host.downloadBackup();

    runtime.profile.revision = remote.revision;
    runtime.profile.dirty = false;
    runtime.profile.lastSyncedAt = new Date().toISOString();
    runtime.pendingRemote = null;
    saveProfile();
    runtime.host.applySnapshot(snapshot);
    setStatus(
      'healthy',
      '正常に同期しています',
      `最終同期 ${formatLastSynced(runtime.profile.lastSyncedAt)}`
    );
    render();
  }

  async function syncNow() {
    if (!runtime.profile || runtime.busy) return;

    runtime.busy = true;
    runtime.lastError = '';
    setStatus('connecting', '同期しています…');
    render();

    try {
      const remote = await fetchRemote();

      if (remote.revision < runtime.profile.revision) {
        runtime.pendingRemote = remote;
        setStatus('error', '同期内容が競合しています');
        render();
        return;
      }

      if (remote.revision > runtime.profile.revision) {
        if (runtime.profile.dirty) {
          runtime.pendingRemote = remote;
          setStatus('error', '同期内容が競合しています');
          render();
          return;
        }

        await applyRemote(remote);
        return;
      }

      if (runtime.profile.dirty) {
        await pushCurrent();
        return;
      }

      runtime.profile.lastSyncedAt = new Date().toISOString();
      saveProfile();
      setStatus(
        'healthy',
        '正常に同期しています',
        `最終同期 ${formatLastSynced(runtime.profile.lastSyncedAt)}`
      );
      render();
    } catch (error) {
      if (error instanceof SyncApiError && error.status === 409) {
        try {
          runtime.pendingRemote = await fetchRemote();
          setStatus('error', '同期内容が競合しています');
          render();
        } catch (fetchError) {
          setFailure(fetchError);
        }
      } else {
        setFailure(error);
      }
    } finally {
      runtime.busy = false;
      render();
    }
  }

  function schedulePush() {
    window.clearTimeout(runtime.pushTimer);
    runtime.pushTimer = window.setTimeout(
      () => void syncNow(),
      PUSH_DELAY_MS
    );
  }

  function beginWatchingChanges() {
    if (runtime.unsubscribe || !runtime.profile) return;

    runtime.unsubscribe = runtime.host.onSettingsChanged(() => {
      if (!runtime.profile) return;

      runtime.changeGeneration += 1;
      runtime.profile.dirty = true;
      saveProfile();
      setStatus('pending', '同期待ちの変更があります');
      render();
      schedulePush();
    });
  }

  function stopWatchingChanges() {
    runtime.unsubscribe?.();
    runtime.unsubscribe = null;
    window.clearTimeout(runtime.pushTimer);
    window.clearInterval(runtime.pollTimer);
    runtime.pollTimer = 0;
  }

  function startPolling() {
    if (runtime.pollTimer || !runtime.profile) return;

    runtime.pollTimer = window.setInterval(
      () => void syncNow(),
      POLL_INTERVAL_MS
    );
  }

  async function runBusy(operation) {
    if (runtime.busy) return;

    runtime.busy = true;
    runtime.lastError = '';
    setStatus('connecting', '接続しています…');
    render();

    try {
      await operation();
    } catch (error) {
      setFailure(error);
    } finally {
      runtime.busy = false;
      render();
    }
  }

  function styleButton(button, primary = false) {
    button.type = 'button';
    button.style.cssText = [
      'min-height:31px',
      'border:1px solid #687786',
      'border-radius:7px',
      'padding:5px 8px',
      `background:${primary ? '#356d43' : '#202b36'}`,
      'color:#fff',
      'font:inherit',
      'font-size:11px',
      'cursor:pointer'
    ].join(';');
    return button;
  }

  function makeButton(text, onClick, primary = false) {
    const button = styleButton(document.createElement('button'), primary);

    button.textContent = text;
    button.disabled = runtime.busy;
    button.style.opacity = runtime.busy ? '.55' : '1';
    button.addEventListener('click', onClick);
    return button;
  }

  function textBlock(text, opacity = '.78') {
    const element = document.createElement('div');

    element.textContent = text;
    element.style.cssText = [
      'font-size:11px',
      'line-height:1.5',
      `opacity:${opacity}`
    ].join(';');
    return element;
  }

  function sectionTitle(text) {
    const element = document.createElement('div');

    element.textContent = text;
    element.style.cssText = [
      'margin-top:11px',
      'margin-bottom:6px',
      'font-size:11px',
      'font-weight:600',
      'color:#dbe5ee'
    ].join(';');
    return element;
  }

  function makeInput(placeholder = '') {
    const input = document.createElement('input');

    input.type = 'text';
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.style.cssText = [
      'box-sizing:border-box',
      'width:100%',
      'height:32px',
      'padding:5px 7px',
      'border:1px solid #687786',
      'border-radius:7px',
      'background:#202b36',
      'color:#fff',
      'font:inherit',
      'font-size:11px'
    ].join(';');
    return input;
  }

  function statusCard() {
    const card = document.createElement('div');
    const label = document.createElement('div');
    const detail = document.createElement('div');

    label.textContent = runtime.statusLabel;
    label.style.cssText = 'font-weight:600;font-size:12px';
    detail.textContent = runtime.statusDetail || (
      runtime.profile
        ? `最終同期：${formatLastSynced(runtime.profile.lastSyncedAt)}`
        : '同期は設定されていません'
    );
    detail.style.cssText =
      'margin-top:3px;font-size:10px;opacity:.72;line-height:1.4';
    card.style.cssText = [
      'padding:9px',
      'border:1px solid #526170',
      'border-radius:8px',
      'background:#202b36'
    ].join(';');
    card.append(label, detail);
    return card;
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const input = document.createElement('textarea');
    input.value = value;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.append(input);
    input.select();
    document.execCommand('copy');
    input.remove();
  }

  function downloadSyncCode(value) {
    const url = URL.createObjectURL(
      new Blob([`${value}\n`], {type: 'text/plain'})
    );
    const link = document.createElement('a');

    link.href = url;
    link.download = 'emby-autoskip-sync-code.txt';
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function codePanel() {
    const wrapper = document.createElement('div');
    const code = document.createElement('div');
    const actions = document.createElement('div');
    const syncCode = profileSyncCode();

    code.textContent = runtime.revealCode
      ? syncCode
      : '••••••••••••••••••••••••';
    code.style.cssText = [
      'padding:7px',
      'border:1px solid #526170',
      'border-radius:6px',
      'background:#111920',
      'font:11px monospace',
      'line-height:1.45',
      'overflow-wrap:anywhere',
      'user-select:text'
    ].join(';');
    actions.style.cssText =
      'display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:6px';
    actions.append(
      makeButton(runtime.revealCode ? '隠す' : '表示', () => {
        if (!runtime.revealCode) {
          const accepted = window.confirm(
            '同期コードを知っている人は同期データへアクセスできます。周囲に人がいないことを確認してください。'
          );
          if (!accepted) return;
        }
        runtime.revealCode = !runtime.revealCode;
        render();
      }),
      makeButton('コピー', () => {
        void copyText(syncCode).then(() => {
          runtime.lastError = '';
          setStatus('healthy', '同期コードをコピーしました');
          render();
        }).catch(setFailure);
      }),
      makeButton('保存', () => downloadSyncCode(syncCode))
    );
    wrapper.append(code, actions);
    return wrapper;
  }

  function renderDisconnected(container) {
    const apiInput = makeInput('https://sync.example.com');
    const newButton = makeButton(
      '新しく同期を始める',
      () => void runBusy(async () => {
        const apiBase = normalizeApiBase(apiInput.value);
        saveApiBase(apiBase);
        await createRemote(apiBase);
      }),
      true
    );
    const codeInput = makeInput('EAS1.同期ID.同期キー');
    const joinButton = makeButton(
      '既存の同期に参加',
      () => void runBusy(async () => {
        const apiBase = normalizeApiBase(apiInput.value);
        saveApiBase(apiBase);
        await joinRemote(apiBase, codeInput.value);
      })
    );

    apiInput.value = currentApiBase();
    apiInput.inputMode = 'url';
    newButton.style.width = '100%';
    joinButton.style.width = '100%';

    container.append(
      statusCard(),
      sectionTitle('同期API'),
      apiInput,
      textBlock(
        DEFAULT_API_BASE
          ? '通常は変更不要です。'
          : 'API提供先が決まるまでは、利用するHTTPS APIのURLを指定します。'
      ),
      sectionTitle('新しい同期'),
      textBlock('現在のブラウザー設定を最初の同期データとして登録します。'),
      newButton,
      sectionTitle('既存の同期に参加'),
      textBlock('別のブラウザーで発行された同期コードを入力します。'),
      codeInput,
      joinButton
    );

    if (!hasCryptoSupport()) {
      const warning = textBlock(
        'このページでは暗号化機能を利用できません。HTTPSでEmbyを開いてください。',
        '1'
      );

      warning.style.color = '#ffb4b4';
      container.prepend(warning);
      newButton.disabled = true;
      joinButton.disabled = true;
    }
  }

  function renderConflict(container) {
    const warning = textBlock(
      '別のブラウザーと同時に設定が変更されました。適用する内容を選んでください。',
      '1'
    );
    const actions = document.createElement('div');

    warning.style.color = '#ffd98a';
    actions.style.cssText = 'display:grid;gap:6px;margin-top:7px';
    actions.append(
      makeButton('クラウド設定を適用', () => {
        const accepted = window.confirm(
          '現在の設定をJSONへ書き出してから、クラウド設定を適用します。よろしいですか？'
        );
        if (!accepted) return;

        void runBusy(() => applyRemote(runtime.pendingRemote, true));
      }),
      makeButton('このブラウザーの設定で上書き', () => {
        const accepted = window.confirm(
          'クラウド側の変更をこのブラウザーの設定で上書きします。よろしいですか？'
        );
        if (!accepted) return;

        void runBusy(() => pushCurrent(runtime.pendingRemote.revision));
      }, true)
    );
    container.append(sectionTitle('競合の解決'), warning, actions);
  }

  function renderConnected(container) {
    const syncButton = makeButton(
      '今すぐ同期',
      () => void syncNow(),
      true
    );
    const disconnectButton = makeButton(
      'このブラウザーの同期を解除',
      () => {
        const accepted = window.confirm(
          'このブラウザーの同期だけを解除します。ローカル設定とクラウド上のデータは残ります。よろしいですか？'
        );
        if (!accepted) return;

        stopWatchingChanges();
        removeProfile();
        setStatus('disconnected', '同期していません');
        render();
      }
    );
    const deleteButton = makeButton(
      'クラウド上の同期データを削除',
      () => {
        const confirmation = window.prompt(
          '全端末が同期できなくなります。削除する場合は「削除」と入力してください。'
        );
        if (confirmation !== '削除') return;

        void runBusy(async () => {
          const {authToken} = await credentials();

          await apiRequest(
            runtime.profile.apiBase,
            `/v1/sync/${encodeURIComponent(runtime.profile.syncId)}`,
            {method: 'DELETE', token: authToken}
          );
          stopWatchingChanges();
          removeProfile();
          setStatus('disconnected', '同期データを削除しました');
          render();
        });
      }
    );

    syncButton.style.width = '100%';
    disconnectButton.style.width = '100%';
    deleteButton.style.width = '100%';
    deleteButton.style.color = '#ffb4b4';

    container.append(
      statusCard(),
      syncButton,
      sectionTitle('別のブラウザーを追加'),
      textBlock(
        '同期コードを別のブラウザーへ入力します。コードは第三者へ渡さないでください。'
      ),
      codePanel()
    );

    if (runtime.pendingRemote) renderConflict(container);

    if (runtime.lastError) {
      const error = textBlock(runtime.lastError, '1');

      error.style.cssText += ';margin-top:8px;color:#ffb4b4';
      container.append(error);
    }

    container.append(
      sectionTitle('接続情報'),
      textBlock(`API：${runtime.profile.apiBase}`),
      textBlock(`同期ID：${runtime.profile.syncId.slice(0, 8)}…`),
      sectionTitle('詳細・解除'),
      disconnectButton,
      sectionTitle('危険な操作'),
      deleteButton
    );
  }

  function render() {
    if (!runtime.root) return;

    const content = document.createElement('div');
    content.style.cssText = 'display:grid;gap:7px';

    if (runtime.profile) {
      renderConnected(content);
    } else {
      renderDisconnected(content);
    }

    runtime.root.replaceChildren(content);
  }

  function init(host) {
    if (
      !host ||
      host.apiVersion !== API_VERSION ||
      typeof host.getServerNamespace !== 'function' ||
      typeof host.getSnapshot !== 'function' ||
      typeof host.validateSnapshot !== 'function' ||
      typeof host.applySnapshot !== 'function' ||
      typeof host.mount !== 'function' ||
      typeof host.onSettingsChanged !== 'function' ||
      typeof host.setStatus !== 'function'
    ) {
      throw new Error('対応していないAutoSkip本体です');
    }

    runtime.host = host;
    runtime.root = document.createElement('div');
    runtime.root.dataset.plugin = 'emby-autoskip-sync';
    runtime.profile = loadProfile();
    host.mount(runtime.root);

    if (!hasCryptoSupport()) {
      setStatus('error', '暗号化同期を利用できません');
    } else if (runtime.profile) {
      beginWatchingChanges();
      setStatus(
        runtime.profile.dirty ? 'pending' : 'connecting',
        runtime.profile.dirty
          ? '同期待ちの変更があります'
          : '同期を確認しています…'
      );
      window.setTimeout(() => void syncNow(), 0);
      startPolling();
    } else {
      setStatus('disconnected', '同期していません');
    }

    render();

    return {
      version: PLUGIN_VERSION,
      status: () => ({
        version: PLUGIN_VERSION,
        state: runtime.status,
        connected: !!runtime.profile,
        revision: runtime.profile?.revision || 0,
        dirty: runtime.profile?.dirty === true,
        lastSyncedAt: runtime.profile?.lastSyncedAt || '',
        error: runtime.lastError
      })
    };
  }

  const plugin = Object.freeze({
    version: PLUGIN_VERSION,
    apiVersion: API_VERSION,
    init,
    test: Object.freeze({
      createSyncCode,
      parseSyncCode,
      encryptSnapshot,
      decryptSnapshot,
      normalizeApiBase,
      runVersionedUpload
    })
  });
  let registered = false;

  function register() {
    if (registered) return;

    const core = window.EmbyAutoSkip;

    if (typeof core?.registerSyncPlugin !== 'function') return;

    registered = core.registerSyncPlugin(plugin) === true;
  }

  window.EmbyAutoSkipSyncPlugin = plugin;
  register();
  window.addEventListener('emby-autoskip:ready', register);
})();
