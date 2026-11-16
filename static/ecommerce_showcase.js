'use strict';

window.createCommerceShowcase = function (landing) {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const decks = Array.from(landing.querySelectorAll('[data-showcase-card]'), (card) => ({
    key: card.dataset.showcaseCard,
    card,
    art: card.querySelector('.commerce-art'),
    slide: card.querySelector('.commerce-slide'),
    controls: card.querySelector('.commerce-rotation'),
    toggle: card.querySelector('[data-showcase-toggle]'),
    count: card.querySelector('[data-showcase-count]'),
    rows: [],
    index: 0,
    paused: motion.matches,
    timer: 0,
  }));
  let active = false;
  let currentVideo = null;
  let lastRead = -Infinity;

  function clearVideo() {
    if (!currentVideo) return;
    const { deck, media, play } = currentVideo;
    currentVideo = null;
    media.pause();
    media.removeAttribute('src');
    media.load();
    media.remove();
    deck.card.removeAttribute('data-playing');
    play.hidden = false;
  }

  function schedule(deck) {
    clearTimeout(deck.timer);
    if (!active || deck.rows.length < 2 || deck.paused || document.hidden ||
        deck.card.matches(':hover, :focus-within') || deck.rows[deck.index].type === 'video') return;
    deck.timer = setTimeout(() => show(deck, deck.index + 1), 6000);
  }

  function show(deck, index) {
    if (currentVideo?.deck === deck) clearVideo();
    deck.index = deck.rows.length ? (index + deck.rows.length) % deck.rows.length : 0;
    const row = deck.rows[deck.index];
    deck.slide.replaceChildren();
    deck.slide.dataset.kind = row?.type || '';
    deck.slide.hidden = !row;
    deck.controls.hidden = deck.rows.length < 2;
    deck.count.textContent = row ? (deck.index + 1) + ' / ' + deck.rows.length : '';
    if (row?.type === 'image') {
      const img = document.createElement('img');
      img.alt = (deck.key === 'image' ? '图片创作' : '视频创作') + '展示图';
      img.decoding = 'async';
      img.addEventListener('error', () => { if (img.parentNode === deck.slide) deck.slide.hidden = true; });
      deck.slide.append(img);
      img.src = row.url;
    } else if (row?.type === 'video') {
      const play = document.createElement('button');
      play.type = 'button';
      play.textContent = '▶ 播放示例';
      play.onclick = () => {
        clearVideo();
        const media = document.createElement('video');
        media.controls = true;
        media.playsInline = true;
        media.preload = 'none';
        media.muted = true;
        media.setAttribute('aria-label', '创作示例视频');
        currentVideo = { deck, media, play };
        deck.card.dataset.playing = '';
        play.hidden = true;
        deck.slide.prepend(media);
        media.addEventListener('ended', () => {
          if (currentVideo?.media !== media || deck.paused || deck.rows.length < 2) return;
          show(deck, deck.index + 1);
          deck.card.querySelector('[data-showcase-next]').focus({ preventScroll: true });
        });
        media.addEventListener('error', () => {
          if (currentVideo?.media !== media) return;
          clearVideo();
          play.textContent = '示例暂不可用 · 重试';
          play.focus({ preventScroll: true });
        });
        media.src = row.url;
        media.focus({ preventScroll: true });
        media.play().catch(() => {});
      };
      deck.slide.append(play);
    }
    schedule(deck);
  }

  for (const deck of decks) {
    deck.art.addEventListener('click', (event) => {
      if (!event.target.closest('button, video, .commerce-rotation')) {
        deck.card.querySelector('[data-commerce-entry]').click();
      }
    });
    deck.card.querySelector('[data-showcase-prev]').onclick = () => show(deck, deck.index - 1);
    deck.card.querySelector('[data-showcase-next]').onclick = () => show(deck, deck.index + 1);
    function updateToggle() {
      deck.toggle.textContent = deck.paused ? '▶' : 'Ⅱ';
      deck.toggle.setAttribute('aria-label', deck.paused ? '继续轮播' : '暂停轮播');
      schedule(deck);
    }
    deck.toggle.onclick = () => {
      deck.paused = !deck.paused;
      updateToggle();
    };
    for (const name of ['mouseenter', 'mouseleave', 'focusin', 'focusout']) {
      deck.card.addEventListener(name, () => queueMicrotask(() => schedule(deck)));
    }
    updateToggle();
  }

  async function refresh() {
    if (performance.now() - lastRead < 60000) return;
    lastRead = performance.now();
    try {
      const response = await fetch('/api/ecommerce-showcase', { signal: AbortSignal.timeout(3500), cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      if (!payload.ok || !payload.cards) return;
      for (const deck of decks) {
        if (!Array.isArray(payload.cards[deck.key])) continue;
        const rows = payload.cards[deck.key].slice(0, 20).flatMap((row) => (
          row && typeof row.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(row.id) && ['image', 'video'].includes(row.type)
            ? [{ type: row.type, url: '/api/ecommerce-showcase-media?' + new URLSearchParams({ id: row.id }) }]
            : []
        ));
        if (JSON.stringify(rows) === JSON.stringify(deck.rows)) continue;
        deck.rows = rows;
        if (active) show(deck, 0);
        else deck.index = 0;
      }
    } catch (_) {
      // The static artwork remains usable when the catalog is unavailable.
    }
  }

  function setActive(next) {
    if (next === active) return;
    active = next;
    if (active) {
      decks.forEach((deck) => show(deck, deck.index));
      refresh();
    } else {
      clearVideo();
      for (const deck of decks) {
        clearTimeout(deck.timer);
        deck.slide.replaceChildren();
        deck.slide.hidden = true;
      }
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearVideo();
    decks.forEach(schedule);
  });
  window.addEventListener('pagehide', () => setActive(false));
  return { setActive };
};
