import { useState, useRef, useCallback } from 'react';
import { Download, Upload, Plus, X, Link, Check } from 'lucide-react';
import type { Flow } from '../types';
import { parseOutline, treeToOutline, BLANK_OUTLINE } from '../parser';
import { useStore } from '../store';
import { deleteFlowRemote, saveFlowRemote } from '../storage';
import { encodeFlow } from '../utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

function genId() { return `flow-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function downloadFlowAsOutline(flow: Flow) {
  const text = treeToOutline(flow.tree);
  const blob = new Blob([text], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${flow.name.replace(/[^a-z0-9]/gi, '-')}.txt`; a.click();
  URL.revokeObjectURL(url);
}

type ModalState = null | 'new-choice' | 'new-text';

export function FlowTabs() {
  const { flows, activeId, setFlows, setActiveId, setSel, setSelNodeId } = useStore();
  const [modal, setModal] = useState<ModalState>(null);
  const [textInput, setTextInput] = useState('');
  const [parseErr, setParseErr] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const switchTo = useCallback((id: string) => {
    if (id === activeId) return;
    setActiveId(id);
    setSel(null); setSelNodeId(null);
  }, [activeId, setActiveId, setSel, setSelNodeId]);

  const handleDelete = useCallback((id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const updated = flows.filter(f => f.id !== id);
    const newActiveId = activeId === id ? updated[0].id : activeId;
    deleteFlowRemote(id);
    setFlows(updated);
    setActiveId(newActiveId);
    setSel(null); setSelNodeId(null);
  }, [flows, activeId, setFlows, setActiveId, setSel, setSelNodeId]);

  const handleRename = useCallback((id: string) => {
    const name = renameVal.trim() || flows.find(f => f.id === id)?.name || '';
    const updated = flows.map(f => f.id === id ? { ...f, name } : f);
    setFlows(updated);
    setRenamingId(null);
  }, [flows, renameVal, setFlows]);

  const handleShare = useCallback((flow: Flow) => {
    const url = `${location.origin}${location.pathname}#share=${encodeFlow(flow)}`;
    navigator.clipboard.writeText(url).catch(() => prompt('Copy share link:', url));
    setCopiedId(flow.id);
    setTimeout(() => setCopiedId(null), 1800);
  }, []);

  const addFlow = useCallback((flow: Flow) => {
    const updated = [...flows, flow];
    setFlows(updated);
    setActiveId(flow.id);
    setSel(null); setSelNodeId(null);
    saveFlowRemote(flow);
  }, [flows, setFlows, setActiveId, setSel, setSelNodeId]);

  const handleNewEmpty = useCallback(() => {
    const tree = parseOutline(BLANK_OUTLINE);
    addFlow({ id: genId(), name: 'New Flow', tree });
    setModal(null);
  }, [addFlow]);

  const handleNewFromText = useCallback(() => {
    const text = textInput.trim();
    if (!text) return;
    try {
      const tree = parseOutline(text);
      addFlow({ id: genId(), name: tree.label || 'New Flow', tree });
      setModal(null); setTextInput('');
    } catch (e) { setParseErr(String(e)); }
  }, [textInput, addFlow]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const tree = parseOutline(text);
        const name = file.name.replace(/\.[^.]+$/, '');
        tree.label = name;
        addFlow({ id: genId(), name, tree });
      } catch (err) { alert(`Failed to parse: ${err}`); }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  }, [addFlow]);

  return (
    <>
      <div className="fixed left-0 top-0 bottom-0 w-[148px] z-[100] flex flex-col overflow-hidden border-r border-border bg-[#F8F7F4] font-mono">
        <div className="shrink-0 border-b border-border px-3 pb-2 pt-3.5 text-[8px] uppercase tracking-[0.14em] text-muted-foreground">FLOWS</div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {flows.map(flow => (
            <div
              key={flow.id}
              className={cn(
                "group relative flex cursor-pointer items-center gap-1 border-b border-border/50 px-3 py-2.5 text-[9.5px] leading-snug text-[#777472] transition-colors hover:bg-[#F0EFEb] hover:text-foreground",
                flow.id === activeId && "bg-foreground text-background hover:bg-foreground hover:text-background"
              )}
              data-fid={flow.id}
              onClick={() => switchTo(flow.id)}
              onDoubleClick={e => {
                e.stopPropagation();
                setRenamingId(flow.id);
                setRenameVal(flow.name);
              }}
            >
              {renamingId === flow.id ? (
                <input
                  className="min-w-0 flex-1 bg-transparent font-mono text-inherit outline-none border-none p-0 text-[9.5px]"
                  autoFocus
                  value={renameVal}
                  onClick={e => e.stopPropagation()}
                  onChange={e => setRenameVal(e.target.value)}
                  onBlur={() => handleRename(flow.id)}
                  onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === 'Enter') handleRename(flow.id);
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                />
              ) : (
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{flow.name}</span>
              )}
              <button
                className={cn(
                  "shrink-0 border-none bg-transparent font-mono text-[11px] leading-none cursor-pointer rounded-sm px-0.5 py-0.5 transition-opacity text-inherit",
                  "opacity-0 group-hover:opacity-[0.55]",
                  flow.id === activeId && "opacity-40"
                )}
                title="Download as .txt"
                onClick={e => { e.stopPropagation(); downloadFlowAsOutline(flow); }}
              ><Download size={11} /></button>
              <button
                className={cn(
                  "shrink-0 border-none bg-transparent font-mono text-[11px] leading-none cursor-pointer rounded-sm px-0.5 py-0.5 transition-opacity text-inherit",
                  "opacity-0 group-hover:opacity-[0.55]",
                  flow.id === activeId && "opacity-40"
                )}
                title="Copy share link"
                onClick={e => { e.stopPropagation(); handleShare(flow); }}
              >{copiedId === flow.id ? <Check size={11} /> : <Link size={11} />}</button>
              {flows.length > 1 && (
                <button
                  className={cn(
                    "shrink-0 border-none bg-transparent font-mono text-[11px] leading-none cursor-pointer rounded-sm px-0.5 py-0.5 transition-opacity text-inherit text-destructive",
                    "opacity-0 group-hover:opacity-[0.55]",
                    flow.id === activeId && "opacity-40"
                  )}
                  title="Delete flow"
                  onClick={e => { e.stopPropagation(); handleDelete(flow.id, flow.name); }}
                ><X size={11} /></button>
              )}
            </div>
          ))}
        </div>
        <div className="shrink-0 flex flex-col border-t-[1.5px] border-border">
          <input ref={fileInputRef} type="file" accept=".txt,.md" style={{ display: 'none' }} onChange={handleImport} />
          <button className="border-none border-b border-border/60 bg-transparent px-3 py-2.5 text-left font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground cursor-pointer transition-colors hover:bg-[#EEEDE9] hover:text-foreground last:border-b-0 flex items-center gap-1.5" onClick={() => fileInputRef.current?.click()}><Upload size={11} /> Import</button>
          <button className="border-none border-b border-border/60 bg-transparent px-3 py-2.5 text-left font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground cursor-pointer transition-colors hover:bg-[#EEEDE9] hover:text-foreground last:border-b-0 flex items-center gap-1.5" onClick={() => setModal('new-choice')}><Plus size={11} /> New</button>
        </div>
      </div>

      {/* New flow choice modal */}
      <Dialog open={modal === 'new-choice'} onOpenChange={o => !o && setModal(null)}>
        <DialogContent showCloseButton={false} className="max-w-[268px] font-mono">
          <DialogHeader>
            <DialogTitle className="font-mono text-[9px] uppercase tracking-[0.14em]">New Flow</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <button
              className="flex flex-col items-start gap-0.5 rounded-sm border border-border bg-muted px-3 py-2.5 text-left cursor-pointer transition-colors hover:bg-foreground hover:border-foreground hover:text-background group w-full"
              onClick={handleNewEmpty}
            >
              <span className="text-[10px] font-bold tracking-[0.04em] text-foreground group-hover:text-background transition-colors">Empty</span>
              <span className="text-[8.5px] text-muted-foreground group-hover:text-background/60 transition-colors">Blank starter template</span>
            </button>
            <button
              className="flex flex-col items-start gap-0.5 rounded-sm border border-border bg-muted px-3 py-2.5 text-left cursor-pointer transition-colors hover:bg-foreground hover:border-foreground hover:text-background group w-full"
              onClick={() => setModal('new-text')}
            >
              <span className="text-[10px] font-bold tracking-[0.04em] text-foreground group-hover:text-background transition-colors">From text</span>
              <span className="text-[8.5px] text-muted-foreground group-hover:text-background/60 transition-colors">Paste outline text to build structure</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* From-text modal */}
      <Dialog open={modal === 'new-text'} onOpenChange={o => !o && setModal(null)}>
        <DialogContent showCloseButton={false} className="max-w-[440px] font-mono">
          <DialogHeader>
            <DialogTitle className="font-mono text-[9px] uppercase tracking-[0.14em]">Paste Outline Text</DialogTitle>
          </DialogHeader>
          <p className="text-[8px] text-muted-foreground leading-relaxed" style={{ color: parseErr ? '#B52B1E' : undefined }}>
            {parseErr || <>Format: <b>Label [type:branch] | sublabel</b> · 2-space indent per level<br />Types: root · nav · tab · (none for screen)</>}
          </p>
          <Textarea
            className="font-mono text-[9.5px] h-[196px] resize-y"
            spellCheck={false}
            autoFocus
            value={textInput}
            onChange={e => { setTextInput(e.target.value); setParseErr(''); }}
            onKeyDown={e => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleNewFromText();
              e.stopPropagation();
            }}
            placeholder={`Fit4Me [root]\n  Navigation [nav] | Tab 1 · Tab 2\n    Tab 1 [tab:plan]\n      Screen A`}
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModal(null)}>Cancel</Button>
            <Button size="sm" onClick={handleNewFromText}>Create Flow</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
