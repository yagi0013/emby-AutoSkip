// ==UserScript==
// @name         Emby AutoSkip - Edge Drawer + Countdown
// @namespace    local.emby.autoskip
// @version      1.5.0
// @description  Intro / OP / Outro auto skip with a 30-second countdown
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

  const LIMIT = 360;
  const NEXT_LIMIT = 210;
  const COUNTDOWN_SECONDS = 30;

  // =====================================
  // 設定
  // =====================================

  const settings = {
    intro: true,
    op: true,
    outro: false,
    countdown: true
  };

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

  const state = {
    mode: 'starting',
    id: '',
    title: '',
    chapters: [],
    ranges: [],
    apiBase: '',
    lastError: '',
    sessions: [],
    busy: false,
    skipped: new Set(),
    generation: 0,
    lastDuration: 0
  };

  const log = (...args) => console.log(TAG, ...args);

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

    // 設定項目
    const options = [
      ['intro', 'イントロ・前回のあらすじ'],
      ['op', 'オープニング（OP）'],
      ['outro', 'アウトロ（ED）'],
      ['countdown', '残秒表示（30秒前から）']
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
      check.checked = settings[key];

      check.style.cssText =
        'width:17px;height:17px;accent-color:#4caf50';

      check.addEventListener('change', () => {
        settings[key] = check.checked;

        localStorage.setItem(
          STORE_KEY,
          JSON.stringify(settings)
        );

        state.skipped.clear();

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
    }

    const note = document.createElement('div');

    note.textContent =
      '右端のタブは上下にドラッグできます';

    note.style.cssText =
      'font-size:11px;opacity:.7;margin-top:8px';

    drawer.append(note);

    root.append(drawer, handle);
    document.body.append(root);

    let isOpen = false;
    let countdownText = '';
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

    function paintHandle() {
      const expanded =
        !isOpen && !!countdownText;

      handle.textContent = isOpen
        ? '›'
        : expanded
          ? `${countdownText} ‹`
          : '‹';

      // カウントダウン中だけ横に広げる
      handle.style.width =
        expanded ? '86px' : '17px';

      handle.style.fontSize =
        expanded ? '14px' : '25px';

      handle.style.fontWeight =
        expanded ? '600' : '400';

      handle.style.opacity =
        (isOpen || isHovered || expanded)
          ? '1'
          : '.6';
    }

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

      // 新機能：タブに残秒を表示
      setCountdown: text => {
        const next = String(text || '');

        if (countdownText === next) {
          return;
        }

        countdownText = next;
        paintHandle();
      }
    };
  }

  const ui = makePanel();

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

      if (
        id === state.id &&
        state.mode !== 'api-error'
      ) return;

      state.id = id;

      state.title =
        session.NowPlayingItem.Name || '';

      state.chapters = [];
      state.ranges = [];
      state.skipped.clear();

      const generation =
        ++state.generation;

      state.mode =
        'loading-chapters';

      let item = await apiGet(
        `/Items?Ids=${encodeURIComponent(id)}&Fields=Chapters`
      );

      let chapters =
        item?.Items?.[0]?.Chapters;

      if (
        !Array.isArray(chapters) &&
        auth.userId
      ) {
        item = await apiGet(
          `/Users/${encodeURIComponent(auth.userId)}/Items/${encodeURIComponent(id)}`
        );

        chapters = item?.Chapters;
      }

      if (
        generation !== state.generation
      ) return;

      state.chapters =
        Array.isArray(chapters)
          ? chapters
          : [];

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
  // v1.5 新機能：残秒カウントダウン
  // =====================================

  function countdownFor(video) {
    if (
      !settings.countdown ||
      !video
    ) return '';

    if (
      state.mode !== 'ready' &&
      state.mode !== 'no-segments'
    ) return '';

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
      if (!settings[r.type]) continue;

      // 既にスキップ済みなら予告しない
      if (state.skipped.has(i)) continue;

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

        return (
          label +
          ' ' +
          Math.ceil(remaining)
        );
      }
    }

    return '';
  }

  // =====================================
  // 自動スキップ
  // =====================================

  function skipTick() {
    const v = videoNow();

    // 動画があるときだけタブ表示
    ui.setVisible(!!v);

    if (!v) {
      ui.setCountdown('');
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
      if (!settings[r.type]) continue;

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
      ui.setCountdown('');

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
    status: () => ({
      mode: state.mode,
      itemId: state.id,
      title: state.title,
      chapters: state.chapters.length,
      ranges: state.ranges,
      settings: {...settings},
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
    'v1.5 起動（30秒前カウントダウン付き）'
  );

  void refresh();

  setInterval(refresh, 2500);
  setInterval(skipTick, 300);

})();