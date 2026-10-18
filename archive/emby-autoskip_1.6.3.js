// ==UserScript==
// @name         Emby AutoSkip - Series Rules + Skip Cancel
// @namespace    local.emby.autoskip
// @version      1.6.3
// @description  Intro / OP / Outro auto skip with countdown cancellation and series rules
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
  const STORE_KEY = 'emby-autoskip-settings-v13';
  const TAB_KEY = 'emby-autoskip-edge-position-v14';
  const SERIES_KEY = 'emby-autoskip-series-settings-v16';

  const LIMIT = 360;
  const NEXT_LIMIT = 210;
  const COUNTDOWN_SECONDS = 30;
  const CANCEL_LABEL = 'キャンセル';

  // =====================================
  // 設定
  // =====================================

  const settings = {
    intro: true,
    op: true,
    outro: false,
    countdown: true
  };

  const skipTypes = ['intro', 'op', 'outro'];

  let seriesSettings = {};

  // 旧バージョンの設定を引き継ぐ
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORE_KEY) || '{}'
    );

    for (const key of Object.keys(settings)) {
      if (typeof saved[key] === 'boolean') {
        settings[key] = saved[key];
      }
    }
  } catch (_) {}

  try {
    const saved = JSON.parse(
      localStorage.getItem(SERIES_KEY) || '{}'
    );

    if (
      saved &&
      typeof saved === 'object' &&
      !Array.isArray(saved)
    ) {
      seriesSettings = saved;
    }
  } catch (_) {}

  const state = {
    mode: 'starting',
    id: '',
    title: '',
    seriesId: '',
    seriesName: '',
    chapters: [],
    ranges: [],
    apiBase: '',
    lastError: '',
    sessions: [],
    busy: false,
    skipped: new Set(),
    cancelled: new Set(),
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

  function seriesRule() {
    const rule = state.seriesId
      ? seriesSettings[state.seriesId]
      : null;

    return rule && typeof rule === 'object'
      ? rule
      : null;
  }

  function enabledFor(type) {
    const rule = seriesRule();

    return rule && typeof rule[type] === 'boolean'
      ? rule[type]
      : !!settings[type];
  }

  function clearPlaybackDecisions() {
    state.skipped.clear();
    state.cancelled.clear();
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
      'display:none',
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
      'pointer-events:auto',
      'box-shadow:0 6px 25px #000b'
    ].join(';');

    const title = document.createElement('div');

    title.textContent = '⏭ 自動スキップ';

    title.style.cssText =
      'font-weight:bold;margin-bottom:10px';

    drawer.append(title);

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
    const optionChecks = {};
    const options = [
      ['intro', 'イントロ・前回のあらすじ'],
      ['op', 'オープニング（OP）'],
      ['outro', 'アウトロ（ED）']
    ];

    for (const [key, label] of options) {
      const row = document.createElement('label');

      row.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:9px',
        'padding:7px 0',
        'cursor:pointer',
        'white-space:nowrap'
      ].join(';');

      const check = document.createElement('input');

      check.type = 'checkbox';
      check.style.cssText =
        'width:17px;height:17px;accent-color:#4caf50';

      check.addEventListener('change', () => {
        if (selectedScope.value === 'series') {
          const rule = seriesRule();

          if (!rule) return;

          rule[key] = check.checked;
          saveSeriesSettings();
        } else {
          settings[key] = check.checked;
          saveSettings();
        }

        clearPlaybackDecisions();
        resetCancelFeedback();

        log(
          '設定変更',
          key,
          check.checked ? 'ON' : 'OFF'
        );
      });

      row.append(
        check,
        document.createTextNode(label)
      );

      drawer.append(row);
      optionChecks[key] = check;
    }

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
    });
    countdownRow.append(
      countdownCheck,
      document.createTextNode('残秒表示（30秒前から）')
    );

    drawer.append(
      sectionTitle('共通表示'),
      countdownRow
    );

    function renderSettings() {
      const hasSeries = !!state.seriesId;

      if (!hasSeries && selectedScope.value === 'series') {
        selectedScope.value = 'global';
      }

      const isSeries = selectedScope.value === 'series';
      const rule = seriesRule();

      globalButton.style.background = isSeries
        ? '#202b36'
        : '#356d43';
      seriesButton.style.background = isSeries
        ? '#356d43'
        : '#202b36';
      seriesButton.disabled = !hasSeries;
      seriesButton.style.opacity = hasSeries ? '1' : '.45';
      seriesButton.style.cursor = hasSeries
        ? 'pointer'
        : 'not-allowed';

      seriesName.textContent = isSeries
        ? `現在：${state.seriesName || state.seriesId}`
        : '';
      seriesName.style.display = isSeries ? 'block' : 'none';
      inheritRow.style.display = isSeries ? 'flex' : 'none';
      inheritCheck.checked = !rule;

      for (const key of skipTypes) {
        const check = optionChecks[key];

        check.checked = isSeries
          ? enabledFor(key)
          : !!settings[key];
        check.disabled = isSeries && !rule;
        check.parentElement.style.opacity = check.disabled
          ? '.55'
          : '1';
      }

      // 設定対象の切替で高さが変わった場合も、
      // 実寸を基に画面内へ戻す。
      if (
        isOpen &&
        drawer.style.display !== 'none'
      ) {
        position(y);
      }
    }

    globalButton.addEventListener('click', () => {
      selectedScope.value = 'global';
      renderSettings();
    });

    seriesButton.addEventListener('click', () => {
      if (!state.seriesId) return;

      selectedScope.value = 'series';
      renderSettings();
    });

    inheritCheck.addEventListener('change', () => {
      if (!state.seriesId) return;

      if (inheritCheck.checked) {
        delete seriesSettings[state.seriesId];
      } else {
        seriesSettings[state.seriesId] = Object.fromEntries(
          skipTypes.map(key => [key, !!settings[key]])
        );
      }

      saveSeriesSettings();
      clearPlaybackDecisions();
      resetCancelFeedback();
      renderSettings();
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
      'display:none',
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
      'box-shadow:0 1px 7px #0005'
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
    let countdownInfo = null;
    let cancelHandler = () => {};
    let feedbackUntil = 0;
    let feedbackTimer = 0;
    let isHovered = false;
    let yRatio = .48;

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

    function resetCancelFeedback() {
      feedbackUntil = 0;
      countdownInfo = null;
      window.clearTimeout(feedbackTimer);
      paintHandle();
    }

    function paintCountdown() {
      const feedback = Date.now() < feedbackUntil;
      const visible = !isOpen && (!!countdownInfo || feedback);

      countdownButton.style.display = visible
        ? 'block'
        : 'none';
      handle.style.borderRadius = visible
        ? '0'
        : '10px 0 0 10px';

      if (feedback) {
        countdownMain.textContent = '再生待機';
        countdownCancel.textContent = 'キャンセル済';
        countdownButton.disabled = true;
        countdownButton.style.cursor = 'default';
        return;
      }

      countdownButton.disabled = false;
      countdownButton.style.cursor = 'pointer';

      if (countdownInfo) {
        countdownMain.textContent =
          `${countdownInfo.label} ${countdownInfo.seconds}`;
        countdownCancel.textContent = CANCEL_LABEL;
      }
    }

    function paintHandle() {
      handle.textContent = isOpen
        ? '›'
        : '‹';

      handle.style.opacity =
        (
          isOpen ||
          isHovered ||
          countdownInfo ||
          Date.now() < feedbackUntil
        )
          ? '1'
          : '.6';

      paintCountdown();
    }

    countdownButton.addEventListener('click', () => {
      if (!countdownInfo) return;

      const cancelled = countdownInfo;

      countdownInfo = null;
      feedbackUntil = Date.now() + 1400;
      cancelHandler(cancelled);
      paintHandle();

      window.clearTimeout(feedbackTimer);
      feedbackTimer = window.setTimeout(
        paintHandle,
        1450
      );
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

      drawer.style.display =
        isOpen ? 'block' : 'none';

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

      setCountdown: info => {
        const next = info || null;

        if (
          countdownInfo?.key === next?.key &&
          countdownInfo?.seconds === next?.seconds
        ) {
          return;
        }

        countdownInfo = next;
        paintHandle();
      },

      onCancel: handler => {
        cancelHandler = typeof handler === 'function'
          ? handler
          : () => {};
      },

      updateSeries: () => {
        renderSettings();
      }
    };
  }

  const ui = makePanel();

  ui.onCancel(info => {
    if (!info?.key) return;

    state.cancelled.add(info.key);

    log(
      '今回のスキップをキャンセル:',
      info.type,
      info.start.toFixed(1)
    );
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
        end - start <= LIMIT
      )) return;

      if (
        type !== 'outro' &&
        start > 1200
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
        next.sec - c[i].sec <= NEXT_LIMIT
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
      return;
    }

    const auth = loginInfo();

    if (!auth) {
      state.mode = 'login-not-found';
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

        return;
      }

      const id = String(
        session.NowPlayingItem.Id
      );

      const newItem = id !== state.id;
      const sessionItem = session.NowPlayingItem;

      if (newItem) {
        state.seriesId = String(
          sessionItem.SeriesId || ''
        );
        state.seriesName = String(
          sessionItem.SeriesName || ''
        );
      } else {
        state.seriesId = String(
          sessionItem.SeriesId || state.seriesId
        );
        state.seriesName = String(
          sessionItem.SeriesName || state.seriesName
        );
      }

      ui.updateSeries();

      if (
        !newItem &&
        (
          state.mode === 'ready' ||
          state.mode === 'no-segments'
        )
      ) return;

      state.id = id;

      state.title =
        session.NowPlayingItem.Name || '';

      state.chapters = [];
      state.ranges = [];
      if (newItem) {
        clearPlaybackDecisions();
      }

      const generation =
        ++state.generation;

      state.mode =
        'loading-chapters';

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
      ui.updateSeries();

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

      console.warn(
        TAG,
        state.lastError
      );

    } finally {
      state.busy = false;
    }
  }

  // =====================================
  // 残秒カウントダウン
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

      // 対象スキップがOFFなら予告しない
      if (!enabledFor(r.type)) continue;

      // 既にスキップ済みなら予告しない
      if (state.skipped.has(i)) continue;

      const key = rangeKey(r);

      if (state.cancelled.has(key)) continue;

      const remaining =
        r.start - now;

      if (
        remaining > 0 &&
        remaining <= COUNTDOWN_SECONDS
      ) {
        const label =
          r.type === 'intro'
            ? 'IN'
            : 'OP';

        return {
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

  // =====================================
  // 自動スキップ
  // =====================================

  function skipTick() {
    const v = videoNow();

    // 動画があるときだけタブ表示
    ui.setVisible(!!v);

    if (!v) {
      ui.setCountdown(null);
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
    }

    // カウントダウン表示を更新
    // 一時停止中も現在の残秒を保持
    ui.setCountdown(
      countdownFor(v)
    );

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

      // 種類別ON/OFF
      if (!enabledFor(r.type)) continue;

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
        v.currentTime >= r.end - .35
      ) continue;

      const dest =
        Number.isFinite(v.duration)
          ? Math.min(
              r.end + .15,
              v.duration - .3
            )
          : r.end + .15;

      if (
        dest <= v.currentTime + .1
      ) continue;

      // 実際のジャンプ
      v.currentTime = dest;

      state.skipped.add(i);

      // ジャンプ直後に残秒を消す
      ui.setCountdown(null);

      log(
        'SKIP:',
        r.type,
        r.start.toFixed(1),
        '→',
        dest.toFixed(1)
      );

      break;
    }
  }

  // =====================================
  // デバッグ機能
  // =====================================

  window.EmbyAutoSkip = {
    version: '1.6.3',

    status: () => ({
      mode: state.mode,
      itemId: state.id,
      title: state.title,
      seriesId: state.seriesId,
      seriesName: state.seriesName,
      chapters: state.chapters.length,
      ranges: state.ranges,
      settings: {...settings},
      seriesSettings: seriesRule()
        ? {...seriesRule()}
        : null,
      effectiveSettings: Object.fromEntries(
        skipTypes.map(key => [key, enabledFor(key)])
      ),
      cancelled: [...state.cancelled],
      countdown:
        countdownFor(videoNow()),
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
    'v1.6.3 起動（キャンセル・シリーズ設定対応）'
  );

  void refresh();

  setInterval(refresh, 2500);
  setInterval(skipTick, 300);

})();
