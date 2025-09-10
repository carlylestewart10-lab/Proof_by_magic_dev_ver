// modules/progress_tester.js
import { setStatus, resetProof, getLastLine, safeAddListener } from './gameplay.js';
import { normalizeFormula } from './rendering.js';

/* =========================================================
   1) User + Campaign identity (per-player persistence)
   ========================================================= */
const USER_ID = (() => {
  const explicit = (window.userID ?? localStorage.getItem('pbm_user_id') ?? '').toString().trim();
  const id = explicit || 'Guest';
  if (!localStorage.getItem('pbm_user_id')) localStorage.setItem('pbm_user_id', id);
  window.userID = id;
  return id;
})();

const CAMPAIGN_ID =
  window.PBM_CAMPAIGN_ID ||
  document.body.dataset.campaignId ||
  (location.pathname.split('/').pop() || 'campaign').replace(/\.[^.]+$/, '');

/* ---------------- Inner steps (per campaign) ---------------- */
const STEP_KEY = `pbm_steps_v1:${encodeURIComponent(USER_ID)}:${CAMPAIGN_ID}`;

function loadStepIndex() {
  try { return JSON.parse(localStorage.getItem(STEP_KEY))?.i ?? 0; } catch { return 0; }
}

function saveStepIndex(i) {
  localStorage.setItem(STEP_KEY, JSON.stringify({ i }));
}

/* ---------------- Campaign completion (per user) ---------------- */
const CAMPAIGN_STORE_KEY = `pbmCampaigns_v1:${encodeURIComponent(USER_ID)}`;
function loadCampaignProgress() {
  try { return JSON.parse(localStorage.getItem(CAMPAIGN_STORE_KEY)) || {}; } catch { return {}; }
}

function saveCampaignProgress(progress) {
  localStorage.setItem(CAMPAIGN_STORE_KEY, JSON.stringify(progress));
}

export function markCampaignComplete(id = CAMPAIGN_ID) {
  const p = loadCampaignProgress();
  if (!p[id]) {
    p[id] = true;
    saveCampaignProgress(p);
  }
}

/* ==========================================
   2) Steps model (info|gameplay, declarative)
   ========================================== */
function normalizeSteps(raw) {
  if (Array.isArray(raw) && raw.length) return raw.map((s, i) => normalizeStep(s, i));
  const fallbackTargets = ["Target: P", "Target: A → ( P → A )"];
  return fallbackTargets.map((t, i) => ({ type: 'gameplay', id: `lvl${i + 1}`, target: t }));
}

function normalizeStep(s, i) {
  if (s?.type === 'gameplay') {
    return { type: 'gameplay', id: s.id || `lvl${i + 1}`, target: s.target };
  }
  return {
    type: 'info',
    id: s.id || `info${i + 1}`,
    mode: s.mode === 'spotlight' ? 'spotlight' : 'modal',
    html: s.html || '',
    image: s.image || '',
    steps: Array.isArray(s.steps) ? s.steps : []
  };
}

const steps = normalizeSteps(window.PBM_STEPS);

let currentIndex = Math.max(0, Math.min(loadStepIndex(), Math.max(0, steps.length - 1)));

/* =============================================
   3) Overlay engine (modal + spotlight sequence)
   ============================================= */
function els() {
  return {
    backdrop: document.getElementById('tutorialBackdrop'),
    spot:     document.getElementById('tutorialSpotlight'),
    msg:      document.getElementById('tutorialMessage'),
  };
}

function showModal(html, image, onDone) {
  const { backdrop, spot, msg } = els();
  if (!backdrop || !msg) { onDone?.(); return; }

  if (spot) spot.style.display = 'none';
  backdrop.style.display = 'block';
  backdrop.style.background = '';
  backdrop.classList.add('pbm-smoke');

  msg.style.display = 'block';
  msg.style.left = '50%';
  msg.style.top = '50%';
  msg.style.transform = 'translate(-50%, -50%)';

  msg.innerHTML =
    html +
    (image ? `<div class="pbm-gate-img"><img src="${image}" alt=""/></div>` : '') +
    "<div id='pbmModalHint' style='opacity:.65;margin-top:.5em;font-size:.9em'>Click anywhere to continue</div>";

  // --- Pet naming wiring (only present on the hatching step) ---
  const PET_NAME_KEY = `pbm_pet_name_v1:${encodeURIComponent(USER_ID)}`;
  const nameInput  = msg.querySelector('#pbmPetName');
  const nameBtn    = msg.querySelector('#pbmPetNameBtn');
  const nameStatus = msg.querySelector('#pbmPetNameStatus');
  const hintEl     = msg.querySelector('#pbmModalHint');

  const getStoredName = () => {
    try { return (localStorage.getItem(PET_NAME_KEY) || '').trim(); } catch { return ''; }
  };
  const isNamed = () => !!getStoredName();

  // NEW: brief pause after saving so the user sees the message
  const PAUSE_MS = 2000;
  let namingCooldown = false;

  if (nameInput) {
    // Prefill if a name already exists
    const existing = getStoredName();
    if (existing) nameInput.value = existing;

    const setHint = () => {
      if (!hintEl) return;
      hintEl.innerHTML = isNamed()
        ? "Click anywhere to continue"
        : "Enter a name and press <b>Name</b> (or Enter) to continue";
    };
    setHint();

    const saveName = () => {
      const v = (nameInput.value || '').trim();
      if (!v) {
        if (nameStatus) nameStatus.textContent = "Please enter a name.";
        nameInput.focus();
        return false;
      }
      try { localStorage.setItem(PET_NAME_KEY, v); } catch {}
      if (nameStatus) nameStatus.textContent = `✨ Saved as “${v}”`;
      setHint();
      return true;
    };

    // Save + PAUSE + auto-advance
    const commitAndAdvance = () => {
      if (!saveName()) return;
      namingCooldown = true;
      // lock controls during the pause
      if (nameBtn) nameBtn.disabled = true;
      nameInput.disabled = true;
      if (hintEl) hintEl.textContent = "Saved — continuing…";

      setTimeout(() => {
        document.removeEventListener('click', dismiss, true);
        hideOverlay();
        onDone?.();
      }, PAUSE_MS);
    };

    nameBtn?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); commitAndAdvance(); });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commitAndAdvance(); }
    });
  }

  // Dismiss by clicking outside — but only if either (a) there's no naming gate,
  // (b) a name already exists, and (c) we are not in the cooldown pause.
  const dismiss = (e) => {
    if (msg && msg.contains(e.target)) return; // clicks inside do nothing

    if (nameInput) {
      if (namingCooldown) { e.stopPropagation(); return; } // wait for pause to finish
      if (!isNamed()) {
        if (nameStatus) nameStatus.textContent = "Please name your hatchling first.";
        nameInput?.focus();
        e.stopPropagation();
        return;
      }
    }

    e.stopPropagation();
    document.removeEventListener('click', dismiss, true);
    hideOverlay();
    onDone?.();
  };
  document.addEventListener('click', dismiss, true);
}

function hideOverlay() {
  const { backdrop, msg, spot } = els();
  if (backdrop) {
    backdrop.classList.remove('pbm-smoke');
    backdrop.style.display = 'none';
  }
  if (spot) spot.style.display = 'none';
  if (msg) msg.style.display = 'none';
}

// --- Keep the page hard-aligned to the top when a gameplay step starts ---
function pbmScrollTop() {
  // Do it now…
  window.scrollTo(0, 0);
  // …and once more on the next frame in case layout just changed
  requestAnimationFrame(() => window.scrollTo(0, 0));
}


function startSpotlightSequence(sequence, onDone) {
  const { backdrop, spot, msg } = els();
  if (!backdrop || !spot || !msg || !Array.isArray(sequence) || !sequence.length) {
    onDone?.(); return;
  }

  let idx = 0;
  let forcedElim = false;

  function setElim(on) {
    forcedElim ||= on;
    window.PBM_ELIM_MODE = !!on;
    document.body.classList.toggle('pbm-elim-mode', !!on);
    const pet = document.querySelector('.parchment-pet');
    if (pet) {
      pet.classList.toggle('pet-switch-active', !!on);
      pet.setAttribute('aria-checked', String(!!on));
    }
  }

  function showAll() {
    backdrop.style.display = 'block';
    msg.style.display = 'block';
    setStep(0);
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', reposition, { passive: true });
    window.addEventListener('scroll', reposition, true);
  }

  function hideAll() {
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);

    // restore default pointer behavior
    backdrop.style.pointerEvents = '';
    spot.style.pointerEvents = '';

    // reset elim mode if we turned it on during the sequence
    if (forcedElim) setElim(false);

    backdrop.style.display = 'none';
    spot.style.display = 'none';
    msg.style.display = 'none';
    onDone?.();
  }

  function onKey(e) {
    if (e.key === 'Escape') { hideAll(); return; }
    const s = sequence[idx];
    if (s?.sel === '.parchment-pet') return; // don't advance via keyboard on the pet step
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') next();
  }

  function onDocClick(e) {
    e.stopPropagation();
    const s = sequence[idx];

    // Pet step: only advance if click is inside pet's bounding box
    if (s?.sel === '.parchment-pet') {
      const pet = document.querySelector('.parchment-pet');
      if (!pet) return;
      const r = pet.getBoundingClientRect();
      const x = e.clientX, y = e.clientY;
      const hit = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      if (!hit) return; // ignore non-pet clicks
      setElim(true);
      next();
      return;
    }

    // Normal steps: click anywhere advances
    next();
  }

  function next() {
    idx++;
    if (idx >= sequence.length) { hideAll(); return; }
    setStep(idx);
  }

  function setStep(i) {
    const s = sequence[i];
    const isPetStep = s?.sel === '.parchment-pet';

    msg.innerHTML = (s?.message || '') +
      `<div style="opacity:.65;margin-top:.5em;font-size:.9em">` +
      (isPetStep ? 'Click on your pet to continue' : 'Click anywhere to continue') +
      `</div>`;

    if (s?.welcome || !s?.sel) {
      spot.style.display = 'none';
      backdrop.style.background = 'rgba(0,0,0,0.75)';
      backdrop.style.pointerEvents = 'auto'; // welcome: overlay handles clicks
      msg.style.left = '50%';
      msg.style.top = '50%';
      msg.style.transform = 'translate(-50%, -50%)';
      return;
    }

    // Spotlight (transparent bg)
    backdrop.style.background = 'transparent';
    spot.style.display = 'block';

    const el = document.querySelector(s.sel);
    if (!el) { next(); return; }

    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    requestAnimationFrame(reposition);

    // Let clicks pass through the overlay during the pet step so the user can actually hit the pet
    if (isPetStep) {
      backdrop.style.pointerEvents = 'none';
      spot.style.pointerEvents = 'none';
    } else {
      backdrop.style.pointerEvents = 'auto';
      spot.style.pointerEvents = 'auto';
    }
  }

  function reposition() {
    const s = sequence[idx];
    if (!s || s.welcome || !s.sel) return;

    const el = document.querySelector(s.sel);
    if (!el) return;

    const pad = s.pad ?? 12;
    const r = el.getBoundingClientRect();

    const top    = Math.max(8, r.top  - pad);
    const left   = Math.max(8, r.left - pad);
    const width  = Math.min(window.innerWidth  - left - 8, r.width  + pad * 2);
    const height = Math.min(window.innerHeight - top  - 8, r.height + pad * 2);

    spot.style.top = top + 'px';
    spot.style.left = left + 'px';
    spot.style.width = width + 'px';
    spot.style.height = height + 'px';
    spot.style.borderRadius = (s.radius ?? 12) + 'px';

    const preferredTop = top + height + 12;
    const willOverflow = preferredTop + 200 > window.innerHeight;
    const msgTop = willOverflow ? Math.max(12, top - 12 - 160) : preferredTop;
    const msgLeft = Math.min(left, window.innerWidth - 20 - 520);

    msg.style.top = msgTop + 'px';
    msg.style.left = msgLeft + 'px';
    msg.style.transform = 'none';
  }

  showAll();
}

/* ==========================================
   4) Step entry / completion / advancement
   ========================================== */
function enterStep(i) {
  currentIndex = i;
  saveStepIndex(currentIndex);
  resetProof();

  const step = steps[currentIndex];
  if (!step) { finishCampaign(); return; }

  if (step.type === 'gameplay') {
    pbmScrollTop(); // <<< add this line

    const targetEl = document.getElementById('target');
    if (targetEl) targetEl.textContent = step.target;
    resetProof();
    setStatus(`New target: ${step.target}`);
    return;
  }

  // info step...
  if (step.mode === 'spotlight') {
    startSpotlightSequence(step.steps, completeCurrentStep);
  } else {
    showModal(step.html || '', step.image || '', completeCurrentStep);
  }
}


function completeCurrentStep() {
  const next = currentIndex + 1;
  if (next >= steps.length) { finishCampaign(); return; }
  enterStep(next);
}

/* ===================================
   5) “Next Problem” button behaviour
   =================================== */
export function doNextProblem() {
  const step = steps[currentIndex];
  if (!step) { finishCampaign(); return; }

  if (step.type === 'info') {
    setStatus('Read the info and click to continue.', 'warn');
    return;
  }

  const last = getLastLine();
  if (!last) { setStatus('✗ Finish the current task before moving on.', 'warn'); return; }

  const targetEl = document.getElementById('target');
  if (!targetEl) { setStatus('No target element found.', 'err'); return; }
  const target = (targetEl.textContent || '').replace(/^Target:\s*/i, '').trim();

  if (normalizeFormula(last.text) === normalizeFormula(target) && last.indent === 0) {
    completeCurrentStep();
  } else {
    setStatus("✗ Finish the current task before moving on.", "warn");
  }
}

/* ==========================
   6) Campaign finish handler
   ========================== */
function finishCampaign() {
  try { markCampaignComplete(); } catch {}

  const nextBtnEl = document.getElementById('nextBtn');
  if (nextBtnEl) nextBtnEl.disabled = true;

  setStatus(`🎉 ${CAMPAIGN_ID} complete! Returning to the map…`, "ok");

  const REDIRECT_DELAY_MS = 1600;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setTimeout(() => { location.assign('Campaigns.html'); }, REDIRECT_DELAY_MS);
    });
  });
}

/* ======= Boot ======= */
document.addEventListener('DOMContentLoaded', () => {
  safeAddListener('nextBtn', doNextProblem);

  // Optional: avatar on campaign pages
  try { if (typeof placeAvatarOnIslands === 'function') placeAvatarOnIslands(); } catch {}

  enterStep(currentIndex);

  const step = steps[currentIndex];
  if (step?.type === 'gameplay') setStatus('Enter an assumption or assertion to begin.');
});
