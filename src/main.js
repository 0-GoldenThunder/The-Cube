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
      img.src = `${import.meta.env.BASE_URL}assets/frames/frame_${idx}.png`;
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
// Image Overlay
// ==========================================================================

const imageHeroEl   = document.getElementById('image-hero');
const imageDetailEl = document.getElementById('image-detail');

// CSS transition duration (must match .image-overlay transition in CSS)
const IMAGE_FADE_MS = 1200;

function fadeOutImage(wrapperEl) {
  if (!wrapperEl) return;
  wrapperEl.classList.remove('active');
}

function fadeInImage(wrapperEl) {
  if (!wrapperEl) return;
  wrapperEl.classList.add('active');
}

/**
 * Main image state switch
 * @param {'hero'|'detail'|null} imageState
 */
function setImageOverlay(imageState) {
  if (imageState === 'hero') {
    fadeOutImage(imageDetailEl);
    fadeInImage(imageHeroEl);
  } else if (imageState === 'detail') {
    fadeOutImage(imageHeroEl);
    fadeInImage(imageDetailEl);
  } else {
    fadeOutImage(imageHeroEl);
    fadeOutImage(imageDetailEl);
  }
}

/**
 * Fade out an image wrapper and call back ONLY once the CSS opacity
 * transition has fully completed.
 */
function fadeOutThen(wrapperEl, callback) {
  if (!wrapperEl) { callback?.(); return; }
  if (!wrapperEl.classList.contains('active')) { callback?.(); return; }

  let settled = false;
  const done = () => {
    if (settled) return;
    settled = true;
    callback?.();
  };

  wrapperEl.classList.remove('active');

  wrapperEl.addEventListener('transitionend', function handler(e) {
    if (e.propertyName === 'opacity' && e.target === wrapperEl) {
      wrapperEl.removeEventListener('transitionend', handler);
      done();
    }
  });

  setTimeout(done, IMAGE_FADE_MS + 100);
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

  // 1. Fade hero UI
  gsap.to('#hero-layer', { opacity: 0, duration: 0.5, ease: 'power2.in' });

  // 2. Fade out hero overlay — WAIT for it to fully reach opacity 0
  fadeOutThen(imageHeroEl, () => {
    log('Hero overlay faded — starting frame animation.');

    // 3. NOW animate frames 0 → 239
    gsap.to(seq, {
      frame: TOTAL - 1,
      duration: 2.4,
      ease: 'power2.inOut',
      onComplete: () => {
        state = 'detail';
        log('Reached detail state.');
        setImageOverlay('detail');
        showLabels();
      }
    });
  });
}

function goToHero() {
  if (state !== 'detail') return;
  state = 'transitioning';
  log('detail → hero');

  // 1. Hide labels
  hideLabels();

  // 2. Fade out detail overlay — WAIT for it to fully reach opacity 0
  fadeOutThen(imageDetailEl, () => {
    log('Detail overlay faded — starting frame reverse.');

    // 3. NOW animate frames 239 → 0
    gsap.to(seq, {
      frame: 0,
      duration: 2.4,
      ease: 'power2.inOut',
      onComplete: () => {
        state = 'hero';
        log('Returned to hero state.');
        gsap.to('#hero-layer', { opacity: 1, duration: 0.6, ease: 'power2.out' });
        setImageOverlay('hero');
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

          // Fade in hero image overlay
          setTimeout(() => setImageOverlay('hero'), 500);

          // Attach all input listeners
          initInputs();

          log('Engine ready. State: hero. Press D for debug.');
        }
      });
    }, 80); // 80ms — one or two paint frames, enough to eliminate black flash
  })
  .catch(err => log(`Boot error: ${err.message}`, true));
