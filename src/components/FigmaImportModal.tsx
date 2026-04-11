import { useState, useCallback } from 'react';
import { X, ArrowRight, RefreshCw } from 'lucide-react';
import type { TreeNode, ScreenRef } from '../types';
import {
  parseFigmaInput, parseFigmaFileKey, getPAT,
  fetchPageStructure, parseFrameGroups, fetchBatchThumbnails,
  SCREEN_PAT,
} from '../lib/figma';
import type { PageResult } from '../lib/figma';
import { useStore } from '../store';
import { findNode, addChildNode } from '../tree';
import { decodeRef } from '../lib/figma';

type ConflictAction = 'overwrite' | 'merge' | 'skip';
type ImportAction = ConflictAction | 'create';

interface ReviewGroup {
  groupName: string;
  screens: ScreenRef[];
  matchedNodeId: string | null;
  action: ImportAction;
}

type Step =
  | { type: 'input' }
  | { type: 'loading'; msg: string }
  | { type: 'select-page'; fileKey: string; pages: PageResult[] }
  | { type: 'review'; fileKey: string; groups: ReviewGroup[]; skippedFrames: number }
  | { type: 'applying'; total: number; done: number; msg: string }
  | { type: 'done'; created: number; updated: number; skippedGroups: number }
  | { type: 'error'; msg: string };

interface Props {
  allNodes: TreeNode[];
}

export function FigmaImportModal({ allNodes }: Props) {
  const { setFigmaImportOpen, setFigmaTokenOpen, getActive, pushUndo, updateActiveTree } = useStore();
  const [step, setStep] = useState<Step>({ type: 'input' });
  const [url, setUrl] = useState('');
  const [selectedPageId, setSelectedPageId] = useState<string>('');

  const close = useCallback(() => setFigmaImportOpen(false), [setFigmaImportOpen]);

  function buildReview(fileKey: string, frames: RawFrame[], allNodes: TreeNode[]) {
    const groups = parseFrameGroups(frames, fileKey);
    const skippedFrames = frames.filter(f => !SCREEN_PAT.test(f.name)).length;
    const reviewGroups: ReviewGroup[] = [];
    for (const [groupName, screens] of groups) {
      const matched = allNodes.find(
        n => n.label.trim().toLowerCase() === groupName.toLowerCase()
      );
      reviewGroups.push({
        groupName,
        screens,
        matchedNodeId: matched?.id ?? null,
        action: matched ? 'overwrite' : 'create',
      });
    }
    setStep({ type: 'review', fileKey, groups: reviewGroups, skippedFrames });
  }

  const handleFetch = useCallback(async () => {
    if (!getPAT()) { setFigmaTokenOpen(true); return; }
    const raw = url.trim();
    const parsed = parseFigmaInput(raw);
    const fileKey = parsed?.fileKey ?? parseFigmaFileKey(raw);
    if (!fileKey) {
      setStep({ type: 'error', msg: 'Invalid Figma URL. Expected figma.com/design/... URL.' });
      return;
    }
    setStep({ type: 'loading', msg: 'Fetching file structure…' });
    try {
      const pages = await fetchPageStructure(fileKey);
      const useful = pages.filter(p => p.frames.some(f => SCREEN_PAT.test(f.name)));
      if (useful.length === 0) {
        setStep({
          type: 'error',
          msg: 'No frames matching "Group / 01 – Name" pattern found on any page.',
        });
        return;
      }
      if (useful.length === 1) {
        buildReview(fileKey, useful[0].frames, allNodes);
      } else {
        setSelectedPageId(useful[0].id);
        setStep({ type: 'select-page', fileKey, pages: useful });
      }
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (msg === 'no_pat') { setFigmaTokenOpen(true); setStep({ type: 'input' }); }
      else setStep({ type: 'error', msg });
    }
  }, [url, allNodes, setFigmaTokenOpen]);

  const handlePageNext = useCallback((fileKey: string, pages: PageResult[]) => {
    const page = pages.find(p => p.id === selectedPageId) ?? pages[0];
    buildReview(fileKey, page.frames, allNodes);
  }, [selectedPageId, allNodes]);

  const handleApply = useCallback(async (groups: ReviewGroup[], fileKey: string) => {
    const active = groups.filter(g => g.action !== 'skip');
    setStep({ type: 'applying', total: active.length, done: 0, msg: 'Preparing…' });

    pushUndo();
    const flow = getActive();
    let created = 0, updated = 0;

    for (let i = 0; i < active.length; i++) {
      const g = active[i];
      setStep({ type: 'applying', total: active.length, done: i, msg: `Loading ${g.groupName}…` });

      if (g.action === 'create') {
        const newNode = addChildNode(flow.tree);
        newNode.label = g.groupName;
        newNode.screens = g.screens;
        created++;
      } else {
        const node = findNode(flow.tree, g.matchedNodeId!);
        if (node) {
          if (g.action === 'overwrite') {
            node.screens = g.screens;
          } else {
            // merge: add screens not already present (by ref)
            const existing = node.screens ?? [];
            const existingRefs = new Set(existing.map(s => s.ref));
            const added = g.screens.filter(s => !existingRefs.has(s.ref));
            node.screens = [...existing, ...added].sort((a, b) => a.order - b.order);
          }
          updated++;
        }
      }

      // Warm the thumbnail cache for this group
      try {
        const nodeIds = g.screens
          .map(s => decodeRef(s.ref)?.nodeId)
          .filter((id): id is string => !!id);
        await fetchBatchThumbnails(fileKey, nodeIds);
      } catch (_) { /* thumbnails are optional — carousel lazy-loads */ }

      setStep({ type: 'applying', total: active.length, done: i + 1, msg: `Loaded ${g.groupName}` });
    }

    updateActiveTree(flow.tree);
    setStep({ type: 'done', created, updated, skippedGroups: groups.length - active.length });
  }, [getActive, pushUndo, updateActiveTree]);

  const setGroupAction = useCallback((groups: ReviewGroup[], i: number, action: ImportAction): ReviewGroup[] => {
    return groups.map((g, idx) => idx === i ? { ...g, action } : g);
  }, []);

  return (
    <div className="fi-backdrop" onClick={close}>
      <div className="fi-modal" onClick={e => e.stopPropagation()}>
        <div className="fi-header">
          <span className="fi-title">Import screens from Figma</span>
          <button className="fi-icon-btn" onClick={close}><X size={13} /></button>
        </div>

        {step.type === 'input' && (
          <div className="fi-body">
            <p className="fi-hint">Paste a Figma page URL. Frames must follow the naming convention:</p>
            <code className="fi-code">Open App / 01 – Splash{'\n'}Open App / 02 – Loading{'\n'}Profile / 01 – View</code>
            <div className="fi-row">
              <input
                className="fi-input"
                autoFocus
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="figma.com/design/…"
                onKeyDown={e => { if (e.key === 'Enter') handleFetch(); }}
              />
              <button className="fi-btn fi-btn-primary" onClick={handleFetch}>
                Fetch <ArrowRight size={11} />
              </button>
            </div>
          </div>
        )}

        {step.type === 'loading' && (
          <div className="fi-body fi-center">
            <RefreshCw size={18} className="fig-spin" />
            <span className="fi-hint">{step.msg}</span>
          </div>
        )}

        {step.type === 'select-page' && (
          <div className="fi-body">
            <p className="fi-hint">Multiple pages have matching frames. Select one to import:</p>
            <div className="fi-page-list">
              {step.pages.map(p => {
                const count = p.frames.filter(f => SCREEN_PAT.test(f.name)).length;
                return (
                  <label key={p.id} className="fi-page-row">
                    <input
                      type="radio"
                      name="figma-page"
                      value={p.id}
                      checked={selectedPageId === p.id}
                      onChange={() => setSelectedPageId(p.id)}
                    />
                    <span className="fi-page-name">{p.name}</span>
                    <span className="fi-page-count">{count} frame{count !== 1 ? 's' : ''}</span>
                  </label>
                );
              })}
            </div>
            <div className="fi-actions">
              <button className="fi-btn fi-btn-ghost" onClick={() => setStep({ type: 'input' })}>← Back</button>
              <button className="fi-btn fi-btn-primary" onClick={() => handlePageNext(step.fileKey, step.pages)}>
                Next <ArrowRight size={11} />
              </button>
            </div>
          </div>
        )}

        {step.type === 'review' && (() => {
          const { fileKey, groups, skippedFrames } = step;
          const matched = groups.filter(g => g.matchedNodeId).length;
          const created = groups.filter(g => !g.matchedNodeId).length;
          return (
            <div className="fi-body">
              <p className="fi-hint">
                {groups.length} group{groups.length !== 1 ? 's' : ''} found
                {matched > 0 ? ` · ${matched} match canvas nodes` : ''}
                {created > 0 ? ` · ${created} new` : ''}
              </p>
              <div className="fi-review-list">
                {groups.map((g, i) => (
                  <div key={g.groupName} className="fi-review-row">
                    <span className={`fi-review-badge ${g.matchedNodeId ? 'fi-badge-match' : 'fi-badge-new'}`}>
                      {g.matchedNodeId ? '✓' : '+'}
                    </span>
                    <span className="fi-review-name">{g.groupName}</span>
                    <span className="fi-review-count">{g.screens.length} screen{g.screens.length !== 1 ? 's' : ''}</span>
                    <select
                      className="fi-review-select"
                      value={g.action}
                      onChange={e => {
                        const updated = setGroupAction(groups, i, e.target.value as ImportAction);
                        setStep({ ...step, groups: updated });
                      }}
                    >
                      {g.matchedNodeId ? (
                        <>
                          <option value="overwrite">Overwrite</option>
                          <option value="merge">Merge</option>
                          <option value="skip">Skip</option>
                        </>
                      ) : (
                        <>
                          <option value="create">Create node</option>
                          <option value="skip">Skip</option>
                        </>
                      )}
                    </select>
                  </div>
                ))}
              </div>
              {skippedFrames > 0 && (
                <p className="fi-hint fi-hint-warn">
                  ⚠ {skippedFrames} frame{skippedFrames !== 1 ? 's' : ''} skipped (no naming pattern)
                </p>
              )}
              <div className="fi-actions">
                <button className="fi-btn fi-btn-ghost" onClick={() => setStep({ type: 'input' })}>← Back</button>
                <button
                  className="fi-btn fi-btn-primary"
                  disabled={groups.every(g => g.action === 'skip')}
                  onClick={() => handleApply(groups, fileKey)}
                >
                  Apply <ArrowRight size={11} />
                </button>
              </div>
            </div>
          );
        })()}

        {step.type === 'applying' && (
          <div className="fi-body fi-center">
            <div className="fi-progress-bar">
              <div
                className="fi-progress-fill"
                style={{ width: `${step.total ? (step.done / step.total) * 100 : 0}%` }}
              />
            </div>
            <span className="fi-hint">{step.msg} ({step.done}/{step.total})</span>
          </div>
        )}

        {step.type === 'done' && (
          <div className="fi-body fi-center">
            <span className="fi-done-check">✓</span>
            <p className="fi-hint">
              {step.updated > 0 && <>{step.updated} node{step.updated !== 1 ? 's' : ''} updated<br /></>}
              {step.created > 0 && <>{step.created} node{step.created !== 1 ? 's' : ''} created<br /></>}
              {step.skippedGroups > 0 && <>{step.skippedGroups} group{step.skippedGroups !== 1 ? 's' : ''} skipped</>}
            </p>
            <button className="fi-btn fi-btn-primary" onClick={close}>Done</button>
          </div>
        )}

        {step.type === 'error' && (
          <div className="fi-body fi-center">
            <p className="fi-hint fi-hint-err">{step.msg}</p>
            <button className="fi-btn fi-btn-ghost" onClick={() => setStep({ type: 'input' })}>← Try again</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Local type alias to avoid import duplication
type RawFrame = { id: string; name: string };
