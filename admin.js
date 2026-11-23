(function () {
  'use strict';

  const { el, sanitizeUrl, sanitizeImageUrl } = window.TEUM_DOM;
  const { THUMB_THEMES } = window.TEUM_UI;
  const WIDGET_META = window.TEUM_WIDGET_META;

  const TAB_LABELS = [
    { id: 'home', label: '홈' },
    { id: 'explore', label: '탐색' },
    { id: 'forest', label: '숲' },
    { id: 'my', label: '마이' }
  ];

  const ACCENT_PRESETS = [
    { name: '서전 세이지 그린', color: '#257A54' },
    { name: '슬레이트 인디고', color: '#3B5B9D' },
    { name: '브론즈 앰버', color: '#A6631B' },
    { name: '기존 블루', color: '#3182F6' },
    { name: '로즈 핑크', color: '#F43F5E' }
  ];

  const studio = {
    serverMode: false,
    studioTab: 'widgets',
    portalTab: 'home',
    selectedWidgetId: null,
    selectedPostId: null,
    selectedForestId: null,
    config: { siteTitle: '틈.', schoolName: '서전고', accentColor: '#257A54', liveBarText: '', tabs: { home: [], explore: [], forest: [], my: [] } },
    sourcesConfig: {},
    sourcesData: {},
    meta: {}
  };

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  let toastTimer = null;
  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('is-visible');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2800);
  }

  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2) + '\n'], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function syncPreview() {
    const frame = document.getElementById('previewFrame');
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({
      type: 'TEUM_PREVIEW',
      config: studio.config,
      sourcesData: studio.sourcesData,
      meta: studio.meta,
      activeTab: studio.portalTab
    }, '*');
  }

  function updateHeaderModeUI() {
    const badge = document.getElementById('connectionBadge');
    const saveBtn = document.getElementById('saveAllBtn');
    const bakeBtn = document.getElementById('bakeNowBtn');
    if (studio.serverMode) {
      badge.textContent = '로컬 서버 연결 (원클릭 저장)';
      badge.className = 'mode-pill is-server';
      saveBtn.textContent = '저장 후 올리기';
      bakeBtn.style.display = 'inline-flex';
    } else {
      badge.textContent = '정적 모드 (JSON 다운로드)';
      badge.className = 'mode-pill is-static';
      saveBtn.textContent = 'config.json 다운로드';
      bakeBtn.style.display = 'none';
    }
    document.documentElement.style.setProperty('--accent', studio.config.accentColor || '#3182F6');
  }

  function getTabWidgets(tabId) {
    if (!studio.config.tabs) studio.config.tabs = {};
    if (!Array.isArray(studio.config.tabs[tabId])) studio.config.tabs[tabId] = [];
    return studio.config.tabs[tabId];
  }

  function ensureSelection() {
    const list = getTabWidgets(studio.portalTab);
    if (list.length === 0) {
      studio.selectedWidgetId = null;
      return;
    }
    if (!list.some((w) => w.id === studio.selectedWidgetId)) {
      studio.selectedWidgetId = list[0].id;
    }
  }

  function makeField(labelText, controlEl, fullWidth) {
    return el('div', { className: `form-field ${fullWidth ? 'full' : ''}`.trim() },
      el('label', null, labelText),
      controlEl
    );
  }

  function renderWidgetEditor(widget) {
    if (!widget) {
      return el('div', { className: 'editor-box' }, '위젯을 선택하거나 위에서 새 위젯을 추가하세요.');
    }
    if (!widget.props) widget.props = {};
    if (!widget.sheet) widget.sheet = { title: '', body: '' };

    const meta = WIDGET_META[widget.type] || { label: widget.type, icon: '위젯' };
    const box = el('div', { className: 'editor-box' });
    box.appendChild(el('h3', { className: 'editor-box-title' }, `${meta.icon} 선택된 위젯 편집: ${widget.title || widget.id}`));

    const grid = el('div', { className: 'form-grid' });

    const typeSelect = el('select', {
      onChange: (e) => {
        const newType = e.target.value;
        const tpl = WIDGET_META[newType] || {};
        widget.type = newType;
        widget.props = deepClone(tpl.defaultProps || {});
        if (!widget.sourceKey && tpl.defaultSource) widget.sourceKey = tpl.defaultSource;
        renderStudioBody();
        syncPreview();
      }
    }, Object.entries(WIDGET_META).map(([k, v]) =>
      el('option', { value: k, selected: k === widget.type }, `${v.icon} ${v.label}`)
    ));
    grid.appendChild(makeField('위젯 템플릿 종류', typeSelect));

    const sourceOptions = [el('option', { value: '', selected: !widget.sourceKey }, '(직접 입력 / 소스 없음)')];
    for (const [sKey, sCfg] of Object.entries(studio.sourcesConfig || {})) {
      sourceOptions.push(
        el('option', { value: sKey, selected: sKey === widget.sourceKey }, `${sCfg.label || sKey} [${sKey}]`)
      );
    }
    const sourceSelect = el('select', {
      onChange: (e) => {
        widget.sourceKey = e.target.value;
        renderStudioBody();
        syncPreview();
      }
    }, sourceOptions);
    grid.appendChild(makeField('연결할 API 데이터 소스', sourceSelect));

    grid.appendChild(makeField('카드 제목', el('input', {
      type: 'text',
      value: widget.title || '',
      onInput: (e) => { widget.title = e.target.value; syncPreview(); }
    })));
    grid.appendChild(makeField('부제목', el('input', {
      type: 'text',
      value: widget.subtitle || '',
      onInput: (e) => { widget.subtitle = e.target.value; syncPreview(); }
    })));

    const accentRow = el('div', { className: 'swatch-row' },
      el('input', {
        type: 'color',
        value: widget.accent || studio.config.accentColor || '#3182F6',
        onInput: (e) => { widget.accent = e.target.value; syncPreview(); }
      }),
      el('button', {
        type: 'button',
        className: 'btn btn-sm',
        onClick: () => { widget.accent = ''; renderStudioBody(); syncPreview(); }
      }, '기본 테마색 사용')
    );
    grid.appendChild(makeField('카드 강조색 (선택)', accentRow, true));

    if (widget.type === 'carousel') {
      const cb = el('input', {
        type: 'checkbox',
        checked: widget.props.pinnedOnly !== false,
        onChange: (e) => { widget.props.pinnedOnly = e.target.checked; syncPreview(); }
      });
      grid.appendChild(makeField('표시 대상 필터', el('label', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, cb, '중요공지(pinned) 글만 가로 스와이프에 노출'), true));
    } else if (widget.type === 'planner') {
      grid.appendChild(makeField('홈 카드 최대 표시 개수', el('input', {
        type: 'number',
        value: widget.props.maxVisible ?? 5,
        onInput: (e) => { widget.props.maxVisible = Math.max(1, Number(e.target.value) || 5); syncPreview(); }
      })));
    } else if (widget.type === 'stat') {
      grid.appendChild(makeField('표시 수치 (예: 72)', el('input', {
        type: 'text',
        value: widget.props.value ?? '',
        onInput: (e) => { widget.props.value = e.target.value; syncPreview(); }
      })));
      grid.appendChild(makeField('단위 (예: %, 원, 명)', el('input', {
        type: 'text',
        value: widget.props.unit ?? '',
        onInput: (e) => { widget.props.unit = e.target.value; syncPreview(); }
      })));
      grid.appendChild(makeField('게이지 비율 (0~100, 비우면 숨김)', el('input', {
        type: 'number',
        value: widget.props.percent ?? '',
        onInput: (e) => { widget.props.percent = e.target.value === '' ? '' : Number(e.target.value); syncPreview(); }
      })));
      grid.appendChild(makeField('설명 문구', el('input', {
        type: 'text',
        value: widget.props.caption ?? '',
        onInput: (e) => { widget.props.caption = e.target.value; syncPreview(); }
      })));
    } else if (widget.type === 'banner') {
      grid.appendChild(makeField('배지 텍스트 (예: EVENT)', el('input', {
        type: 'text',
        value: widget.props.badge ?? '',
        onInput: (e) => { widget.props.badge = e.target.value; syncPreview(); }
      })));
      grid.appendChild(makeField('버튼 문구', el('input', {
        type: 'text',
        value: widget.props.ctaText ?? '',
        onInput: (e) => { widget.props.ctaText = e.target.value; syncPreview(); }
      })));
      grid.appendChild(makeField('버튼 이동 URL', el('input', {
        type: 'url',
        value: widget.props.ctaUrl ?? '',
        onInput: (e) => { widget.props.ctaUrl = e.target.value; syncPreview(); }
      }), true));
      grid.appendChild(makeField('배너 설명 본문', el('textarea', {
        onInput: (e) => { widget.props.description = e.target.value; syncPreview(); }
      }, widget.props.description ?? ''), true));
    } else if (widget.type === 'text') {
      grid.appendChild(makeField('본문 내용 (API 소스가 비어있을 때 표시)', el('textarea', {
        onInput: (e) => { widget.props.body = e.target.value; syncPreview(); }
      }, widget.props.body ?? ''), true));
    } else if (widget.type === 'list') {
      grid.appendChild(makeField('최대 표시 개수', el('input', {
        type: 'number',
        value: widget.props.maxItems ?? 5,
        onInput: (e) => { widget.props.maxItems = Math.max(1, Number(e.target.value) || 5); syncPreview(); }
      })));
      if (!widget.sourceKey) {
        if (!Array.isArray(widget.props.items)) widget.props.items = [];
        const itemsWrap = el('div', { className: 'mini-items-wrap' });
        widget.props.items.forEach((item, idx) => {
          itemsWrap.appendChild(
            el('div', { className: 'mini-item-card' },
              el('input', { type: 'text', placeholder: '제목', value: item.title || '', onInput: (e) => { item.title = e.target.value; syncPreview(); } }),
              el('input', { type: 'text', placeholder: '태그', value: item.tag || '', onInput: (e) => { item.tag = e.target.value; syncPreview(); } }),
              el('input', { type: 'text', placeholder: '부제/날짜', value: item.meta || '', onInput: (e) => { item.meta = e.target.value; syncPreview(); } }),
              el('button', {
                type: 'button',
                className: 'btn btn-sm btn-danger',
                onClick: () => { widget.props.items.splice(idx, 1); renderStudioBody(); syncPreview(); }
              }, '항목 삭제')
            )
          );
        });
        itemsWrap.appendChild(
          el('button', {
            type: 'button',
            className: 'btn btn-sm',
            onClick: () => {
              widget.props.items.push({ title: '새 항목', meta: '설명', tag: '안내', detail: '상세 내용입니다.' });
              renderStudioBody();
              syncPreview();
            }
          }, '+ 직접 항목 추가')
        );
        grid.appendChild(makeField('직접 입력 목록 (API 미연결 시)', itemsWrap, true));
      }
    } else if (widget.type === 'meal') {
      const cb = el('input', {
        type: 'checkbox',
        checked: widget.props.showCalories !== false,
        onChange: (e) => { widget.props.showCalories = e.target.checked; syncPreview(); }
      });
      grid.appendChild(makeField('칼로리 표시', el('label', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, cb, '칼로리 뱃지 표시'), true));
    } else if (widget.type === 'timetable') {
      const cb = el('input', {
        type: 'checkbox',
        checked: widget.props.showPeriodTimes !== false,
        onChange: (e) => { widget.props.showPeriodTimes = e.target.checked; syncPreview(); }
      });
      grid.appendChild(makeField('교시 시작 시각 표시', el('label', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, cb, '시간 표시 (08:40 등)'), true));
    } else if (widget.type === 'ticker') {
      grid.appendChild(makeField('전환 주기 (ms)', el('input', {
        type: 'number',
        value: widget.props.intervalMs ?? 3000,
        onInput: (e) => { widget.props.intervalMs = Math.max(1500, Number(e.target.value) || 3000); syncPreview(); }
      })));
    }

    grid.appendChild(makeField('반 시트 제목 (카드 클릭 시)', el('input', {
      type: 'text',
      value: widget.sheet.title || '',
      onInput: (e) => { widget.sheet.title = e.target.value; syncPreview(); }
    }), true));
    grid.appendChild(makeField('반 시트 안내 문구', el('textarea', {
      onInput: (e) => { widget.sheet.body = e.target.value; syncPreview(); }
    }, widget.sheet.body || ''), true));

    box.appendChild(grid);
    return box;
  }

  function renderWidgetsTab(container) {
    ensureSelection();

    container.appendChild(
      el('div', { className: 'portal-tab-bar' },
        TAB_LABELS.map((t) =>
          el('button', {
            type: 'button',
            className: `portal-tab-btn ${studio.portalTab === t.id ? 'is-active' : ''}`.trim(),
            onClick: () => {
              studio.portalTab = t.id;
              studio.selectedWidgetId = null;
              renderStudioBody();
              syncPreview();
            }
          }, t.label)
        )
      )
    );

    const newTypeSelect = el('select', { 'aria-label': '추가할 위젯 템플릿' },
      Object.entries(WIDGET_META).map(([k, v]) => el('option', { value: k }, `${v.label}: ${v.description}`))
    );
    container.appendChild(
      el('div', { className: 'add-bar' },
        newTypeSelect,
        el('button', {
          type: 'button',
          className: 'btn btn-primary',
          onClick: () => {
            const tKey = newTypeSelect.value;
            const tpl = WIDGET_META[tKey] || {};
            const newWidget = {
              id: `${studio.portalTab}-${tKey}-${Date.now().toString(36)}`,
              type: tKey,
              enabled: true,
              title: `새 ${tpl.label || tKey}`,
              subtitle: '커스텀 위젯',
              sourceKey: tpl.defaultSource || '',
              accent: '',
              props: deepClone(tpl.defaultProps || {}),
              sheet: { title: `새 ${tpl.label || tKey}`, body: '관리자 스튜디오에서 추가한 커스텀 위젯입니다.' }
            };
            const list = getTabWidgets(studio.portalTab);
            list.push(newWidget);
            studio.selectedWidgetId = newWidget.id;
            renderStudioBody();
            syncPreview();
            showToast('새 위젯을 추가했습니다!');
          }
        }, '+ 새 위젯 추가')
      )
    );

    const widgets = getTabWidgets(studio.portalTab);
    const listWrap = el('div', { className: 'widget-list' });

    if (widgets.length === 0) {
      const hint = studio.portalTab === 'explore'
        ? '탐색 탭은 기본 네이버 블로그 아카이브가 자동 표시됩니다. 필요 시 아래에 추가 위젯을 꽂을 수 있습니다.'
        : studio.portalTab === 'forest'
          ? '숲 탭은 기본 통합 깔때기 창고가 자동 표시됩니다. 필요 시 상·하단 추가 위젯을 꽂을 수 있습니다.'
          : '이 탭에는 아직 커스텀 위젯이 없습니다.';
      listWrap.appendChild(el('p', { style: { color: 'var(--text-muted)', fontSize: '0.84rem' } }, hint));
    } else {
      widgets.forEach((w, idx) => {
        const meta = WIDGET_META[w.type] || { icon: '위젯', label: w.type };
        const isSelected = w.id === studio.selectedWidgetId;
        listWrap.appendChild(
          el('div', {
            className: `widget-row ${isSelected ? 'is-selected' : ''} ${w.enabled === false ? 'is-disabled' : ''}`.trim(),
            onClick: (e) => {
              if (e.target.closest('button, input')) return;
              studio.selectedWidgetId = w.id;
              renderStudioBody();
            }
          },
            el('div', { className: 'widget-row-info' },
              el('div', { className: 'widget-row-title' },
                el('span', null, `${meta.icon} ${w.title || '(제목 없음)'}`),
                w.sourceKey ? el('span', { className: 'status-badge' }, `API: ${w.sourceKey}`) : null
              ),
              el('div', { className: 'widget-row-sub' }, `${meta.label}${w.subtitle ? ' · ' + w.subtitle : ''}`)
            ),
            el('div', { className: 'widget-row-actions' },
              el('input', {
                type: 'checkbox',
                checked: w.enabled !== false,
                title: '표시 여부',
                onChange: (e) => {
                  w.enabled = e.target.checked;
                  renderStudioBody();
                  syncPreview();
                }
              }),
              el('button', {
                type: 'button',
                className: 'btn btn-sm',
                disabled: idx === 0,
                onClick: () => { [widgets[idx - 1], widgets[idx]] = [widgets[idx], widgets[idx - 1]]; renderStudioBody(); syncPreview(); }
              }, '▲'),
              el('button', {
                type: 'button',
                className: 'btn btn-sm',
                disabled: idx === widgets.length - 1,
                onClick: () => { [widgets[idx + 1], widgets[idx]] = [widgets[idx], widgets[idx + 1]]; renderStudioBody(); syncPreview(); }
              }, '▼'),
              el('button', {
                type: 'button',
                className: 'btn btn-sm btn-danger',
                onClick: () => {
                  widgets.splice(idx, 1);
                  if (studio.selectedWidgetId === w.id) studio.selectedWidgetId = null;
                  renderStudioBody();
                  syncPreview();
                }
              }, '삭제')
            )
          )
        );
      });
    }
    container.appendChild(listWrap);

    const selected = widgets.find((w) => w.id === studio.selectedWidgetId) || null;
    container.appendChild(renderWidgetEditor(selected));
  }

  function resizeDataUrlForStatic(dataUrl, callback) {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 320;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, side, side, 0, 0, 320, 320);
      callback(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => callback(dataUrl);
    img.src = dataUrl;
  }

  function syncPostsPreviewData(postsList) {
    if (studio.meta?.sources?.archive_posts?.status !== 'live') {
      studio.sourcesData.archive_posts = postsList;
    }
    syncPreview();
  }

  function syncForestPreviewData(records) {
    if (studio.meta?.sources?.forest_records?.status !== 'live') {
      studio.sourcesData.forest_records = records;
    }
    const baseRecords = Array.isArray(studio.sourcesData.forest_records) ? studio.sourcesData.forest_records : records;
    const posts = Array.isArray(studio.sourcesData.archive_posts)
      ? studio.sourcesData.archive_posts
      : (Array.isArray(studio.sourcesConfig?.archive_posts?.fallback) ? studio.sourcesConfig.archive_posts.fallback : []);
    const noticeRows = posts
      .filter((p) => {
        const tags = Array.isArray(p.tags) ? p.tags : [];
        return tags.includes('#재정') || tags.includes('#공지');
      })
      .map((p) => ({
        id: `notice-${p.id}`,
        type: 'notice',
        date: p.date || '',
        term: p.term || '제10대',
        dept: p.dept || '학생자치회',
        title: p.title || '',
        detail: p.excerpt || '',
        attachment: p.article?.attachment || '',
        linkedPostId: p.id
      }));
    studio.sourcesData.forest_all = [...baseRecords, ...noticeRows]
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    syncPreview();
  }

  const POST_TEMPLATES = [
    { id: 'pinned-notice', label: '홈 상단 공지', sub: '홈 스와이프 + 탐색', pinned: true, tags: ['#공지'], icon: '공지', theme: 'forest', dept: '학생자치회' },
    { id: 'normal-notice', label: '탐색 일반 공지', sub: '탐색 소식 목록', pinned: false, tags: ['#공지'], icon: '소식', theme: 'ocean', dept: '학생자치회' },
    { id: 'event-club', label: '행사 · 동아리', sub: '축제 · 부스 · 모집', pinned: false, tags: ['#행사', '#동아리'], icon: '행사', theme: 'sunset', dept: '기획홍보부' },
    { id: 'woodumji', label: '우듬지 · 탐구', sub: '학생기자단 · 기록', pinned: false, tags: ['#우듬지'], icon: '우듬지', theme: 'warm', dept: '우듬지 편집부' }
  ];

  function detectPostTemplateId(post) {
    if (post.pinned) return 'pinned-notice';
    const tags = Array.isArray(post.tags) ? post.tags : [];
    if (tags.includes('#우듬지')) return 'woodumji';
    if (tags.includes('#행사') || tags.includes('#동아리')) return 'event-club';
    return 'normal-notice';
  }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function postToEditorHtml(post) {
    if (!post.article) post.article = { quote: '', sections: [], facts: [], attachment: '' };
    if (post.article.html && String(post.article.html).trim()) return post.article.html;
    const parts = [];
    const blocks = Array.isArray(post.article.blocks) ? post.article.blocks : null;
    if (blocks && blocks.length > 0) {
      blocks.forEach((b) => {
        if (!b) return;
        if (b.type === 'quote' && b.text) {
          parts.push(`<blockquote class="article-quote">${escHtml(b.text)}</blockquote>`);
        } else if (b.type === 'paragraph') {
          if (b.heading) parts.push(`<h4>${escHtml(b.heading)}</h4>`);
          if (b.body) {
            String(b.body).split(/\n+/).forEach((line) => {
              if (line.trim()) parts.push(`<p>${escHtml(line)}</p>`);
            });
          }
        } else if (b.type === 'image' && b.url) {
          parts.push(`<img src="${escHtml(b.url)}" alt="${escHtml(b.caption || '')}">`);
        } else if (b.type === 'facts' && Array.isArray(b.items) && b.items.length > 0) {
          const rows = b.items.map((f) => `<div class="article-fact-row"><span><b>${escHtml(f.label)}</b></span><span>${escHtml(f.value)}</span></div>`).join('');
          parts.push(`<div class="article-facts">${rows}</div>`);
        } else if (b.type === 'cta' && b.label && b.url) {
          parts.push(`<p><a class="article-cta-btn" href="${escHtml(b.url)}">${escHtml(b.label)}</a></p>`);
        }
      });
    } else {
      if (post.article.quote) parts.push(`<blockquote class="article-quote">${escHtml(post.article.quote)}</blockquote>`);
      if (Array.isArray(post.article.sections)) {
        post.article.sections.forEach((s) => {
          if (!s) return;
          if (s.heading) parts.push(`<h4>${escHtml(s.heading)}</h4>`);
          if (s.body) {
            String(s.body).split(/\n+/).forEach((line) => {
              if (line.trim()) parts.push(`<p>${escHtml(line)}</p>`);
            });
          }
        });
      }
      if (Array.isArray(post.article.facts) && post.article.facts.length > 0) {
        const rows = post.article.facts.map((f) => `<div class="article-fact-row"><span><b>${escHtml(f.label)}</b></span><span>${escHtml(f.value)}</span></div>`).join('');
        parts.push(`<div class="article-facts">${rows}</div>`);
      }
      if (post.ctaUrl && post.ctaLabel) {
        parts.push(`<p><a class="article-cta-btn" href="${escHtml(post.ctaUrl)}">${escHtml(post.ctaLabel)}</a></p>`);
      }
    }
    return parts.join('') || '<p><br></p>';
  }

  function renderPostsTab(container) {
    if (!studio.sourcesConfig.archive_posts) {
      studio.sourcesConfig.archive_posts = { type: 'notion_db', label: '블로그·공지 마스터 DB', envToken: 'NOTION_TOKEN', databaseId: '', fallback: [] };
    }
    if (!Array.isArray(studio.sourcesConfig.archive_posts.fallback)) {
      studio.sourcesConfig.archive_posts.fallback = [];
    }
    const posts = studio.sourcesConfig.archive_posts.fallback;
    if (posts.length > 0 && !posts.some((p) => p.id === studio.selectedPostId)) {
      studio.selectedPostId = posts[0].id;
    }

    const postSelect = el('select', {
      className: 'post-select',
      'aria-label': '편집할 글 선택',
      onChange: (e) => {
        studio.selectedPostId = e.target.value;
        renderStudioBody();
      }
    }, posts.map((p) => el('option', { value: p.id, selected: p.id === studio.selectedPostId }, `${p.pinned ? '[상단] ' : ''}${p.title || '(제목 없음)'}`)));

    const createNewPost = () => {
      const newPost = {
        id: `post-${Date.now().toString(36)}`,
        date: new Date().toISOString().slice(0, 10),
        dept: '학생자치회',
        title: '',
        excerpt: '',
        pinned: true,
        thumbUrl: '',
        thumbTheme: 'forest',
        thumbIcon: '공지',
        tags: ['#공지'],
        article: {
          quote: '',
          sections: [{ heading: '상세 안내', body: '' }],
          facts: [],
          attachment: ''
        }
      };
      posts.unshift(newPost);
      studio.selectedPostId = newPost.id;
      studio.portalTab = 'home';
      renderStudioBody();
      syncPostsPreviewData(posts);
      showToast('새 글 캔버스를 열었습니다. 제목을 눌러 바로 작성해 보세요.');
    };

    container.appendChild(
      el('div', { className: 'post-toolbar' },
        posts.length > 0 ? postSelect : el('span', { style: { fontSize: '0.84rem', color: 'var(--text-muted)' } }, '등록된 글이 없습니다.'),
        el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
          el('button', { type: 'button', className: 'btn', onClick: createNewPost }, '+ 새 글 쓰기'),
          posts.length > 0 ? el('button', {
            type: 'button',
            className: 'btn btn-danger',
            onClick: () => {
              const idx = posts.findIndex((p) => p.id === studio.selectedPostId);
              if (idx >= 0) posts.splice(idx, 1);
              studio.selectedPostId = posts[0] ? posts[0].id : null;
              renderStudioBody();
              syncPostsPreviewData(posts);
            }
          }, '삭제') : null,
          el('button', {
            type: 'button',
            className: 'btn btn-primary',
            onClick: saveSourcesAction
          }, studio.serverMode ? '올리기 (저장)' : 'sources.json 다운로드')
        )
      )
    );

    const post = posts.find((p) => p.id === studio.selectedPostId);
    if (!post) return;
    if (!post.article) post.article = { quote: '', sections: [{ heading: '본문', body: '' }], facts: [], attachment: '' };
    if (!Array.isArray(post.article.sections) || post.article.sections.length === 0) {
      post.article.sections = [{ heading: '본문', body: '' }];
    }

    const activeTplId = detectPostTemplateId(post);
    container.appendChild(
      el('div', { className: 'type-picker-row', role: 'group', 'aria-label': '공지 유형 선택' },
        POST_TEMPLATES.map((tpl) =>
          el('button', {
            type: 'button',
            className: `type-chip-btn ${activeTplId === tpl.id ? 'is-active' : ''}`.trim(),
            onClick: () => {
              post.pinned = tpl.pinned;
              post.tags = [...tpl.tags];
              post.thumbIcon = tpl.icon;
              post.thumbTheme = tpl.theme;
              if (!post.dept) post.dept = tpl.dept;
              studio.portalTab = tpl.pinned ? 'home' : 'explore';
              renderStudioBody();
              syncPostsPreviewData(posts);
            }
          },
            el('span', { className: 'type-chip-title' }, tpl.label),
            el('span', { className: 'type-chip-sub' }, tpl.sub)
          )
        )
      )
    );

    const previewTitleEl = el('div', { style: { fontSize: '0.88rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, post.title || '제목을 입력하세요');
    const previewMetaEl = el('div', { style: { fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '3px' } }, `${post.date || ''} · ${post.dept || '학생자치회'} · ${(post.tags || []).join(' ')}`);
    const articleLiveSlot = el('div', { className: 'article-live-box' });

    const refreshArticlePreview = () => {
      if (window.TEUM_UI && typeof window.TEUM_UI.buildArticleContent === 'function') {
        articleLiveSlot.replaceChildren(
          el('span', { className: 'list-preview-label' }, '실제 학생 화면에서 보이는 상세 페이지'),
          window.TEUM_UI.buildArticleContent(post, {
            isLiked: () => false,
            isBookmarked: () => false,
            onToggleLike: () => {},
            onToggleBookmark: () => {}
          })
        );
      }
    };

    const updateListCardPreview = () => {
      previewTitleEl.textContent = post.title || '제목을 입력하세요';
      previewMetaEl.textContent = `${post.date || ''} · ${post.dept || '학생자치회'} · ${(post.tags || []).join(' ')}`;
      refreshArticlePreview();
    };

    const hiddenFileInput = el('input', {
      type: 'file',
      accept: 'image/*',
      style: { display: 'none' },
      onChange: (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = String(reader.result || '');
          if (studio.serverMode) {
            try {
              const resp = await fetch('./api/upload-thumb', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: file.name, dataUrl })
              });
              const res = await resp.json();
              if (!resp.ok || !res.ok) throw new Error(res.error || '업로드 실패');
              post.thumbUrl = res.url;
              renderStudioBody();
              syncPostsPreviewData(posts);
              showToast('사진을 업로드했습니다.');
            } catch (err) {
              showToast(`업로드 오류: ${err.message}`);
            }
          } else {
            resizeDataUrlForStatic(dataUrl, (resized) => {
              post.thumbUrl = resized;
              renderStudioBody();
              syncPostsPreviewData(posts);
              showToast('사진을 반영했습니다.');
            });
          }
        };
        reader.readAsDataURL(file);
      }
    });

    const safeThumb = sanitizeImageUrl(post.thumbUrl || '');
    const coverBtn = el('button', {
      type: 'button',
      className: 'visual-cover-btn',
      style: safeThumb ? {} : { background: THUMB_THEMES[post.thumbTheme] || THUMB_THEMES.forest },
      onClick: () => hiddenFileInput.click()
    },
      safeThumb
        ? el('img', { src: safeThumb, alt: post.title || '공지 커버' })
        : el('div', { style: { textAlign: 'center', padding: '16px' } },
            el('div', { style: { fontSize: '1.1rem', fontWeight: 800 } }, post.thumbIcon || '공지'),
            el('div', { style: { fontSize: '0.78rem', opacity: 0.88, marginTop: '4px' } }, '클릭해서 커버 사진 넣기 (선택)')
          ),
      el('span', { className: 'visual-cover-hint' }, safeThumb ? '사진 바꾸기' : '사진 추가')
    );

    const pinToggle = el('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 700, color: 'var(--text)' } },
      el('input', {
        type: 'checkbox',
        checked: Boolean(post.pinned),
        onChange: (e) => {
          post.pinned = e.target.checked;
          studio.portalTab = post.pinned ? 'home' : 'explore';
          renderStudioBody();
          syncPostsPreviewData(posts);
        }
      }),
      '홈 상단 고정'
    );

    const seCanvas = el('div', {
      className: 'se-canvas',
      contenteditable: 'true',
      'data-placeholder': '여기를 눌러 글을 작성하세요. 위 도구 막대로 굵게, 소제목, 사진, 인용구, 정보표를 바로 넣을 수 있습니다.'
    });
    seCanvas.innerHTML = postToEditorHtml(post);

    const syncHtml = () => {
      post.article.html = seCanvas.innerHTML;
      refreshArticlePreview();
      syncPostsPreviewData(posts);
    };
    seCanvas.addEventListener('input', syncHtml);

    let savedRange = null;
    const saveSelection = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && seCanvas.contains(sel.anchorNode)) {
        savedRange = sel.getRangeAt(0).cloneRange();
      }
    };
    seCanvas.addEventListener('keyup', saveSelection);
    seCanvas.addEventListener('mouseup', saveSelection);

    const insertHtmlAtCursor = (htmlSnippet) => {
      seCanvas.focus();
      const sel = window.getSelection();
      if (savedRange && sel) {
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
      const ok = document.execCommand('insertHTML', false, htmlSnippet);
      if (!ok) {
        seCanvas.insertAdjacentHTML('beforeend', htmlSnippet);
      }
      saveSelection();
      syncHtml();
    };

    const inlineImgInput = el('input', {
      type: 'file',
      accept: 'image/*',
      style: { display: 'none' },
      onChange: (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = String(reader.result || '');
          if (studio.serverMode) {
            try {
              const resp = await fetch('./api/upload-thumb', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: file.name, dataUrl })
              });
              const res = await resp.json();
              if (!resp.ok || !res.ok) throw new Error(res.error || '업로드 실패');
              insertHtmlAtCursor(`<img src="${escHtml(res.url)}" alt="${escHtml(file.name)}"><p><br></p>`);
            } catch (err) {
              showToast(`업로드 오류: ${err.message}`);
            }
          } else {
            resizeDataUrlForStatic(dataUrl, (resized) => {
              insertHtmlAtCursor(`<img src="${escHtml(resized)}" alt="${escHtml(file.name)}"><p><br></p>`);
            });
          }
        };
        reader.readAsDataURL(file);
      }
    });

    const popoverSlot = el('div');
    const closePopover = () => popoverSlot.replaceChildren();

    const openFactPopover = () => {
      const k1 = el('input', { type: 'text', placeholder: '항목 1 (예: 일시)', value: '일시', style: { flex: 1, minWidth: '90px' } });
      const v1 = el('input', { type: 'text', placeholder: '내용 1 (예: 12월 29일)', style: { flex: 1, minWidth: '110px' } });
      const k2 = el('input', { type: 'text', placeholder: '항목 2 (예: 장소)', value: '장소', style: { flex: 1, minWidth: '90px' } });
      const v2 = el('input', { type: 'text', placeholder: '내용 2 (예: 돌실 잔디광장)', style: { flex: 1, minWidth: '110px' } });
      popoverSlot.replaceChildren(
        el('div', { className: 'se-popover' },
          k1, v1, k2, v2,
          el('button', {
            type: 'button',
            className: 'btn btn-sm btn-primary',
            onClick: () => {
              const rows = [[k1.value, v1.value], [k2.value, v2.value]]
                .filter(([a, b]) => a.trim() || b.trim())
                .map(([a, b]) => `<div class="article-fact-row"><span><b>${escHtml(a)}</b></span><span>${escHtml(b)}</span></div>`)
                .join('');
              if (rows) insertHtmlAtCursor(`<div class="article-facts">${rows}</div><p><br></p>`);
              closePopover();
            }
          }, '표 넣기'),
          el('button', { type: 'button', className: 'btn btn-sm', onClick: closePopover }, '닫기')
        )
      );
    };

    const openCtaPopover = () => {
      const lbl = el('input', { type: 'text', placeholder: '버튼 문구 (예: 신청 폼 열기)', value: '신청하러 가기', style: { flex: 1, minWidth: '130px' } });
      const url = el('input', { type: 'url', placeholder: 'https://...', value: 'https://', style: { flex: 1, minWidth: '150px' } });
      popoverSlot.replaceChildren(
        el('div', { className: 'se-popover' },
          lbl, url,
          el('button', {
            type: 'button',
            className: 'btn btn-sm btn-primary',
            onClick: () => {
              const safeHref = sanitizeUrl(url.value);
              if (lbl.value.trim() && safeHref) {
                insertHtmlAtCursor(`<p><a class="article-cta-btn" href="${escHtml(safeHref)}">${escHtml(lbl.value)}</a></p><p><br></p>`);
              } else {
                showToast('버튼 문구와 올바른 주소(https://)를 입력해 주세요.');
                return;
              }
              closePopover();
            }
          }, '버튼 넣기'),
          el('button', { type: 'button', className: 'btn btn-sm', onClick: closePopover }, '닫기')
        )
      );
    };

    const makeToolBtn = (label, extraClass, onPress) =>
      el('button', {
        type: 'button',
        className: `se-tool-btn ${extraClass || ''}`.trim(),
        onMousedown: (e) => e.preventDefault(),
        onClick: onPress
      }, label);

    const seToolbar = el('div', { className: 'se-toolbar', role: 'toolbar', 'aria-label': '글쓰기 도구' },
      makeToolBtn('소제목', '', () => { document.execCommand('formatBlock', false, 'h4'); syncHtml(); }),
      makeToolBtn('본문', '', () => { document.execCommand('formatBlock', false, 'p'); syncHtml(); }),
      makeToolBtn('굵게', '', () => { document.execCommand('bold'); syncHtml(); }),
      makeToolBtn('밑줄', '', () => { document.execCommand('underline'); syncHtml(); }),
      makeToolBtn('취소선', '', () => { document.execCommand('strikeThrough'); syncHtml(); }),
      el('span', { className: 'se-tool-sep' }),
      makeToolBtn('왼쪽', '', () => { document.execCommand('justifyLeft'); syncHtml(); }),
      makeToolBtn('가운데', '', () => { document.execCommand('justifyCenter'); syncHtml(); }),
      el('span', { className: 'se-tool-sep' }),
      makeToolBtn('+ 사진', 'is-insert', () => { saveSelection(); inlineImgInput.click(); }),
      makeToolBtn('+ 인용구', 'is-insert', () => insertHtmlAtCursor('<blockquote class="article-quote">강조할 한마디를 입력하세요</blockquote><p><br></p>')),
      makeToolBtn('+ 구분선', 'is-insert', () => insertHtmlAtCursor('<hr class="article-hr"><p><br></p>')),
      makeToolBtn('+ 정보표', 'is-insert', () => { saveSelection(); openFactPopover(); }),
      makeToolBtn('+ 링크 버튼', 'is-insert', () => { saveSelection(); openCtaPopover(); })
    );

    const seShell = el('div', { className: 'se-shell' },
      inlineImgInput,
      seToolbar,
      popoverSlot,
      seCanvas
    );

    const visualCard = el('div', { className: 'visual-page-card' },
      hiddenFileInput,
      coverBtn,
      safeThumb ? el('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
        el('button', {
          type: 'button',
          className: 'btn btn-sm',
          onClick: () => { post.thumbUrl = ''; renderStudioBody(); syncPostsPreviewData(posts); }
        }, '사진 빼기')
      ) : null,
      el('div', { className: 'visual-meta-line' },
        el('input', {
          type: 'text',
          className: 'inline-pill-input',
          value: post.dept || '',
          placeholder: '작성 부서',
          'aria-label': '작성 부서',
          onInput: (e) => { post.dept = e.target.value; updateListCardPreview(); syncPostsPreviewData(posts); }
        }),
        el('span', null, '·'),
        el('input', {
          type: 'text',
          className: 'inline-pill-input',
          value: post.date || '',
          placeholder: 'YYYY-MM-DD',
          'aria-label': '작성 날짜',
          onInput: (e) => { post.date = e.target.value; updateListCardPreview(); syncPostsPreviewData(posts); }
        }),
        pinToggle
      ),
      el('input', {
        type: 'text',
        className: 'visual-title-input',
        value: post.title || '',
        placeholder: '여기를 눌러 공지 제목을 입력하세요',
        'aria-label': '공지 제목',
        onInput: (e) => { post.title = e.target.value; updateListCardPreview(); syncPostsPreviewData(posts); }
      }),
      el('input', {
        type: 'text',
        className: 'visual-excerpt-input',
        value: post.excerpt || '',
        placeholder: '목록에 보일 한 줄 설명을 입력하세요',
        'aria-label': '한 줄 설명',
        onInput: (e) => { post.excerpt = e.target.value; syncPostsPreviewData(posts); }
      }),
      seShell,
      el('div', { className: 'visual-foot-row' },
        makeField('태그 (공백 구분)', el('input', {
          type: 'text',
          value: (post.tags || []).join(' '),
          placeholder: '#공지 #행사',
          onInput: (e) => {
            post.tags = e.target.value.trim().split(/\s+/).filter(Boolean).map((t) => (t.startsWith('#') ? t : '#' + t));
            updateListCardPreview();
            syncPostsPreviewData(posts);
          }
        })),
        makeField('첨부파일명 (선택)', el('input', {
          type: 'text',
          value: post.article.attachment || '',
          placeholder: '예: 안내문.pdf',
          onInput: (e) => { post.article.attachment = e.target.value; refreshArticlePreview(); syncPostsPreviewData(posts); }
        }))
      )
    );

    refreshArticlePreview();
    const previewCol = el('div', { className: 'posts-preview-col' },
      el('div', { className: 'list-preview-box', style: { marginTop: 0 } },
        el('span', { className: 'list-preview-label' }, '탐색 목록에서 보이는 카드 모양'),
        el('div', { className: 'list-preview-row' },
          el('div', { className: 'list-preview-thumb' },
            safeThumb ? el('img', { src: safeThumb, alt: '' }) : (post.thumbIcon || '공지')
          ),
          el('div', { style: { minWidth: 0, flex: 1 } },
            previewTitleEl,
            previewMetaEl
          )
        )
      ),
      articleLiveSlot
    );

    container.appendChild(
      el('div', { className: 'posts-split-grid' },
        el('div', { className: 'posts-editor-col' }, visualCard),
        previewCol
      )
    );
  }

  const FOREST_TYPES = [
    { id: 'accounting', label: '회계 (수입·지출)', badge: '회계', cls: 'is-accounting' },
    { id: 'minutes', label: '회의록', badge: '회의록', cls: 'is-minutes' },
    { id: 'docs', label: '자료', badge: '자료', cls: 'is-docs' }
  ];

  function createForestDraft(type = 'accounting') {
    return {
      id: `forest-${Date.now().toString(36)}`,
      type,
      date: new Date().toISOString().slice(0, 10),
      term: '제10대',
      dept: type === 'accounting' ? '문서관리부' : '학생자치회',
      title: '',
      flow: 'expense',
      amount: 0,
      session: '',
      agendaCount: 1,
      fileType: 'PDF',
      fileName: '',
      detail: '',
      attachment: ''
    };
  }

  function renderForestTab(container) {
    if (!studio.sourcesConfig.forest_records) {
      studio.sourcesConfig.forest_records = {
        type: 'notion_db',
        mode: 'forest',
        label: '숲 투명 기록실 (회계·회의록·자료)',
        envToken: 'NOTION_TOKEN',
        databaseId: '',
        fallback: []
      };
    }
    if (!Array.isArray(studio.sourcesConfig.forest_records.fallback)) {
      studio.sourcesConfig.forest_records.fallback = [];
    }
    const records = studio.sourcesConfig.forest_records.fallback;
    if (records.length > 0 && !records.some((r) => r.id === studio.selectedForestId)) {
      studio.selectedForestId = records[0].id;
    }

    const typeLabelMap = { accounting: '회계', minutes: '회의록', docs: '자료' };
    const recordSelect = el('select', {
      className: 'post-select',
      'aria-label': '편집할 숲 기록 선택',
      onChange: (e) => {
        studio.selectedForestId = e.target.value;
        renderStudioBody();
      }
    }, records.map((r) => el('option', {
      value: r.id,
      selected: r.id === studio.selectedForestId
    }, `[${typeLabelMap[r.type] || '기록'}] ${r.title || '(제목 없음)'} (${r.date || ''})`)));

    const createNewForest = () => {
      const rec = createForestDraft('accounting');
      records.unshift(rec);
      studio.selectedForestId = rec.id;
      studio.portalTab = 'forest';
      renderStudioBody();
      syncForestPreviewData(records);
      showToast('새 숲 기록 초안을 만들었습니다.');
    };

    container.appendChild(
      el('div', { className: 'post-toolbar' },
        records.length > 0 ? recordSelect : el('span', { style: { fontSize: '0.84rem', color: 'var(--text-muted)' } }, '등록된 숲 기록이 없습니다.'),
        el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
          el('button', { type: 'button', className: 'btn', onClick: createNewForest }, '+ 새 기록'),
          records.length > 0 ? el('button', {
            type: 'button',
            className: 'btn btn-danger',
            onClick: () => {
              const idx = records.findIndex((r) => r.id === studio.selectedForestId);
              if (idx >= 0) records.splice(idx, 1);
              studio.selectedForestId = records[0] ? records[0].id : null;
              renderStudioBody();
              syncForestPreviewData(records);
            }
          }, '삭제') : null,
          el('button', {
            type: 'button',
            className: 'btn btn-primary',
            onClick: saveSourcesAction
          }, studio.serverMode ? '올리기 (저장)' : 'sources.json 다운로드')
        )
      )
    );

    const rec = records.find((r) => r.id === studio.selectedForestId);
    if (!rec) return;

    container.appendChild(
      el('div', { className: 'type-picker-row', role: 'group', 'aria-label': '숲 기록 유형 선택' },
        FOREST_TYPES.map((ft) =>
          el('button', {
            type: 'button',
            className: `type-chip-btn ${rec.type === ft.id ? 'is-active' : ''}`.trim(),
            onClick: () => {
              rec.type = ft.id;
              if (ft.id === 'accounting') {
                if (!rec.flow) rec.flow = 'expense';
                if (typeof rec.amount !== 'number') rec.amount = 0;
              } else if (ft.id === 'minutes') {
                if (!rec.agendaCount) rec.agendaCount = 1;
              } else if (ft.id === 'docs') {
                if (!rec.fileType) rec.fileType = 'PDF';
              }
              renderStudioBody();
              syncForestPreviewData(records);
            }
          },
            el('strong', null, ft.label)
          )
        )
      )
    );

    const previewCard = el('div', { className: 'live-preview-card' });
    const updateLivePreview = () => {
      const ft = FOREST_TYPES.find((t) => t.id === rec.type) || { badge: '기록', cls: 'is-docs' };
      let rightText = '';
      let rightColor = 'var(--text-muted)';
      if (rec.type === 'accounting') {
        const amt = Number(rec.amount || 0).toLocaleString('ko-KR');
        const isInc = rec.flow === 'income';
        rightText = `${isInc ? '+' : '-'}${amt}원`;
        rightColor = isInc ? 'var(--accent)' : '#e11d48';
      } else if (rec.type === 'minutes' && rec.agendaCount) {
        rightText = `안건 ${rec.agendaCount}`;
      } else if (rec.type === 'docs' && rec.fileType) {
        rightText = rec.fileType;
      }

      previewCard.replaceChildren(
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' } },
          el('div', { style: { minWidth: 0, flex: 1 } },
            el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' } },
              el('span', { className: `type-pill ${ft.cls}` }, ft.badge),
              el('span', { style: { fontSize: '0.76rem', color: 'var(--text-muted)' } }, `${rec.date || ''} · ${rec.dept || ''}`)
            ),
            el('div', { style: { fontWeight: 700, fontSize: '0.96rem', marginBottom: '4px' } }, rec.title || '(제목을 입력하세요)'),
            rec.session ? el('div', { style: { fontSize: '0.78rem', color: 'var(--text-muted)' } }, `${rec.term || ''} · ${rec.session}`) : null
          ),
          rightText ? el('strong', { style: { fontSize: '0.92rem', color: rightColor, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' } }, rightText) : null
        ),
        rec.detail ? el('p', { style: { margin: '10px 0 0', fontSize: '0.84rem', color: 'var(--text-sub)', lineHeight: 1.5 } }, rec.detail) : null,
        (rec.attachment || rec.fileName) ? el('div', { style: { marginTop: '8px', fontSize: '0.78rem', color: 'var(--accent)' } }, `첨부: ${rec.attachment || rec.fileName}`) : null
      );
    };

    const formBox = el('div', { className: 'se-visual-card', style: { padding: '16px' } });
    const grid = el('div', { className: 'form-grid' });

    grid.appendChild(makeField('제목', el('input', {
      type: 'text',
      placeholder: '예: 11월 학생자치회 간식 행사 정산',
      value: rec.title || '',
      onInput: (e) => { rec.title = e.target.value; updateLivePreview(); syncForestPreviewData(records); }
    }), true));

    grid.appendChild(makeField('날짜', el('input', {
      type: 'date',
      value: rec.date || '',
      onInput: (e) => { rec.date = e.target.value; updateLivePreview(); syncForestPreviewData(records); }
    })));

    grid.appendChild(makeField('기수', el('input', {
      type: 'text',
      placeholder: '예: 제10대',
      value: rec.term || '',
      onInput: (e) => { rec.term = e.target.value; updateLivePreview(); syncForestPreviewData(records); }
    })));

    grid.appendChild(makeField('담당 부서', el('input', {
      type: 'text',
      placeholder: '예: 문서관리부',
      value: rec.dept || '',
      onInput: (e) => { rec.dept = e.target.value; updateLivePreview(); syncForestPreviewData(records); }
    })));

    if (rec.type === 'accounting') {
      grid.appendChild(makeField('수입 / 지출 구분', el('select', {
        onChange: (e) => { rec.flow = e.target.value; updateLivePreview(); syncForestPreviewData(records); }
      }, [
        el('option', { value: 'expense', selected: rec.flow !== 'income' }, '지출 (-)'),
        el('option', { value: 'income', selected: rec.flow === 'income' }, '수입 (+)')
      ])));
      grid.appendChild(makeField('금액 (원)', el('input', {
        type: 'number',
        min: '0',
        step: '100',
        value: rec.amount ?? 0,
        onInput: (e) => { rec.amount = Math.max(0, Number(e.target.value) || 0); updateLivePreview(); syncForestPreviewData(records); }
      })));
    } else if (rec.type === 'minutes') {
      grid.appendChild(makeField('회의 회차', el('input', {
        type: 'text',
        placeholder: '예: 제12차 정기회의',
        value: rec.session || '',
        onInput: (e) => { rec.session = e.target.value; updateLivePreview(); syncForestPreviewData(records); }
      })));
      grid.appendChild(makeField('안건 수', el('input', {
        type: 'number',
        min: '1',
        value: rec.agendaCount ?? 1,
        onInput: (e) => { rec.agendaCount = Math.max(1, Number(e.target.value) || 1); updateLivePreview(); syncForestPreviewData(records); }
      })));
    } else if (rec.type === 'docs') {
      grid.appendChild(makeField('파일 형식', el('input', {
        type: 'text',
        placeholder: '예: PDF, HWP, XLSX',
        value: rec.fileType || '',
        onInput: (e) => { rec.fileType = e.target.value; updateLivePreview(); syncForestPreviewData(records); }
      })));
      grid.appendChild(makeField('파일명', el('input', {
        type: 'text',
        placeholder: '예: 2026_학생회칙_개정안.pdf',
        value: rec.fileName || '',
        onInput: (e) => { rec.fileName = e.target.value; updateLivePreview(); syncForestPreviewData(records); }
      })));
    }

    grid.appendChild(makeField('상세 기록', el('textarea', {
      placeholder: '집행 내역, 회의 의결 사항, 자료 설명 등을 입력하세요.',
      onInput: (e) => { rec.detail = e.target.value; updateLivePreview(); syncForestPreviewData(records); }
    }, rec.detail || ''), true));

    grid.appendChild(makeField('첨부파일명 (선택)', el('input', {
      type: 'text',
      placeholder: '예: 11월_영수증_모음.pdf',
      value: rec.attachment || '',
      onInput: (e) => { rec.attachment = e.target.value; updateLivePreview(); syncForestPreviewData(records); }
    }), true));

    formBox.appendChild(grid);
    updateLivePreview();

    const previewCol = el('div', { className: 'live-preview-col' },
      el('div', { className: 'live-preview-head' }, '실시간 숲 목록 미리보기'),
      previewCard
    );

    container.appendChild(
      el('div', { className: 'posts-split-grid' },
        el('div', { className: 'posts-editor-col' }, formBox),
        previewCol
      )
    );
  }

  function renderThemeTab(container) {
    const box = el('div', { className: 'editor-box' });
    box.appendChild(el('h3', { className: 'editor-box-title' }, '포털 기본 정보 & 포인트 컬러'));

    box.appendChild(makeField('포털 이름 (예: 틈.)', el('input', {
      type: 'text',
      value: studio.config.siteTitle || '',
      onInput: (e) => { studio.config.siteTitle = e.target.value; syncPreview(); }
    })));
    box.appendChild(makeField('학교 이름 (예: 서전고)', el('input', {
      type: 'text',
      value: studio.config.schoolName || '',
      onInput: (e) => { studio.config.schoolName = e.target.value; syncPreview(); }
    })));
    box.appendChild(makeField('상단 라이브 바 문구', el('input', {
      type: 'text',
      value: studio.config.liveBarText || '',
      onInput: (e) => { studio.config.liveBarText = e.target.value; syncPreview(); }
    })));

    const colorInput = el('input', {
      type: 'color',
      value: studio.config.accentColor || '#3182F6',
      onInput: (e) => {
        studio.config.accentColor = e.target.value;
        updateHeaderModeUI();
        syncPreview();
      }
    });
    const swatches = el('div', { className: 'swatch-row' },
      colorInput,
      ACCENT_PRESETS.map((p) =>
        el('button', {
          type: 'button',
          className: 'swatch-btn',
          title: p.name,
          style: { backgroundColor: p.color },
          onClick: () => {
            studio.config.accentColor = p.color;
            colorInput.value = p.color;
            updateHeaderModeUI();
            syncPreview();
          }
        })
      )
    );
    box.appendChild(makeField('포인트 컬러 (프리셋 또는 직접 선택)', swatches));
    container.appendChild(box);
  }

  function renderSourcesTab(container) {
    container.appendChild(
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '8px', flexWrap: 'wrap' } },
        el('span', { style: { fontSize: '0.84rem', color: 'var(--text-muted)' } }, '외부 API를 추가·수정한 뒤 저장하면 백엔드(bake_data.py)가 즉시 새 데이터를 구워냅니다.'),
        el('button', {
          type: 'button',
          className: 'btn btn-primary',
          onClick: saveSourcesAction
        }, studio.serverMode ? '소스 저장 & 테스트 굽기' : 'sources.json 다운로드')
      )
    );

    const keyInput = el('input', { type: 'text', placeholder: '소스 키 (영문, 예: weather_api)' });
    const labelInput = el('input', { type: 'text', placeholder: '이름 (예: 진천 날씨)' });
    const urlInput = el('input', { type: 'url', placeholder: 'https://api.example.com/data.json' });
    const pathInput = el('input', { type: 'text', placeholder: 'extractPath (선택, 예: data.items)' });

    container.appendChild(
      el('div', { className: 'editor-box', style: { marginBottom: '16px' } },
        el('h3', { className: 'editor-box-title' }, '새 범용 JSON API 커넥터 추가'),
        el('div', { className: 'form-grid' },
          makeField('고유 소스 키 (영문/숫자/_)', keyInput),
          makeField('표시 이름', labelInput),
          makeField('요청 URL (GET/POST)', urlInput, true),
          makeField('JSON 추출 경로 (dot-path)', pathInput, true)
        ),
        el('button', {
          type: 'button',
          className: 'btn btn-sm btn-primary',
          onClick: () => {
            const key = keyInput.value.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
            if (!key) { showToast('영문 소스 키를 입력해 주세요.'); return; }
            if (studio.sourcesConfig[key]) { showToast('이미 존재하는 소스 키입니다.'); return; }
            studio.sourcesConfig[key] = {
              type: 'generic_json',
              label: labelInput.value.trim() || key,
              url: urlInput.value.trim(),
              method: 'GET',
              headers: {},
              extractPath: pathInput.value.trim(),
              fieldMap: {},
              fallback: { headline: labelInput.value.trim() || key, body: 'API 연결 대기 중 또는 폴백 메시지입니다.' }
            };
            renderStudioBody();
            showToast(`'${key}' 커넥터를 추가했습니다.`);
          }
        }, '+ 커넥터 목록에 추가')
      )
    );

    const metaSources = (studio.meta && studio.meta.sources) || {};
    for (const [sKey, sCfg] of Object.entries(studio.sourcesConfig || {})) {
      const m = metaSources[sKey] || {};
      const status = m.status || sCfg.type || 'static';
      const statusCls = status === 'live' ? 'is-live' : status === 'fallback' ? 'is-fallback' : '';

      const card = el('div', { className: 'connector-card' });
      card.appendChild(
        el('div', { className: 'connector-head' },
          el('div', null,
            el('strong', null, `${sCfg.label || sKey} `),
            el('span', { style: { fontSize: '0.78rem', color: 'var(--text-muted)' } }, `(${sKey} · ${sCfg.type})`)
          ),
          el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
            el('span', { className: `status-badge ${statusCls}` }, `${String(status).toUpperCase()} · ${m.durationMs ?? 0}ms`),
            el('button', {
              type: 'button',
              className: 'btn btn-sm btn-danger',
              onClick: () => { delete studio.sourcesConfig[sKey]; renderStudioBody(); }
            }, '삭제')
          )
        )
      );

      if (m.reason) {
        card.appendChild(el('p', { style: { margin: '0 0 10px', fontSize: '0.78rem', color: 'var(--text-muted)' } }, `상태: ${m.reason}`));
      }

      const fields = el('div', { className: 'form-grid' });
      fields.appendChild(makeField('표시 라벨', el('input', {
        type: 'text',
        value: sCfg.label || '',
        onInput: (e) => { sCfg.label = e.target.value; }
      })));

      if (sCfg.type === 'neis_meal' || sCfg.type === 'neis_schedule') {
        fields.appendChild(makeField('교육청 코드 (예: M10)', el('input', {
          type: 'text',
          value: sCfg.officeCode || '',
          onInput: (e) => { sCfg.officeCode = e.target.value; }
        })));
        fields.appendChild(makeField('학교명', el('input', {
          type: 'text',
          value: sCfg.schoolName || '',
          onInput: (e) => { sCfg.schoolName = e.target.value; }
        })));
      } else if (sCfg.type === 'notion_db') {
        fields.appendChild(makeField('Database ID', el('input', {
          type: 'text',
          className: 'mono-input',
          value: sCfg.databaseId || '',
          onInput: (e) => { sCfg.databaseId = e.target.value; }
        })));
        fields.appendChild(makeField('환경변수 토큰명', el('input', {
          type: 'text',
          className: 'mono-input',
          value: sCfg.envToken || 'NOTION_TOKEN',
          onInput: (e) => { sCfg.envToken = e.target.value; }
        })));
      } else if (sCfg.type === 'generic_json') {
        fields.appendChild(makeField('HTTP 메서드', el('select', {
          onChange: (e) => { sCfg.method = e.target.value; }
        }, ['GET', 'POST'].map((mOpt) => el('option', { value: mOpt, selected: (sCfg.method || 'GET') === mOpt }, mOpt)))));
        fields.appendChild(makeField('API URL (${ENV_VAR} 지원)', el('input', {
          type: 'url',
          className: 'mono-input',
          value: sCfg.url || '',
          onInput: (e) => { sCfg.url = e.target.value; }
        }), true));
        fields.appendChild(makeField('추출 경로 extractPath', el('input', {
          type: 'text',
          className: 'mono-input',
          value: sCfg.extractPath || '',
          onInput: (e) => { sCfg.extractPath = e.target.value; }
        }), true));
      } else if (sCfg.type === 'static') {
        fields.appendChild(makeField('정적 데이터 JSON', el('textarea', {
          className: 'mono-input',
          onChange: (e) => {
            try {
              sCfg.data = JSON.parse(e.target.value || '{}');
              studio.sourcesData[sKey] = sCfg.data;
              syncPreview();
            } catch (err) {
              showToast('정적 데이터 JSON 문법을 확인해 주세요.');
            }
          }
        }, JSON.stringify(sCfg.data ?? {}, null, 2)), true));
      }

      card.appendChild(fields);
      container.appendChild(card);
    }
  }

  function renderStudioBody() {
    const body = document.getElementById('studioBody');
    body.replaceChildren();
    if (studio.studioTab === 'widgets') renderWidgetsTab(body);
    else if (studio.studioTab === 'posts') renderPostsTab(body);
    else if (studio.studioTab === 'forest') renderForestTab(body);
    else if (studio.studioTab === 'theme') renderThemeTab(body);
    else renderSourcesTab(body);
  }

  async function saveConfigAction() {
    if (!studio.serverMode) {
      downloadJson('config.json', studio.config);
      showToast('config.json을 다운로드했습니다. 폴더에 덮어써 주세요.');
      return;
    }
    try {
      const resp = await fetch('./api/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(studio.config)
      });
      const res = await resp.json();
      if (!resp.ok || !res.ok) throw new Error(res.error || '저장 실패');
      if (res.baked) {
        studio.sourcesData = res.baked.sources || studio.sourcesData;
        studio.meta = res.baked._meta || studio.meta;
      }
      syncPreview();
      showToast('저장 및 데이터 굽기 완료!');
    } catch (err) {
      showToast(`오류: ${err.message}`);
    }
  }

  async function saveSourcesAction() {
    if (!studio.serverMode) {
      downloadJson('sources.json', studio.sourcesConfig);
      showToast('sources.json을 다운로드했습니다. 폴더에 덮어쓴 뒤 bake_data.py를 실행하세요.');
      return;
    }
    try {
      const resp = await fetch('./api/save-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(studio.sourcesConfig)
      });
      const res = await resp.json();
      if (!resp.ok || !res.ok) throw new Error(res.error || '소스 저장 실패');
      if (res.baked) {
        studio.sourcesData = res.baked.sources || studio.sourcesData;
        studio.meta = res.baked._meta || studio.meta;
      }
      renderStudioBody();
      syncPreview();
      showToast('저장 & 데이터 굽기 완료!');
    } catch (err) {
      showToast(`오류: ${err.message}`);
    }
  }

  async function bakeOnlyAction() {
    if (!studio.serverMode) return;
    try {
      const resp = await fetch('./api/bake', { method: 'POST' });
      const res = await resp.json();
      if (!resp.ok || !res.ok) throw new Error(res.error || '굽기 실패');
      if (res.baked) {
        studio.sourcesData = res.baked.sources || studio.sourcesData;
        studio.meta = res.baked._meta || studio.meta;
      }
      renderStudioBody();
      syncPreview();
      showToast(`데이터 굽기 완료 (${studio.meta.bakedAt || ''})`);
    } catch (err) {
      showToast(`굽기 오류: ${err.message}`);
    }
  }

  const studioModal = document.getElementById('studioModal');
  function openStudioModal(tabName) {
    if (tabName) studio.studioTab = tabName;
    document.querySelectorAll('.studio-tab-btn').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.studioTab === studio.studioTab);
    });
    if (studio.studioTab === 'posts') studio.portalTab = 'explore';
    else if (studio.studioTab === 'forest') studio.portalTab = 'forest';
    renderStudioBody();
    syncPreview();
    if (studioModal && !studioModal.open) studioModal.showModal();
  }

  document.querySelectorAll('.studio-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => openStudioModal(btn.dataset.studioTab));
  });
  document.querySelectorAll('[data-drawer-tab]').forEach((btn) => {
    btn.addEventListener('click', () => openStudioModal(btn.dataset.drawerTab));
  });
  const openWriteBtn = document.getElementById('openWriteBtn');
  if (openWriteBtn) {
    openWriteBtn.addEventListener('click', () => openStudioModal('posts'));
  }
  const closeModalBtn = document.getElementById('closeStudioModalBtn');
  if (closeModalBtn && studioModal) {
    closeModalBtn.addEventListener('click', () => studioModal.close());
    studioModal.addEventListener('click', (e) => {
      if (e.target === studioModal) studioModal.close();
    });
  }

  const canvasModeBtn = document.getElementById('canvasModeBtn');
  const portalStage = document.getElementById('portalStage');
  let isPortraitStage = false;
  if (canvasModeBtn && portalStage) {
    canvasModeBtn.addEventListener('click', () => {
      isPortraitStage = !isPortraitStage;
      portalStage.classList.toggle('is-portrait', isPortraitStage);
      canvasModeBtn.textContent = isPortraitStage ? '전체 화면' : '세로 보기';
    });
  }

  document.getElementById('saveAllBtn').addEventListener('click', saveConfigAction);
  document.getElementById('bakeNowBtn').addEventListener('click', bakeOnlyAction);
  document.getElementById('previewFrame').addEventListener('load', syncPreview);

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin && event.origin !== 'null') return;
    const msg = event.data;
    if (!msg || msg.type !== 'TEUM_ADMIN_ACTION') return;
    if (msg.action === 'newPost') {
      if (!studio.sourcesConfig.archive_posts) {
        studio.sourcesConfig.archive_posts = { type: 'notion_db', label: '블로그·공지 마스터 DB', envToken: 'NOTION_TOKEN', databaseId: '', fallback: [] };
      }
      const list = studio.sourcesConfig.archive_posts.fallback || (studio.sourcesConfig.archive_posts.fallback = []);
      const newPost = {
        id: `post-${Date.now().toString(36)}`,
        date: new Date().toISOString().slice(0, 10),
        dept: '학생자치회',
        title: '',
        excerpt: '',
        pinned: false,
        thumbUrl: '',
        thumbTheme: 'forest',
        thumbIcon: '공지',
        tags: ['#공지'],
        article: { blocks: [{ type: 'paragraph', heading: '', body: '' }], attachment: '' }
      };
      list.unshift(newPost);
      studio.selectedPostId = newPost.id;
      openStudioModal('posts');
    } else if (msg.action === 'editPost' && msg.postId) {
      studio.selectedPostId = msg.postId;
      openStudioModal('posts');
    } else if (msg.action === 'newForest') {
      if (!studio.sourcesConfig.forest_records) {
        studio.sourcesConfig.forest_records = {
          type: 'notion_db',
          mode: 'forest',
          label: '숲 투명 기록실 (회계·회의록·자료)',
          envToken: 'NOTION_TOKEN',
          databaseId: '',
          fallback: []
        };
      }
      const list = studio.sourcesConfig.forest_records.fallback || (studio.sourcesConfig.forest_records.fallback = []);
      const rec = createForestDraft('accounting');
      list.unshift(rec);
      studio.selectedForestId = rec.id;
      openStudioModal('forest');
      syncForestPreviewData(list);
    } else if (msg.action === 'editForest' && msg.recordId) {
      studio.selectedForestId = msg.recordId;
      openStudioModal('forest');
    }
  });

  async function init() {
    const fallbackData = window.TEUM_DATA || {};
    if (fallbackData.config) studio.config = deepClone(fallbackData.config);
    if (fallbackData.sources) studio.sourcesData = deepClone(fallbackData.sources);
    if (fallbackData._sourcesConfig) studio.sourcesConfig = deepClone(fallbackData._sourcesConfig);
    if (fallbackData._meta) studio.meta = deepClone(fallbackData._meta);

    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      try {
        const resp = await fetch('./api/state', { cache: 'no-store' });
        if (resp.ok) {
          const res = await resp.json();
          if (res && res.ok && res.serverMode) {
            studio.serverMode = true;
            if (res.config) studio.config = res.config;
            if (res.sources) studio.sourcesConfig = res.sources;
            if (res.meta) studio.meta = res.meta;
            if (res.baked && res.baked.sources) studio.sourcesData = res.baked.sources;
          }
        }
      } catch (e) {}
    }

    updateHeaderModeUI();
    renderStudioBody();
    syncPreview();
  }

  init();
})();
