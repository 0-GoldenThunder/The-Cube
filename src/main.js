/**
 * THE CUBE — Animation Engine v2
 *
 * Interaction model (Option B — scroll-triggered auto-play):
 *   State: 'hero'         → Frame 0 frozen, neon loop active, hero UI visible
 *   ↓ scroll / click Start
 *   State: 'transitioning' → GSAP animates frames 0→239, hero fades out
 *   State: 'detail'        → Frame 239 frozen, neon loop active, labels visible
 *   ↑ scroll up
 *   State: 'transitioning' → GSAP animates frames 239→0, labels fade out
 *   State: 'hero'          → back to start
 */

import { gsap } from 'gsap';

// ==========================================================================
// Core Setup
// ==========================================================================

const canvas   = document.getElementById('parallax-canvas');
const ctx      = canvas.getContext('2d', { alpha: false });
const TOTAL    = 240;  // total frame count
const frames   = [];   // preloaded Image array

// GSAP-driven frame pointer — tweened directly, no LERP needed
const seq = { frame: 0 };

ctx.imageSmoothingEnabled  = true;
ctx.imageSmoothingQuality  = 'high';

// ==========================================================================
// State Machine
// ==========================================================================

// Allowed values: 'hero' | 'transitioning' | 'detail'
let state = 'hero';

// ==========================================================================
// Debug
// ==========================================================================

let debugOn = false;

function log(msg, isErr = false) {
  const list  = document.getElementById('debug-log-list');
  const stEl  = document.getElementById('debug-state');

  if (stEl) stEl.textContent = `State: ${state}`;

  if (list) {
    const row = document.createElement('div');
    row.style.cssText = [
      `color:${isErr ? '#ff4466' : '#00d4ff'}`,
      `border-left:2px solid ${isErr ? '#ff4466' : '#00d4ff'}`,
      'padding-left:5px',
      'font-size:10px',
      'line-height:1.3',
    ].join(';');
    row.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    list.appendChild(row);
    list.scrollTop = list.scrollHeight;
  }

  isErr ? console.error(`[CUBE] ${msg}`) : console.log(`[CUBE] ${msg}`);
}

function syncDebugCounter() {
  const el  = document.getElementById('debug-frame-counter');
  const stEl = document.getElementById('debug-state');
  if (el)   el.textContent  = `Frame: ${Math.floor(seq.frame) + 1} / ${TOTAL}`;
  if (stEl) stEl.textContent = `State: ${state}`;
}

function toggleDebug() {
  debugOn = !debugOn;
  document.getElementById('debug-console')
    ?.classList.toggle('debug-hidden', !debugOn);
}

// ==========================================================================
// Preloader
// ==========================================================================

function preload() {
  const barEl    = document.getElementById('progress-bar');
  const statusEl = document.getElementById('loader-status');
  let loaded = 0;

  const promises = Array.from({ length: TOTAL }, (_, i) => {
    const idx = String(i + 1).padStart(4, '0');
    const img = new Image();
    frames.push(img);

    return new Promise(resolve => {
      img.onload = img.onerror = () => {
        loaded++;
        const pct = Math.round((loaded / TOTAL) * 100);
        if (barEl)    barEl.style.width    = `${pct}%`;
        if (statusEl) statusEl.textContent = `Loading… ${pct}%`;
        resolve();
      };
      img.src = `/assets/frames/frame_${idx}.jpg`;
    });
  });

  return Promise.all(promises);
}

// ==========================================================================
// Rendering
// ==========================================================================

function drawCover(img) {
  if (!img?.complete) return;

  const W = window.innerWidth;
  const H = window.innerHeight;
  const iW = img.naturalWidth  || img.width;
  const iH = img.naturalHeight || img.height;
  const r  = Math.max(W / iW, H / iH);
  const sx = (W - iW * r) / 2;
  const sy = (H - iH * r) / 2;

  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, iW, iH, sx, sy, iW * r, iH * r);
}

function renderFrame(f) {
  const i = Math.max(0, Math.min(TOTAL - 1, Math.floor(f)));
  drawCover(frames[i]);
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const W   = window.innerWidth;
  const H   = window.innerHeight;

  canvas.style.width  = `${W}px`;
  canvas.style.height = `${H}px`;
  canvas.width        = W * dpr;
  canvas.height       = H * dpr;

  ctx.resetTransform();
  ctx.scale(dpr, dpr);

  renderFrame(seq.frame);
}

// Lightweight RAF loop — just keeps the canvas in sync with seq.frame
// (GSAP tweens seq.frame; RAF renders it)
function tick() {
  renderFrame(seq.frame);
  syncDebugCounter();
  requestAnimationFrame(tick);
}

// ==========================================================================
// Neon Overlay
// ==========================================================================

const neonEl = document.getElementById('neon-overlay');

// ==========================================================================
// Video Overlay — dual video, state-matched, canplay-gated smooth fade
// ==========================================================================

const videoHeroEl   = document.getElementById('video-hero');
const videoDetailEl = document.getElementById('video-detail');
const vidHero       = document.getElementById('vid-hero');
const vidDetail     = document.getElementById('vid-detail');

// CSS transition duration (must match .video-overlay transition in CSS)
const VIDEO_FADE_MS = 1200;

/**
 * Fade out a video overlay wrapper smoothly, then pause the video.
 * @param {HTMLElement} wrapperEl
 */
function fadeOutVideo(wrapperEl) {
  if (!wrapperEl) return;
  wrapperEl.classList.remove('active');
  // Pause playback after the CSS fade completes — no jarring cut
  const vid = wrapperEl.querySelector('video');
  if (vid) setTimeout(() => vid.pause(), VIDEO_FADE_MS);
}

/**
 * Start playing a video and fade its wrapper in only once
 * the browser confirms it has enough data to play smoothly.
 * @param {HTMLElement} wrapperEl
 * @param {HTMLVideoElement} vid
 */
function fadeInVideo(wrapperEl, vid) {
  if (!wrapperEl || !vid) return;

  const doFade = () => {
    wrapperEl.classList.add('active');
  };

  // If already ready (e.g. pre-rolled), fade in immediately
  if (vid.readyState >= 3) {  // HAVE_FUTURE_DATA or better
    vid.play().catch(() => {});
    doFade();
  } else {
    // Wait for enough data, then fade in
    vid.addEventListener('canplay', function onReady() {
      vid.removeEventListener('canplay', onReady);
      vid.play().catch(() => {});
      doFade();
    });
    vid.load(); // trigger load if not already started
  }
}

/**
 * Pre-roll both videos silently so they're ready when needed.
 * Plays then immediately pauses — browsers buffer ahead after this.
 */
function prerollVideos() {
  [vidHero, vidDetail].forEach(vid => {
    if (!vid) return;
    vid.addEventListener('canplay', function onReady() {
      vid.removeEventListener('canplay', onReady);
      // Buffer is ready — pause until we actually need it
      vid.pause();
    }, { once: true });
    vid.load();
  });
}

/**
 * Main video state switch — call with 'hero', 'detail', or null to hide all.
 * @param {'hero'|'detail'|null} videoState
 */
function setVideo(videoState) {
  if (videoState === 'hero') {
    fadeOutVideo(videoDetailEl);
    fadeInVideo(videoHeroEl, vidHero);
  } else if (videoState === 'detail') {
    fadeOutVideo(videoHeroEl);
    fadeInVideo(videoDetailEl, vidDetail);
  } else {
    fadeOutVideo(videoHeroEl);
    fadeOutVideo(videoDetailEl);
  }
}

/**
 * Fade out a video wrapper and call back ONLY once the CSS opacity
 * transition has fully completed — guaranteed via transitionend.
 * Falls back to a timeout if transitionend never fires.
 * @param {HTMLElement} wrapperEl  — the .video-overlay wrapper
 * @param {Function}   callback   — called once opacity reaches 0
 */
function fadeOutThen(wrapperEl, callback) {
  if (!wrapperEl) { callback?.(); return; }

  // Already hidden — no need to wait
  if (!wrapperEl.classList.contains('active')) { callback?.(); return; }

  let settled = false;
  const done = () => {
    if (settled) return;   // guard against double-fire
    settled = true;
    wrapperEl.querySelector('video')?.pause();
    callback?.();
  };

  // Start CSS fade
  wrapperEl.classList.remove('active');

  // Fire once the opacity transition ends
  wrapperEl.addEventListener('transitionend', function handler(e) {
    if (e.propertyName === 'opacity' && e.target === wrapperEl) {
      wrapperEl.removeEventListener('transitionend', handler);
      done();
    }
  });

  // Hard fallback — in case transitionend is suppressed (visibility hidden, etc.)
  setTimeout(done, VIDEO_FADE_MS + 100);
}

/**
 * @param {'hero'|'detail'|null} mode  — null = fade out entirely
 */
function setNeon(mode) {
  if (!neonEl) return;
  neonEl.classList.remove('hero', 'detail', 'active');
  if (mode) {
    // Force reflow so CSS transition re-fires when re-adding 'active'
    void neonEl.offsetWidth;
    neonEl.classList.add(mode, 'active');
  }
}

// ==========================================================================
// Label Management
// ==========================================================================

const LABEL_IDS = ['#section-1', '#section-2', '#section-3'];

function showLabels() {
  LABEL_IDS.forEach((sel, i) => {
    const el = document.querySelector(sel);
    if (!el) return;
    gsap.set(el, { visibility: 'visible' });
    gsap.fromTo(el,
      { opacity: 0, y: 18 },
      { opacity: 1, y: 0,
        duration: 0.75,
        delay: 0.1 + i * 0.18,
        ease: 'power2.out' }
    );
  });

  // Back hint
  const hint = document.getElementById('back-hint');
  if (hint) {
    gsap.set(hint, { visibility: 'visible' });
    gsap.fromTo(hint,
      { opacity: 0 },
      { opacity: 1, duration: 0.6, delay: 0.65, ease: 'power2.out' }
    );
  }
}

function hideLabels(onDone) {
  gsap.to(LABEL_IDS, {
    opacity: 0,
    y: 10,
    duration: 0.3,
    ease: 'power2.in',
    onComplete: () => {
      LABEL_IDS.forEach(sel => {
        gsap.set(sel, { visibility: 'hidden' });
      });
      onDone?.();
    }
  });

  // Back hint
  const hint = document.getElementById('back-hint');
  if (hint) {
    gsap.to(hint, {
      opacity: 0, duration: 0.25,
      onComplete: () => gsap.set(hint, { visibility: 'hidden' })
    });
  }
}

// ==========================================================================
// State Transitions
// ==========================================================================

function goToDetail() {
  if (state !== 'hero') return;
  state = 'transitioning';
  log('hero → detail');

  // 1. Fade hero UI and neon out in parallel (cosmetic — doesn't block)
  gsap.to('#hero-layer', { opacity: 0, duration: 0.5, ease: 'power2.in' });
  gsap.to(neonEl, {
    opacity: 0, duration: 0.4, ease: 'power2.in',
    onComplete: () => neonEl.classList.remove('hero', 'detail', 'active')
  });

  // 2. Fade out hero video — WAIT for it to fully reach opacity 0
  //    before moving a single frame
  fadeOutThen(videoHeroEl, () => {
    log('Hero video faded — starting frame animation.');

    // 3. NOW animate frames 0 → 239
    gsap.to(seq, {
      frame: TOTAL - 1,
      duration: 2.4,
      ease: 'power2.inOut',
      onComplete: () => {
        state = 'detail';
        log('Reached detail state.');
        setNeon('detail');
        setVideo('detail');
        showLabels();
      }
    });
  });
}

function goToHero() {
  if (state !== 'detail') return;
  state = 'transitioning';
  log('detail → hero');

  // 1. Hide labels and neon in parallel (cosmetic — doesn't block)
  hideLabels();
  gsap.to(neonEl, {
    opacity: 0, duration: 0.4, ease: 'power2.in',
    onComplete: () => neonEl.classList.remove('hero', 'detail', 'active')
  });

  // 2. Fade out detail video — WAIT for it to fully reach opacity 0
  //    before moving a single frame back
  fadeOutThen(videoDetailEl, () => {
    log('Detail video faded — starting frame reverse.');

    // 3. NOW animate frames 239 → 0
    gsap.to(seq, {
      frame: 0,
      duration: 2.4,
      ease: 'power2.inOut',
      onComplete: () => {
        state = 'hero';
        log('Returned to hero state.');
        gsap.to('#hero-layer', { opacity: 1, duration: 0.6, ease: 'power2.out' });
        setNeon('hero');
        setVideo('hero');
      }
    });
  });
}

// ==========================================================================
// Input Handlers
// ==========================================================================

function initInputs() {
  // ── Mouse wheel ───────────────────────────────────────────────────────
  window.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY > 0  && state === 'hero')   goToDetail();
    if (e.deltaY < 0  && state === 'detail') goToHero();
  }, { passive: false });

  // ── Touch swipe ───────────────────────────────────────────────────────
  let touchY0 = 0;

  window.addEventListener('touchstart', (e) => {
    touchY0 = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    const dy = touchY0 - e.changedTouches[0].clientY;
    if (dy >  45 && state === 'hero')   goToDetail();
    if (dy < -45 && state === 'detail') goToHero();
  }, { passive: true });

  // Prevent iOS rubber-band while keeping touch events normal
  document.addEventListener('touchmove', (e) => {
    e.preventDefault();
  }, { passive: false });

  // ── Keyboard ──────────────────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'ArrowDown' || e.key === ' ')
        && state === 'hero')   { e.preventDefault(); goToDetail(); }

    if (e.key === 'ArrowUp'
        && state === 'detail') { goToHero(); }

    if (e.key.toLowerCase() === 'd') toggleDebug();
  });

  // ── Start button ──────────────────────────────────────────────────────
  document.getElementById('start-btn')
    ?.addEventListener('click', () => {
      if (state === 'hero') goToDetail();
    });
}

// ==========================================================================
// Boot
// ==========================================================================

preload()
  .then(() => {
    log(`${TOTAL} frames cached.`);

    const loader = document.getElementById('loader');

    // ── Draw frame 0 onto canvas BEFORE the loader fades out ──
    // This eliminates the black flash: when the loader becomes transparent,
    // the canvas already has the first frame rendered behind it.
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();              // sizes canvas + draws frame 0 immediately
    requestAnimationFrame(tick); // start RAF loop while loader still visible

    // Pre-roll both videos silently so they're buffered and ready
    prerollVideos();

    // Short settle — gives browser one paint cycle to render frame 0
    // before we start fading the loader out over it
    setTimeout(() => {
      gsap.to(loader, {
        opacity: 0,
        duration: 0.7,
        ease: 'power2.out',
        onComplete: () => {
          loader.style.display = 'none';

          // Reveal navbar
          document.getElementById('navbar')?.classList.add('visible');

          // Engage neon in hero state
          setTimeout(() => setNeon('hero'), 300);

          // Fade in hero video overlay
          setTimeout(() => setVideo('hero'), 500);

          // Attach all input listeners
          initInputs();

          log('Engine ready. State: hero. Press D for debug.');
        }
      });
    }, 80); // 80ms — one or two paint frames, enough to eliminate black flash
  })
  .catch(err => log(`Boot error: ${err.message}`, true));
