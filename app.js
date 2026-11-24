(function () {
  'use strict';

  const { el, formatKrw } = window.TEUM_DOM;
  const { WEEKDAYS, PERIOD_TIMES, getCurrentPeriodIndex, resolveWeekTimetable, buildBlogRow, buildArticleContent } = window.TEUM_UI;
  const ALLERGENS = window.TEUM_ALLERGENS;
  const isAdminPreview = new URLSearchParams(window.location.search).get('preview') === '1' && window.parent !== window;

  function sendAdminAction(action, payload) {
    if (!isAdminPreview) return;
    window.parent.postMessage({ type: 'TEUM_ADMIN_ACTION', action, ...(payload || {}) }, '*');
  }

  const DEFAULT_SEED_TASKS = [
    {
      id: 'ass-1-math',
      title: '공통수학2 도형의 방정식 문제풀이 보고서',
      dueDate: '2026-11-24',
      subject: '수학',
      source: '수행',
      done: false
    }
  ];

  const state = {
    tab: 'home',
    grade: 1,
    classNum: 1,
    allergens: [],
    bookmarks: ['post-jisan'],
    likes: {},
    personalTasks: [...DEFAULT_SEED_TASKS],
    explore: { query: '', month: 'all', tag: '전체' },
    forest: { query: '', year: 'all', month: 'all', dept: 'all', type: 'all' },
    inlineDetail: null,
    homeEditMode: false,
    homeLayout: { items: {}, hidden: [] },
    studyTimer: {
      subject: '수학',
      mode: 'stopwatch',
      running: false,
      startedAt: 0,
      accumulatedMs: 0,
      dailyLogs: {}
    },
    data: window.TEUM_DATA || { config: { tabs: {} }, sources: {}, _meta: {} },
    timers: []
  };

  function loadUserPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem('teum_user_prefs') || '{}');
      if (saved.grade >= 1 && saved.grade <= 3) state.grade = Number(saved.grade);
      if (saved.classNum >= 1 && saved.classNum <= 8) state.classNum = Number(saved.classNum);
      if (Array.isArray(saved.allergens)) state.allergens = saved.allergens.map(Number);

      const bms = JSON.parse(localStorage.getItem('teum_bookmarks') || 'null');
      if (Array.isArray(bms)) state.bookmarks = bms;

      const likes = JSON.parse(localStorage.getItem('teum_likes') || 'null');
      if (likes && typeof likes === 'object') state.likes = likes;

      const tasksRaw = localStorage.getItem('teum_personal_tasks');
      if (tasksRaw !== null) {
        const parsed = JSON.parse(tasksRaw);
        if (Array.isArray(parsed)) state.personalTasks = parsed;
      }
      const studyRaw = localStorage.getItem('teum_study_timer_v1');
      if (studyRaw) {
        const parsed = JSON.parse(studyRaw);
        if (parsed && typeof parsed === 'object') {
          state.studyTimer = { ...state.studyTimer, ...parsed };
        }
      }
      const layoutRaw = localStorage.getItem('teum_bento_v2');
      if (layoutRaw) {
        const parsed = JSON.parse(layoutRaw);
        if (parsed && typeof parsed === 'object') {
          state.homeLayout = {
            items: parsed.items && typeof parsed.items === 'object' ? parsed.items : {},
            hidden: Array.isArray(parsed.hidden) ? parsed.hidden : []
          };
        }
      }
    } catch (e) {}
  }

  function saveHomeLayout() {
    try {
      localStorage.setItem('teum_bento_v2', JSON.stringify(state.homeLayout));
    } catch (e) {}
  }

  function commitBentoItems(itemsMap) {
    state.homeLayout.items = itemsMap && typeof itemsMap === 'object' ? itemsMap : {};
    saveHomeLayout();
    renderFeed();
  }

  function compactHomeLayout() {
    if (!window.TEUM_BENTO) return;
    const cfg = state.data.config || {};
    const tabWidgets = (cfg.tabs && cfg.tabs.home) || [];
    const hiddenSet = new Set(Array.isArray(state.homeLayout?.hidden) ? state.homeLayout.hidden : []);
    const pool = [
      { id: 'bento-meal', type: 'meal' },
      { id: 'bento-timetable', type: 'timetable' },
      ...tabWidgets.filter((w) => w && w.enabled !== false).map((w) => ({ id: w.id, type: w.type }))
    ].filter((it) => !hiddenSet.has(it.id));
    const rects = window.TEUM_BENTO.normalizeLayout(pool, state.homeLayout.items || {});
    const compacted = window.TEUM_BENTO.compactLayout(rects);
    const nextMap = {};
    for (const r of compacted) nextMap[r.id] = { x: r.x, y: r.y, w: r.w, h: r.h };
    commitBentoItems(nextMap);
  }

  function setHomeWidgetHidden(widgetId, hidden) {
    const set = new Set(Array.isArray(state.homeLayout.hidden) ? state.homeLayout.hidden : []);
    if (hidden) set.add(widgetId);
    else set.delete(widgetId);
    state.homeLayout.hidden = Array.from(set);
    saveHomeLayout();
    renderFeed();
  }

  function resetHomeLayout() {
    state.homeLayout = { items: {}, hidden: [] };
    saveHomeLayout();
    renderFeed();
  }

  function toggleHomeEditMode(force) {
    state.homeEditMode = typeof force === 'boolean' ? force : !state.homeEditMode;
    renderFeed();
  }

  function saveStudyTimerState() {
    try {
      localStorage.setItem('teum_study_timer_v1', JSON.stringify(state.studyTimer));
    } catch (e) {}
  }

  function getStudyElapsedMs() {
    const st = state.studyTimer;
    return st.accumulatedMs + (st.running && st.startedAt ? Math.max(0, Date.now() - st.startedAt) : 0);
  }

  function toggleStudyTimer() {
    const st = state.studyTimer;
    if (st.running) {
      st.accumulatedMs = getStudyElapsedMs();
      st.startedAt = 0;
      st.running = false;
    } else {
      st.startedAt = Date.now();
      st.running = true;
    }
    saveStudyTimerState();
    renderFeed();
  }

  function saveStudySession(pomoSec) {
    const st = state.studyTimer;
    const elapsedSec = Math.floor(getStudyElapsedMs() / 1000);
    const recordedSec = st.mode === 'pomodoro' && pomoSec ? Math.min(elapsedSec, pomoSec) : elapsedSec;
    if (recordedSec <= 0) return;
    const todayKey = new Date().toISOString().slice(0, 10);
    if (!st.dailyLogs || typeof st.dailyLogs !== 'object') st.dailyLogs = {};
    if (!st.dailyLogs[todayKey]) st.dailyLogs[todayKey] = {};
    const subj = st.subject || '수학';
    st.dailyLogs[todayKey][subj] = (Number(st.dailyLogs[todayKey][subj]) || 0) + recordedSec;
    st.running = false;
    st.startedAt = 0;
    st.accumulatedMs = 0;
    saveStudyTimerState();
    renderFeed();
  }

  function resetStudyTimer() {
    state.studyTimer.running = false;
    state.studyTimer.startedAt = 0;
    state.studyTimer.accumulatedMs = 0;
    saveStudyTimerState();
    renderFeed();
  }

  function setStudySubject(subj) {
    state.studyTimer.subject = subj;
    saveStudyTimerState();
    renderFeed();
  }

  function setStudyMode(mode) {
    state.studyTimer.mode = mode === 'pomodoro' ? 'pomodoro' : 'stopwatch';
    state.studyTimer.running = false;
    state.studyTimer.startedAt = 0;
    state.studyTimer.accumulatedMs = 0;
    saveStudyTimerState();
    renderFeed();
  }

  function openStudyFocusSheet(pomoSec = 1500) {
    const formatHms = (sec) => {
      const s = Math.max(0, Math.floor(sec));
      return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
        .map((n) => String(n).padStart(2, '0')).join(':');
    };
    const formatKo = (sec) => {
      const m = Math.floor(Math.max(0, sec) / 60);
      const h = Math.floor(m / 60);
      const rm = m % 60;
      if (h > 0) return `${h}시간 ${rm}분`;
      if (m > 0) return `${m}분`;
      return `${Math.floor(Math.max(0, sec))}초`;
    };

    const renderFocus = () => {
      const st = state.studyTimer;
      const clockEl = el('div', { className: 'study-focus-clock' }, '00:00:00');
      const sync = () => {
        const elapsedSec = getStudyElapsedMs() / 1000;
        clockEl.textContent = st.mode === 'pomodoro'
          ? formatHms(Math.max(0, pomoSec - elapsedSec))
          : formatHms(elapsedSec);
      };
      sync();
      if (st.running) state.timers.push(setInterval(sync, 1000));

      const todayKey = new Date().toISOString().slice(0, 10);
      const todayLogs = (st.dailyLogs && st.dailyLogs[todayKey]) || {};
      const entries = Object.entries(todayLogs).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);

      const weekDays = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const key = d.toISOString().slice(0, 10);
        const sec = Object.values((st.dailyLogs && st.dailyLogs[key]) || {}).reduce((a, b) => a + (Number(b) || 0), 0);
        weekDays.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, sec });
      }
      const maxWeekSec = Math.max(...weekDays.map((w) => w.sec), 60);

      return el('div', { className: 'study-focus-wrap' },
        el('div', { className: 'study-focus-hero' },
          el('div', { className: 'study-mode-row', style: { justifyContent: 'center' } },
            [
              { id: 'stopwatch', label: '스톱워치' },
              { id: 'pomodoro', label: `뽀모도로 ${Math.round(pomoSec / 60)}분` }
            ].map((m) =>
              el('button', {
                type: 'button',
                className: `study-mode-btn ${st.mode === m.id ? 'is-active' : ''}`.trim(),
                onClick: () => { setStudyMode(m.id); openStudyFocusSheet(pomoSec); }
              }, m.label)
            )
          ),
          el('div', { className: 'study-subj-row', style: { justifyContent: 'center' } },
            ['국어', '수학', '영어', '탐구', '기타'].map((subj) =>
              el('button', {
                type: 'button',
                className: `study-subj-chip ${st.subject === subj ? 'is-active' : ''}`.trim(),
                onClick: () => { setStudySubject(subj); openStudyFocusSheet(pomoSec); }
              }, subj)
            )
          ),
          clockEl,
          el('div', { className: 'study-controls-row', style: { justifyContent: 'center' } },
            el('button', {
              type: 'button',
              className: `planner-mini-btn ${st.running ? '' : 'is-primary'}`.trim(),
              onClick: () => { toggleStudyTimer(); openStudyFocusSheet(pomoSec); }
            }, st.running ? '일시정지' : '시작'),
            el('button', {
              type: 'button',
              className: 'planner-mini-btn',
              onClick: () => { saveStudySession(pomoSec); openStudyFocusSheet(pomoSec); }
            }, '기록 저장'),
            el('button', {
              type: 'button',
              className: 'planner-mini-btn',
              onClick: () => { resetStudyTimer(); openStudyFocusSheet(pomoSec); }
            }, '초기화')
          )
        ),
        el('div', { className: 'article-sec' },
          el('h4', null, '최근 7일 공부 기록'),
          el('div', { className: 'study-week-grid' },
            weekDays.map((w) =>
              el('div', { className: 'study-week-col' },
                el('div', { className: 'study-week-bar-wrap' },
                  el('div', { className: 'study-week-bar', style: { height: `${w.sec > 0 ? Math.max(10, Math.round((w.sec / maxWeekSec) * 100)) : 4}%`, opacity: w.sec > 0 ? 1 : 0.25 } })
                ),
                el('span', { className: 'study-week-val' }, w.sec > 0 ? `${Math.round(w.sec / 60)}m` : '-'),
                el('span', { className: 'study-week-day' }, w.label)
              )
            )
          )
        ),
        entries.length > 0 ? el('div', { className: 'article-sec' },
          el('h4', null, '오늘 과목별 누적'),
          el('div', { className: 'article-facts' },
            entries.map(([subj, sec]) =>
              el('div', { className: 'article-fact-row' },
                el('span', { style: { fontWeight: 700 } }, subj),
                el('span', { style: { fontWeight: 700, color: 'var(--accent)' } }, formatKo(sec))
              )
            )
          )
        ) : null
      );
    };

    openFullSheet('학습 집중 타이머', `${state.studyTimer.subject || '수학'} 집중 모드`, renderFocus);
  }

  function saveUserPrefs() {
    try {
      localStorage.setItem('teum_user_prefs', JSON.stringify({
        grade: state.grade,
        classNum: state.classNum,
        allergens: state.allergens
      }));
    } catch (e) {}
  }

  function saveReactions() {
    try {
      localStorage.setItem('teum_bookmarks', JSON.stringify(state.bookmarks));
      localStorage.setItem('teum_likes', JSON.stringify(state.likes));
    } catch (e) {}
  }

  function isBookmarked(id) {
    return state.bookmarks.includes(id);
  }

  function isLiked(id) {
    return Boolean(state.likes[id]);
  }

  function toggleBookmark(post) {
    if (isBookmarked(post.id)) {
      state.bookmarks = state.bookmarks.filter((x) => x !== post.id);
    } else {
      state.bookmarks = [post.id, ...state.bookmarks];
    }
    saveReactions();
    renderFeed();
  }

  function toggleLike(post) {
    state.likes[post.id] = !state.likes[post.id];
    saveReactions();
    renderFeed();
  }

  function savePersonalTasks() {
    try {
      localStorage.setItem('teum_personal_tasks', JSON.stringify(state.personalTasks));
    } catch (e) {}
  }

  function hasTaskId(id) {
    return state.personalTasks.some((t) => t.id === id);
  }

  function isPostScheduled(postId) {
    return hasTaskId(`post-${postId}`);
  }

  function toggleSchedulePost(post) {
    const taskId = `post-${post.id}`;
    if (hasTaskId(taskId)) {
      state.personalTasks = state.personalTasks.filter((t) => t.id !== taskId);
    } else {
      state.personalTasks = [
        {
          id: taskId,
          title: post.title || '공지 일정',
          dueDate: post.dueDate || post.date || '',
          subject: '공지',
          source: post.dept || '공지',
          done: false
        },
        ...state.personalTasks
      ];
    }
    savePersonalTasks();
    renderFeed();
  }

  function toggleTaskDone(id) {
    state.personalTasks = state.personalTasks.map((t) =>
      t.id === id ? Object.assign({}, t, { done: !t.done }) : t
    );
    savePersonalTasks();
    renderFeed();
  }

  function deleteTask(id) {
    state.personalTasks = state.personalTasks.filter((t) => t.id !== id);
    savePersonalTasks();
    renderFeed();
  }

  // Dark Mode Toggle Helpers
  function getStoredTheme() {
    try {
      const v = localStorage.getItem('color-scheme');
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch (e) {
      return 'system';
    }
  }

  function applyTheme(mode) {
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (mode === 'light' || mode === 'dark') {
      try { localStorage.setItem('color-scheme', mode); } catch (e) {}
      if (meta) meta.content = mode;
    } else {
      try { localStorage.removeItem('color-scheme'); } catch (e) {}
      if (meta) meta.content = 'light dark';
    }
  }

  window.addEventListener('storage', (e) => {
    if (e.key === 'color-scheme') {
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) meta.content = e.newValue || 'light dark';
      if (state.tab === 'my') renderFeed();
    }
  });

  // --- Dual Top-Layer Dialogs (Half Sheet + Full Sheet) ---
  const halfSheet = document.getElementById('halfSheet');
  const fullSheet = document.getElementById('fullSheet');

  let supportsDisplayTransition;
  function canTransitionDisplay() {
    if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
    if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
      return false;
    }
    const probe = document.createElement('div');
    probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
    document.body.appendChild(probe);
    getComputedStyle(probe).display;
    probe.style.display = 'none';
    supportsDisplayTransition = getComputedStyle(probe).display === 'block';
    probe.remove();
    return supportsDisplayTransition;
  }

  function supportsTopLayerExit() {
    return Boolean(window.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay());
  }

  async function closeTopLayer(dialog) {
    if (!dialog.open) return;
    if (!supportsTopLayerExit()) {
      dialog.setAttribute('data-closing', '');
      const animations = dialog.getAnimations ? dialog.getAnimations({ subtree: true }) : [];
      if (animations.length > 0) {
        await Promise.race([
          Promise.allSettled(animations.map((a) => a.finished)),
          new Promise((r) => setTimeout(r, 400))
        ]);
      }
      if (!dialog.hasAttribute('data-closing')) return;
      dialog.removeAttribute('data-closing');
    }
    dialog.close();
  }

  function wireSheetDialog(dialog, closeBtn) {
    closeBtn.addEventListener('click', () => closeTopLayer(dialog));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeTopLayer(dialog);
    });
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isInside = (
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width
        );
        if (!isInside) closeTopLayer(dialog);
      });
    }
  }

  wireSheetDialog(halfSheet, document.getElementById('halfCloseBtn'));
  wireSheetDialog(fullSheet, document.getElementById('fullCloseBtn'));

  function openHalfSheet(kicker, title, bodyNode) {
    document.getElementById('halfKicker').textContent = kicker || '';
    document.getElementById('halfTitle').textContent = title || '빠른 확인';
    const bodyEl = document.getElementById('halfBody');
    if (typeof bodyNode === 'string') {
      bodyEl.textContent = bodyNode;
    } else {
      bodyEl.replaceChildren(bodyNode);
    }
    if (!halfSheet.open) halfSheet.showModal();
  }

  function isDesktopLayout() {
    return window.matchMedia && window.matchMedia('(min-width: 1024px)').matches;
  }

  function closeFullDetail() {
    if (state.inlineDetail) {
      state.inlineDetail = null;
      renderFeed();
    }
    if (fullSheet.open) closeTopLayer(fullSheet);
  }

  function openFullSheet(kicker, title, bodyNode) {
    const renderFn = typeof bodyNode === 'function'
      ? bodyNode
      : () => (typeof bodyNode === 'string' ? el('div', null, bodyNode) : bodyNode);

    if (isDesktopLayout()) {
      state.inlineDetail = {
        kicker: kicker || '',
        title: title || '상세 보기',
        renderBody: renderFn
      };
      renderFeed();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    document.getElementById('fullKicker').textContent = kicker || '';
    document.getElementById('fullTitle').textContent = title || '상세 보기';
    const bodyEl = document.getElementById('fullBody');
    const rendered = renderFn();
    if (typeof rendered === 'string') {
      bodyEl.textContent = rendered;
    } else {
      bodyEl.replaceChildren(rendered);
    }
    if (!fullSheet.open) fullSheet.showModal();
  }

  function openFullArticle(post) {
    const renderBody = () => buildArticleContent(post, {
      isLiked,
      isBookmarked,
      isScheduled: isPostScheduled,
      onToggleLike: (p) => {
        toggleLike(p);
        if (state.inlineDetail) renderFeed();
        else if (fullSheet.open) document.getElementById('fullBody').replaceChildren(renderBody());
      },
      onToggleBookmark: (p) => {
        toggleBookmark(p);
        if (state.inlineDetail) renderFeed();
        else if (fullSheet.open) document.getElementById('fullBody').replaceChildren(renderBody());
      },
      onToggleSchedule: (p) => {
        toggleSchedulePost(p);
        if (state.inlineDetail) renderFeed();
        else if (fullSheet.open) document.getElementById('fullBody').replaceChildren(renderBody());
      },
      onEditPost: isAdminPreview ? (p) => {
        closeFullDetail();
        sendAdminAction('editPost', { postId: p.id });
      } : null
    });
    openFullSheet(`${post.dept || '학생자치회'} · ${post.date || ''}`, post.title || '블로그 포스트', renderBody);
  }

  function openAddTaskSheet() {
    const SUBJECTS = ['직접', '국어', '수학', '영어', '통합사회', '통합과학', '물리학Ⅰ', '화학Ⅰ', '문학', '미적분', '공지', '기타'];
    const titleInput = el('input', {
      type: 'text',
      className: 'planner-input',
      placeholder: '할 일 또는 마감 일정 (예: 물리 보고서 제출)'
    });
    const dateInput = el('input', {
      type: 'date',
      className: 'planner-input',
      value: new Date().toISOString().slice(0, 10)
    });
    const subjectSelect = el('select', { className: 'planner-input' },
      SUBJECTS.map((s) => el('option', { value: s }, s))
    );

    const form = el('form', {
      className: 'planner-form',
      onSubmit: (e) => {
        e.preventDefault();
        const title = titleInput.value.trim();
        if (!title) {
          titleInput.focus();
          return;
        }
        state.personalTasks = [
          {
            id: `custom-${Date.now().toString(36)}`,
            title,
            dueDate: dateInput.value || '',
            subject: subjectSelect.value || '직접',
            source: '직접',
            done: false
          },
          ...state.personalTasks
        ];
        savePersonalTasks();
        renderFeed();
        closeTopLayer(halfSheet);
      }
    },
      el('label', { className: 'planner-field-label' }, '일정 / 할 일 제목', titleInput),
      el('div', { className: 'planner-form-grid' },
        el('label', { className: 'planner-field-label' }, '마감 날짜', dateInput),
        el('label', { className: 'planner-field-label' }, '과목 · 분류 (시간표 자동 매칭)', subjectSelect)
      ),
      el('button', { type: 'submit', className: 'cta-btn', style: { width: '100%', backgroundColor: 'var(--accent)' } }, '내 일정에 추가')
    );

    openHalfSheet('반 시트 빠른 입력 · 폰 로컬 저장', '새 개인 일정 추가', form);
  }

  function openAssessmentPicker(assessments) {
    let showAllGrades = false;
    const bodyWrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });

    function renderPicker() {
      const list = showAllGrades
        ? assessments
        : assessments.filter((a) => Number(a.grade) === state.grade);

      const toggleBtn = el('button', {
        type: 'button',
        className: 'planner-mini-btn',
        onClick: () => {
          showAllGrades = !showAllGrades;
          renderPicker();
        }
      }, showAllGrades ? `${state.grade}학년만 보기` : '전체 학년 보기');

      const headerRow = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        el('span', { style: { fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 } },
          showAllGrades ? `전체 학년 (${list.length}건)` : `${state.grade}학년 수행평가 (${list.length}건)`
        ),
        toggleBtn
      );

      const rows = list.map((item) => {
        const added = hasTaskId(item.id);
        return el('div', { className: 'assess-row' },
          el('div', { className: 'assess-info' },
            el('p', { className: 'assess-title' }, `[${item.subject}] ${item.title}`),
            el('p', { className: 'assess-sub' }, `${item.grade}학년 · 마감 ${item.dueDate}${item.note ? ' · ' + item.note : ''}`)
          ),
          el('button', {
            type: 'button',
            className: `planner-mini-btn ${added ? 'is-primary' : ''}`.trim(),
            onClick: () => {
              if (added) {
                state.personalTasks = state.personalTasks.filter((t) => t.id !== item.id);
              } else {
                state.personalTasks = [
                  {
                    id: item.id,
                    title: item.title,
                    dueDate: item.dueDate || '',
                    subject: item.subject || '수행',
                    source: '수행',
                    done: false
                  },
                  ...state.personalTasks
                ];
              }
              savePersonalTasks();
              renderFeed();
              renderPicker();
            }
          }, added ? '담김' : '+ 담기')
        );
      });

      bodyWrap.replaceChildren(
        headerRow,
        ...(rows.length ? rows : [el('p', { className: 'card-subtitle' }, '등록된 수행평가 항목이 없습니다.')])
      );
    }

    renderPicker();
    openHalfSheet('수행평가 · 학급 일정 보드', '내 일정으로 1초 담기', bodyWrap);
  }

  function openAllTasksSheet() {
    const wrap = el('div', { className: 'planner-list' });
    function renderAll() {
      const sorted = [...state.personalTasks].sort((a, b) => {
        if (Boolean(a.done) !== Boolean(b.done)) return a.done ? 1 : -1;
        return String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'));
      });
      wrap.replaceChildren(
        ...sorted.map((task) =>
          el('div', { className: `planner-row ${task.done ? 'is-done' : ''}`.trim() },
            el('input', {
              type: 'checkbox',
              className: 'planner-check',
              checked: Boolean(task.done),
              onChange: () => { toggleTaskDone(task.id); renderAll(); }
            }),
            el('div', { className: 'planner-main' },
              el('span', { className: 'planner-title' }, task.title),
              el('span', { className: 'planner-meta' }, `${task.subject || '일정'} · ${task.dueDate || '날짜 미정'}`)
            ),
            el('button', {
              type: 'button',
              className: 'planner-del-btn',
              onClick: () => { deleteTask(task.id); renderAll(); }
            }, '✕')
          )
        )
      );
    }
    renderAll();
    openHalfSheet('개인 일정 전체 보기', `내 일정 (${state.personalTasks.length}건)`, wrap);
  }

  function openBackupRestoreSheet() {
    const area = el('textarea', {
      className: 'planner-input',
      style: { minHeight: '120px', fontFamily: 'monospace', fontSize: '0.78rem' },
      placeholder: '백업해 둔 JSON 배열을 여기에 붙여넣으세요...'
    }, JSON.stringify(state.personalTasks, null, 2));
    const msgEl = el('p', { className: 'card-subtitle', style: { margin: 0 } }, '');

    const node = el('div', { className: 'planner-form' },
      area,
      msgEl,
      el('div', { className: 'backup-row' },
        el('button', {
          type: 'button',
          className: 'planner-mini-btn',
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(JSON.stringify(state.personalTasks));
              msgEl.textContent = '클립보드에 백업 JSON을 복사했습니다.';
            } catch (e) {
              area.select();
              msgEl.textContent = '위 입력창의 텍스트를 전체 복사(Ctrl+C)해 보관하세요.';
            }
          }
        }, '백업 복사'),
        el('button', {
          type: 'button',
          className: 'planner-mini-btn is-primary',
          onClick: () => {
            try {
              const parsed = JSON.parse(area.value);
              if (!Array.isArray(parsed)) throw new Error('배열 형식이어야 합니다.');
              state.personalTasks = parsed.filter((t) => t && typeof t === 'object' && t.title);
              savePersonalTasks();
              renderFeed();
              closeTopLayer(halfSheet);
            } catch (err) {
              msgEl.textContent = `복원 실패: ${err.message}`;
            }
          }
        }, '이 내용으로 복원')
      )
    );
    openHalfSheet('로컬 저장 백업 · 기기 이동 시 활용', '개인 일정 백업 / 복원', node);
  }

  function getLunchStatusText() {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const lunchStart = 12 * 60 + 30;
    const lunchEnd = 13 * 60 + 30;
    if (mins < lunchStart) {
      const diff = lunchStart - mins;
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      return h > 0 ? `점심까지 ${h}시간 ${m}분` : `점심까지 ${m}분`;
    }
    if (mins < lunchEnd) return '점심시간 진행 중';
    return '방과 후 · 다음 급식 보기';
  }

  function clearTimers() {
    for (const id of state.timers) window.clearInterval(id);
    state.timers = [];
  }

  function renderHeader() {
    const cfg = state.data.config || {};
    const accent = String(cfg.accentColor || '#257A54').trim();
    if (accent.toUpperCase() === '#257A54') {
      document.documentElement.style.removeProperty('--accent');
      document.documentElement.style.removeProperty('--accent-weak');
    } else {
      document.documentElement.style.setProperty('--accent', accent);
      document.documentElement.style.setProperty('--accent-weak', `color-mix(in srgb, ${accent} 14%, transparent)`);
    }
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = accent;

    const brandEl = document.getElementById('brandTitle');
    const classEl = document.getElementById('schoolClassPill');
    const clockEl = document.getElementById('liveClockPill');
    const barEl = document.getElementById('liveBarText');

    if (brandEl) brandEl.textContent = cfg.siteTitle || '틈.';
    if (classEl) classEl.textContent = `${cfg.schoolName || '서전고'} ${state.grade}-${state.classNum}`;
    if (clockEl) clockEl.textContent = getLunchStatusText();
    if (barEl) barEl.textContent = cfg.liveBarText || '서전고 일상 허브';
  }

  function stripHtmlText(html) {
    return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function matchesSearchTokens(haystack, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    const tokens = q.split(/\s+/).filter(Boolean);
    const text = String(haystack || '').toLowerCase();
    return tokens.every((tk) => text.includes(tk));
  }

  // --- Built-in Explore Tab: Editorial Blog Archive ---
  function renderExploreArchive(container) {
    const posts = Array.isArray(state.data.sources?.archive_posts) ? state.data.sources.archive_posts : [];
    const months = Array.from(new Set(posts.map((p) => String(p.date || '').slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)))).sort().reverse();
    const tagCounts = new Map();
    posts.forEach((p) => {
      (Array.isArray(p.tags) ? p.tags : []).forEach((t) => {
        tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
      });
    });
    const sortedTags = Array.from(tagCounts.keys()).sort((a, b) => (tagCounts.get(b) || 0) - (tagCounts.get(a) || 0));
    const allTags = ['전체', ...sortedTags];
    const chipTags = ['전체', ...sortedTags.slice(0, 5)];
    if (state.explore.tag !== '전체' && !chipTags.includes(state.explore.tag) && allTags.includes(state.explore.tag)) {
      chipTags.push(state.explore.tag);
    }

    const controls = el('section', { className: 'archive-controls' });
    const countBadge = el('span', { className: 'badge-pill' }, '');
    const writeBtn = isAdminPreview ? el('button', {
      type: 'button',
      className: 'planner-mini-btn is-primary',
      onClick: () => sendAdminAction('newPost')
    }, '+ 글쓰기') : null;
    controls.appendChild(
      el('div', { className: 'archive-head-row' },
        el('h2', { className: 'section-heading' }, '소식 · 아카이브'),
        el('div', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px' } }, writeBtn, countBadge)
      )
    );

    const searchInput = el('input', {
      type: 'search',
      className: 'search-input',
      placeholder: '제목 · 본문 · 부서 · #태그 (예: 지산실 점심)...',
      value: state.explore.query,
      onInput: (e) => {
        state.explore.query = e.target.value;
        updateList();
      }
    });

    const monthSelect = el('select', {
      className: 'filter-select',
      'aria-label': '날짜 월별 선택',
      onChange: (e) => {
        state.explore.month = e.target.value;
        updateList();
      }
    }, [
      el('option', { value: 'all', selected: state.explore.month === 'all' }, '전체 날짜'),
      ...months.map((ym) => el('option', { value: ym, selected: state.explore.month === ym }, `${ym.slice(0, 4)}년 ${ym.slice(5)}월`))
    ]);

    const tagSelect = el('select', {
      className: 'filter-select',
      'aria-label': '전체 태그 선택',
      onChange: (e) => {
        state.explore.tag = e.target.value;
        renderTagChips();
        updateList();
      }
    }, [
      el('option', { value: '전체', selected: state.explore.tag === '전체' }, '전체 태그'),
      ...sortedTags.map((t) => el('option', { value: t, selected: state.explore.tag === t }, `${t} (${tagCounts.get(t) || 0})`))
    ]);

    controls.appendChild(el('div', { className: 'search-row', style: { flexWrap: 'wrap' } }, searchInput, monthSelect, tagSelect));

    const tagRow = el('div', { className: 'chip-scroll-row' });
    function renderTagChips() {
      tagSelect.value = allTags.includes(state.explore.tag) ? state.explore.tag : '전체';
      const visibleChips = state.explore.tag !== '전체' && !chipTags.includes(state.explore.tag)
        ? [...chipTags, state.explore.tag]
        : chipTags;
      tagRow.replaceChildren(
        ...visibleChips.map((tag) =>
          el('button', {
            type: 'button',
            className: `filter-chip ${state.explore.tag === tag ? 'is-active' : ''}`.trim(),
            onClick: () => {
              state.explore.tag = tag;
              renderTagChips();
              updateList();
            }
          }, tag)
        )
      );
    }
    renderTagChips();
    controls.appendChild(tagRow);

    const resetExploreBtn = el('button', {
      type: 'button',
      className: 'reset-link-btn',
      onClick: () => {
        state.explore = { query: '', month: 'all', tag: '전체' };
        renderFeed();
      }
    }, '필터 초기화');
    const filterSummary = el('span', null, '');
    controls.appendChild(el('div', { className: 'funnel-summary-row', style: { marginTop: '8px' } }, filterSummary, resetExploreBtn));

    const listWrap = el('div', { className: 'blog-list' });

    function updateList() {
      const filtered = posts.filter((p) => {
        if (state.explore.month !== 'all' && !String(p.date || '').startsWith(state.explore.month)) return false;
        if (state.explore.tag !== '전체' && !(Array.isArray(p.tags) && p.tags.includes(state.explore.tag))) return false;
        if (state.explore.query.trim()) {
          const secText = Array.isArray(p.article?.sections)
            ? p.article.sections.map((s) => `${s.heading || ''} ${s.body || ''}`).join(' ')
            : '';
          const hay = [
            p.title || '',
            p.excerpt || '',
            p.dept || '',
            (p.tags || []).join(' '),
            p.article?.quote || '',
            secText,
            stripHtmlText(p.article?.bodyHtml || ''),
            p.article?.attachment || ''
          ].join(' ');
          if (!matchesSearchTokens(hay, state.explore.query)) return false;
        }
        return true;
      }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

      const hasFilter = state.explore.query.trim() || state.explore.month !== 'all' || state.explore.tag !== '전체';
      filterSummary.textContent = hasFilter ? `검색 결과: ${filtered.length}건` : `최신순 전체 ${filtered.length}건`;
      resetExploreBtn.style.visibility = hasFilter ? 'visible' : 'hidden';
      countBadge.textContent = `${filtered.length}건`;
      listWrap.replaceChildren();
      if (filtered.length === 0) {
        listWrap.appendChild(el('div', { className: 'empty-state' }, '조건에 맞는 블로그 글이 없습니다.'));
        return;
      }

      filtered.forEach((post) => {
        listWrap.appendChild(
          buildBlogRow(post, {
            isBookmarked,
            onOpen: openFullArticle,
            onToggleBookmark: toggleBookmark,
            onEditPost: isAdminPreview ? (p) => sendAdminAction('editPost', { postId: p.id }) : null,
            onClickTag: (tag) => {
              state.explore.tag = tag;
              renderTagChips();
              updateList();
            }
          })
        );
      });
    }

    container.appendChild(controls);
    container.appendChild(listWrap);
    updateList();
  }

  // --- Built-in Forest Tab: Unified Free-Combination Funnel Archive ---
  function openForestRecordSheet(rec) {
    if (rec.type === 'notice' && rec.linkedPostId) {
      const posts = Array.isArray(state.data.sources?.archive_posts) ? state.data.sources.archive_posts : [];
      const linked = posts.find((p) => p.id === rec.linkedPostId);
      if (linked) {
        openFullArticle(linked);
        return;
      }
    }

    const typeMeta = {
      accounting: { label: '회계', cls: 'is-accounting' },
      minutes: { label: '회의록', cls: 'is-minutes' },
      notice: { label: '공지', cls: 'is-notice' },
      docs: { label: '자료·데이터', cls: 'is-docs' }
    }[rec.type] || { label: '기록', cls: 'is-docs' };

    const facts = [
      { label: '유형', value: typeMeta.label },
      { label: '날짜', value: rec.date || '-' },
      { label: '대수', value: rec.term || '-' },
      { label: '담당 부서', value: rec.dept || '-' }
    ];
    if (rec.type === 'accounting') {
      facts.push({ label: '구분 / 금액', value: `${rec.flow === 'income' ? '+ 수입' : '- 지출'} ${formatKrw(rec.amount)}` });
    }
    if (rec.type === 'minutes') {
      facts.push({ label: '회차 / 안건', value: `${rec.session || '회의'} · 안건 ${rec.agendaCount || 1}건` });
    }
    if (rec.type === 'docs') {
      facts.push({ label: '파일 형식', value: `${rec.fileType || 'FILE'} (${rec.fileName || ''})` });
    }

    const node = el('div', { className: 'article-wrap' },
      el('div', { className: 'article-facts' },
        facts.map((f) =>
          el('div', { className: 'article-fact-row' },
            el('span', { style: { fontWeight: 700, color: 'var(--text-muted)' } }, f.label),
            el('span', { style: { fontWeight: 700, textAlign: 'right' } }, f.value)
          )
        )
      ),
      el('div', { className: 'article-sec' },
        el('h4', null, '상세 기록'),
        el('p', null, rec.detail || rec.title || '')
      ),
      (rec.attachment || rec.fileName) ? el('div', { className: 'article-attach' },
        el('span', null, `첨부: ${rec.attachment || rec.fileName}`),
        el('span', { style: { color: 'var(--accent)' } }, '원본 보관됨')
      ) : null,
      isAdminPreview ? el('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: '12px' } },
        el('button', {
          type: 'button',
          className: 'planner-mini-btn is-primary',
          onClick: () => {
            closeFullDetail();
            sendAdminAction('editForest', { recordId: rec.id });
          }
        }, '이 기록 수정')
      ) : null
    );

    openFullSheet(`숲 아카이브 · ${rec.term || ''} · ${rec.date || ''}`, rec.title || '상세 기록', node);
  }

  function renderForestFunnel(container) {
    const records = Array.isArray(state.data.sources?.forest_all) ? state.data.sources.forest_all : [];
    const years = Array.from(new Set(records.map((r) => String(r.date || '').slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))).sort().reverse();
    const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

    const TYPE_TABS = [
      { id: 'all', label: '전체' },
      { id: 'accounting', label: '회계' },
      { id: 'minutes', label: '회의록' },
      { id: 'notice', label: '공지' },
      { id: 'docs', label: '자료' }
    ];

    const funnelBox = el('section', { className: 'funnel-box' });
    funnelBox.appendChild(
      el('div', { className: 'archive-head-row' },
        el('h2', { className: 'section-heading' }, '숲 · 투명 기록실'),
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          isAdminPreview ? el('button', {
            type: 'button',
            className: 'planner-mini-btn is-primary',
            onClick: () => sendAdminAction('newForest')
          }, '+ 기록 추가') : null,
          el('span', { className: 'badge-pill' }, `총 ${records.length}건`)
        )
      )
    );

    const searchInput = el('input', {
      type: 'search',
      className: 'search-input',
      placeholder: '키워드 검색 (예: 틈, 수능, 지산실, 잔반)...',
      value: state.forest.query,
      onInput: (e) => {
        state.forest.query = e.target.value;
        updateForestView();
      }
    });
    funnelBox.appendChild(searchInput);

    const yearSelect = el('select', {
      className: 'filter-select',
      'aria-label': '연도 선택',
      onChange: (e) => {
        state.forest.year = e.target.value;
        updateForestView();
      }
    }, [
      el('option', { value: 'all', selected: state.forest.year === 'all' }, '언제: 전체 연도'),
      ...years.map((y) => el('option', { value: y, selected: state.forest.year === y }, `${y}년`))
    ]);

    const monthSelect = el('select', {
      className: 'filter-select',
      'aria-label': '월 선택',
      onChange: (e) => {
        state.forest.month = e.target.value;
        updateForestView();
      }
    }, [
      el('option', { value: 'all', selected: state.forest.month === 'all' }, '전체 월'),
      ...months.map((m) => el('option', { value: m, selected: state.forest.month === m }, `${Number(m)}월`))
    ]);

    const depts = Array.from(new Set(records.map((r) => String(r.dept || '').trim()).filter(Boolean))).sort();
    const deptSelect = el('select', {
      className: 'filter-select',
      'aria-label': '부서 선택',
      onChange: (e) => {
        state.forest.dept = e.target.value;
        updateForestView();
      }
    }, [
      el('option', { value: 'all', selected: state.forest.dept === 'all' }, '전체 부서'),
      ...depts.map((d) => el('option', { value: d, selected: state.forest.dept === d }, d))
    ]);

    funnelBox.appendChild(el('div', { className: 'funnel-date-row' }, yearSelect, monthSelect, deptSelect));

    const typeRow = el('div', { className: 'chip-scroll-row' });
    const summaryText = el('span', null, '');
    const resetBtn = el('button', {
      type: 'button',
      className: 'reset-link-btn',
      onClick: () => {
        state.forest = { query: '', year: 'all', month: 'all', dept: 'all', type: 'all' };
        renderFeed();
      }
    }, '필터 초기화');

    funnelBox.appendChild(typeRow);
    funnelBox.appendChild(el('div', { className: 'funnel-summary-row' }, summaryText, resetBtn));

    const accSummarySlot = el('div');
    const resultsSlot = el('div', { className: 'list-items forest-list' });

    function matchDateAndQuery(rec) {
      const d = String(rec.date || '');
      if (state.forest.year !== 'all' && !d.startsWith(state.forest.year)) return false;
      if (state.forest.month !== 'all' && d.slice(5, 7) !== state.forest.month) return false;
      if (state.forest.dept !== 'all' && String(rec.dept || '').trim() !== state.forest.dept) return false;
      if (state.forest.query.trim()) {
        const hay = `${rec.title || ''} ${rec.detail || ''} ${rec.dept || ''} ${rec.term || ''} ${rec.session || ''} ${rec.fileName || ''} ${rec.attachment || ''} ${(rec.tags || []).join(' ')}`;
        if (!matchesSearchTokens(hay, state.forest.query)) return false;
      }
      return true;
    }

    function updateForestView() {
      const baseFiltered = records.filter(matchDateAndQuery);

      // Update type chips with dynamic counts
      typeRow.replaceChildren(
        ...TYPE_TABS.map((t) => {
          const cnt = t.id === 'all' ? baseFiltered.length : baseFiltered.filter((r) => r.type === t.id).length;
          return el('button', {
            type: 'button',
            className: `filter-chip ${state.forest.type === t.id ? 'is-active' : ''}`.trim(),
            onClick: () => {
              state.forest.type = t.id;
              updateForestView();
            }
          }, `${t.label} (${cnt})`);
        })
      );

      const finalItems = state.forest.type === 'all'
        ? baseFiltered
        : baseFiltered.filter((r) => r.type === state.forest.type);

      const parts = [];
      if (state.forest.year !== 'all') parts.push(`${state.forest.year}년`);
      if (state.forest.month !== 'all') parts.push(`${Number(state.forest.month)}월`);
      const typeLabel = TYPE_TABS.find((t) => t.id === state.forest.type)?.label || '전체';
      if (state.forest.type !== 'all') parts.push(typeLabel);
      if (state.forest.query.trim()) parts.push(`"${state.forest.query.trim()}"`);
      summaryText.textContent = `${parts.length ? parts.join(' · ') : '전체 조건'}: ${finalItems.length}건`;

      // Accounting auto-sum bar when accounting filter is selected
      accSummarySlot.replaceChildren();
      if (state.forest.type === 'accounting') {
        let income = 0;
        let expense = 0;
        finalItems.forEach((it) => {
          if (it.flow === 'income') income += Number(it.amount || 0);
          else expense += Number(it.amount || 0);
        });
        accSummarySlot.appendChild(
          el('div', { className: 'accounting-summary' },
            el('div', { className: 'acc-cell' },
              el('span', { className: 'acc-label' }, '수입 합계'),
              el('span', { className: 'acc-val is-income' }, `+${formatKrw(income)}`)
            ),
            el('div', { className: 'acc-cell' },
              el('span', { className: 'acc-label' }, '지출 합계'),
              el('span', { className: 'acc-val is-expense' }, `-${formatKrw(expense)}`)
            ),
            el('div', { className: 'acc-cell' },
              el('span', { className: 'acc-label' }, '잔액'),
              el('span', { className: 'acc-val is-balance' }, formatKrw(income - expense))
            )
          )
        );
      }

      resultsSlot.replaceChildren();
      if (finalItems.length === 0) {
        resultsSlot.appendChild(el('div', { className: 'empty-state' }, '선택한 조건에 맞는 기록이 없습니다.'));
        return;
      }

      const typeBadgeMap = {
        accounting: { text: '회계', cls: 'is-accounting' },
        minutes: { text: '회의록', cls: 'is-minutes' },
        notice: { text: '공지', cls: 'is-notice' },
        docs: { text: '자료', cls: 'is-docs' }
      };

      finalItems.forEach((rec) => {
        const tb = typeBadgeMap[rec.type] || { text: '기록', cls: 'is-docs' };
        let rightEl = null;
        if (rec.type === 'accounting') {
          const isInc = rec.flow === 'income';
          rightEl = el('span', {
            className: 'forest-amount',
            style: { color: isInc ? 'var(--live-text)' : 'var(--warn-text)' }
          }, `${isInc ? '+' : '-'}${formatKrw(rec.amount)}`);
        } else if (rec.type === 'docs' && rec.fileType) {
          rightEl = el('span', { className: 'badge-pill' }, rec.fileType);
        } else if (rec.type === 'minutes' && rec.agendaCount) {
          rightEl = el('span', { className: 'badge-pill' }, `안건 ${rec.agendaCount}`);
        }

        const rowBtn = el('button', {
          type: 'button',
          className: 'forest-row',
          onClick: () => openForestRecordSheet(rec)
        },
          el('div', { className: 'forest-row-main' },
            el('div', { className: 'forest-row-top' },
              el('span', { className: `type-pill ${tb.cls}` }, tb.text),
              el('span', { style: { fontSize: '0.75rem', color: 'var(--text-muted)' } }, `${rec.date || ''} · ${rec.dept || ''}`)
            ),
            el('p', { className: 'forest-row-title' }, rec.title || ''),
            rec.session ? el('div', { className: 'forest-row-meta' }, `${rec.term || ''} · ${rec.session}`) : null
          ),
          rightEl
        );

        if (isAdminPreview) {
          resultsSlot.appendChild(
            el('div', { className: 'forest-row-item' },
              rowBtn,
              el('button', {
                type: 'button',
                className: 'bookmark-btn',
                onClick: () => {
                  if (rec.type === 'notice' && rec.linkedPostId) {
                    sendAdminAction('editPost', { postId: rec.linkedPostId });
                  } else {
                    sendAdminAction('editForest', { recordId: rec.id });
                  }
                }
              }, '수정')
            )
          );
        } else {
          resultsSlot.appendChild(rowBtn);
        }
      });
    }

    container.appendChild(funnelBox);
    container.appendChild(accSummarySlot);
    container.appendChild(resultsSlot);
    updateForestView();
  }

  // --- Built-in My Tab: Saved Bookmarks + Settings ---
  function buildMySavedCard() {
    const posts = Array.isArray(state.data.sources?.archive_posts) ? state.data.sources.archive_posts : [];
    const savedPosts = posts.filter((p) => isBookmarked(p.id));

    const card = el('section', { className: 'widget-card' });
    card.appendChild(
      el('div', { className: 'card-head' },
        el('div', { className: 'card-title-wrap' },
          el('h2', { className: 'card-title' }, `보관한 블로그 글 (${savedPosts.length})`),
          el('p', { className: 'card-subtitle' }, '탐색 탭에서 [보관]을 누른 공지와 글이 모입니다')
        )
      )
    );

    if (savedPosts.length === 0) {
      card.appendChild(el('p', { className: 'card-subtitle' }, '아직 보관한 글이 없습니다.'));
    } else {
      card.appendChild(
        el('div', { className: 'list-items' },
          savedPosts.map((p) =>
            el('button', {
              type: 'button',
              className: 'list-item-btn',
              onClick: () => openFullArticle(p)
            },
              el('span', { className: 'list-item-main' },
                el('span', { className: 'list-item-title' }, p.title || ''),
                el('span', { className: 'list-item-meta' }, `${p.date || ''} · ${p.dept || ''}`)
              ),
              el('span', { className: 'badge-pill' }, '읽기')
            )
          )
        )
      );
    }
    return card;
  }

  function buildMySettingsCard() {
    const card = el('section', { className: 'widget-card' });
    card.appendChild(
      el('div', { className: 'card-head' },
        el('div', { className: 'card-title-wrap' },
          el('h2', { className: 'card-title' }, '내 설정 & 환경'),
          el('p', { className: 'card-subtitle' }, '변경 즉시 홈 피드에 반영됩니다')
        ),
        el('a', { className: 'badge-pill', href: './admin.html', style: { textDecoration: 'none' } }, '관리자')
      )
    );

    const gradeSelect = el('select', {
      className: 'field-select',
      'aria-label': '학년 선택',
      onChange: (e) => {
        state.grade = Number(e.target.value);
        saveUserPrefs();
        renderHeader();
      }
    }, [1, 2, 3].map((g) => el('option', { value: g, selected: g === state.grade }, `${g}학년`)));

    const classSelect = el('select', {
      className: 'field-select',
      'aria-label': '반 선택',
      onChange: (e) => {
        state.classNum = Number(e.target.value);
        saveUserPrefs();
        renderHeader();
      }
    }, [1, 2, 3, 4, 5, 6, 7, 8].map((c) => el('option', { value: c, selected: c === state.classNum }, `${c}반`)));

    card.appendChild(
      el('div', { className: 'settings-group' },
        el('span', { className: 'settings-label' }, '내 학년 · 반 (시간표 연동)'),
        el('div', { className: 'select-row' }, gradeSelect, classSelect)
      )
    );

    const currentTheme = getStoredTheme();
    const sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const themeOptions = [
      { id: 'system', label: `시스템 (${sysDark ? '다크' : '라이트'})` },
      { id: 'light', label: '라이트' },
      { id: 'dark', label: '다크' }
    ];
    card.appendChild(
      el('div', { className: 'settings-group' },
        el('span', { className: 'settings-label' }, '화면 테마'),
        el('div', { className: 'segmented', role: 'group', 'aria-label': '화면 테마' },
          themeOptions.map((opt) =>
            el('button', {
              type: 'button',
              className: `seg-btn ${currentTheme === opt.id ? 'is-active' : ''}`.trim(),
              onClick: () => {
                applyTheme(opt.id);
                renderFeed();
              }
            }, opt.label)
          )
        )
      )
    );

    const allergenGrid = el('div', { className: 'allergen-grid' });
    for (const [numStr, name] of Object.entries(ALLERGENS)) {
      const num = Number(numStr);
      const isSelected = state.allergens.includes(num);
      allergenGrid.appendChild(
        el('button', {
          type: 'button',
          className: `allergen-btn ${isSelected ? 'is-active' : ''}`.trim(),
          onClick: () => {
            if (state.allergens.includes(num)) {
              state.allergens = state.allergens.filter((n) => n !== num);
            } else {
              state.allergens = [...state.allergens, num].sort((a, b) => a - b);
            }
            saveUserPrefs();
            renderFeed();
          }
        }, `${num}.${name}`)
      );
    }
    card.appendChild(
      el('div', { className: 'settings-group' },
        el('span', { className: 'settings-label' }, '알레르기 주의 설정 (급식 카드 자동 강조)'),
        allergenGrid
      )
    );

    card.appendChild(
      el('div', { className: 'settings-group' },
        el('span', { className: 'settings-label' }, `개인 일정 로컬 백업 (현재 ${state.personalTasks.length}건)`),
        el('div', { className: 'backup-row' },
          el('button', {
            type: 'button',
            className: 'planner-mini-btn',
            onClick: openBackupRestoreSheet
          }, '백업 / 복원 열기'),
          el('button', {
            type: 'button',
            className: 'planner-mini-btn',
            onClick: () => {
              switchTab('home');
              toggleHomeEditMode(true);
            }
          }, '홈 화면 맞춤 배치')
        )
      )
    );

    const metaSources = (state.data._meta && state.data._meta.sources) || {};
    const bakedAt = (state.data._meta && state.data._meta.bakedAt) || '-';
    const apiList = el('div', { className: 'api-status-list' });
    for (const [key, info] of Object.entries(metaSources)) {
      const status = info.status || 'static';
      const badgeCls = status === 'live' ? 'is-live' : status === 'fallback' ? 'is-fallback' : '';
      apiList.appendChild(
        el('div', { className: 'api-status-row' },
          el('span', null, `${info.label || key}`),
          el('span', { className: `badge-pill ${badgeCls}` }, `${status.toUpperCase()} (${info.durationMs ?? 0}ms)`)
        )
      );
    }
    card.appendChild(
      el('div', { className: 'settings-group' },
        el('span', { className: 'settings-label' }, `데이터 파이프라인 상태 · ${bakedAt}`),
        apiList
      )
    );

    return card;
  }

  function buildHomeTopHero(cfg, sources, classKey) {
    const meal = sources.neis_meal && typeof sources.neis_meal === 'object' ? sources.neis_meal : {};
    const dishes = Array.isArray(meal.dishes) ? meal.dishes : [];
    const ttMap = sources.timetable && typeof sources.timetable === 'object' ? sources.timetable : {};
    const rawEntry = ttMap[classKey] || ttMap.default || [];
    const fallbackResolve = (entry) => {
      const days = ['월', '화', '수', '목', '금'];
      const d = new Date().getDay();
      const todayLabel = d >= 1 && d <= 5 ? days[d - 1] : '월';
      if (Array.isArray(entry)) {
        const w = {};
        days.forEach((k) => { w[k] = entry; });
        return { week: w, today: todayLabel, periods: entry };
      }
      if (entry && typeof entry === 'object') {
        const p = Array.isArray(entry[todayLabel]) ? entry[todayLabel] : (Array.isArray(entry['월']) ? entry['월'] : []);
        return { week: entry, today: todayLabel, periods: p };
      }
      return { week: {}, today: todayLabel, periods: [] };
    };
    const { week, today, periods } = typeof resolveWeekTimetable === 'function'
      ? resolveWeekTimetable(rawEntry)
      : fallbackResolve(rawEntry);
    const activeIdx = typeof getCurrentPeriodIndex === 'function' ? getCurrentPeriodIndex() : -1;
    const userAllergens = new Set(state.allergens || []);

    const openMealSheet = () => {
      const wrap = el('div', null,
        el('p', { style: { margin: '0 0 10px', fontSize: '0.84rem', color: 'var(--text-muted)' } }, `${meal.date || ''} ${meal.mealType || '중식'} · ${meal.calories || ''}`),
        dishes.length > 0
          ? el('div', { className: 'chip-wrap' },
              dishes.map((dish) => {
                const hits = (dish.allergens || []).filter((n) => userAllergens.has(Number(n)));
                const label = hits.length ? `${dish.name} (주의: ${hits.map((h) => ALLERGENS[h] || h).join(',')})` : dish.name;
                return el('span', { className: `dish-chip ${hits.length ? 'has-allergen' : ''}`.trim() }, label);
              })
            )
          : el('p', { className: 'card-subtitle' }, '표시할 급식 메뉴가 없습니다.')
      );
      openHalfSheet('오늘의 급식 · NEIS', '급식 전체 보기', wrap);
    };

    const openTimetableSheet = () => {
      const days = Array.isArray(WEEKDAYS) ? WEEKDAYS : ['월', '화', '수', '목', '금'];
      const maxPeriods = Math.max(7, periods.length);
      const table = el('table', { className: 'tt-table' },
        el('thead', null,
          el('tr', null,
            el('th', { className: 'tt-th tt-period-col', scope: 'col' }, '교시'),
            ...days.map((d) =>
              el('th', {
                className: `tt-th ${d === today ? 'is-today-col' : ''}`.trim(),
                scope: 'col'
              }, d)
            )
          )
        ),
        el('tbody', null,
          Array.from({ length: maxPeriods }, (_, idx) =>
            el('tr', null,
              el('th', { className: 'tt-td tt-period-col', scope: 'row' },
                el('span', { className: 'tt-pnum' }, `${idx + 1}`),
                PERIOD_TIMES && PERIOD_TIMES[idx]
                  ? el('span', { className: 'tt-ptime' }, PERIOD_TIMES[idx])
                  : null
              ),
              ...days.map((d) => {
                const subj = (week[d] && week[d][idx]) || '-';
                const isToday = d === today;
                const isNow = isToday && idx === activeIdx;
                return el('td', {
                  className: `tt-td ${isToday ? 'is-today-col' : ''} ${isNow ? 'is-now-cell' : ''}`.trim()
                }, String(subj));
              })
            )
          )
        )
      );
      const wrap = el('div', { className: 'tt-table-wrap' }, table);
      openHalfSheet(`${cfg.schoolName || '서전고'} ${classKey}반 · ${today}요일`, '주간 전체 시간표', wrap);
    };

    const nowMain = activeIdx >= 0 && periods[activeIdx]
      ? `${activeIdx + 1}교시 ${periods[activeIdx]} 진행 중`
      : `${classKey}반 · ${getLunchStatusText()}`;
    const nowSub = activeIdx >= 0 && periods[activeIdx + 1]
      ? `다음 ${periods[activeIdx + 1]}`
      : '전체 시간표';

    const mealRect = !isAdminPreview && state.homeLayout?.items ? state.homeLayout.items['bento-meal'] : null;
    const mealExpanded = Boolean(mealRect && (mealRect.h >= 3 || mealRect.w >= 3));
    const previewDishes = mealExpanded ? dishes : dishes.slice(0, 4);

    const ttRect = !isAdminPreview && state.homeLayout?.items ? state.homeLayout.items['bento-timetable'] : null;
    const ttExpanded = Boolean(ttRect && (ttRect.h >= 3 || ttRect.w >= 3));
    const startIdx = ttExpanded ? 0 : (activeIdx >= 0 ? Math.min(activeIdx, Math.max(0, periods.length - 3)) : 0);
    const previewPeriods = ttExpanded ? periods : periods.slice(startIdx, startIdx + 3);

    const stripNode = el('section', { className: 'tds-home-top home-dashboard', ariaLabel: '오늘 학교 요약' },
      el('div', { className: 'home-strip-row' },
        el('button', { type: 'button', className: 'tds-now-strip', onClick: openTimetableSheet },
          el('div', { className: 'tds-now-left' },
            el('span', { className: `tds-now-dot ${activeIdx >= 0 ? 'is-live' : ''}`.trim() }),
            el('span', { className: 'tds-now-text' }, nowMain)
          ),
          el('span', { className: 'tds-now-next' }, nowSub)
        ),
        !isAdminPreview ? el('button', {
          type: 'button',
          className: `home-edit-btn ${state.homeEditMode ? 'is-active' : ''}`.trim(),
          onClick: () => toggleHomeEditMode()
        }, state.homeEditMode ? '편집 완료' : '화면 편집') : null
      ),
      (!isAdminPreview && state.homeEditMode) ? el('div', { className: 'home-edit-banner' },
        el('span', { className: 'home-edit-banner-text' }, '카드를 끌어 원하는 칸에 놓고, 오른쪽 아래 모서리를 당겨 크기를 조절하세요.'),
        el('div', { style: { display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' } },
          isDesktopLayout() ? el('button', {
            type: 'button',
            className: 'planner-mini-btn',
            onClick: compactHomeLayout
          }, '빈칸 정리') : null,
          el('button', {
            type: 'button',
            className: 'planner-mini-btn',
            onClick: resetHomeLayout
          }, '기본 배치로 초기화'),
          el('button', {
            type: 'button',
            className: 'planner-mini-btn is-primary',
            onClick: () => toggleHomeEditMode(false)
          }, '완료')
        )
      ) : null
    );

    const mealCard = el('section', { className: 'widget-card bento-core-card', 'data-widget-id': 'bento-meal' },
      el('button', { type: 'button', className: 'bento-card-trigger', onClick: openMealSheet },
        el('div', { className: 'bento-head' },
          el('span', { className: 'bento-title' }, '오늘 급식'),
          el('span', { className: 'bento-meta' }, meal.calories || meal.date || '중식')
        ),
        previewDishes.length > 0
            ? el('ul', { className: 'bento-meal-list' },
                previewDishes.map((dish, idx) => {
                  const hits = (dish.allergens || []).filter((n) => userAllergens.has(Number(n)));
                  const text = (mealExpanded && hits.length)
                    ? `${dish.name} (주의: ${hits.map((h) => ALLERGENS[h] || h).join(',')})`
                    : dish.name;
                  return el('li', {
                    className: `bento-meal-item ${idx === 0 ? 'is-lead' : ''} ${hits.length ? 'has-allergen' : ''}`.trim()
                  }, text);
                })
              )
            : el('p', { className: 'bento-empty' }, '급식 정보가 없습니다.'),
        el('div', { className: 'bento-foot' },
          (!mealExpanded && dishes.length > 4) ? `외 ${dishes.length - 4}개 더보기` : '전체 메뉴 · 알레르기'
        )
      )
    );

    const timetableCard = el('section', { className: 'widget-card bento-core-card', 'data-widget-id': 'bento-timetable' },
      el('button', { type: 'button', className: 'bento-card-trigger', onClick: openTimetableSheet },
        el('div', { className: 'bento-head' },
          el('span', { className: 'bento-title' }, '시간표'),
          el('span', { className: 'bento-meta' }, `${periods.length || 7}교시`)
        ),
        previewPeriods.length > 0
          ? el('div', { className: 'bento-tt-list' },
              previewPeriods.map((subject, offset) => {
                const pIdx = startIdx + offset;
                const isNow = pIdx === activeIdx;
                return el('div', { className: `bento-tt-row ${isNow ? 'is-now' : ''}`.trim() },
                  el('span', { className: 'bento-tt-num' }, `${pIdx + 1}교시`),
                  el('span', { className: 'bento-tt-subj' }, String(subject))
                );
              })
            )
          : el('p', { className: 'bento-empty' }, '시간표가 없습니다.'),
        el('div', { className: 'bento-foot' }, '주간 전체 시간표')
      )
    );

    return { stripNode, mealCard, timetableCard };
  }

  function renderFeed() {
    clearTimers();
    const container = document.getElementById('feedContainer');
    container.replaceChildren();

    if (state.inlineDetail && isDesktopLayout()) {
      const detail = state.inlineDetail;
      const bodyContent = detail.renderBody ? detail.renderBody() : null;
      const page = el('section', { className: 'inline-detail-page' },
        el('div', { className: 'inline-detail-bar' },
          el('button', {
            type: 'button',
            className: 'inline-detail-back',
            onClick: () => closeFullDetail()
          }, '← 목록으로'),
          detail.kicker ? el('span', { className: 'inline-detail-kicker' }, detail.kicker) : null
        ),
        el('h1', { className: 'inline-detail-title' }, detail.title || '상세 보기'),
        el('div', { className: 'inline-detail-body' }, bodyContent)
      );
      container.appendChild(page);
      return;
    }

    const cfg = state.data.config || {};
    const sources = state.data.sources || {};
    const metaSources = (state.data._meta && state.data._meta.sources) || {};
    const tabWidgets = (cfg.tabs && cfg.tabs[state.tab]) || [];
    const classKey = `${state.grade}-${state.classNum}`;

    if (state.tab === 'home') {
      const { stripNode, mealCard, timetableCard } = buildHomeTopHero(cfg, sources, classKey);
      container.appendChild(stripNode);

      const coreItems = [
        { id: 'bento-meal', type: 'meal', title: '오늘 급식', render: () => mealCard },
        { id: 'bento-timetable', type: 'timetable', title: '시간표', render: () => timetableCard }
      ];
      const widgetItems = tabWidgets
        .filter((w) => w && w.enabled !== false)
        .map((w) => ({
          id: w.id,
          type: w.type,
          title: w.title || w.type,
          render: () => {
            const sourceKey = w.sourceKey || '';
            const sourceData = sourceKey ? sources[sourceKey] : undefined;
            return window.renderWidgetSafe(w, sourceData, {
              classKey,
              allergens: state.allergens,
              personalTasks: state.personalTasks,
              sourceMeta: sourceKey ? metaSources[sourceKey] : null,
              openHalfSheet,
              openFullArticle,
              toggleTaskDone,
              deleteTask,
              openAddTaskSheet,
              openAssessmentPicker,
              openAllTasksSheet,
              studyTimer: state.studyTimer,
              getStudyElapsedMs,
              toggleStudyTimer,
              saveStudySession,
              resetStudyTimer,
              setStudySubject,
              setStudyMode,
              openStudyFocusSheet,
              registerTimer: (id) => state.timers.push(id)
            });
          }
        }));

      const allPool = [...coreItems, ...widgetItems];
      const hiddenSet = isAdminPreview
        ? new Set()
        : new Set(Array.isArray(state.homeLayout?.hidden) ? state.homeLayout.hidden : []);
      const visibleItems = allPool.filter((it) => !hiddenSet.has(it.id));

      if (visibleItems.length === 0) {
        container.appendChild(
          el('div', { className: 'empty-state' },
            !isAdminPreview
              ? el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' } },
                  el('span', null, '홈 화면에 표시할 카드가 모두 숨겨져 있습니다.'),
                  el('button', { type: 'button', className: 'planner-mini-btn is-primary', onClick: resetHomeLayout }, '기본 배치로 복원')
                )
              : '표시할 위젯이 없습니다. 관리자 스튜디오(admin.html)에서 위젯을 추가해 보세요.'
          )
        );
        return;
      }

      const editActive = !isAdminPreview && state.homeEditMode;
      const board = el('div', { className: `bento-board ${editActive ? 'is-edit-board' : ''}`.trim() });

      if (window.TEUM_BENTO) {
        window.TEUM_BENTO.mountBentoBoard({
          boardEl: board,
          visiblePool: visibleItems,
          savedMap: isAdminPreview ? {} : (state.homeLayout.items || {}),
          editMode: editActive,
          isDesktop: isDesktopLayout(),
          onCommit: commitBentoItems,
          onHide: (id) => setHomeWidgetHidden(id, true)
        });
      } else {
        visibleItems.forEach((it) => board.appendChild(it.render()));
      }

      container.appendChild(board);

      if (editActive) {
        const hiddenItems = allPool.filter((it) => hiddenSet.has(it.id));
        if (hiddenItems.length > 0) {
          container.appendChild(
            el('section', { className: 'widget-card home-hidden-tray' },
              el('div', { className: 'card-head' },
                el('div', { className: 'card-head-title-group' },
                  el('h2', { className: 'card-title' }, `숨긴 카드 (${hiddenItems.length})`),
                  el('p', { className: 'card-subtitle' }, '다시 표시할 카드를 누르세요')
                )
              ),
              el('div', { className: 'study-subj-row' },
                hiddenItems.map((it) =>
                  el('button', {
                    type: 'button',
                    className: 'planner-mini-btn',
                    onClick: () => setHomeWidgetHidden(it.id, false)
                  }, `+ ${it.title || it.id}`)
                )
              )
            )
          );
        }
      }
      return;
    }

    if (state.tab === 'explore') {
      renderExploreArchive(container);
    } else if (state.tab === 'forest') {
      renderForestFunnel(container);
    } else if (state.tab === 'my') {
      container.appendChild(buildMySavedCard());
      container.appendChild(buildMySettingsCard());
    }

    const enabledWidgets = tabWidgets.filter((w) => w && w.enabled !== false);
    for (const widget of enabledWidgets) {
      const sourceKey = widget.sourceKey || '';
      const sourceData = sourceKey ? sources[sourceKey] : undefined;
      const ctx = {
        classKey,
        allergens: state.allergens,
        personalTasks: state.personalTasks,
        sourceMeta: sourceKey ? metaSources[sourceKey] : null,
        openHalfSheet,
        openFullArticle,
        toggleTaskDone,
        deleteTask,
        openAddTaskSheet,
        openAssessmentPicker,
        openAllTasksSheet,
        studyTimer: state.studyTimer,
        getStudyElapsedMs,
        toggleStudyTimer,
        saveStudySession,
        resetStudyTimer,
        setStudySubject,
        setStudyMode,
        openStudyFocusSheet,
        registerTimer: (id) => state.timers.push(id)
      };
      container.appendChild(window.renderWidgetSafe(widget, sourceData, ctx));
    }
  }

  function switchTab(tabName) {
    state.tab = tabName;
    state.inlineDetail = null;
    state.homeEditMode = false;
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      if (btn.dataset.tab === tabName) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    renderFeed();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  const schoolPillBtn = document.getElementById('schoolClassPill');
  if (schoolPillBtn) {
    schoolPillBtn.addEventListener('click', () => switchTab('my'));
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin && event.origin !== 'null') return;
    const msg = event.data;
    if (!msg || msg.type !== 'TEUM_PREVIEW') return;
    if (msg.config) state.data.config = msg.config;
    if (msg.sourcesData) state.data.sources = msg.sourcesData;
    if (msg.meta) state.data._meta = msg.meta;
    if (msg.activeTab && msg.activeTab !== state.tab) {
      state.tab = msg.activeTab;
      state.inlineDetail = null;
      document.querySelectorAll('.nav-btn').forEach((btn) => {
        if (btn.dataset.tab === state.tab) btn.setAttribute('aria-current', 'page');
        else btn.removeAttribute('aria-current');
      });
    }
    renderHeader();
    renderFeed();
  });

  async function syncServerStateIfAvailable() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('preview') === '1' || window.location.protocol === 'file:') return;
    try {
      const resp = await fetch('./api/state', { cache: 'no-store' });
      if (!resp.ok) return;
      const res = await resp.json();
      if (res && res.ok && res.baked) {
        state.data = res.baked;
        renderHeader();
        renderFeed();
      }
    } catch (e) {}
  }

  if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('preview') !== '1') {
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => undefined);
    }
  }

  loadUserPrefs();
  renderHeader();
  renderFeed();
  syncServerStateIfAvailable();
})();
