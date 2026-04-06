import { useRef, useEffect, useCallback, useState } from 'react';
import { useStore } from '../store';
import { parseOutline, treeToOutline, normalizeArrows, splitInlineArrows, normalizeOutline } from '../parser';

function getLabel(raw: string): string {
  let text = raw.trim();
  const pipeIdx = text.indexOf(' | ');
  if (pipeIdx !== -1) text = text.slice(0, pipeIdx).trim();
  text = text.replace(/\[([^\]]+)\]\s*$/, '').trim();
  return text || 'Untitled';
}

function computeBreadcrumbs(value: string, cursorPos: number): string[] {
  const lines = value.split('\n');
  let pos = 0, curIdx = lines.length - 1;
  for (let i = 0; i < lines.length; i++) {
    if (pos + lines[i].length >= cursorPos) { curIdx = i; break; }
    pos += lines[i].length + 1;
  }
  const curLine = lines[curIdx];
  if (!curLine.trim()) return [];
  const curLevel = Math.floor(((curLine.match(/^ */)?.[0] ?? '').length) / 2);
  const crumbs: string[] = [];
  let target = curLevel - 1;
  for (let i = curIdx - 1; i >= 0 && target >= 0; i--) {
    const line = lines[i];
    if (!line.trim()) continue;
    const level = Math.floor(((line.match(/^ */)?.[0] ?? '').length) / 2);
    if (level === target) { crumbs.unshift(getLabel(line)); target--; }
  }
  crumbs.push(getLabel(curLine));
  return crumbs;
}

export function TextEditPanel() {
  const { getActive, setTextEditOpen, pushUndo, updateActiveTree } = useStore();
  const taRef      = useRef<HTMLTextAreaElement>(null);
  const dimRef     = useRef<HTMLDivElement>(null);
  const errRef     = useRef<HTMLSpanElement>(null);
  const dimActive  = useRef(false);
  const [showSteps, setShowSteps] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);

  // ── Line-focus dim overlay ───────────────────────────────────────────────────
  const updateDim = useCallback(() => {
    const ta  = taRef.current;
    const dim = dimRef.current;
    if (!ta || !dim) return;
    if (!dimActive.current) { dim.style.background = ''; return; }
    const style   = getComputedStyle(ta);
    const lineH   = parseFloat(style.lineHeight) || 20.4;
    const padT    = parseFloat(style.paddingTop)  || 16;
    const lineIdx = (ta.value.slice(0, ta.selectionStart).match(/\n/g) ?? []).length;
    const top     = padT + lineIdx * lineH - ta.scrollTop;
    const bot     = top + lineH;
    const c0 = 'rgba(254,252,248,0)';
    const c1 = 'rgba(254,252,248,0.55)';
    dim.style.background = `linear-gradient(to bottom,${c1} 0px,${c1} ${top}px,${c0} ${top}px,${c0} ${bot}px,${c1} ${bot}px,${c1} 100%)`;
  }, []);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.value = normalizeOutline(treeToOutline(getActive().tree));
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(0, 0); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = () => {
    const ta = taRef.current;
    const errEl = errRef.current;
    if (!ta) return;
    try {
      const tree = parseOutline(ta.value);
      pushUndo();
      updateActiveTree(tree);
      setTextEditOpen(false);
    } catch (e) {
      if (errEl) errEl.textContent = String(e);
    }
  };

  const close = () => setTextEditOpen(false);

  const updateBreadcrumbs = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    setBreadcrumbs(computeBreadcrumbs(ta.value, ta.selectionStart));
    updateDim();
  };

  const handleTaClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    dimActive.current = true;
    updateBreadcrumbs(e);
  };

  const handleTaBlur = () => {
    dimActive.current = false;
    updateDim();
  };

  // Convert arrow prefixes and inline arrows to indentation in real-time
  const handleInput = () => {
    const ta = taRef.current;
    if (!ta) return;
    const { value, selectionStart: ss } = ta;
    const lineStart = value.lastIndexOf('\n', ss - 1) + 1;
    const lineEndRaw = value.indexOf('\n', ss);
    const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw;
    const line = value.slice(lineStart, lineEnd);
    const replaced = splitInlineArrows(normalizeArrows(line)).join('\n');
    if (replaced !== line) {
      ta.value = value.slice(0, lineStart) + replaced + value.slice(lineEnd);
      ta.selectionStart = ta.selectionEnd = lineStart + replaced.length;
    }
    updateDim();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;

    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); apply(); return; }

    // Shift+Enter → new sibling block at same indent
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      const s = ta.selectionStart, val = ta.value;
      const lineStart = val.lastIndexOf('\n', s - 1) + 1;
      const indent = (val.slice(lineStart).match(/^ */) ?? [''])[0];
      ta.value = val.slice(0, s) + '\n' + indent + val.slice(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = s + 1 + indent.length;
      updateDim();
      return;
    }

    // Tab → indent all selected lines by 2 spaces
    if (!e.shiftKey && e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: ss, selectionEnd: se, value: val } = ta;
      const blockStart = val.lastIndexOf('\n', ss - 1) + 1;
      const blockEnd   = se > ss ? (val.indexOf('\n', se - 1) === -1 ? val.length : val.indexOf('\n', se - 1))
                                 : (val.indexOf('\n', ss)    === -1 ? val.length : val.indexOf('\n', ss));
      const indented = val.slice(blockStart, blockEnd).split('\n').map(l => '  ' + l).join('\n');
      ta.value = val.slice(0, blockStart) + indented + val.slice(blockEnd);
      ta.selectionStart = blockStart;
      ta.selectionEnd   = blockStart + indented.length;
      updateDim();
      return;
    }

    // Shift+Tab → outdent all selected lines by up to 2 spaces
    if (e.shiftKey && e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: ss, selectionEnd: se, value: val } = ta;
      const blockStart = val.lastIndexOf('\n', ss - 1) + 1;
      const blockEnd   = se > ss ? (val.indexOf('\n', se - 1) === -1 ? val.length : val.indexOf('\n', se - 1))
                                 : (val.indexOf('\n', ss)    === -1 ? val.length : val.indexOf('\n', ss));
      const outdented = val.slice(blockStart, blockEnd).split('\n').map(l => l.replace(/^ {1,2}/, '')).join('\n');
      ta.value = val.slice(0, blockStart) + outdented + val.slice(blockEnd);
      ta.selectionStart = blockStart;
      ta.selectionEnd   = blockStart + outdented.length;
      updateDim();
      return;
    }

    e.stopPropagation();
  };

  return (
    <div id="text-edit-panel">
      <div id="text-edit-header">
        <span id="text-edit-title">
          Edit outline — <kbd>Shift+↵</kbd> new block · <kbd>Tab</kbd> indent · <kbd>-&gt;</kbd> level down · <kbd>Ctrl+↵</kbd> apply · <kbd>Esc</kbd> cancel
        </span>
        <button
          className={`te-btn te-steps-toggle${showSteps ? ' te-steps-on' : ''}`}
          onClick={() => setShowSteps(s => !s)}
          title="Toggle path display"
        >
          steps
        </button>
        <span id="text-edit-err" ref={errRef} />
      </div>
      {showSteps && (
        <div id="text-edit-steps">
          {breadcrumbs.length === 0
            ? <span className="te-step te-step-empty">— move cursor to a line —</span>
            : breadcrumbs.map((crumb, i) => (
                <span key={i} className={`te-step${i === breadcrumbs.length - 1 ? ' te-step-cur' : ''}`}>
                  {i > 0 && <span className="te-step-sep">›</span>}
                  {crumb}
                </span>
              ))
          }
        </div>
      )}
      <div id="text-edit-ta-wrap">
        <textarea
          id="text-edit-ta"
          ref={taRef}
          spellCheck={false}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onKeyUp={updateBreadcrumbs}
          onClick={handleTaClick}
          onSelect={updateBreadcrumbs}
          onScroll={updateDim}
          onBlur={handleTaBlur}
        />
        <div id="text-edit-dim" ref={dimRef} />
      </div>
      <div id="text-edit-footer">
        <button className="te-btn te-btn-cancel" onClick={close}>Cancel</button>
        <button className="te-btn te-btn-apply" onClick={apply}>Apply</button>
      </div>
    </div>
  );
}
