// modules/progress.js
import {
  setStatus, resetProof, render, getLastLine, lastNonEmptyLineIndex, safeAddListener
} from './gameplay.js';
import { normalizeFormula } from './rendering.js';

/* === Campaign progress (shared with map) =============================== */
const PBM_PROGRESS_KEY = 'pbmProgress';

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PBM_PROGRESS_KEY)) || {}; }
  catch { return {}; }
}

function saveProgress(progress) {
  localStorage.setItem(PBM_PROGRESS_KEY, JSON.stringify(progress));
}

function markCampaignComplete(id) {
  const progress = loadProgress();
  if (!progress[id]) {
    progress[id] = true;
    saveProgress(progress);
  }
}

// ======= Targets =======
const targets = [
  "Target: P",
  "Target: A → ( P → A )"
];

let currentTargetIndex = 0;

export function setTarget(index) {
  const targetEl = document.getElementById('target');
  if (!targetEl) return;
  currentTargetIndex = index;
  targetEl.textContent = targets[index];
  resetProof();                // clears state and re-renders
  setStatus(`New target: ${targets[index]}`);
}

// ======= Final gate overlay (optional, degrades gracefully) =======
const FINAL_GATE_TEXT = (
  "<b>The Final Trial</b><br/>" +
  "After mastering the basics of the conjuring canyons, you stumbled upon an egg" +
  " in an abandoned nest. But the egg is sealed by a powerful spell! Reach the target to find out what is inside."
);
const FINAL_GATE_IMAGE = "css-styles/media/final_level2.png";
const FINAL_INDEX = targets.length - 1;

function showCenteredOverlay(html, { smoky = false } = {}) {
  const backdrop = document.getElementById('tutorialBackdrop');
  const spot     = document.getElementById('tutorialSpotlight');
  const msg      = document.getElementById('tutorialMessage');
  if (!backdrop || !spot || !msg) {
    // If tutorial elements don't exist, just continue straight to the final target.
    setTarget(FINAL_INDEX);
    return;
  }

  // Hide spotlight (full overlay mode)
  spot.style.display = 'none';

  // Backdrop
  backdrop.style.display = 'block';
  backdrop.style.background = smoky ? '' : 'rgba(0,0,0,0.3)';
  backdrop.classList.toggle('pbm-smoke', smoky);

  // Centered message
  msg.style.display = 'block';
  msg.style.left = '50%';
  msg.style.top = '50%';
  msg.style.transform = 'translate(-50%, -50%)';
  msg.innerHTML = html + "<div style='opacity:.65;margin-top:.5em;font-size:.9em'>Click anywhere to continue</div>";

  const dismiss = (e) => {
    e.stopPropagation();
    document.removeEventListener('click', dismiss, true);
    hideOverlay();
    setTarget(FINAL_INDEX);
  };
  document.addEventListener('click', dismiss, true);
}

function hideOverlay() {
  const backdrop = document.getElementById('tutorialBackdrop');
  const msg      = document.getElementById('tutorialMessage');
  if (backdrop) {
    backdrop.classList.remove('pbm-smoke');
    backdrop.style.display = 'none';
  }
  if (msg) msg.style.display = 'none';
}

function showFinalGate() {
  const html = FINAL_GATE_TEXT + (FINAL_GATE_IMAGE
    ? `<div class="pbm-gate-img"><img src="${FINAL_GATE_IMAGE}" alt="Final Level"/></div>`
    : '');
  showCenteredOverlay(html, { smoky: true });
}

// ======= Advancement =======
export function doNextProblem() {
  const last = getLastLine();
  if (!last) { setStatus('✗ Finish the current task before moving on.', 'warn'); return; }

  const targetEl = document.getElementById('target');
  if (!targetEl) { setStatus('No target element found.', 'err'); return; }
  const target = (targetEl.textContent || '').replace(/^Target:\s*/i, '').trim();

  // Target reached at top level?
  if (normalizeFormula(last.text) === normalizeFormula(target) && last.indent === 0) {
    const nextIndex = currentTargetIndex + 1;

    if (nextIndex >= targets.length) {
      // === FINISH SEQUENCE ===
      markCampaignComplete('Basics');

      const nextBtnEl = document.getElementById('nextBtn');
      if (nextBtnEl) nextBtnEl.disabled = true;

      setStatus("🎉 Congratulations! Basics complete. Returning to the map…", "ok");

      const REDIRECT_DELAY_MS = 1600;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => { location.assign('Campaigns.html'); }, REDIRECT_DELAY_MS);
        });
      });
      return;
    }

    if (nextIndex === FINAL_INDEX) {
      // Interpose final-gate overlay
      showFinalGate();
      return;
    }

    setTarget(nextIndex);
    return;
  }

  setStatus("✗ Finish the current task before moving on.", "warn");
}

// ======= Boot =======
document.addEventListener('DOMContentLoaded', () => {
  // Wire "Next" button
  safeAddListener('nextBtn', doNextProblem);

  // Start at first target
  setTarget(0);

  // Optional: place avatar on map if function exists elsewhere
  try { if (typeof placeAvatarOnIslands === 'function') placeAvatarOnIslands(); } catch {}

  // Friendly initial hint
  setStatus('Enter an assumption or assertion to begin.');
});
