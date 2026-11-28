(function () {
  'use strict';

  function getElHelper() {
    if (window.TEUM_DOM && typeof window.TEUM_DOM.el === 'function') {
      return window.TEUM_DOM.el;
    }
    return function fallbackEl(tag, attrs, ...children) {
      const node = document.createElement(tag);
      if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
          if (v === null || v === undefined || v === false) continue;
          if (k === 'className') node.className = v;
          else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
          else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
          else node.setAttribute(k, String(v));
        }
      }
      for (const ch of children.flat()) {
        if (ch === null || ch === undefined || ch === false) continue;
        node.appendChild(typeof ch === 'string' ? document.createTextNode(ch) : ch);
      }
      return node;
    };
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toLocalDateStr(d) {
    const dt = d instanceof Date ? d : new Date();
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  }

  function parseLocalDate(str) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || '').trim());
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function calcDiffDays(dueStr) {
    const dt = parseLocalDate(dueStr);
    if (!dt) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((dt.getTime() - today.getTime()) / 86400000);
  }

  function calcDday(dueStr) {
    const diff = calcDiffDays(dueStr);
    if (diff === null) return '';
    if (diff === 0) return 'D-Day';
    if (diff > 0) return `D-${diff}`;
    return `D+${Math.abs(diff)}`;
  }

  function computeNextDueDate(dateStr, recurrence) {
    if (!recurrence || recurrence === 'none') return '';
    const base = parseLocalDate(dateStr) || new Date();
    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    if (recurrence === 'daily') {
      next.setDate(next.getDate() + 1);
    } else if (recurrence === 'weekly') {
      next.setDate(next.getDate() + 7);
    } else if (recurrence === 'monthly') {
      const targetDay = next.getDate();
      next.setMonth(next.getMonth() + 1, 1);
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(targetDay, lastDay));
    }
    return toLocalDateStr(next);
  }

  function normalizeSubtasks(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((it) => it && typeof it === 'object' && String(it.text || '').trim())
      .map((it, idx) => ({
        id: String(it.id || `sub-${Date.now().toString(36)}-${idx}`),
        text: String(it.text).trim().slice(0, 80),
        done: Boolean(it.done)
      }));
  }

  function normalizeTask(raw) {
    const t = raw && typeof raw === 'object' ? raw : {};
    const done = Boolean(t.done || t.status === 'done');
    const status = done
      ? 'done'
      : (t.status === 'inprogress' ? 'inprogress' : 'todo');
    const category = ['수행', '시험', '동아리', '개인'].includes(t.category)
      ? t.category
      : (t.source === '수행' ? '수행' : '개인');
    const priority = ['high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium';
    const recurrence = ['none', 'daily', 'weekly', 'monthly'].includes(t.recurrence) ? t.recurrence : 'none';
    return {
      id: String(t.id || `task-${Date.now().toString(36)}`),
      title: String(t.title || '').trim() || '제목 없는 일정',
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(t.dueDate || '')) ? String(t.dueDate) : '',
      subject: String(t.subject || '직접').trim() || '직접',
      source: String(t.source || category || '직접'),
      category,
      status,
      done: status === 'done',
      priority,
      important: Boolean(t.important),
      recurrence,
      memo: String(t.memo || '').slice(0, 1000),
      subtasks: normalizeSubtasks(t.subtasks),
      createdAt: Number(t.createdAt) || Date.now(),
      completedAt: t.completedAt ? Number(t.completedAt) : null
    };
  }

  function normalizeLog(raw) {
    const l = raw && typeof raw === 'object' ? raw : {};
    const metrics = Array.isArray(l.metrics)
      ? l.metrics
          .filter((m) => m && typeof m === 'object' && (String(m.label || '').trim() || String(m.value || '').trim()))
          .map((m) => ({
            label: String(m.label || '').trim().slice(0, 30),
            value: String(m.value || '').trim().slice(0, 30)
          }))
      : [];
    return {
      id: String(l.id || `log-${Date.now().toString(36)}`),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(l.date || '')) ? String(l.date) : toLocalDateStr(new Date()),
      category: ['수행평가', '독서', '탐구', '동아리', '자율'].includes(l.category) ? l.category : '수행평가',
      subject: String(l.subject || '직접').trim() || '직접',
      highlight: Boolean(l.highlight),
      title: String(l.title || '').trim(),
      content: String(l.content || '').slice(0, 2000),
      reflection: String(l.reflection || '').slice(0, 2000),
      nextPlan: String(l.nextPlan || '').slice(0, 600),
      metrics,
      createdAt: Number(l.createdAt) || Date.now(),
      updatedAt: Number(l.updatedAt) || Date.now()
    };
  }

  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
  const PRIORITY_LABEL = { high: '높음', medium: '보통', low: '낮음' };
  const STATUS_LABEL = { todo: '예정', inprogress: '진행 중', done: '완료' };
  const RECURRENCE_LABEL = { none: '안 함', daily: '매일', weekly: '매주', monthly: '매월' };

  function openTaskDetailSheet(existingTask, defaults, ctx) {
    const el = getElHelper();
    const isEdit = Boolean(existingTask && existingTask.id);
    const seed = normalizeTask(existingTask || {
      dueDate: (defaults && defaults.dueDate) || toLocalDateStr(new Date()),
      subject: (defaults && defaults.subject) || '직접',
      category: (defaults && defaults.category) || '수행',
      status: (defaults && defaults.status) || 'todo'
    });

    const subjects = typeof ctx.getStudentSubjects === 'function' ? ctx.getStudentSubjects() : ['직접', '국어', '수학', '영어'];
    if (seed.subject && !subjects.includes(seed.subject)) subjects.unshift(seed.subject);

    let localImportant = seed.important;
    let localSubtasks = seed.subtasks.map((s) => ({ ...s }));

    const titleInput = el('input', {
      type: 'text',
      className: 'planner-input',
      value: isEdit ? seed.title : '',
      placeholder: '할 일 또는 수행평가 제목 (예: 물리학Ⅰ 실험 보고서)',
      maxLength: 80
    });
    const dateInput = el('input', {
      type: 'date',
      className: 'planner-input',
      value: seed.dueDate
    });
    const subjectSelect = el('select', { className: 'planner-input' },
      subjects.map((s) => el('option', { value: s, selected: s === seed.subject }, s))
    );
    const categorySelect = el('select', { className: 'planner-input' },
      ['수행', '시험', '동아리', '개인'].map((c) => el('option', { value: c, selected: c === seed.category }, c))
    );
    const statusSelect = el('select', { className: 'planner-input' },
      Object.entries(STATUS_LABEL).map(([k, lbl]) => el('option', { value: k, selected: k === seed.status }, lbl))
    );
    const prioritySelect = el('select', { className: 'planner-input' },
      Object.entries(PRIORITY_LABEL).map(([k, lbl]) => el('option', { value: k, selected: k === seed.priority }, lbl))
    );
    const recSelect = el('select', { className: 'planner-input' },
      Object.entries(RECURRENCE_LABEL).map(([k, lbl]) => el('option', { value: k, selected: k === seed.recurrence }, lbl))
    );
    const memoInput = el('textarea', {
      className: 'planner-input sched-textarea',
      placeholder: '준비물, 범위, 참고할 링크나 메모를 적어두세요...',
      maxLength: 1000
    }, seed.memo);

    const impBtn = el('button', {
      type: 'button',
      className: `planner-mini-btn sched-star-toggle ${localImportant ? 'is-primary' : ''}`.trim(),
      onClick: () => {
        localImportant = !localImportant;
        impBtn.className = `planner-mini-btn sched-star-toggle ${localImportant ? 'is-primary' : ''}`.trim();
        impBtn.textContent = localImportant ? '★ 중요 일정 ON' : '☆ 중요 표시';
      }
    }, localImportant ? '★ 중요 일정 ON' : '☆ 중요 표시');

    const subListWrap = el('div', { className: 'sched-sublist' });
    const subInput = el('input', {
      type: 'text',
      className: 'planner-input',
      placeholder: '세부 할 일 입력 후 + 추가 (예: 자료 조사, 초고 작성)',
      maxLength: 80
    });

    function renderSubtasks() {
      if (localSubtasks.length === 0) {
        subListWrap.replaceChildren(
          el('p', { className: 'sched-muted-hint' }, '큰 과제를 작은 단계로 나누어 체크해 보세요.')
        );
        return;
      }
      subListWrap.replaceChildren(
        ...localSubtasks.map((st, idx) =>
          el('div', { className: `sched-sub-row ${st.done ? 'is-done' : ''}`.trim() },
            el('input', {
              type: 'checkbox',
              className: 'planner-check',
              checked: Boolean(st.done),
              onChange: () => {
                localSubtasks[idx].done = !localSubtasks[idx].done;
                renderSubtasks();
              }
            }),
            el('span', { className: 'sched-sub-text' }, st.text),
            el('button', {
              type: 'button',
              className: 'planner-del-btn',
              'aria-label': '세부 할 일 삭제',
              onClick: () => {
                localSubtasks.splice(idx, 1);
                renderSubtasks();
              }
            }, '✕')
          )
        )
      );
    }

    function addSubtaskFromInput() {
      const txt = subInput.value.trim();
      if (!txt) {
        subInput.focus();
        return;
      }
      localSubtasks.push({ id: `sub-${Date.now().toString(36)}-${localSubtasks.length}`, text: txt, done: false });
      subInput.value = '';
      renderSubtasks();
      subInput.focus();
    }

    subInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addSubtaskFromInput();
      }
    });

    renderSubtasks();

    const form = el('form', {
      className: 'planner-form sched-detail-form',
      onSubmit: (e) => {
        e.preventDefault();
        const title = titleInput.value.trim();
        if (!title) {
          titleInput.focus();
          return;
        }
        const status = statusSelect.value || 'todo';
        const done = status === 'done';
        const nextTask = normalizeTask({
          ...seed,
          id: isEdit ? seed.id : `task-${Date.now().toString(36)}`,
          title,
          dueDate: dateInput.value || '',
          subject: subjectSelect.value || '직접',
          category: categorySelect.value || '개인',
          source: categorySelect.value || '개인',
          status,
          done,
          priority: prioritySelect.value || 'medium',
          important: localImportant,
          recurrence: recSelect.value || 'none',
          memo: memoInput.value.trim(),
          subtasks: localSubtasks,
          createdAt: isEdit ? seed.createdAt : Date.now(),
          completedAt: done ? (seed.completedAt || Date.now()) : null
        });
        ctx.upsertTask(nextTask);
        ctx.closeFullSheet();
      }
    },
      el('div', { className: 'sched-detail-top-row' },
        impBtn,
        isEdit ? el('button', {
          type: 'button',
          className: 'planner-mini-btn is-danger',
          onClick: () => {
            ctx.deleteTask(seed.id);
            ctx.closeFullSheet();
          }
        }, '삭제') : null
      ),
      el('label', { className: 'planner-field-label' }, '일정 제목', titleInput),
      el('div', { className: 'planner-form-grid' },
        el('label', { className: 'planner-field-label' }, '마감일', dateInput),
        el('label', { className: 'planner-field-label' }, '과목 (내 시간표 연동)', subjectSelect)
      ),
      el('div', { className: 'planner-form-grid' },
        el('label', { className: 'planner-field-label' }, '유형', categorySelect),
        el('label', { className: 'planner-field-label' }, '진행 상태', statusSelect)
      ),
      el('div', { className: 'planner-form-grid' },
        el('label', { className: 'planner-field-label' }, '우선순위', prioritySelect),
        el('label', { className: 'planner-field-label' }, '반복 주기', recSelect)
      ),
      el('div', { className: 'planner-field-label' },
        '세부 할 일 (체크리스트)',
        el('div', { className: 'sched-sub-add-row' },
          subInput,
          el('button', { type: 'button', className: 'planner-mini-btn', onClick: addSubtaskFromInput }, '+ 추가')
        ),
        subListWrap
      ),
      el('label', { className: 'planner-field-label' }, '메모 / 준비물', memoInput),
      el('button', { type: 'submit', className: 'cta-btn', style: { width: '100%', backgroundColor: 'var(--accent)' } }, isEdit ? '변경사항 저장' : '새 일정 등록')
    );

    ctx.openFullSheet(isEdit ? '일정 상세 편집' : '새 일정 만들기', isEdit ? seed.title : '새 일정 등록', form);
  }

  function openLogEditorSheet(existingLog, ctx) {
    const el = getElHelper();
    const isEdit = Boolean(existingLog && existingLog.id);
    const seed = normalizeLog(existingLog || {});
    const subjects = typeof ctx.getStudentSubjects === 'function' ? ctx.getStudentSubjects() : ['직접', '국어', '수학', '영어', '독서'];
    if (seed.subject && !subjects.includes(seed.subject)) subjects.unshift(seed.subject);

    let localHighlight = seed.highlight;
    let localMetrics = seed.metrics.map((m) => ({ ...m }));

    const dateInput = el('input', { type: 'date', className: 'planner-input', value: seed.date });
    const catSelect = el('select', { className: 'planner-input' },
      ['수행평가', '독서', '탐구', '동아리', '자율'].map((c) => el('option', { value: c, selected: c === seed.category }, c))
    );
    const subjSelect = el('select', { className: 'planner-input' },
      subjects.map((s) => el('option', { value: s, selected: s === seed.subject }, s))
    );
    const titleInput = el('input', {
      type: 'text',
      className: 'planner-input',
      value: seed.title,
      placeholder: '활동명 또는 도서명 (예: 『코스모스』 읽고 물리학Ⅰ 세특 탐구)',
      maxLength: 100
    });
    const contentInput = el('textarea', {
      className: 'planner-input sched-textarea',
      placeholder: '수행평가 주제, 읽은 핵심 내용, 실험/탐구 과정을 정리하세요...',
      maxLength: 2000
    }, seed.content);
    const reflectInput = el('textarea', {
      className: 'planner-input sched-textarea',
      placeholder: '배운 점, 교과 개념과 연결된 인사이트, 심화 질문을 적어두면 세특 작성 때 큰 도움이 됩니다.',
      maxLength: 2000
    }, seed.reflection);
    const nextPlanInput = el('input', {
      type: 'text',
      className: 'planner-input',
      value: seed.nextPlan,
      placeholder: '다음 후속 탐구 / 보완할 점 (선택)',
      maxLength: 300
    });

    const hlBtn = el('button', {
      type: 'button',
      className: `planner-mini-btn sched-star-toggle ${localHighlight ? 'is-primary' : ''}`.trim(),
      onClick: () => {
        localHighlight = !localHighlight;
        hlBtn.className = `planner-mini-btn sched-star-toggle ${localHighlight ? 'is-primary' : ''}`.trim();
        hlBtn.textContent = localHighlight ? '★ 세특 핵심 기록' : '☆ 세특 핵심 지정';
      }
    }, localHighlight ? '★ 세특 핵심 기록' : '☆ 세특 핵심 지정');

    const metricsWrap = el('div', { className: 'sched-sublist' });
    function renderMetrics() {
      if (localMetrics.length === 0) {
        metricsWrap.replaceChildren(
          el('p', { className: 'sched-muted-hint' }, '예: 저자/출판사, 읽은 쪽수, 발표 시간, 실험 결과 수치 등')
        );
        return;
      }
      metricsWrap.replaceChildren(
        ...localMetrics.map((m, idx) =>
          el('div', { className: 'sched-metric-row' },
            el('input', {
              type: 'text',
              className: 'planner-input',
              value: m.label,
              placeholder: '항목명 (예: 도서 저자)',
              maxLength: 30,
              onInput: (e) => { localMetrics[idx].label = e.target.value; }
            }),
            el('input', {
              type: 'text',
              className: 'planner-input',
              value: m.value,
              placeholder: '내용/수치 (예: 칼 세이건)',
              maxLength: 30,
              onInput: (e) => { localMetrics[idx].value = e.target.value; }
            }),
            el('button', {
              type: 'button',
              className: 'planner-del-btn',
              'aria-label': '근거 행 삭제',
              onClick: () => {
                localMetrics.splice(idx, 1);
                renderMetrics();
              }
            }, '✕')
          )
        )
      );
    }
    renderMetrics();

    const form = el('form', {
      className: 'planner-form sched-detail-form',
      onSubmit: (e) => {
        e.preventDefault();
        const title = titleInput.value.trim();
        if (!title) {
          titleInput.focus();
          return;
        }
        const saved = normalizeLog({
          ...seed,
          id: isEdit ? seed.id : `log-${Date.now().toString(36)}`,
          date: dateInput.value || toLocalDateStr(new Date()),
          category: catSelect.value || '수행평가',
          subject: subjSelect.value || '직접',
          highlight: localHighlight,
          title,
          content: contentInput.value.trim(),
          reflection: reflectInput.value.trim(),
          nextPlan: nextPlanInput.value.trim(),
          metrics: localMetrics.filter((m) => m.label.trim() || m.value.trim()),
          createdAt: isEdit ? seed.createdAt : Date.now(),
          updatedAt: Date.now()
        });
        ctx.upsertLog(saved);
        ctx.closeFullSheet();
      }
    },
      el('div', { className: 'sched-detail-top-row' },
        hlBtn,
        isEdit ? el('button', {
          type: 'button',
          className: 'planner-mini-btn is-danger',
          onClick: () => {
            ctx.deleteLog(seed.id);
            ctx.closeFullSheet();
          }
        }, '삭제') : null
      ),
      el('label', { className: 'planner-field-label' }, '활동 / 도서 제목', titleInput),
      el('div', { className: 'planner-form-grid' },
        el('label', { className: 'planner-field-label' }, '날짜', dateInput),
        el('label', { className: 'planner-field-label' }, '분류', catSelect)
      ),
      el('label', { className: 'planner-field-label' }, '연계 과목 (내 시간표 연동)', subjSelect),
      el('label', { className: 'planner-field-label' }, '활동 · 독서 내용', contentInput),
      el('label', { className: 'planner-field-label' }, '배운 점 · 세특 연계 포인트', reflectInput),
      el('div', { className: 'planner-field-label' },
        el('div', { className: 'sched-detail-top-row' },
          el('span', null, '근거 · 수치 · 서지 정보'),
          el('button', {
            type: 'button',
            className: 'planner-mini-btn',
            onClick: () => {
              localMetrics.push({ label: '', value: '' });
              renderMetrics();
            }
          }, '+ 행 추가')
        ),
        metricsWrap
      ),
      el('label', { className: 'planner-field-label' }, '다음 탐구 계획', nextPlanInput),
      el('button', { type: 'submit', className: 'cta-btn', style: { width: '100%', backgroundColor: 'var(--accent)' } }, isEdit ? '기록 수정 저장' : '기록 저장하기')
    );

    ctx.openFullSheet('수행평가 · 독서 · 탐구 일지', isEdit ? '기록 편집' : '새 기록 작성', form);
  }

  function openReportSheet(ctx) {
    const el = getElHelper();
    const wrap = el('div', { className: 'sched-report-wrap' });
    let period = 'all';
    let subjFilter = 'all';
    const copyFeedback = el('span', { className: 'sched-muted-hint' }, '');

    function getRangeCutoff(days) {
      if (days === 'all') return '';
      const d = new Date();
      d.setDate(d.getDate() - Number(days));
      return toLocalDateStr(d);
    }

    function renderReport() {
      const tasks = (ctx.tasks || []).map(normalizeTask);
      const logs = (ctx.logs || []).map(normalizeLog);
      const cutoff = period === '7' ? getRangeCutoff(7) : period === '30' ? getRangeCutoff(30) : period === '365' ? getRangeCutoff(365) : '';

      const allSubjects = Array.from(new Set([
        ...tasks.map((t) => t.subject),
        ...logs.map((l) => l.subject)
      ].filter(Boolean)));

      const filteredDoneTasks = tasks.filter((t) => {
        if (!t.done) return false;
        if (subjFilter !== 'all' && t.subject !== subjFilter) return false;
        if (!cutoff) return true;
        const doneDate = t.completedAt ? toLocalDateStr(new Date(t.completedAt)) : t.dueDate;
        return !doneDate || doneDate >= cutoff;
      });

      const filteredLogs = logs.filter((l) => {
        if (subjFilter !== 'all' && l.subject !== subjFilter) return false;
        if (!cutoff) return true;
        return l.date >= cutoff;
      });

      const logDays = new Set(filteredLogs.map((l) => l.date)).size;
      const highlightLogs = filteredLogs.filter((l) => l.highlight);

      // Breakdown by subject across done tasks + logs
      const subjCounts = new Map();
      filteredDoneTasks.forEach((t) => subjCounts.set(t.subject, (subjCounts.get(t.subject) || 0) + 1));
      filteredLogs.forEach((l) => subjCounts.set(l.subject, (subjCounts.get(l.subject) || 0) + 1));
      const totalItems = Array.from(subjCounts.values()).reduce((a, b) => a + b, 0);
      const sortedSubj = Array.from(subjCounts.entries()).sort((a, b) => b[1] - a[1]);

      const controls = el('div', { className: 'sched-report-controls' },
        el('div', { className: 'sched-chip-row' },
          [
            { id: '7', label: '최근 7일' },
            { id: '30', label: '최근 30일' },
            { id: '365', label: '1년' },
            { id: 'all', label: '전체 기간' }
          ].map((opt) =>
            el('button', {
              type: 'button',
              className: `chip-btn ${period === opt.id ? 'is-active' : ''}`.trim(),
              onClick: () => { period = opt.id; renderReport(); }
            }, opt.label)
          )
        ),
        el('select', {
          className: 'filter-select',
          'aria-label': '과목별 리포트 필터',
          onChange: (e) => { subjFilter = e.target.value; renderReport(); }
        },
          el('option', { value: 'all', selected: subjFilter === 'all' }, '전체 과목'),
          ...allSubjects.map((s) => el('option', { value: s, selected: subjFilter === s }, s))
        )
      );

      const summaryGrid = el('div', { className: 'sched-report-cards' },
        el('div', { className: 'sched-stat-card' },
          el('span', { className: 'sched-stat-num' }, String(filteredDoneTasks.length)),
          el('span', { className: 'sched-stat-lbl' }, '완료한 일정')
        ),
        el('div', { className: 'sched-stat-card' },
          el('span', { className: 'sched-stat-num' }, `${logDays}일`),
          el('span', { className: 'sched-stat-lbl' }, `탐구·독서 기록 (${filteredLogs.length}건)`)
        ),
        el('div', { className: 'sched-stat-card is-accent' },
          el('span', { className: 'sched-stat-num' }, String(highlightLogs.length)),
          el('span', { className: 'sched-stat-lbl' }, '★ 세특 핵심')
        )
      );

      const barSection = el('div', { className: 'sched-report-section' },
        el('h3', { className: 'sched-subhead' }, '과목별 활동 비중'),
        sortedSubj.length === 0
          ? el('p', { className: 'sched-muted-hint' }, '선택한 조건에 완료된 일정이나 기록이 아직 없습니다.')
          : el('div', { className: 'sched-bar-list' },
              sortedSubj.map(([subj, cnt]) => {
                const pct = totalItems > 0 ? Math.round((cnt / totalItems) * 100) : 0;
                return el('div', { className: 'sched-bar-item' },
                  el('div', { className: 'sched-bar-head' },
                    el('span', null, subj),
                    el('span', { className: 'sched-bar-val' }, `${cnt}건 (${pct}%)`)
                  ),
                  el('div', { className: 'sched-bar-track' },
                    el('div', { className: 'sched-bar-fill', style: { width: `${pct}%` } })
                  )
                );
              })
            )
      );

      const hlSection = el('div', { className: 'sched-report-section' },
        el('h3', { className: 'sched-subhead' }, '★ 세특 핵심 기록 모아보기'),
        highlightLogs.length === 0
          ? el('p', { className: 'sched-muted-hint' }, '기록 작성 시 [★ 세특 핵심 지정]을 켜면 이곳에 자동으로 모입니다.')
          : el('div', { className: 'sched-hl-list' },
              highlightLogs.map((l) =>
                el('div', { className: 'sched-hl-card' },
                  el('div', { className: 'sched-log-meta' }, `${l.date} · ${l.subject} · ${l.category}`),
                  el('div', { className: 'sched-hl-title' }, l.title),
                  l.content ? el('p', { className: 'sched-hl-body' }, l.content) : null,
                  l.reflection ? el('p', { className: 'sched-hl-reflect' }, `💡 ${l.reflection}`) : null
                )
              )
            )
      );

      const exportRow = el('div', { className: 'sched-export-row' },
        el('button', {
          type: 'button',
          className: 'planner-mini-btn is-primary',
          onClick: async () => {
            const lines = [
              `[틈 활동 · 세특 정리 리포트] (${period === 'all' ? '전체 기간' : `최근 ${period}일`}${subjFilter === 'all' ? '' : ` · ${subjFilter}`})`,
              `- 완료한 일정: ${filteredDoneTasks.length}건`,
              `- 탐구/독서 기록: ${filteredLogs.length}건 (★ 핵심 ${highlightLogs.length}건)`,
              '',
              '■ 핵심 기록 요약'
            ];
            (highlightLogs.length ? highlightLogs : filteredLogs).forEach((l, i) => {
              lines.push(`${i + 1}. [${l.date}][${l.subject}/${l.category}] ${l.title}`);
              if (l.content) lines.push(`   - 내용: ${l.content}`);
              if (l.reflection) lines.push(`   - 배운 점: ${l.reflection}`);
              if (l.metrics.length) {
                lines.push(`   - 근거: ${l.metrics.map((m) => `${m.label}: ${m.value}`).join(', ')}`);
              }
            });
            if (filteredDoneTasks.length) {
              lines.push('', '■ 완료한 수행/할 일');
              filteredDoneTasks.forEach((t) => {
                lines.push(`- [${t.subject}] ${t.title}${t.dueDate ? ` (${t.dueDate})` : ''}`);
              });
            }
            try {
              await navigator.clipboard.writeText(lines.join('\n'));
              copyFeedback.textContent = '리포트 텍스트를 클립보드에 복사했습니다.';
            } catch (err) {
              copyFeedback.textContent = '복사에 실패했습니다. CSV 내보내기를 이용해 주세요.';
            }
          }
        }, '세특 정리 텍스트 복사'),
        el('button', {
          type: 'button',
          className: 'planner-mini-btn',
          onClick: () => {
            const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
            const rows = [['구분', '날짜', '과목', '분류', '핵심여부', '제목', '내용/메모', '배운점/다음계획']];
            filteredLogs.forEach((l) => {
              rows.push(['일지', l.date, l.subject, l.category, l.highlight ? 'Y' : '', l.title, l.content, l.reflection || l.nextPlan]);
            });
            filteredDoneTasks.forEach((t) => {
              rows.push(['완료일정', t.dueDate || '', t.subject, t.category, t.important ? 'Y' : '', t.title, t.memo || '', '']);
            });
            const csv = '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `teum_study_report_${toLocalDateStr(new Date())}.csv`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            copyFeedback.textContent = 'CSV 파일을 다운로드했습니다.';
          }
        }, 'CSV 내보내기'),
        copyFeedback
      );

      wrap.replaceChildren(controls, summaryGrid, exportRow, barSection, hlSection);
    }

    renderReport();
    ctx.openFullSheet('생기부 · 활동 누적 정리', '탐구 · 세특 리포트', wrap);
  }

  function renderScheduleTab(container, ctx) {
    const el = getElHelper();
    const ui = ctx.uiState;
    const rawTasks = (ctx.tasks || []).map(normalizeTask);
    const rawLogs = (ctx.logs || []).map(normalizeLog);
    const todayStr = toLocalDateStr(new Date());

    // 1. Compact Top KPI Strip + Quick Capture
    const totalCount = rawTasks.length;
    const doneCount = rawTasks.filter((t) => t.done).length;
    const activeCount = totalCount - doneCount;
    const rate = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
    const overdueCount = rawTasks.filter((t) => !t.done && t.dueDate && t.dueDate < todayStr).length;
    const impCount = rawTasks.filter((t) => !t.done && t.important).length;

    const kpiStrip = el('section', { className: 'sched-kpi-strip' },
      el('span', { className: 'sched-kpi-pill' }, `진행 ${activeCount}`),
      el('span', { className: 'sched-kpi-pill is-accent' }, `완료율 ${rate}%`),
      el('span', { className: `sched-kpi-pill ${overdueCount > 0 ? 'is-danger' : ''}`.trim() }, `기한초과 ${overdueCount}`),
      el('span', { className: 'sched-kpi-pill' }, `중요 ★ ${impCount}`)
    );

    const quickInput = el('input', {
      type: 'text',
      className: 'planner-input sched-quick-input',
      placeholder: '할 일 빠르게 적고 엔터... (예: 국어 독서감상문)',
      maxLength: 80,
      'aria-label': '할 일 빠른 입력'
    });
    const quickBar = el('form', {
      className: 'sched-quick-bar',
      onSubmit: (e) => {
        e.preventDefault();
        const title = quickInput.value.trim();
        if (!title) {
          quickInput.focus();
          return;
        }
        const defaultDate = ui.view === 'calendar' && ui.selectedDate ? ui.selectedDate : '';
        ctx.upsertTask(normalizeTask({
          id: `task-${Date.now().toString(36)}`,
          title,
          dueDate: defaultDate,
          subject: '직접',
          category: '개인',
          status: 'todo',
          done: false
        }));
        quickInput.value = '';
      }
    },
      quickInput,
      el('button', { type: 'submit', className: 'planner-mini-btn is-primary' }, '+ 추가')
    );

    // 2. 3-segment View Switcher (`할 일` | `달력` | `기록`)
    const segSwitch = el('div', { className: 'sched-seg-bar', role: 'tablist', 'aria-label': '일정 화면 전환' },
      [
        { id: 'tasks', label: '할 일' },
        { id: 'calendar', label: '달력' },
        { id: 'logs', label: '기록' }
      ].map((seg) =>
        el('button', {
          type: 'button',
          role: 'tab',
          'aria-selected': ui.view === seg.id ? 'true' : 'false',
          className: `sched-seg-btn ${ui.view === seg.id ? 'is-active' : ''}`.trim(),
          onClick: () => {
            ui.view = seg.id;
            ctx.rerender();
          }
        }, seg.label)
      )
    );

    const topPanel = el('section', { className: 'widget-card sched-top-card' },
      el('div', { className: 'sched-top-head' },
        el('h2', { className: 'card-title' }, '일정 · 탐구 워크스페이스'),
        segSwitch
      ),
      kpiStrip,
      quickBar
    );
    container.appendChild(topPanel);

    // 3. Render active sub-view
    if (ui.view === 'tasks') {
      renderTasksSubView(container, rawTasks, todayStr, ui, ctx, el);
    } else if (ui.view === 'calendar') {
      renderCalendarSubView(container, rawTasks, todayStr, ui, ctx, el);
    } else {
      renderLogsSubView(container, rawLogs, ui, ctx, el);
    }
  }

  function renderTasksSubView(container, rawTasks, todayStr, ui, ctx, el) {
    const filterChips = [
      { id: 'all', label: '전체' },
      { id: 'today', label: '오늘' },
      { id: 'upcoming', label: '예정' },
      { id: 'overdue', label: '기한초과' },
      { id: 'important', label: '중요 ★' },
      { id: 'done', label: '완료' }
    ];

    const modeSwitch = el('div', { className: 'sched-mini-switch' },
      el('button', {
        type: 'button',
        className: `sched-mini-tab ${ui.taskMode !== 'board' ? 'is-active' : ''}`.trim(),
        onClick: () => { ui.taskMode = 'list'; ctx.rerender(); }
      }, '목록'),
      el('button', {
        type: 'button',
        className: `sched-mini-tab ${ui.taskMode === 'board' ? 'is-active' : ''}`.trim(),
        onClick: () => { ui.taskMode = 'board'; ctx.rerender(); }
      }, '보드')
    );

    const filterBar = el('div', { className: 'sched-toolbar' },
      el('div', { className: 'sched-chip-row' },
        filterChips.map((f) =>
          el('button', {
            type: 'button',
            className: `chip-btn ${ui.filter === f.id ? 'is-active' : ''}`.trim(),
            onClick: () => { ui.filter = f.id; ctx.rerender(); }
          }, f.label)
        )
      ),
      modeSwitch
    );

    const searchInput = el('input', {
      type: 'search',
      className: 'search-input sched-search-input',
      placeholder: '제목 · 과목 · 메모 검색...',
      value: ui.query || ''
    });
    const sortSelect = el('select', {
      className: 'filter-select',
      'aria-label': '정렬 기준',
      onChange: (e) => {
        ui.sort = e.target.value;
        ctx.rerender();
      }
    },
      [
        { id: 'dueDate', label: '마감일순' },
        { id: 'priority', label: '우선순위순' },
        { id: 'created', label: '최신순' }
      ].map((o) => el('option', { value: o.id, selected: ui.sort === o.id }, o.label))
    );

    const doneTotal = rawTasks.filter((t) => t.done).length;
    const clearDoneBtn = doneTotal > 0 ? el('button', {
      type: 'button',
      className: 'planner-mini-btn',
      onClick: () => ctx.clearCompletedTasks()
    }, `완료 정리 (${doneTotal})`) : null;

    const secondRow = el('div', { className: 'sched-controls-row' },
      searchInput,
      sortSelect,
      clearDoneBtn
    );

    const bodyHost = el('div', { className: 'sched-tasks-host' });

    function filterAndSort() {
      const q = String(ui.query || '').trim().toLowerCase();
      const weekAhead = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        return toLocalDateStr(d);
      })();

      let list = rawTasks.filter((t) => {
        if (ui.filter === 'today' && (t.done || t.dueDate !== todayStr)) return false;
        if (ui.filter === 'upcoming' && (t.done || !t.dueDate || t.dueDate < todayStr || t.dueDate > weekAhead)) return false;
        if (ui.filter === 'overdue' && (t.done || !t.dueDate || t.dueDate >= todayStr)) return false;
        if (ui.filter === 'important' && (t.done || !t.important)) return false;
        if (ui.filter === 'done' && !t.done) return false;
        if (ui.filter === 'all' && ui.taskMode !== 'board' && t.done) {
          // Keep completed tasks visible in 'all', sorted to bottom, so user sees progress & can uncheck
        }
        if (q) {
          const hay = `${t.title} ${t.subject} ${t.category} ${t.memo} ${t.subtasks.map((s) => s.text).join(' ')}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      list.sort((a, b) => {
        if (Boolean(a.done) !== Boolean(b.done)) return a.done ? 1 : -1;
        if (Boolean(a.important) !== Boolean(b.important)) return a.important ? -1 : 1;
        if (ui.sort === 'priority') {
          const pr = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
          if (pr !== 0) return pr;
        } else if (ui.sort === 'created') {
          return (b.createdAt || 0) - (a.createdAt || 0);
        }
        return String(a.dueDate || '9999-99-99').localeCompare(String(b.dueDate || '9999-99-99'));
      });
      return list;
    }

    function renderListCards(list) {
      if (list.length === 0) {
        bodyHost.replaceChildren(
          el('div', { className: 'empty-state' },
            '표시할 일정이 없습니다. 위 입력창에 할 일을 적거나 [+ 상세 등록]을 눌러 보세요.'
          )
        );
        return;
      }
      bodyHost.replaceChildren(
        el('div', { className: 'sched-list' },
          list.map((t) => {
            const diff = calcDiffDays(t.dueDate);
            const dday = t.dueDate ? calcDday(t.dueDate) : '';
            const isOverdue = !t.done && diff !== null && diff < 0;
            const isUrgent = !t.done && diff !== null && diff <= 3;
            const subTotal = t.subtasks.length;
            const subDone = t.subtasks.filter((s) => s.done).length;
            const metaText = [t.subject, t.category, t.dueDate || '날짜 미정', t.recurrence !== 'none' ? RECURRENCE_LABEL[t.recurrence] : '']
              .filter(Boolean)
              .join(' · ');

            return el('div', { className: `sched-task-card ${t.done ? 'is-done' : ''} ${isOverdue ? 'is-overdue' : ''}`.trim() },
              el('input', {
                type: 'checkbox',
                className: 'planner-check',
                checked: Boolean(t.done),
                'aria-label': `${t.title} 완료 여부`,
                onChange: () => ctx.toggleTaskDone(t.id)
              }),
              el('button', {
                type: 'button',
                className: 'sched-task-body',
                onClick: () => openTaskDetailSheet(t, null, ctx)
              },
                el('div', { className: 'sched-task-title-row' },
                  t.priority === 'high' && !t.done ? el('span', { className: 'sched-prio-dot is-high', title: '우선순위 높음' }) : null,
                  el('span', { className: 'sched-task-title' }, t.title)
                ),
                el('div', { className: 'sched-task-meta-row' },
                  el('span', { className: 'planner-meta' }, metaText),
                  subTotal > 0 ? el('span', { className: 'sched-sub-badge' }, `✓ ${subDone}/${subTotal}`) : null,
                  t.status === 'inprogress' && !t.done ? el('span', { className: 'sched-status-badge' }, '진행 중') : null
                )
              ),
              dday ? el('span', { className: `dday-pill ${isUrgent ? 'is-urgent' : ''}`.trim() }, dday) : null,
              el('button', {
                type: 'button',
                className: `sched-star-btn ${t.important ? 'is-active' : ''}`.trim(),
                'aria-label': '중요 일정 토글',
                onClick: () => ctx.toggleTaskImportant(t.id)
              }, t.important ? '★' : '☆')
            );
          })
        )
      );
    }

    function renderBoardView(list) {
      const cols = [
        { id: 'todo', label: '예정', next: 'inprogress', prev: null },
        { id: 'inprogress', label: '진행 중', next: 'done', prev: 'todo' },
        { id: 'done', label: '완료', next: null, prev: 'inprogress' }
      ];
      const board = el('div', { className: 'sched-board' },
        cols.map((col) => {
          const items = list.filter((t) => t.status === col.id);
          const colBody = el('div', { className: 'sched-board-items' },
            items.length === 0
              ? el('p', { className: 'sched-muted-hint' }, '항목 없음')
              : items.map((t) => {
                  const dday = t.dueDate ? calcDday(t.dueDate) : '';
                  const card = el('div', {
                    className: `sched-board-card ${t.done ? 'is-done' : ''}`.trim(),
                    draggable: 'true'
                  },
                    el('button', {
                      type: 'button',
                      className: 'sched-board-card-btn',
                      onClick: () => openTaskDetailSheet(t, null, ctx)
                    },
                      el('div', { className: 'sched-board-title' }, `${t.important ? '★ ' : ''}${t.title}`),
                      el('div', { className: 'planner-meta' }, [t.subject, dday || t.dueDate].filter(Boolean).join(' · '))
                    ),
                    el('div', { className: 'sched-board-steps' },
                      col.prev ? el('button', {
                        type: 'button',
                        className: 'planner-mini-btn',
                        'aria-label': `${col.prev} 단계로 이동`,
                        onClick: () => ctx.setTaskStatus(t.id, col.prev)
                      }, '←') : null,
                      col.next ? el('button', {
                        type: 'button',
                        className: 'planner-mini-btn is-primary',
                        'aria-label': `${col.next} 단계로 이동`,
                        onClick: () => ctx.setTaskStatus(t.id, col.next)
                      }, col.next === 'done' ? '완료 →' : '→') : null
                    )
                  );
                  card.addEventListener('dragstart', (ev) => {
                    try { ev.dataTransfer.setData('text/plain', t.id); } catch (e) {}
                  });
                  return card;
                })
          );

          const colBox = el('section', { className: 'sched-board-col' },
            el('div', { className: 'sched-board-head' },
              el('span', { className: 'sched-board-title-col' }, col.label),
              el('span', { className: 'badge-pill' }, String(items.length))
            ),
            colBody
          );
          colBox.addEventListener('dragover', (ev) => {
            ev.preventDefault();
            colBox.classList.add('is-drag-over');
          });
          colBox.addEventListener('dragleave', () => colBox.classList.remove('is-drag-over'));
          colBox.addEventListener('drop', (ev) => {
            ev.preventDefault();
            colBox.classList.remove('is-drag-over');
            const taskId = ev.dataTransfer ? ev.dataTransfer.getData('text/plain') : '';
            if (taskId) ctx.setTaskStatus(taskId, col.id);
          });
          return colBox;
        })
      );
      bodyHost.replaceChildren(board);
    }

    function updateTaskContent() {
      const list = filterAndSort();
      if (ui.taskMode === 'board') renderBoardView(list);
      else renderListCards(list);
    }

    searchInput.addEventListener('input', (e) => {
      ui.query = e.target.value;
      updateTaskContent();
    });

    updateTaskContent();

    container.appendChild(
      el('section', { className: 'widget-card sched-section-card' },
        filterBar,
        secondRow,
        bodyHost,
        el('div', { style: { marginTop: '10px', display: 'flex', justifyContent: 'flex-end' } },
          el('button', {
            type: 'button',
            className: 'planner-mini-btn',
            onClick: () => openTaskDetailSheet(null, null, ctx)
          }, '+ 상세 옵션으로 일정 추가')
        )
      )
    );
  }

  function renderCalendarSubView(container, rawTasks, todayStr, ui, ctx, el) {
    const neisItems = Array.isArray(ctx.neisSchedule) ? ctx.neisSchedule : [];
    const cursorDate = parseLocalDate(ui.calCursor) || new Date();
    const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(ui.selectedDate || ''))
      ? ui.selectedDate
      : todayStr;
    if (!ui.selectedDate) ui.selectedDate = selectedDate;

    // Build maps by dateStr
    const neisByDate = new Map();
    neisItems.forEach((it) => {
      const ds = String(it.date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return;
      if (!neisByDate.has(ds)) neisByDate.set(ds, []);
      neisByDate.get(ds).push(it);
    });

    const tasksByDate = new Map();
    rawTasks.forEach((t) => {
      if (!t.dueDate) return;
      if (!tasksByDate.has(t.dueDate)) tasksByDate.set(t.dueDate, []);
      tasksByDate.get(t.dueDate).push(t);
    });

    function shiftCursor(dir) {
      const next = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), cursorDate.getDate());
      if (ui.calMode === 'week') next.setDate(next.getDate() + dir * 7);
      else next.setMonth(next.getMonth() + dir, 1);
      ui.calCursor = toLocalDateStr(next);
      ctx.rerender();
    }

    const headLabel = ui.calMode === 'week'
      ? `${cursorDate.getFullYear()}년 ${cursorDate.getMonth() + 1}월 주간`
      : `${cursorDate.getFullYear()}년 ${cursorDate.getMonth() + 1}월`;

    const calHeader = el('div', { className: 'sched-cal-head' },
      el('div', { className: 'sched-cal-nav' },
        el('button', { type: 'button', className: 'planner-mini-btn', 'aria-label': '이전', onClick: () => shiftCursor(-1) }, '◀'),
        el('strong', { className: 'sched-cal-title' }, headLabel),
        el('button', { type: 'button', className: 'planner-mini-btn', 'aria-label': '다음', onClick: () => shiftCursor(1) }, '▶'),
        el('button', {
          type: 'button',
          className: 'planner-mini-btn',
          onClick: () => {
            ui.calCursor = todayStr;
            ui.selectedDate = todayStr;
            ctx.rerender();
          }
        }, '오늘')
      ),
      el('div', { className: 'sched-mini-switch' },
        el('button', {
          type: 'button',
          className: `sched-mini-tab ${ui.calMode !== 'week' ? 'is-active' : ''}`.trim(),
          onClick: () => { ui.calMode = 'month'; ctx.rerender(); }
        }, '월간'),
        el('button', {
          type: 'button',
          className: `sched-mini-tab ${ui.calMode === 'week' ? 'is-active' : ''}`.trim(),
          onClick: () => { ui.calMode = 'week'; ctx.rerender(); }
        }, '주간')
      )
    );

    const legend = el('div', { className: 'sched-cal-legend' },
      el('span', { className: 'sched-legend-item' }, el('i', { className: 'sched-dot is-neis' }), '학교 학사일정(NEIS)'),
      el('span', { className: 'sched-legend-item' }, el('i', { className: 'sched-dot is-task' }), '내 일정 · 수행')
    );

    const DOW = ['일', '월', '화', '수', '목', '금', '토'];
    const cells = [];
    if (ui.calMode === 'week') {
      const start = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), cursorDate.getDate());
      start.setDate(start.getDate() - start.getDay());
      for (let i = 0; i < 7; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        cells.push({ date: d, dateStr: toLocalDateStr(d), inMonth: true });
      }
    } else {
      const year = cursorDate.getFullYear();
      const month = cursorDate.getMonth();
      const first = new Date(year, month, 1);
      const startOffset = first.getDay();
      const gridStart = new Date(year, month, 1 - startOffset);
      for (let i = 0; i < 42; i++) {
        const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
        cells.push({ date: d, dateStr: toLocalDateStr(d), inMonth: d.getMonth() === month });
      }
    }

    const grid = el('div', { className: 'sched-cal-grid' },
      ...DOW.map((name, idx) =>
        el('div', { className: `sched-cal-dow ${idx === 0 ? 'is-sun' : idx === 6 ? 'is-sat' : ''}`.trim() }, name)
      ),
      ...cells.map((cell) => {
        const dayNeis = neisByDate.get(cell.dateStr) || [];
        const dayTasks = tasksByDate.get(cell.dateStr) || [];
        const isToday = cell.dateStr === todayStr;
        const isSel = cell.dateStr === selectedDate;
        const cellBtn = el('button', {
          type: 'button',
          className: [
            'sched-cal-cell',
            cell.inMonth ? '' : 'is-out',
            isToday ? 'is-today' : '',
            isSel ? 'is-selected' : ''
          ].filter(Boolean).join(' '),
          onClick: () => {
            ui.selectedDate = cell.dateStr;
            ctx.rerender();
          }
        },
          el('span', { className: 'sched-cal-num' }, String(cell.date.getDate())),
          el('div', { className: 'sched-cal-dots' },
            dayNeis.slice(0, 2).map((n) => el('span', { className: 'sched-cal-pill is-neis', title: n.title }, n.title)),
            dayTasks.slice(0, 2).map((t) => el('span', { className: `sched-cal-pill is-task ${t.done ? 'is-done' : ''}`.trim(), title: t.title }, t.title))
          )
        );
        cellBtn.addEventListener('dragover', (ev) => ev.preventDefault());
        cellBtn.addEventListener('drop', (ev) => {
          ev.preventDefault();
          const taskId = ev.dataTransfer ? ev.dataTransfer.getData('text/plain') : '';
          if (taskId) ctx.moveTaskDueDate(taskId, cell.dateStr);
        });
        return cellBtn;
      })
    );

    // Selected Day Panel
    const selNeis = neisByDate.get(selectedDate) || [];
    const selTasks = tasksByDate.get(selectedDate) || [];
    const selPanel = el('div', { className: 'sched-day-panel' },
      el('div', { className: 'sched-day-head' },
        el('strong', null, `${selectedDate} 일정 (${selNeis.length + selTasks.length}건)`),
        el('button', {
          type: 'button',
          className: 'planner-mini-btn is-primary',
          onClick: () => openTaskDetailSheet(null, { dueDate: selectedDate }, ctx)
        }, '+ 이 날짜에 추가')
      ),
      selNeis.map((n) =>
        el('div', { className: 'sched-day-neis-row' },
          el('span', { className: 'badge-pill is-live' }, n.tag || '학사'),
          el('span', null, n.title)
        )
      ),
      selTasks.length === 0 && selNeis.length === 0
        ? el('p', { className: 'sched-muted-hint' }, '선택한 날짜에 등록된 일정이 없습니다.')
        : selTasks.map((t) =>
            el('div', { className: `sched-day-task-row ${t.done ? 'is-done' : ''}`.trim() },
              el('input', {
                type: 'checkbox',
                className: 'planner-check',
                checked: Boolean(t.done),
                onChange: () => ctx.toggleTaskDone(t.id)
              }),
              el('button', {
                type: 'button',
                className: 'sched-task-body',
                onClick: () => openTaskDetailSheet(t, null, ctx)
              },
                el('span', { className: 'sched-task-title' }, `${t.important ? '★ ' : ''}${t.title}`),
                el('span', { className: 'planner-meta' }, `${t.subject} · ${t.category}`)
              )
            )
          )
    );

    container.appendChild(
      el('section', { className: 'widget-card sched-section-card' },
        calHeader,
        legend,
        grid,
        selPanel
      )
    );
  }

  function renderLogsSubView(container, rawLogs, ui, ctx, el) {
    const searchInput = el('input', {
      type: 'search',
      className: 'search-input sched-search-input',
      placeholder: '도서명 · 활동 내용 · 과목 검색...',
      value: ui.logQuery || ''
    });

    const headerActions = el('div', { className: 'sched-controls-row' },
      searchInput,
      el('button', {
        type: 'button',
        className: 'planner-mini-btn',
        onClick: () => openReportSheet(ctx)
      }, '세특 리포트'),
      el('button', {
        type: 'button',
        className: 'planner-mini-btn is-primary',
        onClick: () => openLogEditorSheet(null, ctx)
      }, '+ 기록 쓰기')
    );

    const logCats = [
      { id: 'all', label: '전체' },
      { id: '수행평가', label: '수행평가' },
      { id: '독서', label: '독서' },
      { id: '탐구', label: '탐구' },
      { id: '동아리', label: '동아리' },
      { id: 'highlight', label: '★ 세특 핵심' }
    ];

    const chipRow = el('div', { className: 'sched-chip-row', style: { marginTop: '8px' } },
      logCats.map((c) =>
        el('button', {
          type: 'button',
          className: `chip-btn ${ui.logFilter === c.id ? 'is-active' : ''}`.trim(),
          onClick: () => { ui.logFilter = c.id; ctx.rerender(); }
        }, c.label)
      )
    );

    const listHost = el('div', { className: 'sched-log-list', style: { marginTop: '12px' } });

    function updateLogs() {
      const q = String(ui.logQuery || '').trim().toLowerCase();
      const filtered = rawLogs
        .filter((l) => {
          if (ui.logFilter === 'highlight' && !l.highlight) return false;
          if (ui.logFilter !== 'all' && ui.logFilter !== 'highlight' && l.category !== ui.logFilter) return false;
          if (q) {
            const hay = `${l.title} ${l.subject} ${l.category} ${l.content} ${l.reflection}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        })
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

      if (filtered.length === 0) {
        listHost.replaceChildren(
          el('div', { className: 'empty-state' },
            '작성된 탐구·독서 기록이 없습니다. [+ 기록 쓰기]로 수행평가나 독서 내용을 모아두고 [세특 리포트]로 정리해 보세요.'
          )
        );
        return;
      }

      listHost.replaceChildren(
        ...filtered.map((l) =>
          el('button', {
            type: 'button',
            className: `sched-log-card ${l.highlight ? 'is-highlight' : ''}`.trim(),
            onClick: () => openLogEditorSheet(l, ctx)
          },
            el('div', { className: 'sched-log-card-top' },
              el('span', { className: 'badge-pill' }, `${l.category} · ${l.subject}`),
              l.highlight ? el('span', { className: 'badge-pill is-live' }, '★ 세특 핵심') : null,
              el('span', { className: 'sched-log-date' }, l.date)
            ),
            el('div', { className: 'sched-log-title' }, l.title),
            l.content ? el('p', { className: 'sched-log-preview' }, l.content) : null,
            l.reflection ? el('p', { className: 'sched-log-reflect' }, `💡 ${l.reflection}`) : null,
            l.metrics.length > 0 ? el('div', { className: 'sched-log-metrics' },
              l.metrics.map((m) => el('span', { className: 'sched-metric-chip' }, `${m.label}: ${m.value}`))
            ) : null
          )
        )
      );
    }

    searchInput.addEventListener('input', (e) => {
      ui.logQuery = e.target.value;
      updateLogs();
    });

    updateLogs();

    container.appendChild(
      el('section', { className: 'widget-card sched-section-card' },
        headerActions,
        chipRow,
        listHost
      )
    );
  }

  window.TEUM_SCHEDULE = {
    renderScheduleTab,
    openTaskDetailSheet,
    openLogEditorSheet,
    openReportSheet,
    normalizeTask,
    normalizeLog,
    computeNextDueDate,
    toLocalDateStr,
    calcDiffDays,
    calcDday
  };
})();
