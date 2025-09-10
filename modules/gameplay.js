// modules/gameplay.js
import {
  sanitize, translateInput, normalizeFormula, parenthesize,
  stripOuterParensAll, splitTopLevelImplication, formatFormulaSpacing, splitTopLevelConjunction
} from './rendering.js';

// ======= DOM =======
const proofEl  = document.getElementById('proof');
const statusEl = document.getElementById('status');
const targetEl = document.getElementById('target');
const assumeInput = document.getElementById('assumeText');
const assertInput = document.getElementById('assertText');

// ======= State =======
let lines = [];               // { id, text, indent, rule, extraClass? }
let nextId = 1;
let indentLevel = 0;

// open assumptions: { text, depth, openIndex, lineId }
const assumptionStack = [];

// multi-selection
let selectedLineIds = new Set();

// ======= Exposed helpers =======
export function setStatus(msg, kind='ok') {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.className = 'status ' + (kind || 'ok');
}

export function safeAddListener(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}

export function lastNonEmptyLineIndex(predicate = () => true) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].text && predicate(lines[i], i)) return i;
  }
  return -1;
}

export function getLastLine() {
  const i = lastNonEmptyLineIndex();
  return i >= 0 ? { text: lines[i].text, indent: lines[i].indent } : null;
}

export function resetProof() {
  lines = [];
  assumptionStack.length = 0;
  indentLevel = 0;
  updatePotionBottle();
  selectedLineIds.clear();
  render();
}

// ======= Internal helpers =======
function isLineInAnyOpenAssumption(line) {
  if (!line) return false;
  if ((line.indent || 0) === 0) return true; // globals always OK
  return assumptionStack.some(f => f.depth >= line.indent);
}

function clearEntryFields() {
  if (assumeInput) assumeInput.value = '';
  if (assertInput) assertInput.value = '';
}

function linesShareCommonOpenAssumption(selectedLines) {
  if (!selectedLines || selectedLines.length === 0) return false;
  const maxIndent = Math.max(...selectedLines.map(l => (l.indent || 0)));
  if (maxIndent === 0) return true; // global truths
  return assumptionStack.some(f => f.depth >= maxIndent);
}

function addLine(text, level = indentLevel, rule = 'Given', extraClass = '') {
  selectedLineIds.clear();
  const line = {
    id: nextId++,
    text: formatFormulaSpacing(String(text).trim()),
    indent: Math.max(0, Math.floor(level)),
    rule,
    extraClass
  };
  lines.push(line);
  render();
  return line;
}

// ======= UI render =======
export function render() {
  if (!proofEl) return;
  proofEl.innerHTML = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const div = document.createElement('div');
    div.className =
      'proof-line' +
      (selectedLineIds.has(line.id) ? ' selected' : '') +
      (line.extraClass ? ` ${line.extraClass}` : '');
    div.textContent = line.text;                 // display only formula text
    div.style.marginLeft = (line.indent * 2) + 'em';
    div.dataset.indent = line.indent;
    div.dataset.id = line.id;

    div.addEventListener('click', (e) => {
      e.stopPropagation();
      if (selectedLineIds.has(line.id)) selectedLineIds.delete(line.id);
      else selectedLineIds.add(line.id);
      render();
    });

    proofEl.appendChild(div);
  }
  proofEl.scrollTop = proofEl.scrollHeight; // keep scrolled to bottom
}

// --- MAGIC LEVEL (indent) + POTION UPDATE (ONLY TWO FUNCTIONS) ----------------
export function getMagicLevel() {
  // Magic level is exactly the current indent level
  return Math.max(0, indentLevel);
}

export function updatePotionBottle() {
  const el = document.getElementById('potion_bottle'); // required by you
  if (!el) return;

  // Capacity: how many open assumptions until visually empty
  // Default is now 3, and any provided value is capped at 3.
  const raw = Number(el.dataset.capacity ?? 3);
  const capacity = Math.min(3, Number.isFinite(raw) && raw > 0 ? raw : 3);

  const level = getMagicLevel();
  const pct = Math.max(0, Math.min(100, ((capacity - level) / capacity) * 100));

  // Drive the CSS with a custom property
  el.style.setProperty('--potion-fill', pct + '%');
  el.setAttribute('data-level', String(level));
}



// ======= Actions =======
function doAssume(text) {

  if (indentLevel >= 3) {
    setStatus('Your potion bottle is empty!', 'warn');
    return;
  }

  const t = translateInput(sanitize(text));
  if (!t) { setStatus('Type something to assume.', 'warn'); return; }

  indentLevel += 1;
  updatePotionBottle();

  const { id } = addLine(stripOuterParensAll(t), indentLevel, 'Assumption');
  const openIndex = lines.findIndex(l => l.id === id);
  assumptionStack.push({ text: t, depth: indentLevel, openIndex, lineId: id });
  setStatus(`Assumed: ${t}`);

  clearEntryFields();
}

function doAssert(text) {
  const t = sanitize(text);
  if (!t) { setStatus('Type something to assert.', 'warn'); return; }
  if (!['P','Q','R','S'].includes(t)) {
    setStatus('You can only conjure P,Q,R or S', 'warn'); return;
  }
  addLine(t, indentLevel, 'Assertion', 'neon-assert');
  setStatus(`Asserted: ${t}`);

  clearEntryFields();
}

function doAnd() {
  if (selectedLineIds.size !== 2) {
    setStatus('Select exactly two lines to conjoin.', 'warn'); return;
  }
  const selected = lines.filter(l => selectedLineIds.has(l.id));
  if (!linesShareCommonOpenAssumption(selected)) {
    setStatus('Both lines must be in the same open subproof.', 'warn'); return;
  }
  selected.sort((a, b) => lines.findIndex(x => x.id === a.id) - lines.findIndex(x => x.id === b.id));
  const joined = selected.map(l => parenthesize(l.text)).join(' ∧ ');
  addLine(joined, indentLevel, '∧-Intro');
  setStatus(`Conjoined: ${joined}`);
}

function doReverseAnd() {

  if (selectedLineIds.size !== 1) {
    setStatus('Select exactly one line of the form X ∧ Y to split.', 'warn');
    return;
  }

  const [line] = lines.filter(l => selectedLineIds.has(l.id));

  if (!isLineInAnyOpenAssumption(line)) {
    setStatus('Selected line must be in open subproof.', 'warn'); return;}

  // Normalize and strip outer parens before attempting the split
  const candidate = stripOuterParensAll(
    String(line.text ?? '').replace(/&&/g, '∧').replace(/&/g, '∧')
  );

  const parts = splitTopLevelConjunction(candidate);
  if (!parts) {
    setStatus('Selected line must be a conjunction X ∧ Y.', 'warn');
    return;
  }

  const left  = stripOuterParensAll(parts.left);
  const right = stripOuterParensAll(parts.right);

  // Emit both conjuncts as separate lines
  window.PBM_ELIM_MODE = false;
  document.body.classList.remove('pbm-elim-mode');
  addLine(left,  indentLevel, '∧-ElimL');
  addLine(right, indentLevel, '∧-ElimR');
  setStatus(`∧-split: ${parenthesize(left)} , ${parenthesize(right)}`);
}

function doImplication() {
  if (assumptionStack.length === 0) {
    setStatus('Your potion bottle is already full!', 'err'); return;
  }
  const frame = assumptionStack.pop();
  const idxY = lastNonEmptyLineIndex((l, idx) => idx > frame.openIndex && l.indent >= frame.depth);
  const x = parenthesize(stripOuterParensAll(frame.text));
  const y = idxY < 0 ? parenthesize(frame.text) : parenthesize(lines[idxY].text);
  indentLevel = Math.max(0, frame.depth - 1);
  updatePotionBottle();
  addLine(`${x} → ${y}`, indentLevel, '→-Intro');
  setStatus(`Closed assumption: ${x} → ${y}`);
}

function doModusPonens() {



  if (selectedLineIds.size !== 2) {
    setStatus('Select exactly two lines for Modus Ponens.', 'warn'); return;
  }

  const selected = lines.filter(l => selectedLineIds.has(l.id));
  if (!linesShareCommonOpenAssumption(selected)) {
    setStatus('Both lines must be in the same open subproof.', 'warn'); return;
  }

  const [L1, L2] = selected;
  const [longer, shorter] =
    String(L1.text || '').length >= String(L2.text || '').length ? [L1, L2] : [L2, L1];

  const canon = s =>
    normalizeFormula(
      stripOuterParensAll(String(s ?? '').replace(/->/g, '→')).replace(/\s+/g, '')
    );

  const attempt = (impLine, otherLine) => {
    const candidate = stripOuterParensAll(impLine.text);
    const parts = splitTopLevelImplication(candidate);
    if (!parts) return { ok: false, reason: 'notimp' };
    if (canon(otherLine.text) !== canon(parts.left)) return { ok: false, reason: 'mismatch' };
    return { ok: true, right: parts.right };
  };

  // Try with the longer line as implication first
  let res = attempt(longer, shorter);
  if (!res.ok && res.reason === 'notimp') {
    // Fallback: maybe the shorter line is the implication
    res = attempt(shorter, longer);
  }

  if (!res.ok) {
    setStatus(
      res.reason === 'mismatch'
        ? 'Modus Ponens requires X and (X → Y) with matching X.'
        : 'One of the selected lines must be a top-level implication (X → Y).',
      'warn'
    );
    return;
  }

  window.PBM_ELIM_MODE = false;
  document.body.classList.remove('pbm-elim-mode');
  const derived = stripOuterParensAll(res.right);
  addLine(derived, indentLevel, '→-Elim');
  setStatus(`Inferred: ${derived} (→-Elim)`);
}

function doFalse() {
  addLine('⊥', indentLevel, 'Contradiction');
  setStatus('Contradiction added.');
}

function doRestate() {
  if (selectedLineIds.size === 0) {
    setStatus('Select a line to restate.', 'warn'); return;
  }
  const selected = lines.filter(l => selectedLineIds.has(l.id));
  if (!selected.every(isLineInAnyOpenAssumption)) {
    setStatus('Can only restate lines from an open subproof.', 'warn'); return;
  }
  for (const line of selected) addLine(stripOuterParensAll(line.text), indentLevel, 'Restatement');
  setStatus(`Restated: ${selected.map(l => l.text).join(', ')}`);
}

function doDeleteLast() {
  if (lines.length === 0) {
    setStatus('No lines to delete.', 'warn'); return;
  }
  lines.pop();

  // Recompute frames and indentLevel
  assumptionStack.length = 0;
  indentLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.rule === 'Assumption') {
      indentLevel = l.indent;
      assumptionStack.push({ text: l.text, depth: l.indent, openIndex: i, lineId: l.id });
    } else if (l.rule === '→-Intro') {
      if (assumptionStack.length > 0) assumptionStack.pop();
      indentLevel = assumptionStack.length ? assumptionStack[assumptionStack.length - 1].depth : 0;
    } else {
      indentLevel = l.indent;
    }
  }
  updatePotionBottle();

  render();
  setStatus('Deleted last line.');
}

function doCheck() {
  const i = lastNonEmptyLineIndex();
  if (i < 0) { setStatus('No lines to check.', 'warn'); return; }
  const lastLine = lines[i];
  const last = lastLine.text;

  const tgtEl = targetEl;
  if (!tgtEl) { setStatus('No target element found.', 'err'); return; }
  const target = (tgtEl.textContent || '').replace(/^Target:\s*/i, '').trim();

  if (normalizeFormula(last) === normalizeFormula(target)) {
    if (lastLine.indent === 0) setStatus('✓ Target reached!', 'ok');
    else setStatus("Your spell bottle isn't full!", 'warn');
  } else {
    setStatus(`✗ Last line: "${last}" ≠ Target: "${target}"`, 'warn');
  }
}

function wireControls() {
  // helper: choose intro vs elim based on pet switch
  const dual = (introFn, elimFn) => (...args) =>
    (window.PBM_ELIM_MODE ? elimFn(...args) : introFn(...args));

  // Buttons
  safeAddListener('assumeBtn', () => doAssume(assumeInput ? assumeInput.value : ''));
  safeAddListener('assertBtn', () => doAssert(assertInput ? assertInput.value : ''));

  // Pairs: intro -> elimination when PBM_ELIM_MODE = true
  safeAddListener('andBtn', dual(doAnd,        doReverseAnd));
  safeAddListener('impBtn', dual(doImplication, doModusPonens));

  // Keep elimination buttons as themselves (unchanged)
  safeAddListener('restateBtn', doRestate);
  safeAddListener('ponensBtn',  doModusPonens);
  safeAddListener('reverse_andBtn', doReverseAnd);

  // Others
  safeAddListener('falseBtn',  doFalse);
  safeAddListener('deleteBtn', doDeleteLast);
  safeAddListener('checkBtn',  doCheck);

  // Enter shortcuts
  if (assumeInput) assumeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doAssume(assumeInput.value);
  });
  if (assertInput) assertInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doAssert(assertInput.value);
  });

  render();
}


document.addEventListener('DOMContentLoaded', () => {
  wireControls();
  updatePotionBottle();
  setStatus('Enter an assumption or assertion to begin.');
});
