(function(){
  // ======= Elements & state =======
  const proofEl = document.getElementById('proof');
  const statusEl = document.getElementById('status');
  const targetEl = document.getElementById('target');

  const assumeInput = document.getElementById('assumeText');
  const assertInput = document.getElementById('assertText');

  let lines = [];             // { id, text, indent, rule }
  let nextId = 1;
  let indentLevel = 0;

  // open assumptions: { text, depth, openIndex, lineId }
  const assumptionStack = [];

  // multi-selection
  let selectedLineIds = new Set();

  //helper functions
  function setStatus(msg, kind='ok') {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = 'status ' + (kind || 'ok');
  }

  function sanitize(s) {
    return (s || '').toString().trim();
  }

  function translateInput(s) {
    return s
      .replace(/<->/g, '↔')
      .replace(/->/g, '→')
      .replace(/&/g, '∧')
      .replace(/and/g, '∧')
      .replace(/implies/g, '→')
      .replace(/iff/g, '↔')
      .replace(/equivalent to/g, '↔')
      .replace(/equivalent/g, '↔')
      .replace(/if and only if/g, '↔')
      .replace(/\bF\b/g, '⊥')
      .replace(/\bnot\s+([A-Za-z()]+)\b/gi, '¬$1');
  }

  function normalizeFormula(s) {
    return sanitize(s).replace(/\s+/g, ' ');
  }

  function parenthesize(s) {
    if (!s) return s;
    const t = s.trim();
    if (/^[A-Za-z⊥]$/.test(t)) return t;
    return '(' + t + ')';
  }

  // find last index satisfying predicate(line, index)
  function lastNonEmptyLineIndex(predicate = () => true) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].text && predicate(lines[i], i)) return i;
    }
    return -1;
  }

  // is the provided line object inside any currently-open assumption?
  function isLineInAnyOpenAssumption(line) {
  if (!line) return false;
  // level-0 lines are "absolute truths" (global) — always allowed
  if ((line.indent || 0) === 0) return true;
  // otherwise require an open frame with depth >= line.indent
  return assumptionStack.some(f => f.depth >= line.indent);
}

  // check whether an array of lines share a common open assumption
  // (i.e., there exists an open frame with depth >= max indent among those lines)
  // Treat a selection with maxIndent === 0 as sharing the global "open frame".
  function linesShareCommonOpenAssumption(selectedLines) {
  if (!selectedLines || selectedLines.length === 0) return false;
  const maxIndent = Math.max(...selectedLines.map(l => (l.indent || 0)));
  // If all selected lines are at indent 0, allow (global truths)
  if (maxIndent === 0) return true;
  // Otherwise require an open frame that contains that depth
  return assumptionStack.some(f => f.depth >= maxIndent);
}

  function render() {
    if (!proofEl) return;
    proofEl.innerHTML = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const div = document.createElement('div');
      div.className = 'proof-line' +
  (selectedLineIds.has(line.id) ? ' selected' : '') +
  (line.extraClass ? ` ${line.extraClass}` : '');
      // *** Display ONLY the formula text (no rule tags) as requested ***
      div.textContent = line.text;
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
    // keep scrolled to bottom
    proofEl.scrollTop = proofEl.scrollHeight;
  }

  function formatFormulaSpacing(s) {
  if (!s) return '';
  let t = s;

  // Force spaces around symbols
  t = t.replace(/([∧∨→↔⊥¬()])/g, ' $1 ');

  // Collapse multiple spaces into one
  t = t.replace(/\s+/g, ' ').trim();

  return t;
}

  // create a new line (keeps rule internally but we don't display it)
  function addLine(text, level = indentLevel, rule = 'Given', extraClass = '') {
  // clear multi-selection whenever a new line is added
  selectedLineIds.clear();

  const line = {
    id: nextId++,
    text: formatFormulaSpacing(String(text).trim()), // 🔹 format here
    indent: Math.max(0, Math.floor(level)),
    rule,
    extraClass
  };
  lines.push(line);
  render();
  return line;
}

  // Split on the *top-level* implication arrow, ignoring arrows inside parentheses.
  // Accepts both '→' and '->'. Returns { left, right } or null if none found.
  function splitTopLevelImplication(input) {
    const str = String(input || '');
    let depth = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '(') { depth++; continue; }
      if (ch === ')') { depth = Math.max(0, depth - 1); continue; }
      if (depth === 0) {
        if (ch === '→') {
          return {
            left: stripOuterParensAll(str.slice(0, i).trim()),
            right: stripOuterParensAll(str.slice(i + 1).trim())
          };
        }
        if (ch === '-' && str[i + 1] === '>') {
          return {
            left: stripOuterParensAll(str.slice(0, i).trim()),
            right: stripOuterParensAll(str.slice(i + 2).trim())
          };
        }
      }
    }
    return null;
  }

  // Remove one *pair* of outer parentheses iff they enclose the entire string.
  function stripOuterParens(s) {
    let str = String(s || '').trim();
    if (!(str.startsWith('(') && str.endsWith(')'))) return str;

    let depth = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        // If we close before the end, the outer pair is not global.
        if (depth === 0 && i < str.length - 1) return str;
      }
    }
    // If we got here, the outer parens wrap the whole string.
    return str.slice(1, -1).trim();
  }

  // Repeatedly strip global outer parentheses.
  function stripOuterParensAll(s) {
    let prev, cur = String(s || '').trim();
    do { prev = cur; cur = stripOuterParens(cur); } while (cur !== prev);
    return cur;
  }


  // ======= Actions =======
  function doAssume(text) {
    const t = translateInput(sanitize(text));
    if (!t) { setStatus('Type something to assume.', 'warn'); return; }
    indentLevel += 1;
    const { id } = addLine(t, indentLevel, 'Assumption');
    // record open frame with the index of the assumption line
    const openIndex = lines.findIndex(l => l.id === id);
    assumptionStack.push({ text: t, depth: indentLevel, openIndex, lineId: id });
    setStatus(`Assumed: ${t}`);
  }

  function doAssert(text) {
  const t = sanitize(text);
  if (!t) { setStatus('Type something to assert.', 'warn'); return; }
  if (!['P','Q','R','S'].includes(t)) { setStatus('You can only conjure P,Q,R or S', 'warn'); return; }
  // pass a special rule that identifies it as a neon assert
  addLine(t, indentLevel, 'Assertion', 'neon-assert');
  setStatus(`Asserted: ${t}`);
}

  function doAnd() {
    if (selectedLineIds.size !== 2) {
      setStatus('Select exactly two lines to conjoin.', 'warn');
      return;
    }
    const selected = lines.filter(l => selectedLineIds.has(l.id));
    if (!linesShareCommonOpenAssumption(selected)) {
      setStatus('Both lines must be in the same open subproof.', 'warn');
      return;
    }
    // order by their index in the proof
    selected.sort((a, b) => lines.findIndex(x => x.id === a.id) - lines.findIndex(x => x.id === b.id));
    const joined = selected.map(l => parenthesize(l.text)).join(' ∧ ');
    addLine(joined, indentLevel, '∧-Intro');
    setStatus(`Conjoined: ${joined}`);
  }

  function doImplication() {
  if (assumptionStack.length === 0) {
    setStatus('No open assumption to close with →.', 'err');
    return;
  }

  // Pop most recent open assumption
  const frame = assumptionStack.pop();

  // Find the last line that is inside that block and appears after the assumption line.
  const idxY = lastNonEmptyLineIndex((l, idx) => idx > frame.openIndex && l.indent >= frame.depth);

  let x = parenthesize(frame.text);
  let y;

  if (idxY < 0) {
    // no derived line — use assumption itself as consequent
    y = parenthesize(frame.text);
  } else {
    y = parenthesize(lines[idxY].text);
  }

  // close indentation
  indentLevel = Math.max(0, frame.depth - 1);

  addLine(`${x} → ${y}`, indentLevel, '→-Intro');
  setStatus(`Closed assumption: ${x} → ${y}`);
}

  function doModusPonens() {
    if (selectedLineIds.size !== 2) {
      setStatus('Select exactly two lines for Modus Ponens (→-Elim).', 'warn');
      return;
    }

    const selected = lines.filter(l => selectedLineIds.has(l.id));
    if (!linesShareCommonOpenAssumption(selected)) {
      setStatus('Both lines must be in the same open subproof.', 'warn');
      return;
    }

    // Identify exactly one implication among the two lines
    const impLines = selected.map(l => ({ line: l, parts: splitTopLevelImplication(l.text) }))
                             .filter(x => x.parts !== null);

    if (impLines.length !== 1) {
      setStatus('Select X and (X → Y). Exactly one of the selected lines must be an implication.', 'warn');
      return;
    }

    const { line: impLine, parts } = impLines[0];
    const otherLine = selected.find(l => l.id !== impLine.id);

    // Normalize for comparison (ignore outer parens and whitespace; unify "->" to "→")
    const same = (a, b) => {
      const crush = (s) => stripOuterParensAll(String(s || ''))
        .replace(/->/g, '→')
        .replace(/\s+/g, ' ')
        .trim();
      const useNorm = typeof normalizeFormula === 'function';
      return (useNorm ? normalizeFormula(crush(a)) : crush(a)) ===
             (useNorm ? normalizeFormula(crush(b)) : crush(b));
    };

    const antecedent = parts.left;
    const consequent = parts.right;

    if (!same(otherLine.text, antecedent)) {
      setStatus('Modus Ponens requires X and (X → Y) with matching X.', 'warn');
      return;
    }

    const derived = parenthesize(stripOuterParensAll(consequent));
    addLine(derived, indentLevel, '→-Elim');
    setStatus(`Inferred: ${derived} (→-Elim)`);
  }

  function doFalse() {
    addLine('⊥', indentLevel, 'Contradiction');
    setStatus('Contradiction added.');
  }

  function doRestate() {
    if (selectedLineIds.size === 0) {
      setStatus('Select a line to restate.', 'warn');
      return;
    }
    const selected = lines.filter(l => selectedLineIds.has(l.id));
    if (!selected.every(isLineInAnyOpenAssumption)) {
      setStatus('Can only restate lines from an open subproof.', 'warn');
      return;
    }
    for (const line of selected) addLine(line.text, indentLevel, 'Restatement');
    setStatus(`Restated: ${selected.map(l => l.text).join(', ')}`);
  }

  function doDeleteLast() {
    if (lines.length === 0) {
      setStatus('No lines to delete.', 'warn');
      return;
    }

    // Remove last line
    lines.pop();

    // 🔄 Recompute assumption stack + indentLevel
    assumptionStack.length = 0; // clear
    indentLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];

      if (l.rule === 'Assumption') {
        // push new frame
        indentLevel = l.indent;
        assumptionStack.push({
          text: l.text,
          depth: l.indent,
          openIndex: i,
          lineId: l.id
        });
      }
      else if (l.rule === '→-Intro') {
        // assumption closed, drop the latest frame
        if (assumptionStack.length > 0) {
          assumptionStack.pop();
        }
        indentLevel = assumptionStack.length
          ? assumptionStack[assumptionStack.length - 1].depth
          : 0;
      }
      else {
        // normal line, just update indent level to match
        indentLevel = l.indent;
      }
    }

    render();
    setStatus('Deleted last line.');
  }

  function doCheck() {
  const i = lastNonEmptyLineIndex();
  if (i < 0) {
    setStatus('No lines to check.', 'warn');
    return;
  }

  const lastLine = lines[i];
  const last = lastLine.text;

  let target = '';
  if (targetEl) {
    target = (targetEl.textContent || '').replace(/^Target:\s*/i, '').trim();
  } else {
    setStatus('No target element found.', 'err');
    return;
  }

  if (normalizeFormula(last) === normalizeFormula(target)) {
    if (lastLine.indent === 0) {
      setStatus('✓ Target reached!', 'ok');
    } else {
      setStatus('✗ Target formula derived, but still inside an open assumption.', 'warn');
    }
  } else {
    setStatus(`✗ Last line: "${last}" ≠ Target: "${target}"`, 'warn');
  }
}

    // ======= Wire up controls safely =======
  function safeAddListener(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  if (document.getElementById('assumeBtn')) safeAddListener('assumeBtn', () => doAssume(assumeInput ? assumeInput.value : ''));
  if (document.getElementById('assertBtn')) safeAddListener('assertBtn', () => doAssert(assertInput ? assertInput.value : ''));
  if (document.getElementById('andBtn')) safeAddListener('andBtn', doAnd);
  if (document.getElementById('impBtn')) safeAddListener('impBtn', doImplication);
  if (document.getElementById('restateBtn')) safeAddListener('restateBtn', doRestate);
  if (document.getElementById('ponensBtn')) safeAddListener('ponensBtn', doModusPonens);
  if (document.getElementById('falseBtn')) safeAddListener('falseBtn', doFalse);
  if (document.getElementById('deleteBtn')) safeAddListener('deleteBtn', doDeleteLast);
  if (document.getElementById('checkBtn')) safeAddListener('checkBtn', doCheck);

  if (assumeInput) assumeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAssume(assumeInput.value); });
  if (assertInput) assertInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAssert(assertInput.value); });

  // initial render
  render();
  setStatus('Enter an assumption or assertion to begin.');




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

    window.markCampaignComplete = window.markCampaignComplete || markCampaignComplete;

    /* ======= Next Problem Feature (your code with edits) =================== */
    const targets = [
      "Target: P",
      "Target: P ∧ Q",
      "Target: P → Q",
      "Target: R → ( P ∧ Q )",
      "Target: ( P ∧ Q ) → R",
      "Target: ( ( P ∧ Q ) → R ) → S",
      "Target: P → ( ( P ∧ Q ) → S )",
      "Target: ( P → ( R → ( Q → R ) ) ) ∧ S",
      "Target: A → ( P → A )"
    ];

    let currentTargetIndex = 0;

    function setTarget(index) {
      if (!targetEl) return;
      targetEl.textContent = targets[index];
      // clear the proof for the new problem
      lines = [];
      assumptionStack.length = 0;
      indentLevel = 0;
      selectedLineIds.clear();
      render();
      setStatus(`New target: ${targets[index]}`);
    }

    function doNextProblem() {
      const i = lastNonEmptyLineIndex();
      if (i < 0) {
        setStatus('✗ Finish the current task before moving on.', 'warn');
        return;
      }

      const lastLine = lines[i];
      const last = lastLine.text;

      let target = '';
      if (targetEl) {
        target = (targetEl.textContent || '').replace(/^Target:\s*/i, '').trim();
      } else {
        setStatus('No target element found.', 'err');
        return;
      }

      // ✅ Case 1: Target reached at top level
      if (normalizeFormula(last) === normalizeFormula(target) && lastLine.indent === 0) {
        currentTargetIndex++;

        if (currentTargetIndex >= targets.length) {
          // === FINISH SEQUENCE ===
          markCampaignComplete('Basics');

          // prevent double clicks while we show the message
          const nextBtnEl = document.getElementById('nextBtn');
          if (nextBtnEl) nextBtnEl.disabled = true;

          // show message
          setStatus("🎉 Congratulations! Basics complete. Returning to the map…", "ok");

          // ensure the status paints, then wait ~1.6s, then navigate
          const REDIRECT_DELAY_MS = 1600; // adjust to 2000 for a full 2s

          // Two rAFs -> ensures a paint frame occurs before the timeout starts
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setTimeout(() => {
                location.assign('Campaigns.html'); // exact filename of your map page
              }, REDIRECT_DELAY_MS);
            });
          });

          return; // IMPORTANT: stop further logic
        } else {
          setTarget(currentTargetIndex);
          return;
        }
      }

      // ❌ Case 2: Target not reached
      setStatus("✗ Finish the current task before moving on.", "warn");
    }

    safeAddListener('nextBtn', doNextProblem);
    setTarget(currentTargetIndex);

    /* (Optional) Quick debug helper while testing:
    console.log('progress before:', loadProgress());
    */

(() => {
  // Make sure we have a handle to the target element
  const targetEl = document.getElementById('target');

  // CONFIG: edit these to customize the final gate text & image
  const FINAL_GATE_TEXT = (
    "<b>The Final Trial</b><br/>" +
    "After mastering the basics of the conjuring canyons, you stumbled upon an egg<br/>"
    +
    " in an abandoned nest. But this is no ordinary egg. It is sealed by a powerful spell that needs to be cast"
    +
    " before the egg can hatch. You have learned how to cast complex spells, but this spell will require a technique you"
    +
    " might not have used before. Start casting!"
  );
  // Set this to the image you’ll provide (relative or absolute URL)
  const FINAL_GATE_IMAGE = "css-styles/media/final_level2.png"; //

  // Indices
  const FINAL_INDEX = targets.length - 1;
  let currentTargetIndex = 0;

  // Reuse your overlay elements (from the tutorial)
  const backdrop = document.getElementById('tutorialBackdrop');
  const spot     = document.getElementById('tutorialSpotlight');
  const msg      = document.getElementById('tutorialMessage');

  // Utility: center a message on the screen with the backdrop
  function showCenteredOverlay(html, { smoky = false } = {}) {
    // Hide spotlight (we want a full-screen overlay, not a cut-out)
    spot.style.display = 'none';

    // Backdrop
    backdrop.style.display = 'block';
    backdrop.style.background = smoky ? '' : 'rgba(0,0,0,0.3)';
    backdrop.classList.toggle('pbm-smoke', smoky);

    // Message (centered)
    msg.style.display = 'block';
    msg.style.left = '50%';
    msg.style.top = '50%';
    msg.style.transform = 'translate(-50%, -50%)';
    msg.innerHTML = html + "<div style='opacity:.65;margin-top:.5em;font-size:.9em'>Click anywhere to continue</div>";

    // Click anywhere to dismiss
    const dismiss = (e) => {
      e.stopPropagation();
      document.removeEventListener('click', dismiss, true);
      hideOverlay();
      // Continue to the final target after dismissal
      setTarget(FINAL_INDEX);
    };
    document.addEventListener('click', dismiss, true);
  }

  function hideOverlay() {
    backdrop.classList.remove('pbm-smoke');
    backdrop.style.display = 'none';
    msg.style.display = 'none';
  }

  // Show the final gate (smokescreen with text + image)
  function showFinalGate() {
    const html = FINAL_GATE_TEXT + (FINAL_GATE_IMAGE
      ? `<div class="pbm-gate-img"><img src="${FINAL_GATE_IMAGE}" alt="Final Level"/></div>`
      : '');
    showCenteredOverlay(html, { smoky: true });
  }

  // Replace/augment your existing setTarget to keep the index in sync
  const _origSetTarget = window.setTarget;
  window.setTarget = function(index) {
    currentTargetIndex = index;
    if (typeof _origSetTarget === 'function') {
      _origSetTarget(index);
      return;
    }

    // Clear proof state you already use
    window.lines = [];
    window.assumptionStack = [];
    window.indentLevel = 0;
    window.selectedLineIds?.clear?.();

    window.render?.();
    window.setStatus?.(`New target: ${targets[index]}`);
  };

  // Patch your Next Problem logic to insert the final gate
  const nextBtn = document.getElementById('nextBtn');

  // Keep a reference to your existing doNextProblem if present
  const _origDoNextProblem = window.doNextProblem;

  window.doNextProblem = function() {
    // Your original safety checks
    if (typeof window.lastNonEmptyLineIndex === 'function') {
      const i = window.lastNonEmptyLineIndex();
      if (i < 0) {
        window.setStatus?.('✗ Finish the current task before moving on.', 'warn');
        return;
      }
    }

    // Compute next index from our tracked currentTargetIndex
    const nextIndex = currentTargetIndex + 1;

    // Completed all?
    if (nextIndex >= targets.length) {
      window.setStatus?.('All problems complete!', 'ok');
      // Mark campaign complete if you want:
      try { window.markCampaignComplete?.('conjuring-canyons'); } catch {}
      return;
    }

    // If the NEXT is the final level, show the smokescreen gate first
    if (nextIndex === FINAL_INDEX) {
      currentTargetIndex = nextIndex; // advance now; setTarget() will run after gate
      showFinalGate();
      return;
    }

    // Otherwise behave like normal
    window.setTarget(nextIndex);
  };

  // Hook the button if not already
  if (nextBtn && !nextBtn._pbmHooked) {
    nextBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.doNextProblem();
    });
    nextBtn._pbmHooked = true;
  }

})();



    document.addEventListener('DOMContentLoaded', () => {
      placeAvatarOnIslands();
    });



})();

