(function () {
  'use strict';

  const ALLERGENS = {
    1: '난류', 2: '우유', 3: '메밀', 4: '땅콩', 5: '대두', 6: '밀',
    7: '고등어', 8: '게', 9: '새우', 10: '돼지고기', 11: '복숭아', 12: '토마토',
    13: '아황산류', 14: '호두', 15: '닭고기', 16: '쇠고기', 17: '오징어', 18: '조개류'
  };

  const THUMB_THEMES = {
    ocean: 'linear-gradient(135deg, #3182F6 0%, #4F46E5 100%)',
    forest: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    warm: 'linear-gradient(135deg, #F59E0B 0%, #EA580C 100%)',
    sunset: 'linear-gradient(135deg, #FB7185 0%, #E11D48 100%)',
    midnight: 'linear-gradient(135deg, #334155 0%, #0F172A 100%)',
    violet: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)'
  };

  const WIDGET_META = {
    carousel: {
      label: '가로 스와이프 중요 공지',
      icon: '공지',
      description: '손가락으로 휙휙 넘기는 중요 공지 배너',
      defaultSource: 'archive_posts',
      defaultProps: { pinnedOnly: true }
    },
    planner: {
      label: '내 일정 & 수행 D-Day',
      icon: '일정',
      description: '개인 할 일 + 공지/수행 1초 담기 + 시간표 매칭',
      defaultSource: 'assessments',
      defaultProps: { maxVisible: 5 }
    },
    meal: {
      label: '급식 카드',
      icon: '급식',
      description: '메인 메뉴 + 반찬 칩 + 알레르기 강조 (탭 시 반 시트)',
      defaultSource: 'neis_meal',
      defaultProps: { showCalories: true }
    },
    timetable: {
      label: '시간표 타임라인',
      icon: '시간표',
      description: '학년/반별 1~7교시 라이브 타임라인 (탭 시 반 시트)',
      defaultSource: 'timetable',
      defaultProps: { showPeriodTimes: true }
    },
    ticker: {
      label: '롤링 알림 티커',
      icon: '티커',
      description: '3초마다 전환되는 1줄 학사/공지 티커',
      defaultSource: 'neis_schedule',
      defaultProps: { intervalMs: 3000 }
    },
    stat: {
      label: '숫자 · 게이지 카드',
      icon: '통계',
      description: '공약 이행률, 수치, 진행률 게이지 표시',
      defaultSource: '',
      defaultProps: { value: '100', unit: '%', percent: 100, caption: '목표 달성 현황을 입력해 보세요' }
    },
    list: {
      label: '리스트 카드',
      icon: '목록',
      description: '공지, 영수증, 동아리 등 클릭 가능한 목록',
      defaultSource: '',
      defaultProps: {
        maxItems: 5,
        items: [{ title: '새 항목 1', meta: '설명 입력', tag: '안내', detail: '상세 내용을 입력하세요.' }]
      }
    },
    banner: {
      label: '강조 배너 + 버튼',
      icon: '배너',
      description: '핵심 캠페인 홍보 및 링크 이동 버튼',
      defaultSource: '',
      defaultProps: {
        badge: 'NEW',
        description: '배너 본문 문구를 관리자 스튜디오에서 수정할 수 있습니다.',
        ctaText: '자세히 보기',
        ctaUrl: './admin.html'
      }
    },
    text: {
      label: '자유 텍스트 / API 카드',
      icon: '안내',
      description: '줄글 안내 또는 외부 JSON API 응답 표시',
      defaultSource: '',
      defaultProps: { body: '여기에 자유로운 안내 문구를 입력하거나 외부 JSON API 소스를 연결해 보세요.' }
    },
    study_timer: {
      label: '오늘의 공부 타이머',
      icon: '공부',
      description: '과목별 스톱워치 · 25분 뽀모도로 · 오늘 누적 시간',
      defaultSource: '',
      defaultProps: { pomodoroMin: 25 }
    },
    study_links: {
      label: '입시 · 학습 추천 사이트',
      icon: '진학',
      description: '어디가 · 평가원 · EBSi 등 카테고리별 바로가기',
      defaultSource: 'study_links',
      defaultProps: { maxItems: 8 }
    }
  };

  const WEEKDAYS = ['월', '화', '수', '목', '금'];

  function getTodayWeekdayLabel() {
    const day = new Date().getDay(); // 0: Sun, 1..5: Mon..Fri, 6: Sat
    return day >= 1 && day <= 5 ? WEEKDAYS[day - 1] : '월';
  }

  function resolveWeekTimetable(rawEntry) {
    const dayLabel = getTodayWeekdayLabel();
    if (Array.isArray(rawEntry)) {
      const week = {};
      WEEKDAYS.forEach((d) => { week[d] = rawEntry; });
      return { week, today: dayLabel, periods: rawEntry };
    }
    if (rawEntry && typeof rawEntry === 'object') {
      const periods = Array.isArray(rawEntry[dayLabel])
        ? rawEntry[dayLabel]
        : Array.isArray(rawEntry['월'])
          ? rawEntry['월']
          : [];
      return { week: rawEntry, today: dayLabel, periods };
    }
    return { week: {}, today: dayLabel, periods: [] };
  }

  const PERIOD_TIMES = ['08:40', '09:40', '10:40', '11:40', '13:30', '14:30', '15:30'];

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, val] of Object.entries(attrs)) {
        if (val === null || val === undefined || val === false) continue;
        if (key === 'className') {
          node.className = val;
        } else if (key === 'style' && typeof val === 'object') {
          Object.assign(node.style, val);
        } else if (key.startsWith('on') && typeof val === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), val);
        } else {
          node.setAttribute(key, String(val));
        }
      }
    }
    for (const child of children) {
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) {
        for (const nested of child) {
          if (nested !== null && nested !== undefined && nested !== false) {
            node.appendChild(typeof nested === 'string' ? document.createTextNode(nested) : nested);
          }
        }
      } else {
        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
      }
    }
    return node;
  }

  function sanitizeUrl(raw) {
    if (!raw || typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (/^(https?:\/\/|\.\/|\/|#)/i.test(trimmed)) return trimmed;
    if (/^[a-zA-Z0-9_.-]+\.html(\?.*)?$/i.test(trimmed)) return './' + trimmed;
    return '';
  }

  function sanitizeImageUrl(raw) {
    if (!raw || typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (/^(https?:\/\/|\.\/|\/)/i.test(trimmed)) return trimmed;
    if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/i.test(trimmed)) return trimmed;
    return '';
  }

  function sanitizeRichHtml(rawHtml) {
    const html = String(rawHtml || '').trim();
    if (!html) return null;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const ALLOWED_TAGS = new Set(['P', 'DIV', 'BR', 'H3', 'H4', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'HR', 'BLOCKQUOTE', 'FIGURE', 'FIGCAPTION', 'IMG', 'SPAN', 'A', 'UL', 'OL', 'LI']);
    const ALLOWED_CLASSES = new Set(['article-quote', 'article-hr', 'article-facts', 'article-fact-row', 'article-cta-btn', 'article-cover-img']);

    function cleanNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return document.createTextNode(node.textContent || '');
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const tag = node.tagName.toUpperCase();
      if (!ALLOWED_TAGS.has(tag)) {
        const frag = document.createDocumentFragment();
        Array.from(node.childNodes).forEach((ch) => {
          const cleaned = cleanNode(ch);
          if (cleaned) frag.appendChild(cleaned);
        });
        return frag;
      }

      const out = document.createElement(tag.toLowerCase());
      const clsList = Array.from(node.classList || []).filter((c) => ALLOWED_CLASSES.has(c));
      if (clsList.length > 0) out.className = clsList.join(' ');

      const align = node.style && node.style.textAlign;
      if (align && /^(left|center|right)$/.test(align)) {
        out.style.textAlign = align;
      }

      if (tag === 'A') {
        const href = sanitizeUrl(node.getAttribute('href') || '');
        if (href) {
          out.setAttribute('href', href);
          if (/^https?:\/\//i.test(href)) {
            out.setAttribute('target', '_blank');
            out.setAttribute('rel', 'noopener noreferrer');
          }
        }
      } else if (tag === 'IMG') {
        const src = sanitizeImageUrl(node.getAttribute('src') || '');
        if (!src) return null;
        out.setAttribute('src', src);
        out.setAttribute('alt', node.getAttribute('alt') || '');
        out.setAttribute('loading', 'lazy');
        out.setAttribute('decoding', 'async');
      }

      Array.from(node.childNodes).forEach((ch) => {
        const cleaned = cleanNode(ch);
        if (cleaned) out.appendChild(cleaned);
      });
      return out;
    }

    const container = document.createElement('div');
    container.className = 'article-rich';
    Array.from(doc.body.childNodes).forEach((ch) => {
      const cleaned = cleanNode(ch);
      if (cleaned) container.appendChild(cleaned);
    });
    return container;
  }

  function formatKrw(amount) {
    return `${Number(amount || 0).toLocaleString('ko-KR')}원`;
  }

  function makeStatusBadge(sourceMeta) {
    if (!sourceMeta) return null;
    const status = sourceMeta.status || 'static';
    const labelMap = { live: 'LIVE', fallback: '샘플', static: '내장' };
    const cls = status === 'live' ? 'is-live' : status === 'fallback' ? 'is-fallback' : '';
    return el('span', { className: `badge-pill ${cls}` }, labelMap[status] || status);
  }

  function createCardShell(widget, extraClass) {
    const card = el('section', {
      className: `widget-card ${extraClass || ''}`.trim(),
      'data-widget-id': widget.id || ''
    });
    if (widget.accent) {
      card.style.setProperty('--card-accent', widget.accent);
    }
    return card;
  }

  function attachHalfSheetTrigger(card, widget, ctx, buildDetailFn) {
    const sheet = widget.sheet;
    if (!buildDetailFn && (!sheet || (!sheet.title && !sheet.body))) return;
    if (card.querySelector('a, button, input, select')) return;
    card.classList.add('is-clickable');
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', widget.title || '상세 보기');
    const trigger = () => {
      if (buildDetailFn) {
        buildDetailFn();
      } else {
        ctx.openHalfSheet('빠른 확인', sheet.title || widget.title || '상세 정보', el('p', null, sheet.body || ''));
      }
    };
    card.addEventListener('click', (e) => {
      if (e.target.closest('a, button, select, input')) return;
      trigger();
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        trigger();
      }
    });
  }

  function makeCardHeader(widget, sourceMeta, rightBadge) {
    const badge = rightBadge || makeStatusBadge(sourceMeta);
    return el('div', { className: 'card-head' },
      el('div', { className: 'card-title-wrap' },
        el('h2', { className: 'card-title' }, widget.title || '제목 없음'),
        widget.subtitle ? el('p', { className: 'card-subtitle' }, widget.subtitle) : null
      ),
      badge
    );
  }

  function getCurrentPeriodIndex() {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const starts = [520, 580, 640, 700, 810, 870, 930];
    for (let i = 0; i < starts.length; i++) {
      if (mins >= starts[i] && mins < starts[i] + 50) return i;
    }
    return -1;
  }

  function calcDday(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return '';
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return dateStr;
    const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return 'D-Day';
    if (diff > 0) return `D-${diff}`;
    return `D+${Math.abs(diff)}`;
  }

  function calcDiffDays(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
  }

  const SUBJECT_GROUPS = [
    ['국어', '문학', '독서', '화법', '언어'],
    ['수학', '수Ⅰ', '수Ⅱ', '미적분', '기하', '확률'],
    ['영어', '영어Ⅰ', '영어Ⅱ', '영어독해']
  ];

  function matchSubjectTasks(periodSubject, tasks) {
    if (!periodSubject || !Array.isArray(tasks) || tasks.length === 0) return [];
    const p = String(periodSubject).trim();
    const pGroup = SUBJECT_GROUPS.find((grp) => grp.some((g) => p.includes(g)));
    return tasks.filter((t) => {
      if (!t || t.done || !t.subject) return false;
      const s = String(t.subject).trim();
      if (!s || s === '직접' || s === '공지' || s === '기타') return false;
      if (p === s || p.includes(s) || s.includes(p)) return true;
      if (pGroup && pGroup.some((g) => s.includes(g))) return true;
      return false;
    }).sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
  }

  function shortThumbLabel(post) {
    const icon = String(post.thumbIcon || '').trim();
    if (icon && /^[가-힣A-Za-z0-9·]{1,4}$/.test(icon)) return icon;
    const tag = Array.isArray(post.tags) && post.tags[0] ? String(post.tags[0]).replace(/^#/, '') : '';
    if (tag) return tag.slice(0, 4);
    return String(post.dept || '소식').slice(0, 2);
  }

  // Shared Editorial Blog Row (Left clean square thumb + Right horizontal meta; NO overlay badge on thumb)
  function buildBlogRow(post, opts) {
    const safeImg = sanitizeImageUrl(post.thumbUrl || '');
    const thumbContent = safeImg
      ? el('img', { className: 'blog-thumb-img', src: safeImg, alt: post.title || '', width: 72, height: 72, loading: 'lazy', decoding: 'async' })
      : el('span', { className: 'blog-thumb-label' }, shortThumbLabel(post));

    const thumbEl = el('div', {
      className: `blog-thumb ${safeImg ? '' : 'is-text-thumb'}`.trim()
    }, thumbContent);

    const isSaved = opts.isBookmarked(post.id);
    const tags = Array.isArray(post.tags) ? post.tags.slice(0, 2) : [];

    const row = el('article', {
      className: 'blog-row',
      tabindex: '0',
      role: 'button',
      onClick: (e) => {
        if (e.target.closest('button')) return;
        opts.onOpen(post);
      },
      onKeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          opts.onOpen(post);
        }
      }
    },
      thumbEl,
      el('div', { className: 'blog-body' },
        el('div', { className: 'blog-top-row' },
          el('h3', { className: 'blog-title' }, post.title || '제목 없음'),
          el('div', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 } },
            opts.onEditPost ? el('button', {
              type: 'button',
              className: 'bookmark-btn',
              onClick: () => opts.onEditPost(post)
            }, '수정') : null,
            el('button', {
              type: 'button',
              className: 'bookmark-btn',
              'aria-label': isSaved ? '보관 해제' : '보관하기',
              onClick: () => opts.onToggleBookmark(post)
            }, isSaved ? '저장됨' : '보관')
          )
        ),
        el('div', { className: 'blog-bottom-row' },
          el('span', { className: 'blog-meta' }, `${post.date || ''} · ${post.dept || '학생자치회'}`),
          el('div', { className: 'blog-tags' },
            tags.map((tag) =>
              el('button', {
                type: 'button',
                className: 'blog-tag-btn',
                onClick: () => opts.onClickTag && opts.onClickTag(tag)
              }, tag)
            )
          )
        )
      )
    );
    return row;
  }

  // Shared Full-Screen Article Builder (Zero Comments / Zero DM)
  function buildArticleContent(post, opts) {
    const safeImg = sanitizeImageUrl(post.thumbUrl || '');
    const wrap = el('article', { className: 'article-wrap' });

    if (safeImg) {
      wrap.appendChild(el('img', { className: 'article-cover-img', src: safeImg, alt: post.title || '', width: 800, height: 450, loading: 'lazy', decoding: 'async' }));
    } else {
      wrap.appendChild(
        el('div', {
          className: 'article-cover',
          style: { background: THUMB_THEMES[post.thumbTheme] || THUMB_THEMES.ocean }
        },
          el('div', { style: { minWidth: 0, flex: 1 } },
            el('span', { className: 'snap-slide-kicker' }, post.dept || '학생자치회'),
            el('h3', { style: { margin: 0, fontSize: '1.08rem', fontWeight: 800, lineHeight: 1.35 } }, post.title || '')
          ),
          el('span', { style: { fontSize: '1.2rem', fontWeight: 800, flexShrink: 0 } }, post.thumbIcon || '공지')
        )
      );
    }

    const safeCtaUrl = sanitizeUrl(post.ctaUrl || '');
    if (safeCtaUrl) {
      const isExternal = /^https?:\/\//i.test(safeCtaUrl);
      wrap.appendChild(
        el('a', {
          className: 'article-cta-btn',
          href: safeCtaUrl,
          target: isExternal ? '_blank' : null,
          rel: isExternal ? 'noopener noreferrer' : null
        }, post.ctaLabel || '전용 페이지 열기')
      );
    }

    const richHtml = post.article?.html ? sanitizeRichHtml(post.article.html) : null;
    const blocks = Array.isArray(post.article?.blocks) ? post.article.blocks : null;
    if (richHtml) {
      wrap.appendChild(richHtml);
    } else if (blocks && blocks.length > 0) {
      blocks.forEach((blk) => {
        if (!blk || typeof blk !== 'object') return;
        if (blk.type === 'quote' && blk.text) {
          wrap.appendChild(el('blockquote', { className: 'article-quote' }, blk.text));
        } else if (blk.type === 'image') {
          const bImg = sanitizeImageUrl(blk.url || '');
          if (bImg) {
            wrap.appendChild(
              el('figure', { style: { margin: 0 } },
                el('img', { className: 'article-cover-img', src: bImg, alt: blk.caption || post.title || '', width: 800, height: 450, loading: 'lazy', decoding: 'async' }),
                blk.caption ? el('figcaption', { style: { fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '6px' } }, blk.caption) : null
              )
            );
          }
        } else if (blk.type === 'facts' && Array.isArray(blk.items) && blk.items.length > 0) {
          wrap.appendChild(
            el('div', { className: 'article-facts' },
              blk.items.map((f) =>
                el('div', { className: 'article-fact-row' },
                  el('span', { style: { fontWeight: 700, color: 'var(--text-muted)' } }, f.label || ''),
                  el('span', { style: { fontWeight: 700, textAlign: 'right' } }, f.value || '')
                )
              )
            )
          );
        } else if (blk.type === 'cta') {
          const bUrl = sanitizeUrl(blk.url || '');
          if (bUrl && blk.label) {
            const ext = /^https?:\/\//i.test(bUrl);
            wrap.appendChild(
              el('a', {
                className: 'article-cta-btn',
                href: bUrl,
                target: ext ? '_blank' : null,
                rel: ext ? 'noopener noreferrer' : null
              }, blk.label)
            );
          }
        } else if (blk.type === 'paragraph') {
          if (blk.heading || blk.body) {
            wrap.appendChild(
              el('div', { className: 'article-sec' },
                blk.heading ? el('h4', null, blk.heading) : null,
                blk.body ? el('p', null, blk.body) : null
              )
            );
          }
        }
      });
    } else {
      if (post.article?.quote) {
        wrap.appendChild(el('blockquote', { className: 'article-quote' }, post.article.quote));
      }

      const sections = Array.isArray(post.article?.sections) ? post.article.sections : [];
      if (sections.length === 0 && post.excerpt) {
        wrap.appendChild(el('div', { className: 'article-sec' }, el('p', null, post.excerpt)));
      } else {
        sections.forEach((sec) => {
          wrap.appendChild(
            el('div', { className: 'article-sec' },
              sec.heading ? el('h4', null, sec.heading) : null,
              el('p', null, sec.body || '')
            )
          );
        });
      }

      const facts = Array.isArray(post.article?.facts) ? post.article.facts : [];
      if (facts.length > 0) {
        wrap.appendChild(
          el('div', { className: 'article-facts' },
            facts.map((f) =>
              el('div', { className: 'article-fact-row' },
                el('span', { style: { fontWeight: 700, color: 'var(--text-muted)' } }, f.label || ''),
                el('span', { style: { fontWeight: 700, textAlign: 'right' } }, f.value || '')
              )
            )
          )
        );
      }
    }

    if (post.article?.attachment) {
      wrap.appendChild(
        el('div', { className: 'article-attach' },
          el('span', null, `첨부: ${post.article.attachment}`),
          el('span', { style: { color: 'var(--accent)' } }, '첨부 확인')
        )
      );
    }

    const tags = Array.isArray(post.tags) ? post.tags : [];
    if (tags.length > 0) {
      wrap.appendChild(
        el('div', { className: 'chip-wrap' },
          tags.map((t) => el('span', { className: 'dish-chip' }, t))
        )
      );
    }

    const liked = opts.isLiked(post.id);
    const saved = opts.isBookmarked(post.id);
    const scheduled = opts.isScheduled ? opts.isScheduled(post.id) : false;
    const baseLikes = Number(post.likes || 0);
    const likeCount = baseLikes + (liked ? 1 : 0);
    const likeLabel = likeCount > 0 ? (liked ? `공감함 ${likeCount}` : `공감 ${likeCount}`) : (liked ? '공감함' : '공감');

    wrap.appendChild(
      el('div', { className: 'article-actions' },
        el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
          el('button', {
            type: 'button',
            className: `action-btn ${liked ? 'is-active' : ''}`.trim(),
            onClick: () => opts.onToggleLike(post)
          }, likeLabel),
          el('button', {
            type: 'button',
            className: `action-btn ${saved ? 'is-active' : ''}`.trim(),
            onClick: () => opts.onToggleBookmark(post)
          }, saved ? '저장됨' : '보관'),
          opts.onToggleSchedule ? el('button', {
            type: 'button',
            className: `action-btn ${scheduled ? 'is-active' : ''}`.trim(),
            onClick: () => opts.onToggleSchedule(post)
          }, scheduled ? '일정 담김' : '일정 담기') : null,
          opts.onEditPost ? el('button', {
            type: 'button',
            className: 'action-btn',
            onClick: () => opts.onEditPost(post)
          }, '이 글 수정') : null
        )
      )
    );

    return wrap;
  }

  const RENDERERS = {
    carousel(widget, data, ctx) {
      const card = createCardShell(widget, 'carousel-shell');
      const allPosts = Array.isArray(data) ? data : [];
      const pinnedOnly = widget.props?.pinnedOnly !== false;
      const slides = pinnedOnly ? allPosts.filter((p) => p.pinned) : allPosts;
      const items = slides.length > 0 ? slides : allPosts.slice(0, 3);

      if (items.length === 0) {
        card.classList.remove('carousel-shell');
        card.appendChild(el('p', { className: 'card-subtitle' }, '표시할 중요 공지가 없습니다.'));
        return card;
      }

      let currentIdx = 0;
      const dotsWrap = el('div', { className: 'carousel-dots' });
      const track = el('div', { className: 'snap-carousel' });

      function updateDots() {
        dotsWrap.replaceChildren(
          ...items.map((_, i) =>
            el('button', {
              type: 'button',
              className: `carousel-dot ${i === currentIdx ? 'is-active' : ''}`.trim(),
              'aria-label': `${i + 1}번 공지`,
              onClick: () => {
                currentIdx = i;
                track.scrollTo({ left: track.clientWidth * i, behavior: 'smooth' });
                updateDots();
              }
            })
          )
        );
      }

      items.forEach((post) => {
        const safeImg = sanitizeImageUrl(post.thumbUrl || '');
        const hasCta = Boolean(sanitizeUrl(post.ctaUrl || ''));
        const mediaEl = safeImg
          ? el('div', { className: 'snap-slide-media' },
              el('img', { src: safeImg, alt: post.title || '', width: 800, height: 450, loading: 'lazy', decoding: 'async' })
            )
          : el('div', { className: 'snap-slide-media is-fallback' },
              el('span', { className: 'snap-slide-fallback-tag' }, shortThumbLabel(post))
            );
        track.appendChild(
          el('button', {
            type: 'button',
            className: 'snap-slide',
            onClick: () => ctx.openFullArticle(post)
          },
            mediaEl,
            el('div', { className: 'snap-slide-meta' },
              el('span', { className: 'snap-slide-kicker' }, `${widget.title || '중요 공지'} · ${post.date || ''}`),
              el('h3', { className: 'snap-slide-title' }, post.title || ''),
              el('p', { className: 'snap-slide-sub' }, `${post.dept || '학생자치회'} · ${hasCta ? '자세히 보기' : '본문 읽기'}`)
            )
          )
        );
      });

      track.addEventListener('scroll', () => {
        const w = track.clientWidth || 1;
        const idx = Math.round(track.scrollLeft / w);
        if (idx !== currentIdx && idx >= 0 && idx < items.length) {
          currentIdx = idx;
          updateDots();
        }
      });

      updateDots();

      card.appendChild(
        el('div', { className: 'carousel-head' },
          el('span', { className: 'carousel-label' }, widget.subtitle || '휙휙 넘기는 중요 공지'),
          dotsWrap,
          el('div', { className: 'carousel-arrows' },
            el('button', {
              type: 'button',
              className: 'carousel-nav-btn',
              'aria-label': '이전 공지',
              onClick: () => {
                currentIdx = (currentIdx - 1 + items.length) % items.length;
                track.scrollTo({ left: track.clientWidth * currentIdx, behavior: 'smooth' });
                updateDots();
              }
            }, '‹'),
            el('button', {
              type: 'button',
              className: 'carousel-nav-btn',
              'aria-label': '다음 공지',
              onClick: () => {
                currentIdx = (currentIdx + 1) % items.length;
                track.scrollTo({ left: track.clientWidth * currentIdx, behavior: 'smooth' });
                updateDots();
              }
            }, '›')
          )
        )
      );
      card.appendChild(track);
      return card;
    },

    planner(widget, data, ctx) {
      const card = createCardShell(widget);
      const assessments = Array.isArray(data) ? data : [];
      const tasks = Array.isArray(ctx.personalTasks) ? [...ctx.personalTasks] : [];

      tasks.sort((a, b) => {
        if (Boolean(a.done) !== Boolean(b.done)) return a.done ? 1 : -1;
        return String(a.dueDate || '9999-99-99').localeCompare(String(b.dueDate || '9999-99-99'));
      });

      const header = el('div', { className: 'card-head' },
        el('div', { className: 'card-title-wrap' },
          el('h2', { className: 'card-title' }, widget.title || '내 일정 & 수행 D-Day'),
          widget.subtitle ? el('p', { className: 'card-subtitle' }, widget.subtitle) : null
        ),
        el('div', { className: 'planner-actions' },
          ctx.openAssessmentPicker ? el('button', {
            type: 'button',
            className: 'planner-mini-btn',
            onClick: () => ctx.openAssessmentPicker(assessments)
          }, '수행 담기') : null,
          ctx.openAddTaskSheet ? el('button', {
            type: 'button',
            className: 'planner-mini-btn is-primary',
            onClick: () => ctx.openAddTaskSheet()
          }, '+ 추가') : null
        )
      );
      card.appendChild(header);

      const maxVisible = Math.max(1, Number(widget.props?.maxVisible) || 5);
      const visibleTasks = tasks.slice(0, maxVisible);
      const list = el('div', { className: 'planner-list' });

      if (visibleTasks.length === 0) {
        list.appendChild(
          el('p', { className: 'card-subtitle', style: { margin: '4px 0 0' } },
            '등록된 일정이 없습니다. [+ 추가]를 누르거나 탐색 공지에서 [일정 담기]를 눌러 보세요.'
          )
        );
      } else {
        visibleTasks.forEach((task) => {
          const diff = calcDiffDays(task.dueDate);
          const ddayText = task.dueDate ? calcDday(task.dueDate) : '';
          const isUrgent = !task.done && diff !== null && diff >= 0 && diff <= 3;
          const metaParts = [task.subject || '일정', task.dueDate || '날짜 미정'].filter(Boolean).join(' · ');

          list.appendChild(
            el('div', { className: `planner-row ${task.done ? 'is-done' : ''}`.trim() },
              el('input', {
                type: 'checkbox',
                className: 'planner-check',
                checked: Boolean(task.done),
                'aria-label': `${task.title} 완료 여부`,
                onChange: () => ctx.toggleTaskDone && ctx.toggleTaskDone(task.id)
              }),
              el('div', { className: 'planner-main' },
                el('span', { className: 'planner-title' }, task.title || ''),
                el('span', { className: 'planner-meta' }, metaParts)
              ),
              ddayText ? el('span', { className: `dday-pill ${isUrgent ? 'is-urgent' : ''}`.trim() }, ddayText) : null,
              ctx.deleteTask ? el('button', {
                type: 'button',
                className: 'planner-del-btn',
                'aria-label': '일정 삭제',
                onClick: () => ctx.deleteTask(task.id)
              }, '✕') : null
            )
          );
        });
      }
      card.appendChild(list);

      if (tasks.length > maxVisible && ctx.openAllTasksSheet) {
        card.appendChild(
          el('button', {
            type: 'button',
            className: 'planner-mini-btn',
            style: { marginTop: '10px', width: '100%' },
            onClick: () => ctx.openAllTasksSheet()
          }, `전체 일정 ${tasks.length}건 모두 보기`)
        );
      }
      return card;
    },

    meal(widget, data, ctx) {
      const card = createCardShell(widget);
      const meal = data && typeof data === 'object' ? data : {};
      const dishes = Array.isArray(meal.dishes) ? meal.dishes : [];
      const showCal = widget.props?.showCalories !== false;
      const rightText = [meal.date, showCal ? meal.calories : ''].filter(Boolean).join(' · ');

      card.appendChild(
        makeCardHeader(
          widget,
          ctx.sourceMeta,
          rightText ? el('span', { className: 'badge-pill' }, rightText) : makeStatusBadge(ctx.sourceMeta)
        )
      );

      if (dishes.length === 0) {
        card.appendChild(el('p', { className: 'card-subtitle' }, '표시할 급식 메뉴가 없습니다.'));
        attachHalfSheetTrigger(card, widget, ctx);
        return card;
      }

      const userAllergens = new Set(ctx.allergens || []);
      const matchedNames = [];
      card.appendChild(el('div', { className: 'meal-main' }, dishes[0].name || ''));

      const chips = el('div', { className: 'chip-wrap' });
      for (const dish of dishes) {
        const hits = (dish.allergens || []).filter((n) => userAllergens.has(Number(n)));
        if (hits.length > 0) matchedNames.push(`${dish.name}(${hits.map((h) => ALLERGENS[h] || h).join(',')})`);
        chips.appendChild(
          el('span', { className: `dish-chip ${hits.length > 0 ? 'has-allergen' : ''}`.trim() }, dish.name || '')
        );
      }
      card.appendChild(chips);

      if (matchedNames.length > 0) {
        card.appendChild(el('p', { className: 'allergen-note' }, `주의 성분 포함: ${matchedNames.join(' · ')}`));
      }

      attachHalfSheetTrigger(card, widget, ctx, () => {
        const detailWrap = el('div', null,
          el('p', { style: { margin: '0 0 10px', fontSize: '0.84rem', color: 'var(--text-muted)' } }, `${meal.date || ''} ${meal.mealType || '중식'} · ${meal.calories || ''}`),
          el('div', { className: 'chip-wrap' },
            dishes.map((dish) => {
              const hits = (dish.allergens || []).filter((n) => userAllergens.has(Number(n)));
              const label = hits.length ? `${dish.name} (주의: ${hits.map((h) => ALLERGENS[h]).join(',')})` : dish.name;
              return el('span', { className: `dish-chip ${hits.length ? 'has-allergen' : ''}`.trim() }, label);
            })
          ),
          widget.sheet?.body ? el('p', { style: { margin: '14px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' } }, widget.sheet.body) : null
        );
        ctx.openHalfSheet('반 시트 빠른 확인 · NEIS', widget.sheet?.title || '오늘의 급식 상세', detailWrap);
      });
      return card;
    },

    timetable(widget, data, ctx) {
      const card = createCardShell(widget);
      const map = data && typeof data === 'object' ? data : {};
      const rawEntry = map[ctx.classKey] || map.default || [];
      const { periods } = resolveWeekTimetable(rawEntry);

      card.appendChild(
        makeCardHeader(widget, ctx.sourceMeta, el('span', { className: 'badge-pill' }, `${ctx.classKey}반`))
      );

      const timeline = el('div', { className: 'timeline' });
      const activeIdx = getCurrentPeriodIndex();
      const showTimes = widget.props?.showPeriodTimes !== false;

      if (periods.length === 0) {
        timeline.appendChild(el('p', { className: 'card-subtitle' }, '등록된 시간표 데이터가 없습니다.'));
      } else {
        periods.forEach((subject, idx) => {
          const isCurrent = idx === activeIdx;
          const matched = matchSubjectTasks(subject, ctx.personalTasks);
          const topMatch = matched[0];
          const matchDday = topMatch && topMatch.dueDate ? calcDday(topMatch.dueDate) : '';
          timeline.appendChild(
            el('div', { className: `timeline-row ${isCurrent ? 'is-current' : ''}`.trim() },
              el('span', { className: 'period-num' }, `${idx + 1}교시`),
              el('span', { className: 'period-subject' }, String(subject)),
              topMatch ? el('span', { className: 'dday-pill is-urgent', title: topMatch.title }, `${matchDday || topMatch.subject}`) : null,
              showTimes && PERIOD_TIMES[idx] ? el('span', { className: 'period-time' }, PERIOD_TIMES[idx]) : null,
              isCurrent ? el('span', { className: 'pulse-dot', title: '현재 교시' }) : null
            )
          );
        });
      }

      card.appendChild(timeline);
      attachHalfSheetTrigger(card, widget, ctx, () => {
        const sheetList = el('div', { className: 'timeline' },
          periods.map((subj, i) => {
            const matched = matchSubjectTasks(subj, ctx.personalTasks);
            const topMatch = matched[0];
            return el('div', { className: `timeline-row ${i === activeIdx ? 'is-current' : ''}`.trim() },
              el('span', { className: 'period-num' }, `${i + 1}교시`),
              el('div', { style: { flex: 1, minWidth: 0 } },
                el('span', { className: 'period-subject', style: { display: 'block' } }, String(subj)),
                topMatch ? el('span', { style: { display: 'block', fontSize: '0.75rem', color: 'var(--warn-text)', fontWeight: 700 } }, `수행: ${topMatch.title} (${calcDday(topMatch.dueDate)})`) : null
              ),
              PERIOD_TIMES[i] ? el('span', { className: 'period-time' }, PERIOD_TIMES[i]) : null
            );
          })
        );
        ctx.openHalfSheet(`반 시트 빠른 확인 · ${ctx.classKey}반`, widget.sheet?.title || '오늘 시간표 상세', sheetList);
      });
      return card;
    },

    ticker(widget, data, ctx) {
      const card = createCardShell(widget, 'ticker-card');
      const items = Array.isArray(data) && data.length > 0
        ? data
        : Array.isArray(widget.props?.items) && widget.props.items.length > 0
          ? widget.props.items
          : [{ title: widget.title || '등록된 알림이 없습니다', date: '', tag: '알림' }];

      let idx = 0;
      const tagEl = el('span', { className: 'ticker-tag' }, items[0].tag || '일정');
      const textEl = el('span', { className: 'ticker-text' }, items[0].title || '');
      const dateEl = el('span', { className: 'ticker-date' }, calcDday(items[0].date) || items[0].meta || '');

      const openTickerSheet = () => {
        const list = el('div', { className: 'list-items' },
          items.map((it) =>
            el('div', { className: 'list-item-btn', style: { cursor: 'default' } },
              el('span', { className: 'list-item-main' },
                el('span', { className: 'list-item-title' }, it.title || ''),
                it.date ? el('span', { className: 'list-item-meta' }, `${it.date} (${calcDday(it.date)})`) : null
              ),
              el('span', { className: 'badge-pill' }, it.tag || '학사')
            )
          )
        );
        ctx.openHalfSheet('반 시트 빠른 확인', widget.sheet?.title || '학사 일정', list);
      };

      const mainBtn = el('button', {
        type: 'button',
        className: 'ticker-main-btn',
        onClick: openTickerSheet
      }, tagEl, textEl, dateEl);

      let pauseBtn = null;
      if (items.length > 1) {
        let paused = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        const ms = Math.max(1500, Number(widget.props?.intervalMs) || 3000);
        const timerId = window.setInterval(() => {
          if (!card.isConnected) {
            window.clearInterval(timerId);
            return;
          }
          if (paused) return;
          idx = (idx + 1) % items.length;
          const item = items[idx];
          tagEl.textContent = item.tag || '일정';
          textEl.textContent = item.title || '';
          dateEl.textContent = calcDday(item.date) || item.meta || '';
        }, ms);
        ctx.registerTimer(timerId);

        pauseBtn = el('button', {
          type: 'button',
          className: 'ticker-pause-btn',
          'aria-pressed': String(paused),
          'aria-label': paused ? '자동 전환 재생' : '자동 전환 정지',
          onClick: () => {
            paused = !paused;
            pauseBtn.textContent = paused ? '재생' : '정지';
            pauseBtn.setAttribute('aria-pressed', String(paused));
            pauseBtn.setAttribute('aria-label', paused ? '자동 전환 재생' : '자동 전환 정지');
          }
        }, paused ? '재생' : '정지');
      }

      card.appendChild(el('div', { className: 'ticker-row' }, mainBtn, pauseBtn));
      return card;
    },

    stat(widget, data, ctx) {
      const card = createCardShell(widget);
      card.appendChild(makeCardHeader(widget, ctx.sourceMeta));

      const props = widget.props || {};
      const srcObj = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
      const value = srcObj.value ?? props.value ?? '0';
      const unit = srcObj.unit ?? props.unit ?? '';
      const caption = srcObj.caption ?? props.caption ?? '';
      const percentRaw = srcObj.percent ?? props.percent;

      card.appendChild(
        el('div', { className: 'stat-value-row' },
          el('span', { className: 'stat-value' }, String(value)),
          unit ? el('span', { className: 'stat-unit' }, String(unit)) : null
        )
      );

      if (percentRaw !== undefined && percentRaw !== null && percentRaw !== '') {
        const pct = Math.max(0, Math.min(100, Number(percentRaw) || 0));
        card.appendChild(
          el('div', { className: 'progress-track' },
            el('div', { className: 'progress-fill', style: { width: `${pct}%` } })
          )
        );
      }

      if (caption) {
        card.appendChild(el('p', { className: 'stat-caption' }, String(caption)));
      }

      attachHalfSheetTrigger(card, widget, ctx);
      return card;
    },

    list(widget, data, ctx) {
      const card = createCardShell(widget);
      card.appendChild(makeCardHeader(widget, ctx.sourceMeta));

      const rawItems = Array.isArray(data)
        ? data
        : Array.isArray(widget.props?.items)
          ? widget.props.items
          : [];
      const maxItems = Math.max(1, Number(widget.props?.maxItems) || 5);
      const items = rawItems.slice(0, maxItems);

      const listEl = el('div', { className: 'list-items' });
      if (items.length === 0) {
        listEl.appendChild(el('p', { className: 'card-subtitle' }, '표시할 항목이 없습니다.'));
      } else {
        for (const item of items) {
          const title = typeof item === 'string' ? item : (item.title || item.name || '제목 없음');
          const meta = typeof item === 'object' ? (item.meta || item.date || '') : '';
          const tag = typeof item === 'object' ? (item.tag || '') : '';
          const detail = typeof item === 'object' ? (item.detail || item.excerpt || item.body || meta || title) : title;

          listEl.appendChild(
            el('button', {
              type: 'button',
              className: 'list-item-btn',
              onClick: () => ctx.openHalfSheet(meta || '상세 안내', title, el('p', null, String(detail)))
            },
              el('span', { className: 'list-item-main' },
                el('span', { className: 'list-item-title' }, String(title)),
                meta ? el('span', { className: 'list-item-meta' }, String(meta)) : null
              ),
              tag ? el('span', { className: 'badge-pill' }, String(tag)) : null
            )
          );
        }
      }

      card.appendChild(listEl);
      return card;
    },

    banner(widget, data, ctx) {
      const card = createCardShell(widget, 'banner-card');
      const props = widget.props || {};
      const srcObj = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
      const badge = srcObj.badge ?? props.badge ?? '';
      const desc = srcObj.description ?? props.description ?? '';
      const ctaText = srcObj.ctaText ?? props.ctaText ?? '';
      const ctaUrl = sanitizeUrl(srcObj.ctaUrl ?? props.ctaUrl ?? '');

      if (badge) card.appendChild(el('span', { className: 'banner-badge' }, String(badge)));
      card.appendChild(makeCardHeader(widget, null, el('span')));
      if (desc) card.appendChild(el('p', { className: 'banner-desc' }, String(desc)));
      if (ctaText && ctaUrl) {
        card.appendChild(el('a', { className: 'cta-btn', href: ctaUrl }, ctaText));
      } else {
        attachHalfSheetTrigger(card, widget, ctx);
      }

      return card;
    },

    text(widget, data, ctx) {
      const card = createCardShell(widget);
      card.appendChild(makeCardHeader(widget, ctx.sourceMeta));

      const bodyWrap = el('div', { className: 'text-body' });
      const propsBody = widget.props?.body || '';

      if (data && typeof data === 'object') {
        if (data.headline) bodyWrap.appendChild(el('p', { className: 'text-headline' }, String(data.headline)));
        if (data.body) {
          String(data.body).split(/\n{2,}/).forEach((para) => {
            if (para.trim()) bodyWrap.appendChild(el('p', null, para.trim()));
          });
        } else if (!data.headline) {
          const preview = Array.isArray(data)
            ? data.slice(0, 5).map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join('\n')
            : Object.entries(data).slice(0, 8).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n');
          bodyWrap.appendChild(el('p', null, preview || '데이터가 비어 있습니다.'));
        }
      } else if (typeof data === 'string' && data.trim()) {
        bodyWrap.appendChild(el('p', null, data));
      } else if (propsBody) {
        String(propsBody).split(/\n{2,}/).forEach((para) => {
          if (para.trim()) bodyWrap.appendChild(el('p', null, para.trim()));
        });
      } else {
        bodyWrap.appendChild(el('p', { className: 'card-subtitle' }, '내용을 입력하거나 API 소스를 연결해 주세요.'));
      }

      card.appendChild(bodyWrap);
      attachHalfSheetTrigger(card, widget, ctx);
      return card;
    },

    study_timer(widget, _data, ctx) {
      const card = createCardShell(widget, 'study-timer-card');
      const st = ctx.studyTimer || { subject: '수학', mode: 'stopwatch', running: false, dailyLogs: {} };
      const todayKey = new Date().toISOString().slice(0, 10);
      const todayLogs = (st.dailyLogs && st.dailyLogs[todayKey]) || {};
      const totalTodaySec = Object.values(todayLogs).reduce((acc, s) => acc + (Number(s) || 0), 0);
      const pomoSec = Math.max(5, Number(widget.props?.pomodoroMin) || 25) * 60;

      const formatHms = (sec) => {
        const s = Math.max(0, Math.floor(sec));
        const h = String(Math.floor(s / 3600)).padStart(2, '0');
        const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
        const r = String(s % 60).padStart(2, '0');
        return `${h}:${m}:${r}`;
      };
      const formatKoDur = (sec) => {
        const m = Math.floor(Math.max(0, sec) / 60);
        const h = Math.floor(m / 60);
        const rm = m % 60;
        if (h > 0) return `${h}시간 ${rm}분`;
        if (m > 0) return `${m}분`;
        return `${Math.floor(Math.max(0, sec))}초`;
      };

      const totalBadge = el('span', { className: 'badge-pill' }, `오늘 ${formatKoDur(totalTodaySec)}`);
      const head = el('div', { className: 'card-head' },
        el('div', { className: 'card-head-title-group' },
          el('h2', { className: 'card-title' }, widget.title || '오늘의 공부 타이머'),
          widget.subtitle ? el('p', { className: 'card-subtitle' }, widget.subtitle) : null
        ),
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          totalBadge,
          ctx.openStudyFocusSheet ? el('button', {
            type: 'button',
            className: 'planner-mini-btn',
            onClick: () => ctx.openStudyFocusSheet(pomoSec)
          }, '집중 화면') : null
        )
      );
      card.appendChild(head);

      const modeRow = el('div', { className: 'study-mode-row' },
        [
          { id: 'stopwatch', label: '스톱워치' },
          { id: 'pomodoro', label: `뽀모도로 ${Math.round(pomoSec / 60)}분` }
        ].map((m) =>
          el('button', {
            type: 'button',
            className: `study-mode-btn ${st.mode === m.id ? 'is-active' : ''}`.trim(),
            onClick: () => ctx.setStudyMode && ctx.setStudyMode(m.id)
          }, m.label)
        )
      );
      card.appendChild(modeRow);

      const SUBJECTS = ['국어', '수학', '영어', '탐구', '기타'];
      const subjRow = el('div', { className: 'study-subj-row' },
        SUBJECTS.map((subj) =>
          el('button', {
            type: 'button',
            className: `study-subj-chip ${st.subject === subj ? 'is-active' : ''}`.trim(),
            onClick: () => ctx.setStudySubject && ctx.setStudySubject(subj)
          }, subj)
        )
      );
      card.appendChild(subjRow);

      const clockEl = el('div', { className: 'study-clock-value' }, '00:00:00');
      const syncClockText = () => {
        const elapsedSec = ctx.getStudyElapsedMs ? ctx.getStudyElapsedMs() / 1000 : 0;
        if (st.mode === 'pomodoro') {
          const rem = Math.max(0, pomoSec - elapsedSec);
          clockEl.textContent = formatHms(rem);
        } else {
          clockEl.textContent = formatHms(elapsedSec);
        }
      };
      syncClockText();
      if (st.running && ctx.registerTimer) {
        ctx.registerTimer(setInterval(syncClockText, 1000));
      }

      const controls = el('div', { className: 'study-controls-row' },
        el('button', {
          type: 'button',
          className: `planner-mini-btn ${st.running ? '' : 'is-primary'}`.trim(),
          onClick: () => ctx.toggleStudyTimer && ctx.toggleStudyTimer()
        }, st.running ? '일시정지' : '시작'),
        el('button', {
          type: 'button',
          className: 'planner-mini-btn',
          onClick: () => ctx.saveStudySession && ctx.saveStudySession(pomoSec)
        }, '기록 저장'),
        el('button', {
          type: 'button',
          className: 'planner-mini-btn',
          onClick: () => ctx.resetStudyTimer && ctx.resetStudyTimer()
        }, '초기화')
      );

      card.appendChild(
        el('div', { className: 'study-clock-box' },
          el('span', { className: 'study-clock-subj' }, `${st.subject || '수학'} · ${st.running ? '측정 중' : '대기 중'}`),
          clockEl,
          controls
        )
      );

      const entries = Object.entries(todayLogs).filter(([, sec]) => sec > 0).sort((a, b) => b[1] - a[1]);
      if (entries.length > 0) {
        const maxSec = Math.max(...entries.map(([, s]) => s), 60);
        card.appendChild(
          el('div', { className: 'study-today-bars' },
            entries.map(([subj, sec]) =>
              el('div', { className: 'study-bar-row' },
                el('span', { className: 'study-bar-label' }, subj),
                el('div', { className: 'study-bar-track' },
                  el('div', { className: 'study-bar-fill', style: { width: `${Math.max(8, Math.round((sec / maxSec) * 100))}%` } })
                ),
                el('span', { className: 'study-bar-val' }, formatKoDur(sec))
              )
            )
          )
        );
      }
      return card;
    },

    study_links(widget, data, ctx) {
      const card = createCardShell(widget, 'study-links-card');
      card.appendChild(makeCardHeader(widget, ctx.sourceMeta));

      const rawItems = Array.isArray(data) ? data : (Array.isArray(widget.props?.items) ? widget.props.items : []);
      const maxItems = Number(widget.props?.maxItems) || 12;
      const items = rawItems.slice(0, maxItems);
      if (items.length === 0) {
        card.appendChild(el('p', { className: 'card-subtitle' }, '등록된 추천 사이트가 없습니다.'));
        return card;
      }

      const categories = ['전체', ...Array.from(new Set(items.map((it) => it.category).filter(Boolean)))];
      let activeCat = '전체';
      const chipWrap = el('div', { className: 'study-subj-row', style: { marginBottom: '12px' } });
      const gridWrap = el('div', { className: 'study-links-grid' });

      const renderLinks = () => {
        chipWrap.replaceChildren(
          ...categories.map((cat) =>
            el('button', {
              type: 'button',
              className: `study-subj-chip ${activeCat === cat ? 'is-active' : ''}`.trim(),
              onClick: () => {
                activeCat = cat;
                renderLinks();
              }
            }, cat)
          )
        );

        const filtered = activeCat === '전체' ? items : items.filter((it) => it.category === activeCat);
        gridWrap.replaceChildren(
          ...filtered.map((it) => {
            const safeHref = sanitizeUrl(it.url);
            return el('a', {
              className: 'study-link-item',
              href: safeHref,
              target: '_blank',
              rel: 'noopener noreferrer'
            },
              el('div', { className: 'study-link-top' },
                el('span', { className: 'study-link-cat' }, it.category || '추천'),
                el('span', { className: 'study-link-arrow', 'aria-hidden': 'true' }, '↗')
              ),
              el('strong', { className: 'study-link-title' }, it.title || ''),
              it.desc ? el('span', { className: 'study-link-desc' }, it.desc) : null
            );
          })
        );
      };

      renderLinks();
      if (categories.length > 1) card.appendChild(chipWrap);
      card.appendChild(gridWrap);
      return card;
    }
  };

  function renderWidgetSafe(widget, sourceData, ctx) {
    try {
      const renderer = RENDERERS[widget.type];
      if (!renderer) throw new Error(`알 수 없는 위젯 타입: ${widget.type}`);
      return renderer(widget, sourceData, ctx);
    } catch (err) {
      return el('section', { className: 'widget-card widget-error' },
        el('div', { className: 'card-head' },
          el('div', { className: 'card-title-wrap' },
            el('h2', { className: 'card-title' }, `위젯 점검 중 (${widget.title || widget.id || '이름 없음'})`),
            el('p', { className: 'card-subtitle' }, String(err && err.message ? err.message : err))
          )
        )
      );
    }
  }

  window.TEUM_ALLERGENS = ALLERGENS;
  window.TEUM_WIDGET_META = WIDGET_META;
  window.TEUM_DOM = { el, sanitizeUrl, sanitizeImageUrl, formatKrw };
  window.TEUM_UI = { THUMB_THEMES, WEEKDAYS, PERIOD_TIMES, getCurrentPeriodIndex, resolveWeekTimetable, matchSubjectTasks, buildBlogRow, buildArticleContent };
  window.TEUM_WIDGETS = RENDERERS;
  window.renderWidgetSafe = renderWidgetSafe;
})();
