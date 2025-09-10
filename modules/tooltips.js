// create tooltip element once
const tooltip = document.createElement('div');
tooltip.className = 'custom-tooltip';
tooltip.setAttribute('role', 'tooltip');
document.body.appendChild(tooltip);

let tooltipTimer = null;

function showTooltipFor(el){
  tooltip.textContent = el.dataset.tooltip || '';
  // show first so offsetWidth is available for clamping (optional)
  tooltip.style.display = 'block';

  const rect = el.getBoundingClientRect();
  const pad  = 8;

  // basic position under the element
  let left = rect.left + window.scrollX;
  let top  = rect.bottom + window.scrollY + pad;

  // optional: clamp within viewport
  const vwRight = window.scrollX + document.documentElement.clientWidth - 8;
  left = Math.min(left, vwRight - tooltip.offsetWidth);

  tooltip.style.left = `${left}px`;
  tooltip.style.top  = `${top}px`;
}

function hideTooltip(){
  tooltip.style.display = 'none';
}

function attachTooltip(el, message){
  if (!el) return;
  el.dataset.tooltip = message;

  el.addEventListener('mouseenter', () => {
    clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(() => showTooltipFor(el), 500); // 0.5s delay
  });

  el.addEventListener('mouseleave', () => {
    clearTimeout(tooltipTimer);
    hideTooltip();
  });

  // keyboard accessibility
  el.addEventListener('focus',  () => showTooltipFor(el));
  el.addEventListener('blur',   hideTooltip);
}

// ===== Example usage =====
attachTooltip(document.getElementById('assumeBtn'),  "Use this to create a new assumption.");
attachTooltip(document.getElementById('assertBtn'),  "Conjure one of the letters P,Q, R or S");
attachTooltip(document.getElementById('andBtn'),     "Select two lines, x,y under a common assumption to create x ∧ y");
attachTooltip(document.getElementById('impBtn'),     "Close an open assumption block with →");
attachTooltip(document.getElementById('restateBtn'), "Restate any line from an open assumption block.");
attachTooltip(document.getElementById('checkBtn'),   "Check to see if your spell was successful.");
