import { useState, useEffect, useCallback, useRef } from 'react';
import { RotateCcw, RotateCw, Lock, Unlock, KeyRound, Download, RefreshCw, Languages, Activity } from 'lucide-react';
import { useStore } from '../store';
import { saveFlowRemote } from '../storage';
import { cloneTree, addChildNode } from '../tree';
import { DEFAULT_TREE } from '../data';
import { autoArrange, doLayout, flattenTree } from '../layout';
import { buildChart } from '../retention';
import type { RetentionPoint } from '../types';
import {
  getPAT, getFigmaImportConfig, fetchPageStructure,
  parseFrameGroups, fetchBatchThumbnails, decodeRef,
} from '../lib/figma';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

export function Toolbar() {
  const { flows, activeId, setFlows, undo, redo, canUndo, canRedo, getActive, updateActiveTree, pushUndo, triggerEdgeAnim, freeMode, setFreeMode, setFigmaTokenOpen, setFigmaImportOpen, setLocaleCheckOpen, overlapCount, activeLayer } = useStore();
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);

  // Retention popover content (keeps old UI, but no longer uses the bottom-right "/" marker).
  const [retOpen, setRetOpen] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const getRetentionData = useCallback((): RetentionPoint[] => {
    return getActive().retentionData ?? [];
  }, [getActive]);
  const [retData, setRetData] = useState<RetentionPoint[]>(() => getRetentionData());

  useEffect(() => {
    if (!retOpen) return;
    setRetData(getRetentionData());
  }, [retOpen, activeId, getRetentionData]);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    el.innerHTML = '';
    el.appendChild(buildChart(retData.length > 0 ? retData : [
      { s: 's1', pct: 100 }, { s: 's2', pct: 80 }, { s: 's3', pct: 60 }, { s: 's4', pct: 40 },
    ]));
  }, [retData]);

  // Show ↺ button only when a saved import config exists for the active flow
  const hasSyncConfig = !!getFigmaImportConfig(activeId);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 6000);
    return () => clearTimeout(t);
  }, [status]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      const active = getActive();
      await saveFlowRemote(active);
      setStatus({ msg: 'Saved to cloud ✓', ok: true });
    } catch (e) {
      setStatus({ msg: `Saved locally · ${String(e)}`, ok: false });
    } finally {
      setSaving(false);
    }
  }, [getActive]);

  const handleReset = useCallback(() => {
    if (!confirm('Reset to default tree? Unsaved changes will be lost.')) return;
    const updated = flows.map(f =>
      f.id === activeId ? { ...f, tree: cloneTree(DEFAULT_TREE) } : f,
    );
    setFlows(updated);
  }, [flows, activeId, setFlows]);

  const handleAutoArrange = useCallback(() => {
    const flow = getActive();
    const freeCount = flattenTree(flow.tree).filter(n => n.px !== undefined || n.py !== undefined).length;
    if (freeCount > 3 && !confirm(`Auto-arrange will reset ${freeCount} free-positioned nodes. Continue?`)) return;
    pushUndo();
    autoArrange(flow.tree);
    doLayout(flow.tree, 0, 0);
    triggerEdgeAnim();
    updateActiveTree(flow.tree);
  }, [getActive, pushUndo, triggerEdgeAnim, updateActiveTree]);

  const handleResync = useCallback(async () => {
    const flow = getActive();
    const cfg = getFigmaImportConfig(flow.id);
    if (!cfg) { setFigmaImportOpen(true); return; }
    if (!getPAT()) { setFigmaTokenOpen(true); return; }
    setSyncing(true);
    setStatus(null);
    try {
      const pages = await fetchPageStructure(cfg.fileKey);
      const page = pages.find(p => p.id === cfg.pageId) ?? pages[0];
      if (!page) throw new Error('Saved page not found in Figma file');

      const allNodes = flattenTree(flow.tree);
      const groups = parseFrameGroups(page.frames, cfg.fileKey);

      pushUndo();
      let updated = 0, created = 0;

      for (const [groupName, screens] of groups) {
        const action = cfg.groupActions[groupName] ?? 'create';
        if (action === 'skip') continue;

        const matched = allNodes.find(n => n.label.trim().toLowerCase() === groupName.toLowerCase());

        if (action === 'create') {
          if (matched) {
            matched.screens = screens; updated++;
          } else {
            const newNode = addChildNode(flow.tree);
            newNode.label = groupName;
            newNode.screens = screens;
            created++;
          }
        } else if (matched) {
          if (action === 'overwrite') {
            matched.screens = screens;
          } else {
            const existing = matched.screens ?? [];
            const existingRefs = new Set(existing.map(s => s.ref));
            const added = screens.filter(s => !existingRefs.has(s.ref));
            matched.screens = [...existing, ...added].sort((a, b) => a.order - b.order);
          }
          updated++;
        }

        try {
          const nodeIds = screens.map(s => decodeRef(s.ref)?.nodeId).filter((id): id is string => !!id);
          await fetchBatchThumbnails(cfg.fileKey, nodeIds);
        } catch (_) { /* thumbnails optional */ }
      }

      updateActiveTree(flow.tree);
      const parts = [updated > 0 && `${updated} updated`, created > 0 && `${created} created`].filter(Boolean);
      setStatus({ msg: `Re-synced ✓ ${parts.join(', ') || '(no changes)'}`, ok: true });
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (msg === 'no_pat') setFigmaTokenOpen(true);
      else setStatus({ msg: `Sync failed · ${msg}`, ok: false });
    } finally {
      setSyncing(false);
    }
  }, [getActive, pushUndo, updateActiveTree, setFigmaImportOpen, setFigmaTokenOpen]);

  const undoOk = canUndo();
  const redoOk = canRedo();

  return (
    <div id="toolbar">
      {status && (
        <span id="tb-status" style={{ color: status.ok ? 'var(--teal)' : 'var(--muted-foreground)' }}>
          {status.msg}
        </span>
      )}
      <button id="tb-undo" title="Undo (⌘Z)" disabled={!undoOk} onClick={undo}><RotateCcw size={14} /></button>
      <button id="tb-redo" title="Redo (⌘Y)" disabled={!redoOk} onClick={redo}><RotateCw size={14} /></button>
      {activeLayer === 'nodes' && (
        <button
          id="tb-free"
          title={freeMode ? "Free positioning unlocked — drag nodes anywhere (snap to grid)" : "Free positioning locked"}
          className={freeMode ? 'tb-active' : ''}
          aria-pressed={freeMode}
          onClick={() => setFreeMode(!freeMode)}
        >{freeMode ? <Unlock size={14} /> : <Lock size={14} />}</button>
      )}
      {activeLayer === 'nodes' && (
        <Popover open={retOpen} onOpenChange={setRetOpen}>
          <PopoverTrigger
            title="Retention funnel"
            className={retOpen ? 'tb-active' : ''}
          >
            <Activity size={14} />
          </PopoverTrigger>
          <PopoverContent side="bottom" align="start" sideOffset={10} className="w-[280px] p-3">
            <div ref={chartRef} />
            <div className="ret-divider" />
            <div className="ret-table">
              {retData.map((pt, i) => (
                <div key={i} className="ret-row">
                  <input
                    className="ret-inp ret-inp-lbl"
                    value={pt.s}
                    placeholder="label"
                    onChange={e => {
                      const next = retData.map((d, idx) => idx === i ? { ...d, s: e.target.value.trim() || d.s } : d);
                      setRetData(next);
                      const updated = flows.map(f => f.id === activeId ? { ...f, retentionData: next } : f);
                      setFlows(updated);
                    }}
                  />
                  <input
                    className="ret-inp ret-inp-pct"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={pt.pct}
                    onChange={e => {
                      const v = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                      const next = retData.map((d, idx) => idx === i ? { ...d, pct: v } : d);
                      setRetData(next);
                      const updated = flows.map(f => f.id === activeId ? { ...f, retentionData: next } : f);
                      setFlows(updated);
                    }}
                  />
                  <span className="ret-pct-unit">%</span>
                  {retData.length > 2 && (
                    <button
                      className="ret-row-del"
                      onClick={() => {
                        const next = retData.filter((_, idx) => idx !== i);
                        setRetData(next);
                        const updated = flows.map(f => f.id === activeId ? { ...f, retentionData: next } : f);
                        setFlows(updated);
                      }}
                    >×</button>
                  )}
                </div>
              ))}
              <button
                className="ret-add-row"
                onClick={() => {
                  const last = retData[retData.length - 1];
                  const next = [...retData, { s: `+${retData.length}`, pct: Math.max(0, (last?.pct ?? 10) - 5) }];
                  setRetData(next);
                  const updated = flows.map(f => f.id === activeId ? { ...f, retentionData: next } : f);
                  setFlows(updated);
                }}
              >+ Add stage</button>
            </div>
            <button
              className="ret-reset"
              onClick={() => {
                const next: RetentionPoint[] = [
                  { s: 's1', pct: 100 }, { s: 's2', pct: 80 }, { s: 's3', pct: 60 }, { s: 's4', pct: 40 },
                ];
                setRetData(next);
                const updated = flows.map(f => f.id === activeId ? { ...f, retentionData: next } : f);
                setFlows(updated);
              }}
            >Reset</button>
          </PopoverContent>
        </Popover>
      )}
      {activeLayer === 'nodes' && (
        <button id="tb-figma" title="Figma token settings" onClick={() => setFigmaTokenOpen(true)}><KeyRound size={14} /></button>
      )}
      {activeLayer === 'nodes' && (
        <button id="tb-figma-import" title="Import screens from Figma page" onClick={() => setFigmaImportOpen(true)}><Download size={14} /></button>
      )}
      {activeLayer === 'nodes' && (
        <button id="tb-locale-check" title="Locale check — paste any Figma frame URL" onClick={() => setLocaleCheckOpen(true)}><Languages size={14} /></button>
      )}
      {activeLayer === 'nodes' && hasSyncConfig && (
        <button
          id="tb-figma-resync"
          title="Re-sync screens from Figma (last page)"
          disabled={syncing}
          onClick={handleResync}
        >
          <RefreshCw size={14} className={syncing ? 'fig-spin' : ''} />
        </button>
      )}
      {activeLayer === 'nodes' && overlapCount > 0 && (
        <button id="tb-overlap" title="Edge crossings detected — click to auto-arrange" onClick={handleAutoArrange}>
          ⚠ {overlapCount} crossing{overlapCount > 1 ? 's' : ''} · Fix
        </button>
      )}
      <button id="tb-save" disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save'}</button>
      <button id="tb-reset" onClick={handleReset}>Reset</button>
    </div>
  );
}
