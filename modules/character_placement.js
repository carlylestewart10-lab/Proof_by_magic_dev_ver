/* === Avatar overlay logic ========================================== */
const AVATAR_BY_ROLE = {
  'Logician': 'css-styles/media/gorit-avatar(cuter).png',
  'Illusionist': 'css-styles/media/adarassa-avatar3.png',
  'Elementalist': 'css-styles/media/nyaya-avatar.png',
  'Sage': 'css-styles/media/zera-avatar.png'
};

const PET_BY_ROLE = {
  'Logician': 'css-styles/media/gorit-pet.png',
  'Illusionist': 'css-styles/media/adarassa-pet.png',
  'Elementalist': 'css-styles/media/nyaya-pet.png',
  'Sage': 'css-styles/media/zera-pet.png'
};

// Global elim mode flag (read by gameplay wiring)
window.PBM_ELIM_MODE = window.PBM_ELIM_MODE || false;

const PET_SWITCH_ID = 'pbmPetSwitch';

function placeAvatarOnIslands() {
  // mount points
  const controls =
    document.getElementById('controls') ||
    document.querySelector('#controls') ||
    document.body;

  // ✅ use a valid identifier + provide a fallback
  const petSpot = document.getElementById('pet-spot') || controls;

  const role = localStorage.getItem('chosenCharacter');
  const src  = AVATAR_BY_ROLE[role];
  const pet  = PET_BY_ROLE[role];
  if (!src) {
    console.warn('[PBM] No chosenCharacter in localStorage; avatar skipped.');
    return;
  }

  // avatar goes to controls (unchanged)
  const img = new Image();
  img.src = src;
  img.alt = role || 'Chosen character';
  img.className = 'parchment-avatar';
  img.decoding = 'async';
  img.loading = 'eager';
  controls.appendChild(img);

  // show the pet unless gated by this campaign
  if (window.PBM_CAMPAIGN_ID === 'ConjuringCanyons') return;

  const petpic = new Image();
  petpic.src = pet;
  petpic.alt = (role ? role + ' pet' : 'Pet');
  petpic.className = 'parchment-pet';
  petpic.id = PET_SWITCH_ID;
  petpic.decoding = 'async';
  petpic.loading = 'eager';
  petpic.tabIndex = 0;
  petpic.setAttribute('role', 'switch');
  petpic.setAttribute('aria-checked', String(window.PBM_ELIM_MODE));

  if (window.PBM_ELIM_MODE) petpic.classList.add('pet-switch-active');

  const toggle = () => {
    window.PBM_ELIM_MODE = !window.PBM_ELIM_MODE;
    petpic.classList.toggle('pet-switch-active', window.PBM_ELIM_MODE);
    petpic.setAttribute('aria-checked', String(window.PBM_ELIM_MODE));
    document.body.classList.toggle('pbm-elim-mode', window.PBM_ELIM_MODE);
  };

  // ✅ log the click so you can see it in DevTools
  petpic.addEventListener('click', () => {
    console.log('[PBM] PET CLICKED.');
    toggle();
  });
  petpic.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
  });

  // ✅ append to the new spot
  petSpot.appendChild(petpic);
}


// Run now if DOM is ready; otherwise on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', placeAvatarOnIslands, { once: true });
} else {
  placeAvatarOnIslands();
}
