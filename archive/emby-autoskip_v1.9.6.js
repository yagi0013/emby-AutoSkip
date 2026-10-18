// ==UserScript==
// @name         Emby AutoSkip - First Play + Undo
// @namespace    local.emby.autoskip
// @version      1.9.6
// @description  Intro / OP / Outro auto skip with first-play rules, manual skip and undo
// @match        http://*/*
// @match        https://*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // Emby Web以外では動作しない
  if (!/\/web(?:\/|$)/i.test(location.pathname)) return;

  const TAG = '[Emby AutoSkip]';
  const TICKS = 10000000;
  const STORE_KEY = 'emby-autoskip-settings-v17';
  const LEGACY_STORE_KEY = 'emby-autoskip-settings-v13';
  const TAB_KEY = 'emby-autoskip-edge-position-v14';
  const SERIES_KEY = 'emby-autoskip-series-settings-v17';
  const LEGACY_SERIES_KEY =
    'emby-autoskip-series-settings-v16';
  const HISTORY_KEY = 'emby-autoskip-first-play-history-v17';
  const ADVANCED_STORE_KEY =
    'emby-autoskip-advanced-settings-v1';
  const SCRIPT_VERSION = '1.9.6';
  const BACKUP_FORMAT = 'emby-autoskip-settings-backup';
  const BACKUP_FORMAT_VERSION = 1;
  const BACKUP_MAX_BYTES = 2 * 1024 * 1024;

  // =====================================
  // 初期値（時間はすべて秒）
  // =====================================

  const DEFAULT_CONFIG = Object.freeze({
    countdownLeadSeconds: 30,
    undoDisplaySeconds: 5,
    cancelFeedbackSeconds: 1.4,
    drawerAnimationSeconds: 0.28,
    actionAnimationSeconds: 0.22,
    sessionRefreshSeconds: 2.5,
    skipCheckSeconds: 0.3,
    maxSkipRangeSeconds: 360,
    nextChapterMaxGapSeconds: 210,
    nonOutroStartLimitSeconds: 1200,
    rangeEndGuardSeconds: 0.35
  });
  const CONFIG = {...DEFAULT_CONFIG};
  const ADVANCED_CONFIG_FIELDS = Object.freeze({
    countdownLeadSeconds: {min: 1, max: 120, step: 1},
    undoDisplaySeconds: {min: 1, max: 30, step: 1},
    drawerAnimationSeconds: {min: 0, max: 1.5, step: 0.05},
    actionAnimationSeconds: {min: 0, max: 1.5, step: 0.05}
  });
  const CANCEL_LABEL = 'キャンセル';
  const POLICIES = ['play', 'first', 'skip'];

  // =====================================
  // 設定
  // =====================================

  const settings = {
    intro: true,
    op: 'skip',
    outro: 'play',
    manualSkipButton: true,
    countdown: true
  };

  const skipTypes = ['intro', 'op', 'outro'];

  let seriesSettings = {};
  let firstPlayHistory = {};

  try {
    const saved = JSON.parse(
      localStorage.getItem(ADVANCED_STORE_KEY) || '{}'
    );

    for (const [key, limits] of Object.entries(
      ADVANCED_CONFIG_FIELDS
    )) {
      const value = Number(saved?.[key]);

      if (Number.isFinite(value)) {
        CONFIG[key] = Math.max(
          limits.min,
          Math.min(limits.max, value)
        );
      }
    }
  } catch (_) {}

  const toPolicy = (value, fallback) => {
    if (POLICIES.includes(value)) return value;
    if (typeof value === 'boolean') {
      return value ? 'skip' : 'play';
    }
    return fallback;
  };

  // 旧バージョンの設定を引き継ぐ
  try {
    const current = localStorage.getItem(STORE_KEY);
    const saved = JSON.parse(
      current ||
      localStorage.getItem(LEGACY_STORE_KEY) ||
      '{}'
    );

    if (typeof saved.intro === 'boolean') {
      settings.intro = saved.intro;
    }
    if (typeof saved.countdown === 'boolean') {
      settings.countdown = saved.countdown;
    }
    if (typeof saved.manualSkipButton === 'boolean') {
      settings.manualSkipButton = saved.manualSkipButton;
    }
    settings.op = toPolicy(saved.op, settings.op);
    settings.outro = toPolicy(saved.outro, settings.outro);
  } catch (_) {}

  try {
    const current = localStorage.getItem(SERIES_KEY);
    const saved = JSON.parse(
      current ||
      localStorage.getItem(LEGACY_SERIES_KEY) ||
      '{}'
    );

    if (
      saved &&
      typeof saved === 'object' &&
      !Array.isArray(saved)
    ) {
      seriesSettings = Object.fromEntries(
        Object.entries(saved).map(([id, rule]) => [
          id,
          {
            intro: typeof rule?.intro === 'boolean'
              ? rule.intro
              : settings.intro,
            op: toPolicy(rule?.op, settings.op),
            outro: toPolicy(rule?.outro, settings.outro),
            useGlobal: rule?.useGlobal === true
          }
        ])
      );
    }
  } catch (_) {}

  try {
    const saved = JSON.parse(
      localStorage.getItem(HISTORY_KEY) || '{}'
    );

    if (
      saved &&
      typeof saved === 'object' &&
      !Array.isArray(saved)
    ) {
      firstPlayHistory = saved;
    }
  } catch (_) {}

  const state = {
    mode: 'starting',
    id: '',
    title: '',
    seriesId: '',
    seriesName: '',
    seasonId: '',
    seasonName: '',
    seasonNumber: '',
    scopeKey: '',
    scopeKind: '',
    scopeResolved: false,
    autoSkipSuspended: false,
    suspensionItemId: '',
    suspensionStartTime: 0,
    suspensionMaxTime: 0,
    chapters: [],
    ranges: [],
    apiBase: '',
    lastError: '',
    sessions: [],
    busy: false,
    skipped: new Set(),
    cancelled: new Set(),
    firstWatching: null,
    undo: null,
    generation: 0,
    lastDuration: 0
  };

  const log = (...args) => console.log(TAG, ...args);

  function saveSettings() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify(settings)
      );
    } catch (error) {
      console.warn(TAG, '全体設定を保存できません', error);
    }
  }

  function saveAdvancedSettings() {
    try {
      localStorage.setItem(
        ADVANCED_STORE_KEY,
        JSON.stringify(
          Object.fromEntries(
            Object.keys(ADVANCED_CONFIG_FIELDS).map(key => [
              key,
              CONFIG[key]
            ])
          )
        )
      );
    } catch (error) {
      console.warn(TAG, '詳細設定を保存できません', error);
    }
  }

  function saveSeriesSettings() {
    try {
      localStorage.setItem(
        SERIES_KEY,
        JSON.stringify(seriesSettings)
      );
    } catch (error) {
      console.warn(TAG, 'シリーズ設定を保存できません', error);
    }
  }

  function saveFirstPlayHistory() {
    try {
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(firstPlayHistory)
      );
    } catch (error) {
      console.warn(TAG, '初回再生履歴を保存できません', error);
    }
  }

  const isRecord = value => (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );

  function exportedAdvancedSettings() {
    return Object.fromEntries(
      Object.keys(ADVANCED_CONFIG_FIELDS).map(key => [
        key,
        CONFIG[key]
      ])
    );
  }

  function createSettingsBackup() {
    let tabPosition = null;

    try {
      const rawPosition = localStorage.getItem(TAB_KEY);
      const savedPosition = Number(rawPosition);

      if (
        rawPosition !== null &&
        Number.isFinite(savedPosition) &&
        savedPosition >= 0 &&
        savedPosition <= 1
      ) {
        tabPosition = savedPosition;
      }
    } catch (_) {}

    return {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: SCRIPT_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        settings: {...settings},
        advancedSettings: exportedAdvancedSettings(),
        seriesSettings: JSON.parse(
          JSON.stringify(seriesSettings)
        ),
        firstPlayHistory: JSON.parse(
          JSON.stringify(firstPlayHistory)
        ),
        tabPosition
      }
    };
  }

  function validateSettingsBackup(backup) {
    if (
      !isRecord(backup) ||
      backup.format !== BACKUP_FORMAT ||
      backup.formatVersion !== BACKUP_FORMAT_VERSION ||
      !isRecord(backup.data)
    ) {
      throw new Error('対応していないバックアップ形式です');
    }

    const data = backup.data;
    const importedSettings = data.settings;

    if (
      !isRecord(importedSettings) ||
      typeof importedSettings.intro !== 'boolean' ||
      !POLICIES.includes(importedSettings.op) ||
      !POLICIES.includes(importedSettings.outro) ||
      typeof importedSettings.countdown !== 'boolean' ||
      (
        importedSettings.manualSkipButton !== undefined &&
        typeof importedSettings.manualSkipButton !== 'boolean'
      )
    ) {
      throw new Error('全体設定の内容が不正です');
    }

    if (!isRecord(data.advancedSettings)) {
      throw new Error('詳細設定の内容が不正です');
    }

    const importedAdvanced = {};

    for (const [key, limits] of Object.entries(
      ADVANCED_CONFIG_FIELDS
    )) {
      const value = data.advancedSettings[key];

      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < limits.min ||
        value > limits.max
      ) {
        throw new Error(`詳細設定「${key}」が不正です`);
      }

      importedAdvanced[key] = value;
    }

    if (!isRecord(data.seriesSettings)) {
      throw new Error('シリーズ設定の内容が不正です');
    }

    const importedSeries = Object.create(null);

    for (const [id, rule] of Object.entries(
      data.seriesSettings
    )) {
      if (
        !id ||
        !isRecord(rule) ||
        typeof rule.intro !== 'boolean' ||
        !POLICIES.includes(rule.op) ||
        !POLICIES.includes(rule.outro) ||
        typeof rule.useGlobal !== 'boolean'
      ) {
        throw new Error(`シリーズ設定「${id || '(空)'}」が不正です`);
      }

      importedSeries[id] = {
        intro: rule.intro,
        op: rule.op,
        outro: rule.outro,
        useGlobal: rule.useGlobal
      };
    }

    if (!isRecord(data.firstPlayHistory)) {
      throw new Error('初回再生履歴の内容が不正です');
    }

    const importedHistory = Object.create(null);

    for (const [id, history] of Object.entries(
      data.firstPlayHistory
    )) {
      if (!id || !isRecord(history)) {
        throw new Error(`初回再生履歴「${id || '(空)'}」が不正です`);
      }

      const normalized = {};

      for (const type of ['op', 'outro']) {
        if (
          history[type] !== undefined &&
          typeof history[type] !== 'boolean'
        ) {
          throw new Error(`初回再生履歴「${id}」が不正です`);
        }

        if (history[type] === true) normalized[type] = true;
      }

      importedHistory[id] = normalized;
    }

    const tabPosition = data.tabPosition;

    if (
      tabPosition !== null &&
      (
        typeof tabPosition !== 'number' ||
        !Number.isFinite(tabPosition) ||
        tabPosition < 0 ||
        tabPosition > 1
      )
    ) {
      throw new Error('タブ位置の内容が不正です');
    }

    return {
      [STORE_KEY]: JSON.stringify({
        intro: importedSettings.intro,
        op: importedSettings.op,
        outro: importedSettings.outro,
        manualSkipButton:
          importedSettings.manualSkipButton !== false,
        countdown: importedSettings.countdown
      }),
      [ADVANCED_STORE_KEY]: JSON.stringify(importedAdvanced),
      [SERIES_KEY]: JSON.stringify(importedSeries),
      [HISTORY_KEY]: JSON.stringify(importedHistory),
      [TAB_KEY]: tabPosition === null
        ? null
        : String(tabPosition)
    };
  }

  function restoreSettingsBackup(values) {
    const previous = Object.fromEntries(
      Object.keys(values).map(key => [
        key,
        localStorage.getItem(key)
      ])
    );
    const writtenKeys = [];

    try {
      for (const [key, value] of Object.entries(values)) {
        if (value === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, value);
        }

        writtenKeys.push(key);
      }
    } catch (error) {
      try {
        for (const key of writtenKeys.reverse()) {
          const value = previous[key];

          if (value === null) {
            localStorage.removeItem(key);
          } else {
            localStorage.setItem(key, value);
          }
        }
      } catch (rollbackError) {
        console.error(TAG, '設定の復元ロールバックに失敗', rollbackError);
      }

      throw error;
    }
  }

  function backupFileName() {
    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');

    return `emby-autoskip-settings-${date}.json`;
  }

  function downloadSettingsBackup() {
    const json = JSON.stringify(
      createSettingsBackup(),
      null,
      2
    );
    const url = URL.createObjectURL(
      new Blob([json], {type: 'application/json'})
    );
    const link = document.createElement('a');

    link.href = url;
    link.download = backupFileName();
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function normalizeSeasonNumber(value) {
    if (value === null || value === undefined || value === '') {
      return '';
    }

    const number = Number(value);

    return Number.isInteger(number) && number >= 0
      ? String(number)
      : '';
  }

  function resolveScope() {
    const seriesId = state.seriesId;
    const seasonId = state.seasonId;
    const seasonNumber = state.seasonNumber;

    if (seasonId) {
      state.scopeKey = seriesId
        ? `season:${seriesId}:${seasonId}`
        : `season-id:${seasonId}`;
      state.scopeKind = 'season';
    } else if (seriesId && seasonNumber !== '') {
      state.scopeKey =
        `season-number:${seriesId}:${seasonNumber}`;
      state.scopeKind = 'season';
    } else if (seriesId) {
      state.scopeKey = seriesId;
      state.scopeKind = 'series';
    } else {
      state.scopeKey = '';
      state.scopeKind = '';
    }

    state.scopeResolved = true;
  }

  function directScopeRule() {
    const rule = state.scopeResolved && state.scopeKey
      ? seriesSettings[state.scopeKey]
      : null;

    return rule && typeof rule === 'object'
      ? rule
      : null;
  }

  function seriesRule() {
    const direct = directScopeRule();

    if (direct) return direct;

    const legacy = (
      state.scopeResolved &&
      state.scopeKind === 'season' &&
      state.seriesId
    )
      ? seriesSettings[state.seriesId]
      : null;

    return legacy && typeof legacy === 'object'
      ? legacy
      : null;
  }

  function ensureScopeRule() {
    if (!state.scopeResolved || !state.scopeKey) return null;

    const direct = directScopeRule();

    if (direct) return direct;

    const inherited = seriesRule();
    const created = inherited
      ? {
          intro: !!inherited.intro,
          op: toPolicy(inherited.op, settings.op),
          outro: toPolicy(inherited.outro, settings.outro),
          useGlobal: inherited.useGlobal === true
        }
      : {
          intro: !!settings.intro,
          op: settings.op,
          outro: settings.outro,
          useGlobal: true
        };

    seriesSettings[state.scopeKey] = created;

    return created;
  }

  function valueFor(type) {
    const rule = seriesRule();

    return rule && !rule.useGlobal && rule[type] !== undefined
      ? rule[type]
      : settings[type];
  }

  function wasFirstPlayed(type) {
    return !!(
      state.scopeResolved &&
      state.scopeKey &&
      firstPlayHistory[state.scopeKey]?.[type]
    );
  }

  function isFirstPending(type) {
    return (
      (type === 'op' || type === 'outro') &&
      valueFor(type) === 'first' &&
      !wasFirstPlayed(type)
    );
  }

  function shouldAutoSkip(type) {
    if (type === 'intro') return !!valueFor(type);

    const policy = valueFor(type);

    return (
      policy === 'skip' ||
      (policy === 'first' && wasFirstPlayed(type))
    );
  }

  function markFirstPlayed(type) {
    if (
      state.autoSkipSuspended ||
      !state.scopeResolved ||
      !state.scopeKey ||
      (type !== 'op' && type !== 'outro')
    ) return;

    const history = firstPlayHistory[state.scopeKey] || {};

    if (history[type]) return;

    history[type] = true;
    firstPlayHistory[state.scopeKey] = history;
    saveFirstPlayHistory();
    log(
      '初回再生完了:',
      type,
      state.seasonName || state.seriesName || state.scopeKey
    );
  }

  function clearPlaybackDecisions() {
    state.skipped.clear();
    state.cancelled.clear();
    state.firstWatching = null;
    state.undo = null;
  }

  const rangeKey = range => [
    range.type,
    range.start.toFixed(3),
    range.end.toFixed(3)
  ].join(':');

  const clamp = (n, lo, hi) =>
    Math.max(lo, Math.min(hi, n));

  const videoNow = () =>
    [...document.querySelectorAll('video')]
      .filter(v => v.readyState > 0)
      .sort((a, b) =>
        Number(a.paused) - Number(b.paused)
      )[0] || null;

  // =====================================
  // 右端収納式パネル + カウントダウン
  // =====================================

  function makePanel() {
    const root = document.createElement('div');

    root.id = 'yagi-emby-autoskip-ui';

    root.style.cssText = [
      'position:fixed',
      'top:0',
      'right:0',
      'z-index:2147483000',
      'width:0',
      'height:0',
      'pointer-events:none',
      'font:14px sans-serif',
      'color:#fff'
    ].join(';');

    // 引き出しタブ
    const handle = document.createElement('button');

    handle.type = 'button';

    handle.setAttribute(
      'aria-label',
      '自動スキップ設定。クリックで開く、上下ドラッグで移動'
    );

    handle.setAttribute('aria-expanded', 'false');

    handle.title =
      'クリック: 設定 / 上下ドラッグ: 位置移動';

    handle.style.cssText = [
      'position:fixed',
      'right:0',
      'width:17px',
      'height:60px',
      'padding:0 2px',
      'box-sizing:border-box',
      'border:1px solid #95a4b4',
      'border-right:0',
      'border-radius:10px 0 0 10px',
      'background:#202b36',
      'color:#fff',
      'font-size:25px',
      'line-height:1',
      'font-variant-numeric:tabular-nums',
      'white-space:nowrap',
      'opacity:.6',
      'cursor:ns-resize',
      'touch-action:none',
      'pointer-events:auto',
      'box-shadow:0 1px 7px #0005'
    ].join(';');

    // 設定パネル
    const drawer = document.createElement('div');

    drawer.setAttribute('role', 'dialog');

    drawer.setAttribute(
      'aria-label',
      'Emby 自動スキップ設定'
    );

    drawer.style.cssText = [
      'position:fixed',
      'right:19px',
      'box-sizing:border-box',
      'width:min(245px, calc(100vw - 32px))',
      'max-height:calc(100vh - 16px)',
      'overflow-x:hidden',
      'overflow-y:auto',
      'overscroll-behavior:contain',
      'background:#1b2530',
      'color:white',
      'border:1px solid #687786',
      'border-radius:12px',
      'padding:13px',
      'visibility:hidden',
      'opacity:0',
      'transform:translateX(calc(100% + 19px))',
      'pointer-events:none',
      'box-shadow:0 6px 25px #000b',
      'will-change:transform,opacity'
    ].join(';');

    const title = document.createElement('div');

    title.textContent = '⏭ 自動スキップ';

    title.style.cssText =
      'font-weight:bold;margin-bottom:10px';

    drawer.append(title);

    const suspendRow = document.createElement('label');
    const suspendCheck = document.createElement('input');

    suspendRow.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:9px',
      'padding:2px 0 7px',
      'cursor:pointer',
      'white-space:nowrap'
    ].join(';');
    suspendCheck.type = 'checkbox';
    suspendCheck.style.cssText =
      'width:17px;height:17px;accent-color:#8a949e';
    suspendRow.append(
      suspendCheck,
      document.createTextNode('AutoSkip 一時停止')
    );
    drawer.append(suspendRow);

    const sectionTitle = text => {
      const element = document.createElement('div');

      element.textContent = text;
      element.style.cssText =
        'font-size:11px;opacity:.72;margin:10px 0 6px';

      return element;
    };

    const scope = document.createElement('div');
    const globalButton = document.createElement('button');
    const seriesButton = document.createElement('button');

    scope.style.cssText =
      'display:grid;grid-template-columns:1fr 1fr;gap:4px';

    for (const button of [globalButton, seriesButton]) {
      button.type = 'button';
      button.style.cssText = [
        'min-height:30px',
        'border:1px solid #687786',
        'border-radius:7px',
        'color:#fff',
        'cursor:pointer',
        'font:inherit'
      ].join(';');
    }

    globalButton.textContent = '全体';
    seriesButton.textContent = 'このシリーズ';
    scope.append(globalButton, seriesButton);

    const seriesName = document.createElement('div');

    seriesName.style.cssText = [
      'overflow:hidden',
      'text-overflow:ellipsis',
      'white-space:nowrap',
      'font-size:12px',
      'margin-top:7px'
    ].join(';');

    const inheritRow = document.createElement('label');
    const inheritCheck = document.createElement('input');

    inheritRow.style.cssText =
      'display:none;align-items:center;gap:8px;padding:7px 0';
    inheritCheck.type = 'checkbox';
    inheritCheck.style.cssText =
      'width:17px;height:17px;accent-color:#4caf50';
    inheritRow.append(
      inheritCheck,
      document.createTextNode('全体設定を使用')
    );

    drawer.append(
      sectionTitle('スキップ設定'),
      scope,
      seriesName,
      inheritRow
    );

    const selectedScope = {value: 'global'};
    const optionControls = {};
    const targetTimeLabels = {};

    function optionLabel(key, text) {
      const label = document.createElement('span');
      const targetTime = document.createElement('small');

      label.style.cssText = 'display:grid;min-width:0';
      label.append(document.createTextNode(text), targetTime);
      targetTime.style.cssText = [
        'display:none',
        'margin-top:2px',
        'font-size:9px',
        'line-height:1',
        'font-weight:400',
        'font-variant-numeric:tabular-nums',
        'opacity:.65',
        'white-space:nowrap'
      ].join(';');
      targetTimeLabels[key] = targetTime;

      return label;
    }

    function saveOption(key, value) {
      if (selectedScope.value === 'series') {
        const rule = ensureScopeRule();

        if (!rule) return;

        rule[key] = value;
        saveSeriesSettings();
      } else {
        settings[key] = value;
        saveSettings();
      }

      clearPlaybackDecisions();
      resetActionFeedback();
      log('設定変更', key, value);
    }

    const introRow = document.createElement('label');
    const introCheck = document.createElement('input');

    introRow.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:9px',
      'padding:7px 0',
      'cursor:pointer',
      'white-space:nowrap'
    ].join(';');
    introCheck.type = 'checkbox';
    introCheck.style.cssText =
      'width:17px;height:17px;accent-color:#4caf50';
    introCheck.addEventListener('change', () => {
      saveOption('intro', introCheck.checked);
    });
    introRow.append(
      introCheck,
      optionLabel('intro', 'イントロ・前回のあらすじ')
    );
    drawer.append(introRow);
    optionControls.intro = introCheck;

    for (const [key, label] of [
      ['op', 'オープニング（OP）'],
      ['outro', 'アウトロ（ED）']
    ]) {
      const row = document.createElement('label');
      const select = document.createElement('select');

      row.style.cssText = [
        'display:grid',
        'grid-template-columns:1fr auto',
        'align-items:center',
        'gap:7px',
        'padding:6px 0'
      ].join(';');
      select.style.cssText = [
        'max-width:112px',
        'height:30px',
        'border:1px solid #687786',
        'border-radius:6px',
        'background:#202b36',
        'color:#fff',
        'font:inherit'
      ].join(';');

      for (const [value, text] of [
        ['play', '常に再生'],
        ['first', '初回のみ再生'],
        ['skip', '常にスキップ']
      ]) {
        const option = document.createElement('option');

        option.value = value;
        option.textContent = text;
        select.append(option);
      }

      select.addEventListener('change', () => {
        saveOption(key, select.value);
      });
      row.append(
        optionLabel(key, label),
        select
      );
      drawer.append(row);
      optionControls[key] = select;
    }

    const historyBox = document.createElement('div');
    const historyStatus = document.createElement('span');
    const historyReset = document.createElement('button');

    historyBox.style.cssText = [
      'display:none',
      'align-items:center',
      'justify-content:space-between',
      'gap:6px',
      'padding:6px 0',
      'font-size:11px'
    ].join(';');
    historyReset.type = 'button';
    historyReset.textContent = '履歴をリセット';
    historyReset.style.cssText = [
      'border:1px solid #687786',
      'border-radius:6px',
      'padding:4px 6px',
      'background:#202b36',
      'color:#fff',
      'font:inherit',
      'font-size:10px',
      'cursor:pointer',
      'white-space:nowrap'
    ].join(';');
    historyReset.addEventListener('click', () => {
      if (!state.scopeResolved || !state.scopeKey) return;

      delete firstPlayHistory[state.scopeKey];
      saveFirstPlayHistory();
      clearPlaybackDecisions();
      resetActionFeedback();
      renderSettings();
      log(
        '初回再生履歴をリセット:',
        state.seasonName || state.seriesName || state.scopeKey
      );
    });
    historyBox.append(historyStatus, historyReset);
    drawer.append(historyBox);

    const manualSkipRow = document.createElement('label');
    const manualSkipCheck = document.createElement('input');

    manualSkipRow.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:9px',
      'padding:7px 0',
      'cursor:pointer'
    ].join(';');
    manualSkipRow.title =
      '「常に再生」または初回再生のOP／ED区間に表示します';
    manualSkipCheck.type = 'checkbox';
    manualSkipCheck.checked = settings.manualSkipButton;
    manualSkipCheck.style.cssText =
      'width:17px;height:17px;accent-color:#4caf50';
    manualSkipCheck.addEventListener('change', () => {
      settings.manualSkipButton = manualSkipCheck.checked;
      saveSettings();
      resetActionFeedback();
    });
    const manualSkipLabel = document.createElement('span');

    manualSkipLabel.textContent = 'スキップボタン常時表示';
    manualSkipRow.append(
      manualSkipCheck,
      manualSkipLabel
    );

    const countdownRow = document.createElement('label');
    const countdownCheck = document.createElement('input');

    countdownRow.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:9px',
      'padding:7px 0',
      'cursor:pointer'
    ].join(';');
    countdownCheck.type = 'checkbox';
    countdownCheck.checked = settings.countdown;
    countdownCheck.style.cssText =
      'width:17px;height:17px;accent-color:#4caf50';
    countdownCheck.addEventListener('change', () => {
      settings.countdown = countdownCheck.checked;
      saveSettings();
      paintCountdown();
    });
    const countdownLabel = document.createElement('span');

    countdownLabel.textContent =
      `残秒表示（予告は${CONFIG.countdownLeadSeconds}秒前から）`;
    countdownRow.append(
      countdownCheck,
      countdownLabel
    );

    drawer.append(
      sectionTitle('共通表示'),
      manualSkipRow,
      countdownRow
    );

    const advancedDetails = document.createElement('details');
    const advancedSummary = document.createElement('summary');
    const advancedGrid = document.createElement('div');
    const advancedInputs = {};

    advancedDetails.style.cssText = [
      'margin-top:6px',
      'padding-top:7px',
      'border-top:1px solid #43515f'
    ].join(';');
    advancedSummary.textContent = '詳細設定';
    advancedSummary.style.cssText = [
      'cursor:pointer',
      'font-size:11px',
      'font-weight:600',
      'color:#dbe5ee',
      'user-select:none'
    ].join(';');
    advancedGrid.style.cssText = [
      'display:grid',
      'gap:6px',
      'margin-top:8px'
    ].join(';');

    function advancedNumberRow(label, key, suffix) {
      const limits = ADVANCED_CONFIG_FIELDS[key];
      const row = document.createElement('label');
      const input = document.createElement('input');
      const unit = document.createElement('span');

      row.style.cssText = [
        'display:grid',
        'grid-template-columns:1fr 57px 18px',
        'align-items:center',
        'gap:5px',
        'font-size:11px'
      ].join(';');
      input.type = 'number';
      input.min = String(limits.min);
      input.max = String(limits.max);
      input.step = String(limits.step);
      input.value = String(CONFIG[key]);
      input.inputMode = 'decimal';
      input.setAttribute('aria-label', label);
      input.style.cssText = [
        'box-sizing:border-box',
        'width:57px',
        'height:27px',
        'padding:2px 4px',
        'border:1px solid #687786',
        'border-radius:5px',
        'background:#202b36',
        'color:#fff',
        'font:inherit',
        'text-align:right'
      ].join(';');
      unit.textContent = suffix;
      unit.style.opacity = '.75';
      row.append(
        document.createTextNode(label),
        input,
        unit
      );
      advancedInputs[key] = input;

      input.addEventListener('change', () => {
        const raw = Number(input.value);

        if (!Number.isFinite(raw)) {
          input.value = String(CONFIG[key]);
          return;
        }

        const clamped = Math.max(
          limits.min,
          Math.min(limits.max, raw)
        );
        const stepped = limits.min + Math.round(
          (clamped - limits.min) / limits.step
        ) * limits.step;
        CONFIG[key] = limits.step >= 1
          ? Math.round(stepped)
          : Number(stepped.toFixed(2));
        input.value = String(CONFIG[key]);
        countdownLabel.textContent =
          `残秒表示（予告は${CONFIG.countdownLeadSeconds}秒前から）`;
        saveAdvancedSettings();
        applyMotionConfig();
        paintHandle();
      });

      return row;
    }

    advancedGrid.append(
      advancedNumberRow(
        '予告開始',
        'countdownLeadSeconds',
        '秒'
      ),
      advancedNumberRow(
        '戻す表示',
        'undoDisplaySeconds',
        '秒'
      ),
      advancedNumberRow(
        'メニュー移動',
        'drawerAnimationSeconds',
        '秒'
      ),
      advancedNumberRow(
        '操作表示',
        'actionAnimationSeconds',
        '秒'
      )
    );

    const advancedReset = document.createElement('button');

    advancedReset.type = 'button';
    advancedReset.textContent = '初期値に戻す';
    advancedReset.style.cssText = [
      'justify-self:end',
      'margin-top:2px',
      'border:1px solid #687786',
      'border-radius:6px',
      'padding:4px 7px',
      'background:#202b36',
      'color:#fff',
      'font:inherit',
      'font-size:10px',
      'cursor:pointer'
    ].join(';');
    advancedReset.addEventListener('click', () => {
      for (const key of Object.keys(ADVANCED_CONFIG_FIELDS)) {
        CONFIG[key] = DEFAULT_CONFIG[key];
        advancedInputs[key].value = String(CONFIG[key]);
      }

      try {
        localStorage.removeItem(ADVANCED_STORE_KEY);
      } catch (error) {
        console.warn(TAG, '詳細設定を初期化できません', error);
      }

      countdownLabel.textContent =
        `残秒表示（予告は${CONFIG.countdownLeadSeconds}秒前から）`;
      applyMotionConfig();
      paintHandle();
      log('詳細設定を初期値へ戻しました');
    });
    advancedGrid.append(advancedReset);
    advancedDetails.append(advancedSummary, advancedGrid);
    advancedDetails.addEventListener('toggle', () => {
      window.requestAnimationFrame(() => position(y));
    });
    drawer.append(advancedDetails);

    const backupDetails = document.createElement('details');
    const backupSummary = document.createElement('summary');
    const backupDescription = document.createElement('div');
    const backupActions = document.createElement('div');
    const exportButton = document.createElement('button');
    const importButton = document.createElement('button');
    const importInput = document.createElement('input');
    const backupStatus = document.createElement('div');

    backupDetails.style.cssText = [
      'margin-top:7px',
      'padding-top:7px',
      'border-top:1px solid #43515f'
    ].join(';');
    backupSummary.textContent = '設定データ';
    backupSummary.style.cssText = [
      'cursor:pointer',
      'font-size:11px',
      'font-weight:600',
      'color:#dbe5ee',
      'user-select:none'
    ].join(';');
    backupDescription.textContent =
      '全体・シーズン・シリーズ・詳細設定、初回履歴、タブ位置をJSONで移行します。';
    backupDescription.style.cssText = [
      'margin-top:7px',
      'font-size:10px',
      'line-height:1.45',
      'opacity:.72'
    ].join(';');
    backupActions.style.cssText = [
      'display:grid',
      'grid-template-columns:1fr 1fr',
      'gap:6px',
      'margin-top:7px'
    ].join(';');

    for (const button of [exportButton, importButton]) {
      button.type = 'button';
      button.style.cssText = [
        'min-height:29px',
        'border:1px solid #687786',
        'border-radius:6px',
        'padding:4px 7px',
        'background:#202b36',
        'color:#fff',
        'font:inherit',
        'font-size:11px',
        'cursor:pointer'
      ].join(';');
    }

    exportButton.textContent = '書き出し';
    exportButton.title = '現在の設定をJSONファイルへ保存';
    importButton.textContent = '読み込み';
    importButton.title = 'JSONファイルから設定を復元';
    importInput.type = 'file';
    importInput.accept = 'application/json,.json';
    importInput.style.display = 'none';
    backupStatus.setAttribute('role', 'status');
    backupStatus.setAttribute('aria-live', 'polite');
    backupStatus.style.cssText = [
      'min-height:14px',
      'margin-top:5px',
      'font-size:10px',
      'line-height:1.4',
      'color:#c9d7e3'
    ].join(';');

    exportButton.addEventListener('click', () => {
      try {
        downloadSettingsBackup();
        backupStatus.textContent = '設定を書き出しました';
        log('設定を書き出しました');
      } catch (error) {
        backupStatus.textContent = '書き出しに失敗しました';
        console.error(TAG, '設定を書き出せません', error);
      }
    });

    importButton.addEventListener('click', () => {
      importInput.value = '';
      importInput.click();
    });

    importInput.addEventListener('change', async () => {
      const file = importInput.files?.[0];

      if (!file) return;

      try {
        if (file.size > BACKUP_MAX_BYTES) {
          throw new Error('ファイルサイズが2MBを超えています');
        }

        const backup = JSON.parse(await file.text());
        const values = validateSettingsBackup(backup);
        const approved = window.confirm(
          '現在の設定・シーズン／シリーズ設定・初回履歴を、選択したバックアップで置き換えます。よろしいですか？'
        );

        if (!approved) {
          backupStatus.textContent = '読み込みを中止しました';
          return;
        }

        restoreSettingsBackup(values);
        backupStatus.textContent =
          '読み込みました。画面を再読み込みします…';
        log('設定を読み込みました:', file.name);
        window.setTimeout(() => location.reload(), 500);
      } catch (error) {
        backupStatus.textContent =
          `読み込めません: ${error.message || '形式が不正です'}`;
        console.error(TAG, '設定を読み込めません', error);
      }
    });

    backupActions.append(exportButton, importButton);
    backupDetails.append(
      backupSummary,
      backupDescription,
      backupActions,
      importInput,
      backupStatus
    );
    backupDetails.addEventListener('toggle', () => {
      window.requestAnimationFrame(() => position(y));
    });
    drawer.append(backupDetails);

    function targetTimeText(seconds) {
      const total = Math.max(0, Math.round(seconds));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor(total % 3600 / 60);
      const secs = String(total % 60).padStart(2, '0');

      return hours
        ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}`
        : `${minutes}:${secs}`;
    }

    function renderTargetTimes() {
      for (const type of skipTypes) {
        const label = targetTimeLabels[type];
        const ranges = state.mode === 'ready'
          ? state.ranges.filter(range => range.type === type)
          : [];
        const times = ranges.map(range =>
          `${targetTimeText(range.start)}–${targetTimeText(range.end)}`
        );

        label.textContent = times.length
          ? `${times[0]}${times.length > 1 ? ` +${times.length - 1}` : ''}`
          : '';
        label.title = times.length
          ? `検出区間: ${times.join(', ')}`
          : '';
        label.style.display = times.length ? 'inline' : 'none';
      }
    }

    function renderSettings() {
      const hasScope = !!(
        state.scopeResolved && state.scopeKey
      );

      renderTargetTimes();

      if (
        state.scopeResolved &&
        !hasScope &&
        selectedScope.value === 'series'
      ) {
        selectedScope.value = 'global';
      }

      const isSeries = selectedScope.value === 'series';
      const rule = seriesRule();
      const inheritsGlobal = !rule || rule.useGlobal === true;

      suspendCheck.checked = state.autoSkipSuspended;
      seriesButton.textContent = state.scopeKind === 'season'
        ? 'このシーズン'
        : 'このシリーズ';

      globalButton.style.background = isSeries
        ? '#202b36'
        : '#356d43';
      seriesButton.style.background = isSeries
        ? '#356d43'
        : '#202b36';
      seriesButton.disabled = !hasScope;
      seriesButton.style.opacity = hasScope ? '1' : '.45';
      seriesButton.style.cursor = hasScope
        ? 'pointer'
        : 'not-allowed';

      const scopeName = state.scopeKind === 'season'
        ? (
            state.seasonName ||
            (
              state.seasonNumber !== ''
                ? `シーズン ${state.seasonNumber}`
                : state.seriesName
            )
          )
        : (state.seriesName || state.seriesId);

      seriesName.textContent = isSeries
        ? `現在：${scopeName || state.scopeKey}`
        : '';
      seriesName.style.display = isSeries ? 'block' : 'none';
      inheritRow.style.display = isSeries ? 'flex' : 'none';
      inheritCheck.checked = inheritsGlobal;

      for (const key of skipTypes) {
        const control = optionControls[key];
        const value = isSeries && !inheritsGlobal
          ? rule[key]
          : settings[key];

        if (key === 'intro') {
          control.checked = !!value;
        } else {
          control.value = toPolicy(value, settings[key]);
        }

        control.disabled = isSeries && inheritsGlobal;
        control.parentElement.style.opacity = control.disabled
          ? '.55'
          : '1';
      }

      historyBox.style.display = isSeries
        ? 'flex'
        : 'none';
      historyStatus.textContent = [
        '初回履歴',
        `OP:${wasFirstPlayed('op') ? '済' : '未'}`,
        `ED:${wasFirstPlayed('outro') ? '済' : '未'}`
      ].join(' ');

      // 設定対象の切替で高さが変わった場合も、
      // 実寸を基に画面内へ戻す。
      if (
        isOpen &&
        drawer.style.visibility !== 'hidden'
      ) {
        position(y);
      }
    }

    globalButton.addEventListener('click', () => {
      selectedScope.value = 'global';
      renderSettings();
    });

    seriesButton.addEventListener('click', () => {
      if (!state.scopeResolved || !state.scopeKey) return;

      selectedScope.value = 'series';
      renderSettings();
    });

    inheritCheck.addEventListener('change', () => {
      if (!state.scopeResolved || !state.scopeKey) return;

      const rule = ensureScopeRule();

      if (!rule) return;

      if (inheritCheck.checked) {
        rule.useGlobal = true;
      } else {
        rule.useGlobal = false;
      }

      saveSeriesSettings();
      clearPlaybackDecisions();
      resetActionFeedback();
      renderSettings();
    });

    suspendCheck.addEventListener('change', () => {
      const video = videoNow();

      // 解除直前にも、停止中に到達した区間を確定する。
      if (state.autoSkipSuspended && !suspendCheck.checked) {
        suppressReachedRanges(video);
      }

      state.autoSkipSuspended = suspendCheck.checked;
      state.firstWatching = null;
      state.undo = null;

      if (state.autoSkipSuspended) {
        const currentTime = Number.isFinite(video?.currentTime)
          ? video.currentTime
          : 0;

        state.suspensionItemId = state.id;
        state.suspensionStartTime = currentTime;
        state.suspensionMaxTime = currentTime;
        suppressReachedRanges(video);
      } else {
        state.suspensionItemId = '';
        state.suspensionStartTime = 0;
        state.suspensionMaxTime = 0;
      }

      resetActionFeedback();
      renderSettings();
      log(
        state.autoSkipSuspended
          ? 'AutoSkipを一時停止しました'
          : 'AutoSkipを再開しました'
      );
    });

    const note = document.createElement('div');

    note.textContent =
      '右端のタブは上下にドラッグできます';

    note.style.cssText =
      'font-size:11px;opacity:.7;margin-top:8px';

    drawer.append(note);

    const countdownButton = document.createElement('button');
    const countdownMain = document.createElement('span');
    const countdownCancel = document.createElement('span');

    countdownButton.type = 'button';
    countdownButton.setAttribute(
      'aria-label',
      '今回の自動スキップをキャンセル'
    );
    countdownButton.title =
      'クリックすると今回の自動スキップをキャンセルします';
    countdownButton.style.cssText = [
      'position:fixed',
      'right:17px',
      'width:69px',
      'height:60px',
      'padding:5px 3px 4px',
      'box-sizing:border-box',
      'border:1px solid #95a4b4',
      'border-right:0',
      'border-radius:10px 0 0 10px',
      'background:#202b36',
      'color:#fff',
      'cursor:pointer',
      'pointer-events:auto',
      'font:inherit',
      'font-variant-numeric:tabular-nums',
      'white-space:nowrap',
      'visibility:hidden',
      'opacity:0',
      'transform:translateX(calc(100% + 17px))',
      'box-shadow:0 1px 7px #0005',
      'will-change:transform,opacity'
    ].join(';');
    countdownMain.style.cssText =
      'display:block;font-size:15px;font-weight:600;line-height:27px';
    countdownCancel.style.cssText =
      'display:block;font-size:9px;line-height:16px;opacity:.82;white-space:nowrap;word-break:keep-all';
    countdownCancel.textContent = CANCEL_LABEL;
    countdownButton.append(countdownMain, countdownCancel);

    root.append(drawer, countdownButton, handle);
    document.body.append(root);

    let isOpen = false;
    let actionInfo = null;
    let actionHandler = () => {};
    let feedbackUntil = 0;
    let feedbackTimer = 0;
    let isHovered = false;
    let yRatio = .48;

    const reduceMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    ).matches === true;
    let drawerMotionSeconds = 0;
    let actionMotionSeconds = 0;

    function applyMotionConfig() {
      drawerMotionSeconds = reduceMotion
        ? 0
        : CONFIG.drawerAnimationSeconds;
      actionMotionSeconds = reduceMotion
        ? 0
        : CONFIG.actionAnimationSeconds;

      drawer.style.transition = [
        `transform ${drawerMotionSeconds}s cubic-bezier(.22,.8,.25,1)`,
        `opacity ${drawerMotionSeconds}s ease`,
        `visibility 0s linear ${drawerMotionSeconds}s`
      ].join(',');
      countdownButton.style.transition = [
        `transform ${actionMotionSeconds}s cubic-bezier(.22,.8,.25,1)`,
        `opacity ${actionMotionSeconds}s ease`,
        `visibility 0s linear ${actionMotionSeconds}s`,
        'background-color .12s ease'
      ].join(',');
    }

    applyMotionConfig();

    // 旧バージョンのタブ位置を継承
    try {
      const raw = Number(
        localStorage.getItem(TAB_KEY)
      );

      if (
        Number.isFinite(raw) &&
        raw >= 0 &&
        raw <= 1
      ) {
        yRatio = raw;
      }
    } catch (_) {}

    let y = 0;

    // =====================================
    // タブ描画
    // =====================================

    function resetActionFeedback() {
      feedbackUntil = 0;
      actionInfo = null;
      window.clearTimeout(feedbackTimer);
      paintHandle();
    }

    function paintCountdown() {
      const feedback = Date.now() < feedbackUntil;
      const visible = (
        !state.autoSkipSuspended &&
        !isOpen &&
        (!!actionInfo || feedback)
      );

      countdownButton.style.visibility = visible
        ? 'visible'
        : 'hidden';
      countdownButton.style.opacity = visible ? '1' : '0';
      countdownButton.style.transform = visible
        ? 'translateX(0)'
        : 'translateX(calc(100% + 17px))';
      countdownButton.style.pointerEvents = visible
        ? 'auto'
        : 'none';
      countdownButton.style.transitionDelay = visible
        ? '0s,0s,0s,0s'
        : [
            '0s',
            '0s',
            `${actionMotionSeconds}s`,
            '0s'
          ].join(',');
      handle.style.borderRadius = visible
        ? '0'
        : '10px 0 0 10px';

      if (feedback) {
        countdownMain.style.lineHeight = '27px';
        countdownMain.textContent = '再生待機';
        countdownCancel.style.display = 'block';
        countdownCancel.textContent = 'キャンセル済';
        countdownButton.disabled = true;
        countdownButton.style.cursor = 'default';
        return;
      }

      countdownButton.disabled = false;
      countdownButton.style.cursor = 'pointer';

      if (actionInfo?.kind === 'countdown') {
        countdownButton.setAttribute(
          'aria-label',
          '今回の自動スキップをキャンセル'
        );
        countdownButton.title =
          'クリックすると今回の自動スキップをキャンセルします';
        countdownMain.style.lineHeight = '27px';
        countdownCancel.style.display = 'block';
        countdownMain.textContent =
          `${actionInfo.label} ${actionInfo.seconds}`;
        countdownCancel.textContent = CANCEL_LABEL;
      } else if (actionInfo) {
        const undo = actionInfo.kind === 'undo';
        const showRemaining = !undo && settings.countdown;

        countdownButton.setAttribute(
          'aria-label',
          undo ? 'スキップを元に戻す' : 'この区間をスキップ'
        );
        countdownButton.title = undo
          ? 'クリックするとスキップ開始位置へ戻ります'
          : 'クリックするとこの区間をスキップします';
        countdownMain.style.lineHeight = showRemaining
          ? '27px'
          : '49px';
        countdownMain.textContent = undo
          ? '↶ 戻す'
          : 'スキップ';
        countdownCancel.style.display = showRemaining
          ? 'block'
          : 'none';
        countdownCancel.textContent = showRemaining
          ? `残り ${targetTimeText(actionInfo.seconds)}`
          : '';
      }
    }

    function hasUsableSkipTarget() {
      return (
        state.mode === 'ready' &&
        state.ranges.some(range =>
          skipTypes.includes(range.type) &&
          Number.isFinite(range.start) &&
          Number.isFinite(range.end) &&
          range.end > range.start + .5
        )
      );
    }

    function paintHandle() {
      const skipTargetDetected = hasUsableSkipTarget();
      const statusText = state.autoSkipSuspended
        ? '一時停止中'
        : (
            skipTargetDetected
              ? 'スキップ機能利用可能・対象検知済み'
              : 'スキップ機能利用不可・対象未検知'
          );
      const statusColor = state.autoSkipSuspended
        ? '#4b545d'
        : (skipTargetDetected ? '#315f43' : '#71383d');

      handle.textContent = isOpen
        ? '›'
        : '‹';
      handle.style.background = statusColor;
      handle.setAttribute(
        'aria-label',
        `AutoSkip ${statusText}。クリックで設定、上下ドラッグで移動`
      );
      handle.title =
        `AutoSkip ${statusText} / クリック: 設定 / 上下ドラッグ: 位置移動`;

      handle.style.opacity =
        (
          isOpen ||
          isHovered ||
          actionInfo ||
          Date.now() < feedbackUntil
        )
          ? '1'
          : '.6';

      paintCountdown();
    }

    countdownButton.addEventListener('click', () => {
      if (!actionInfo) return;

      const action = actionInfo;

      actionInfo = null;

      if (action.kind === 'countdown') {
        feedbackUntil = Date.now() +
          CONFIG.cancelFeedbackSeconds * 1000;
      }

      actionHandler(action);
      paintHandle();

      if (action.kind === 'countdown') {
        window.clearTimeout(feedbackTimer);
        feedbackTimer = window.setTimeout(
          paintHandle,
          (CONFIG.cancelFeedbackSeconds + 0.05) * 1000
        );
      }
    });

    countdownButton.addEventListener('mouseenter', () => {
      countdownButton.style.background = '#354654';
      countdownCancel.style.opacity = '1';
    });

    countdownButton.addEventListener('mouseleave', () => {
      countdownButton.style.background = '#202b36';
      countdownCancel.style.opacity = '.82';
    });

    handle.addEventListener('mouseenter', () => {
      isHovered = true;
      paintHandle();
    });

    handle.addEventListener('mouseleave', () => {
      isHovered = false;
      paintHandle();
    });

    // =====================================
    // タブ位置
    // =====================================

    function position(
      px = yRatio * window.innerHeight
    ) {
      const available = Math.max(
        1,
        window.innerHeight
      );

      y = clamp(
        px,
        8,
        Math.max(8, available - 68)
      );

      yRatio = y / available;

      handle.style.top = `${y}px`;
      countdownButton.style.top = `${y}px`;

      const h = drawer.offsetHeight || 230;

      drawer.style.top = `${
        clamp(
          y - 80,
          8,
          Math.max(8, available - h - 8)
        )
      }px`;
    }

    // =====================================
    // 設定パネル開閉
    // =====================================

    function setOpen(value) {
      isOpen = !!value;

      if (isOpen) {
        renderSettings();
      }

      drawer.style.visibility = isOpen
        ? 'visible'
        : 'hidden';
      drawer.style.opacity = isOpen ? '1' : '0';
      drawer.style.transform = isOpen
        ? 'translateX(0)'
        : 'translateX(calc(100% + 19px))';
      drawer.style.pointerEvents = isOpen
        ? 'auto'
        : 'none';
      drawer.style.transitionDelay = isOpen
        ? '0s,0s,0s'
        : `0s,0s,${drawerMotionSeconds}s`;
      drawer.setAttribute('aria-hidden', String(!isOpen));

      handle.setAttribute(
        'aria-expanded',
        String(isOpen)
      );

      // 開いているときは細いタブに戻す
      paintHandle();
      position(y);
    }

    // =====================================
    // ドラッグ操作
    // =====================================

    let pointer = null;

    handle.addEventListener('pointerdown', e => {
      if (
        e.pointerType === 'mouse' &&
        e.button !== 0
      ) return;

      pointer = {
        id: e.pointerId,
        startY: e.clientY,
        startTop: y,
        moved: false
      };

      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    handle.addEventListener('pointermove', e => {
      if (
        !pointer ||
        pointer.id !== e.pointerId
      ) return;

      const dy =
        e.clientY - pointer.startY;

      if (Math.abs(dy) > 6) {
        pointer.moved = true;
      }

      if (pointer.moved) {
        position(pointer.startTop + dy);
      }
    });

    handle.addEventListener('pointerup', e => {
      if (
        !pointer ||
        pointer.id !== e.pointerId
      ) return;

      const moved = pointer.moved;
      pointer = null;

      try {
        handle.releasePointerCapture(
          e.pointerId
        );
      } catch (_) {}

      if (moved) {
        localStorage.setItem(
          TAB_KEY,
          String(yRatio)
        );
      } else {
        setOpen(!isOpen);
      }
    });

    handle.addEventListener(
      'pointercancel',
      () => {
        pointer = null;
      }
    );

    // キーボード操作
    handle.addEventListener('keydown', e => {
      if (
        e.key === 'Enter' ||
        e.key === ' '
      ) {
        e.preventDefault();
        setOpen(!isOpen);
      }
    });

    // パネル外クリックで収納
    document.addEventListener(
      'pointerdown',
      e => {
        if (
          isOpen &&
          !root.contains(e.target)
        ) {
          setOpen(false);
        }
      },
      true
    );

    document.addEventListener('keydown', e => {
      if (
        e.key === 'Escape' &&
        isOpen
      ) {
        setOpen(false);
      }
    });

    window.addEventListener('resize', () => {
      position(
        yRatio * window.innerHeight
      );
    });

    // 全画面表示対応
    document.addEventListener(
      'fullscreenchange',
      () => {
        const full =
          document.fullscreenElement;

        if (
          full &&
          full.tagName !== 'VIDEO'
        ) {
          full.append(root);
        } else {
          document.body.append(root);
        }

        position(
          yRatio * window.innerHeight
        );
      }
    );

    position();
    renderSettings();
    paintHandle();

    return {
      root,

      setVisible: visible => {
        root.style.display =
          visible ? 'block' : 'none';

        if (!visible && isOpen) {
          setOpen(false);
        }
      },

      setAction: info => {
        const next = state.autoSkipSuspended
          ? null
          : (info || null);

        if (
          actionInfo?.kind === next?.kind &&
          actionInfo?.key === next?.key &&
          actionInfo?.seconds === next?.seconds
        ) {
          return;
        }

        actionInfo = next;
        paintHandle();
      },

      onAction: handler => {
        actionHandler = typeof handler === 'function'
          ? handler
          : () => {};
      },

      updateSeries: () => {
        renderSettings();
        paintHandle();
      },

      updateState: () => {
        renderTargetTimes();
        paintHandle();
      }
    };
  }

  const ui = makePanel();

  ui.onAction(action => {
    if (state.autoSkipSuspended || !action?.key) return;

    if (action.kind === 'countdown') {
      state.cancelled.add(action.key);

      log(
        '今回のスキップをキャンセル:',
        action.type,
        action.start.toFixed(1)
      );
    } else if (action.kind === 'skip') {
      manualSkip(action);
    } else if (action.kind === 'undo') {
      undoSkip(action);
    }
  });

  // =====================================
  // Emby認証情報
  // =====================================

  function loginInfo() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(
          'servercredentials3'
        ) || '{}'
      );

      const servers =
        Array.isArray(saved.Servers)
          ? saved.Servers
          : [];

      const matchesOrigin = s =>
        [
          'ManualAddress',
          'LocalAddress',
          'RemoteAddress'
        ].some(k => {
          try {
            return (
              new URL(s[k]).origin ===
              location.origin
            );
          } catch {
            return false;
          }
        });

      const server =
        servers.find(matchesOrigin) ||
        (
          servers.length === 1
            ? servers[0]
            : null
        );

      if (!server) return null;

      const users =
        Array.isArray(server.Users)
          ? server.Users
          : [];

      const user =
        users.find(
          u => u.Id === server.UserId
        ) ||
        users[0] ||
        {};

      const token =
        server.AccessToken ||
        user.AccessToken;

      return token ? {
        token,
        userId: String(
          server.UserId ||
          user.Id ||
          ''
        )
      } : null;

    } catch {
      return null;
    }
  }

  // =====================================
  // Emby API
  // =====================================

  const webPos = location.pathname
    .toLowerCase()
    .indexOf('/web/');

  const prefix = webPos >= 0
    ? location.pathname.slice(0, webPos)
    : '';

  const apiBases = [...new Set([
    `${location.origin}${prefix}/emby`,
    `${location.origin}${prefix}`,
    `${location.origin}/emby`,
    location.origin
  ])];

  async function apiGet(path) {
    const auth = loginInfo();

    if (!auth) {
      throw new Error('ログイン情報なし');
    }

    const candidates = [...new Set([
      state.apiBase,
      ...apiBases
    ].filter(Boolean))];

    let lastError;

    for (const base of candidates) {
      try {
        const res = await fetch(base + path, {
          headers: {
            'X-Emby-Token': auth.token,
            'Accept': 'application/json'
          },
          credentials: 'same-origin',
          cache: 'no-store'
        });

        if (!res.ok) {
          throw new Error(
            `HTTP ${res.status} (${path})`
          );
        }

        const result = await res.json();

        state.apiBase = base;

        return result;

      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ||
      new Error('API接続失敗');
  }

  // =====================================
  // 再生セッションの選択
  // =====================================

  function chooseSession(
    sessions,
    video,
    userId
  ) {
    let playing = sessions.filter(
      s => s.NowPlayingItem?.Id
    );

    if (userId) {
      playing = playing.filter(
        s => String(s.UserId) === userId
      );
    }

    const web = playing.filter(
      s => /web/i.test(
        String(s.Client || '')
      )
    );

    const candidates =
      web.length ? web : playing;

    if (!candidates.length) return null;

    const delta = s => {
      const pos = Number(
        s.PlayState?.PositionTicks
      );

      return Number.isFinite(pos)
        ? Math.abs(
            pos / TICKS -
            video.currentTime
          )
        : Infinity;
    };

    candidates.sort(
      (a, b) => delta(a) - delta(b)
    );

    if (
      candidates.length > 1 &&
      delta(candidates[0]) > 30
    ) {
      return null;
    }

    return candidates[0];
  }

  // =====================================
  // チャプター名判定
  // =====================================

  function kind(name) {
    const n = String(name || '')
      .normalize('NFKC')
      .toLowerCase()
      .trim();

    if (
      /前回のあらすじ|前回まで|あらすじ|recap|previously on/.test(n)
    ) {
      return 'intro';
    }

    if (
      /オープニング|opening|(?:^|[\s_\-])op\d*(?=$|[\s_\-])/.test(n)
    ) {
      return 'op';
    }

    if (
      /エンディング|アウトロ|スタッフロール|ending|outro|credits|(?:^|[\s_\-])ed\d*(?=$|[\s_\-])/.test(n)
    ) {
      return 'outro';
    }

    if (/イントロ|intro/.test(n)) {
      return 'intro';
    }

    return '';
  }

  function isEnd(name) {
    const n = String(name || '')
      .normalize('NFKC')
      .toLowerCase();

    return /終了|終わり|終点|(?:^|[\s_\-])(?:end|finish|stop)(?=$|[\s_\-])/.test(n);
  }

  // =====================================
  // スキップ区間の生成
  // =====================================

  function buildRanges(raw, duration) {
    const c = (
      Array.isArray(raw) ? raw : []
    )
      .map(x => ({
        sec:
          Number(x.StartPositionTicks) /
          TICKS,
        name: String(x.Name || ''),
        marker: String(
          x.MarkerType ?? ''
        )
      }))
      .filter(x =>
        Number.isFinite(x.sec) &&
        x.sec >= 0
      )
      .sort(
        (a, b) => a.sec - b.sec
      );

    const named = [];
    const result = [];

    function add(
      list,
      start,
      end,
      type
    ) {
      if (!(
        end > start + 0.5 &&
        end - start <= CONFIG.maxSkipRangeSeconds
      )) return;

      if (
        type !== 'outro' &&
        start > CONFIG.nonOutroStartLimitSeconds
      ) return;

      if (
        list.some(r =>
          r.type === type &&
          Math.abs(r.start - start) < .5 &&
          Math.abs(r.end - end) < .5
        )
      ) return;

      list.push({
        start,
        end,
        type
      });
    }

    // 名前付きチャプター
    for (let i = 0; i < c.length; i++) {
      const type = kind(c[i].name);

      if (
        !type ||
        isEnd(c[i].name)
      ) {
        continue;
      }

      const explicit = c
        .slice(i + 1)
        .find(x =>
          kind(x.name) === type &&
          isEnd(x.name)
        );

      const next = c[i + 1];

      let end = explicit?.sec;

      if (
        end === undefined &&
        next &&
        next.sec - c[i].sec <=
          CONFIG.nextChapterMaxGapSeconds
      ) {
        end = next.sec;
      }

      // EDが最後のチャプターなら終端へ
      if (
        end === undefined &&
        type === 'outro' &&
        Number.isFinite(duration) &&
        duration > c[i].sec
      ) {
        end = duration - .3;
      }

      if (end !== undefined) {
        add(
          named,
          c[i].sec,
          end,
          type
        );
      }
    }

    result.push(...named);

    // Emby IntroStart / IntroEnd
    // 名前付きOPとの重複を避ける
    for (let i = 0; i < c.length; i++) {
      if (
        !['IntroStart', '1'].includes(
          c[i].marker
        )
      ) continue;

      const ending = c
        .slice(i + 1)
        .find(x =>
          ['IntroEnd', '2'].includes(
            x.marker
          )
        );

      if (
        !ending ||
        ending.sec <= c[i].sec
      ) continue;

      let cursor = c[i].sec;

      const cuts = named
        .filter(x =>
          x.end > cursor &&
          x.start < ending.sec
        )
        .sort(
          (a, b) => a.start - b.start
        );

      for (const cut of cuts) {
        if (cut.start > cursor) {
          add(
            result,
            cursor,
            Math.min(
              cut.start,
              ending.sec
            ),
            'intro'
          );
        }

        cursor = Math.max(
          cursor,
          cut.end
        );

        if (cursor >= ending.sec) {
          break;
        }
      }

      if (cursor < ending.sec) {
        add(
          result,
          cursor,
          ending.sec,
          'intro'
        );
      }
    }

    return result.sort(
      (a, b) =>
        a.start - b.start ||
        a.end - b.end
    );
  }

  // =====================================
  // 再生情報の更新
  // =====================================

  async function refresh() {
    if (state.busy) return;

    const video = videoNow();

    if (!video) {
      state.mode = 'waiting-for-video';
      ui.updateState();
      return;
    }

    const auth = loginInfo();

    if (!auth) {
      state.mode = 'login-not-found';
      ui.updateState();
      return;
    }

    state.busy = true;

    try {
      const sessions =
        await apiGet('/Sessions');

      if (!Array.isArray(sessions)) {
        throw new Error(
          'Sessions形式が不明'
        );
      }

      state.sessions = sessions.map(
        s => ({
          client: s.Client,
          name:
            s.NowPlayingItem?.Name || '',
          hasItem:
            !!s.NowPlayingItem?.Id
        })
      );

      const session = chooseSession(
        sessions,
        video,
        auth.userId
      );

      if (!session) {
        state.mode =
          'waiting-for-session';
        ui.updateState();

        return;
      }

      const id = String(
        session.NowPlayingItem.Id
      );

      const newItem = id !== state.id;
      const sessionItem = session.NowPlayingItem;

      if (newItem) {
        state.id = id;
        state.title = sessionItem.Name || '';
        state.seriesId = String(
          sessionItem.SeriesId || ''
        );
        state.seriesName = String(
          sessionItem.SeriesName || ''
        );
        state.seasonId = String(
          sessionItem.SeasonId || ''
        );
        state.seasonName = String(
          sessionItem.SeasonName || ''
        );
        state.seasonNumber = normalizeSeasonNumber(
          sessionItem.ParentIndexNumber
        );
        state.scopeKey = '';
        state.scopeKind = '';
        state.scopeResolved = false;
        state.chapters = [];
        state.ranges = [];
        clearPlaybackDecisions();
      } else {
        state.seriesId = String(
          sessionItem.SeriesId || state.seriesId
        );
        state.seriesName = String(
          sessionItem.SeriesName || state.seriesName
        );
        state.seasonId = String(
          sessionItem.SeasonId || state.seasonId
        );
        state.seasonName = String(
          sessionItem.SeasonName || state.seasonName
        );

        const sessionSeasonNumber = normalizeSeasonNumber(
          sessionItem.ParentIndexNumber
        );

        if (sessionSeasonNumber !== '') {
          state.seasonNumber = sessionSeasonNumber;
        }
      }

      ui.updateSeries();

      if (
        !newItem &&
        (
          state.mode === 'ready' ||
          state.mode === 'no-segments'
        )
      ) return;

      const generation =
        ++state.generation;

      state.mode =
        'loading-chapters';
      ui.updateState();

      let response = await apiGet(
        `/Items?Ids=${encodeURIComponent(id)}&Fields=Chapters`
      );

      let item = response?.Items?.[0];
      let chapters =
        item?.Chapters;

      if (
        !Array.isArray(chapters) &&
        auth.userId
      ) {
        response = await apiGet(
          `/Users/${encodeURIComponent(auth.userId)}/Items/${encodeURIComponent(id)}`
        );

        item = response;
        chapters = item?.Chapters;
      }

      if (
        generation !== state.generation
      ) return;

      state.chapters =
        Array.isArray(chapters)
          ? chapters
          : [];

      state.seriesId = String(
        item?.SeriesId || state.seriesId
      );
      state.seriesName = String(
        item?.SeriesName || state.seriesName
      );
      state.seasonId = String(
        item?.SeasonId || state.seasonId
      );
      state.seasonName = String(
        item?.SeasonName || state.seasonName
      );

      const itemSeasonNumber = normalizeSeasonNumber(
        item?.ParentIndexNumber
      );

      if (itemSeasonNumber !== '') {
        state.seasonNumber = itemSeasonNumber;
      }

      resolveScope();

      state.lastDuration =
        Number.isFinite(video.duration)
          ? video.duration
          : 0;

      state.ranges = buildRanges(
        state.chapters,
        state.lastDuration
      );

      state.mode =
        state.ranges.length
          ? 'ready'
          : 'no-segments';
      state.lastError = '';
      ui.updateSeries();

      log(
        '再生中:',
        state.title,
        'チャプター:',
        state.chapters.length,
        '区間:',
        state.ranges
      );

    } catch (error) {
      state.lastError = String(
        error.message || error
      );

      state.mode = 'api-error';
      ui.updateState();

      console.warn(
        TAG,
        state.lastError
      );

    } finally {
      state.busy = false;
    }
  }

  // =====================================
  // 右端に表示する操作
  // =====================================

  function countdownFor(video) {
    if (
      !settings.countdown ||
      !video
    ) return null;

    if (
      state.mode !== 'ready' &&
      state.mode !== 'no-segments'
    ) return null;

    const now = video.currentTime;

    for (
      let i = 0;
      i < state.ranges.length;
      i++
    ) {
      const r = state.ranges[i];

      // IntroとOPだけ予告
      // EDは表示しない
      if (
        r.type !== 'intro' &&
        r.type !== 'op'
      ) continue;

      if (!shouldAutoSkip(r.type)) continue;

      // 既にスキップ済みなら予告しない
      if (state.skipped.has(i)) continue;

      const key = rangeKey(r);

      if (state.cancelled.has(key)) continue;

      const remaining =
        r.start - now;

      if (
        remaining > 0 &&
        remaining <= CONFIG.countdownLeadSeconds
      ) {
        const label =
          r.type === 'intro'
            ? 'IN'
            : 'OP';

        return {
          kind: 'countdown',
          key,
          index: i,
          type: r.type,
          start: r.start,
          label,
          seconds: Math.ceil(remaining)
        };
      }
    }

    return null;
  }

  function undoAction() {
    const undo = state.undo;

    if (!undo) return null;

    if (
      undo.itemId !== state.id ||
      Date.now() >= undo.expiresAt
    ) {
      state.undo = null;
      return null;
    }

    return {
      kind: 'undo',
      key: undo.key,
      type: undo.type,
      index: undo.index,
      start: undo.start
    };
  }

  function manualSkipAction(video) {
    if (!settings.manualSkipButton) return null;

    for (
      let i = 0;
      i < state.ranges.length;
      i++
    ) {
      const range = state.ranges[i];
      const key = rangeKey(range);

      const policy = valueFor(range.type);

      if (
        policy !== 'play' &&
        !isFirstPending(range.type)
      ) continue;
      if (state.cancelled.has(key)) continue;
      if (state.skipped.has(i)) continue;

      if (
        video.currentTime >= range.start - .15 &&
        video.currentTime <
          range.end - CONFIG.rangeEndGuardSeconds
      ) {
        return {
          kind: 'skip',
          key,
          type: range.type,
          index: i,
          start: range.start,
          seconds: Math.ceil(
            Math.max(0, range.end - video.currentTime)
          )
        };
      }
    }

    return null;
  }

  function actionFor(video) {
    if (state.autoSkipSuspended || !video) return null;

    return (
      undoAction() ||
      manualSkipAction(video) ||
      countdownFor(video)
    );
  }

  function rearmSkippedRanges(video) {
    for (const index of [...state.skipped]) {
      const range = state.ranges[index];

      if (!range) {
        state.skipped.delete(index);
        continue;
      }

      if (
        video.currentTime >=
        range.end - CONFIG.rangeEndGuardSeconds
      ) continue;

      state.skipped.delete(index);

      if (state.undo?.key === rangeKey(range)) {
        state.undo = null;
      }

      log(
        '巻き戻しを検出、スキップ判定を再有効化:',
        range.type,
        range.start.toFixed(1)
      );
    }
  }

  function suppressReachedRanges(video) {
    if (!video) return;

    const currentTime = Number.isFinite(video.currentTime)
      ? video.currentTime
      : 0;

    if (state.suspensionItemId !== state.id) {
      state.suspensionItemId = state.id;
      state.suspensionStartTime = 0;
      state.suspensionMaxTime = currentTime;
    } else {
      state.suspensionMaxTime = Math.max(
        state.suspensionMaxTime,
        currentTime
      );
    }

    for (const range of state.ranges) {
      if (
        range.start <= state.suspensionMaxTime + .15 &&
        range.end >= state.suspensionStartTime - .15
      ) {
        state.cancelled.add(rangeKey(range));
      }
    }
  }

  function skipDestination(video, range) {
    return Number.isFinite(video.duration)
      ? Math.min(
          range.end + .15,
          video.duration - .3
        )
      : range.end + .15;
  }

  function performSkip(video, range, index, source) {
    if (state.autoSkipSuspended) return false;

    const from = video.currentTime;
    const dest = skipDestination(video, range);

    if (dest <= from + .1) return false;

    video.currentTime = dest;
    state.skipped.add(index);
    state.firstWatching = null;
    state.undo = {
      itemId: state.id,
      key: rangeKey(range),
      type: range.type,
      index,
      start: range.start,
      from,
      dest,
      expiresAt:
        Date.now() + CONFIG.undoDisplaySeconds * 1000
    };

    log(
      source === 'manual' ? 'MANUAL SKIP:' : 'SKIP:',
      range.type,
      range.start.toFixed(1),
      '→',
      dest.toFixed(1)
    );

    return true;
  }

  function manualSkip(action) {
    const video = videoNow();
    const range = state.ranges[action.index];

    if (
      state.autoSkipSuspended ||
      !video ||
      !range ||
      rangeKey(range) !== action.key
    ) return;

    if (isFirstPending(range.type)) {
      markFirstPlayed(range.type);
      ui.updateSeries();
    }

    if (performSkip(video, range, action.index, 'manual')) {
      ui.setAction(undoAction());
    }
  }

  function undoSkip(action) {
    const video = videoNow();
    const undo = state.undo;

    if (
      state.autoSkipSuspended ||
      !video ||
      !undo ||
      undo.key !== action.key ||
      undo.itemId !== state.id
    ) return;

    video.currentTime = Math.max(0, undo.start + .05);
    state.cancelled.add(undo.key);
    state.undo = null;
    ui.setAction(null);

    log('UNDO:', undo.type, undo.start.toFixed(1));
  }

  function updateFirstPlayback(video) {
    if (state.autoSkipSuspended) {
      state.firstWatching = null;
      return;
    }

    const watching = state.firstWatching;

    if (watching) {
      if (watching.itemId !== state.id) {
        state.firstWatching = null;
      } else if (
        video.currentTime >=
        watching.end - CONFIG.rangeEndGuardSeconds
      ) {
        markFirstPlayed(watching.type);
        state.cancelled.add(watching.key);
        state.firstWatching = null;
        ui.updateSeries();
      } else if (
        video.currentTime < watching.start - 1 ||
        video.currentTime > watching.end + 2
      ) {
        state.firstWatching = null;
      }
    }

    if (state.firstWatching) return;

    for (const range of state.ranges) {
      if (!isFirstPending(range.type)) continue;

      if (
        video.currentTime >= range.start - .15 &&
        video.currentTime <
          range.end - CONFIG.rangeEndGuardSeconds
      ) {
        state.firstWatching = {
          itemId: state.id,
          key: rangeKey(range),
          type: range.type,
          start: range.start,
          end: range.end
        };
        return;
      }
    }
  }

  // =====================================
  // 自動スキップ
  // =====================================

  function skipTick() {
    const v = videoNow();

    // 動画があるときだけタブ表示
    ui.setVisible(!!v);

    if (!v) {
      ui.setAction(null);
      return;
    }

    // 動画時間が後から確定した場合
    if (
      state.chapters.length &&
      Number.isFinite(v.duration) &&
      Math.abs(
        v.duration -
        state.lastDuration
      ) > 1
    ) {
      state.lastDuration = v.duration;

      state.ranges = buildRanges(
        state.chapters,
        v.duration
      );
      state.mode = state.ranges.length
        ? 'ready'
        : 'no-segments';
      ui.updateState();
    }

    if (state.autoSkipSuspended) {
      suppressReachedRanges(v);
      state.firstWatching = null;
      state.undo = null;
      ui.setAction(null);
      return;
    }

    rearmSkippedRanges(v);
    updateFirstPlayback(v);

    // 動画自体が一時停止中でも現在の操作を表示する。
    ui.setAction(actionFor(v));

    if (
      v.paused ||
      v.seeking
    ) return;

    if (
      state.mode !== 'ready' &&
      state.mode !== 'no-segments'
    ) return;

    for (
      let i = 0;
      i < state.ranges.length;
      i++
    ) {
      const r = state.ranges[i];

      if (!shouldAutoSkip(r.type)) continue;

      if (state.cancelled.has(rangeKey(r))) {
        continue;
      }

      // スキップ済み判定
      if (
        state.skipped.has(i)
      ) continue;

      // 現在位置が区間内か
      if (
        v.currentTime < r.start - .15 ||
        v.currentTime >=
          r.end - CONFIG.rangeEndGuardSeconds
      ) continue;

      if (performSkip(v, r, i, 'auto')) {
        ui.setAction(undoAction());
        break;
      }
    }
  }

  // =====================================
  // デバッグ機能
  // =====================================

  window.EmbyAutoSkip = {
    version: SCRIPT_VERSION,

    status: () => ({
      mode: state.mode,
      itemId: state.id,
      title: state.title,
      seriesId: state.seriesId,
      seriesName: state.seriesName,
      seasonId: state.seasonId,
      seasonName: state.seasonName,
      seasonNumber: state.seasonNumber,
      scopeKey: state.scopeKey,
      scopeKind: state.scopeKind,
      scopeResolved: state.scopeResolved,
      autoSkipSuspended: state.autoSkipSuspended,
      chapters: state.chapters.length,
      ranges: state.ranges,
      settings: {...settings},
      config: {...CONFIG},
      seriesSettings: seriesRule()
        ? {...seriesRule()}
        : null,
      effectiveSettings: Object.fromEntries(
        skipTypes.map(key => [key, valueFor(key)])
      ),
      firstPlayHistory: state.scopeKey
        ? {...(firstPlayHistory[state.scopeKey] || {})}
        : null,
      firstWatching: state.firstWatching
        ? {...state.firstWatching}
        : null,
      undo: state.undo ? {...state.undo} : null,
      cancelled: [...state.cancelled],
      action: actionFor(videoNow()),
      videoTime:
        videoNow()?.currentTime,
      error: state.lastError,
      sessions: state.sessions
    }),

    inspect: () => {
      console.table(
        state.chapters.map(c => ({
          time:
            Number(c.StartPositionTicks) /
            TICKS,
          name: c.Name,
          marker: c.MarkerType
        }))
      );

      console.table(
        state.ranges
      );
    },

    retry: refresh
  };

  log(
    `v${SCRIPT_VERSION} 起動（シーズン管理・一時停止対応）`
  );

  void refresh();

  setInterval(
    refresh,
    CONFIG.sessionRefreshSeconds * 1000
  );
  setInterval(
    skipTick,
    CONFIG.skipCheckSeconds * 1000
  );

})();
