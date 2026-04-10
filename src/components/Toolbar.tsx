import { useState, useEffect, useCallback } from 'react';
import { RotateCcw, RotateCw, Move, KeyRound } from 'lucide-react';
import { useStore } from '../store';
import { saveFlowRemote } from '../storage';
import { cloneTree } from '../tree';
import { DEFAULT_TREE } from '../data';
import { Button } from './ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { cn } from '../lib/utils';

export function Toolbar() {
  const { flows, activeId, setFlows, undo, redo, canUndo, canRedo, getActive, freeMode, setFreeMode, setFigmaTokenOpen } = useStore();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 6000);
    return () => clearTimeout(t);
  }, [status]);

  const handleSave = useCallback(async () => {
    setSaving(true); setStatus(null);
    try { await saveFlowRemote(getActive()); setStatus({ msg: 'Saved ✓', ok: true }); }
    catch (e) { setStatus({ msg: String(e), ok: false }); }
    finally { setSaving(false); }
  }, [getActive]);

  const handleReset = useCallback(() => {
    if (!confirm('Reset to default tree?')) return;
    setFlows(flows.map(f => f.id === activeId ? { ...f, tree: cloneTree(DEFAULT_TREE) } : f));
  }, [flows, activeId, setFlows]);

  return (
    <div className="fixed top-3 right-4 z-[100] flex items-center gap-2">
      {status && <span className={cn('font-mono text-[10px]', status.ok ? 'text-green-600' : 'text-muted-foreground')}>{status.msg}</span>}
      <div className="flex items-center rounded-md border border-border bg-background shadow-sm">
        <Tooltip><TooltipTrigger><Button variant="ghost" size="icon-xs" onClick={undo} disabled={!canUndo()}><RotateCcw size={13}/></Button></TooltipTrigger><TooltipContent>Undo (⌘Z)</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger><Button variant="ghost" size="icon-xs" onClick={redo} disabled={!canRedo()}><RotateCw size={13}/></Button></TooltipTrigger><TooltipContent>Redo (⌘Y)</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger><Button variant="ghost" size="icon-xs" onClick={() => setFreeMode(!freeMode)} className={freeMode ? 'bg-muted' : ''}><Move size={13}/></Button></TooltipTrigger><TooltipContent>Free positioning</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger><Button variant="ghost" size="icon-xs" onClick={() => setFigmaTokenOpen(true)}><KeyRound size={13}/></Button></TooltipTrigger><TooltipContent>Figma token settings</TooltipContent></Tooltip>
      </div>
      <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      <Button variant="ghost" size="sm" onClick={handleReset}>Reset</Button>
    </div>
  );
}
