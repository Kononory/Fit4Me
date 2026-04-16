import { useState, useRef, useCallback } from 'react';
import { Download, Upload, Plus, X, Link, Check, PanelLeftClose, PanelLeftOpen, List, Network, Zap } from 'lucide-react';
import type { Flow } from '../types';
import { parseOutline, treeToOutline, BLANK_OUTLINE } from '../parser';
import { useStore } from '../store';
import { deleteFlowRemote, saveFlowRemote } from '../storage';
import { encodeFlow } from '../utils';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';

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
  const { flows, activeId, setFlows, setActiveId, setSel, setSelNodeId, setFigmaImportOpen, activeLayer, setActiveLayer, leftSidebarCollapsed, setLeftSidebarCollapsed } = useStore();
  const [modal, setModal] = useState<ModalState>(null);
  const [textInput, setTextInput] = useState('');
  const [parseErr, setParseErr] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [peeking, setPeeking] = useState(false);
  const peekTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePeekEnter = () => {
    if (!leftSidebarCollapsed) return;
    if (peekTimerRef.current) { clearTimeout(peekTimerRef.current); peekTimerRef.current = null; }
    setPeeking(true);
  };
  const handlePeekLeave = () => {
    if (!leftSidebarCollapsed) return;
    if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
    peekTimerRef.current = window.setTimeout(() => setPeeking(false), 200);
  };

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

  const handleNewFromFigma = useCallback(() => {
    const tree = parseOutline(BLANK_OUTLINE);
    addFlow({ id: genId(), name: 'New Flow', tree });
    setModal(null);
    setFigmaImportOpen(true);
  }, [addFlow, setFigmaImportOpen]);

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
      <div
        id="flow-tabs"
        className={[
          leftSidebarCollapsed ? 'collapsed' : '',
          leftSidebarCollapsed && peeking ? 'peeking' : '',
        ].filter(Boolean).join(' ')}
        onMouseEnter={handlePeekEnter}
        onMouseLeave={handlePeekLeave}
      >
        {leftSidebarCollapsed && !peeking ? (
          <div className="sb-collapsed-content">
            <button
              className="sb-collapse-btn"
              title="Expand sidebar"
              onClick={() => setLeftSidebarCollapsed(false)}
            ><PanelLeftOpen size={14} /></button>
          </div>
        ) : (<>
        <div id="flow-layer-tabs">
          <Tabs value={activeLayer} onValueChange={v => setActiveLayer(v as typeof activeLayer)}>
            <TabsList className="layer-tabs-list">
              <TabsTrigger value="outline" className="layer-tab" title="Outline">
                <List size={11} /><span className="layer-tab-lbl">Outline</span>
              </TabsTrigger>
              <TabsTrigger value="nodes" className="layer-tab" title="Nodes">
                <Network size={11} /><span className="layer-tab-lbl">Nodes</span>
              </TabsTrigger>
              <TabsTrigger value="events" className="layer-tab" title="Events">
                <Zap size={11} /><span className="layer-tab-lbl">Events</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div id="flow-tabs-label">
          FLOWS
          <button
            className="sb-collapse-btn sb-collapse-btn-inline"
            title="Collapse sidebar"
            onClick={() => { setPeeking(false); setLeftSidebarCollapsed(true); }}
          ><PanelLeftClose size={12} /></button>
        </div>
        <div id="flow-tab-list">
          {flows.map(flow => (
            <div
              key={flow.id}
              className={'flow-tab' + (flow.id === activeId ? ' flow-tab-active' : '')}
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
                  className="flow-tab-input"
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
                <span className="flow-tab-name">{flow.name}</span>
              )}
              <button className="flow-tab-btn" title="Download as .txt"
                onClick={e => { e.stopPropagation(); downloadFlowAsOutline(flow); }}><Download size={11} /></button>
              <button className="flow-tab-btn" title="Copy share link"
                onClick={e => { e.stopPropagation(); handleShare(flow); }}>{copiedId === flow.id ? <Check size={11} /> : <Link size={11} />}</button>
              {flows.length > 1 && (
                <button className="flow-tab-btn flow-tab-del" title="Delete flow"
                  onClick={e => { e.stopPropagation(); handleDelete(flow.id, flow.name); }}><X size={11} /></button>
              )}
            </div>
          ))}
        </div>
        <div id="flow-tabs-footer">
          <input ref={fileInputRef} type="file" accept=".txt,.md" style={{ display: 'none' }} onChange={handleImport} />
          <button className="flow-footer-btn" onClick={() => fileInputRef.current?.click()}><Upload size={11} /> Import</button>
          <button className="flow-footer-btn" onClick={() => setModal('new-choice')}><Plus size={11} /> New</button>
        </div>
        </>)}
      </div>

      {/* New flow modal */}
      {modal === 'new-choice' && (
        <div className="ft-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="ft-modal-card">
            <div className="ft-modal-title">New Flow</div>
            <div className="ft-modal-options">
              <button className="ft-modal-opt" onClick={handleNewEmpty}>
                <span className="ft-opt-label">Empty</span>
                <span className="ft-opt-desc">Blank starter template</span>
              </button>
              <button className="ft-modal-opt" onClick={() => setModal('new-text')}>
                <span className="ft-opt-label">From text</span>
                <span className="ft-opt-desc">Paste outline text to build structure</span>
              </button>
              <button className="ft-modal-opt" onClick={handleNewFromFigma}>
                <span className="ft-opt-label">From Figma</span>
                <span className="ft-opt-desc">Import structure from a Figma file</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* From-text modal */}
      {modal === 'new-text' && (
        <div className="ft-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="ft-modal-card ft-modal-text">
            <div className="ft-modal-title">Paste Outline Text</div>
            <div className="ft-modal-hint" style={{ color: parseErr ? '#B52B1E' : undefined }}>
              {parseErr || <>Format: <b>Label [type:branch] | sublabel</b> · 2-space indent per level<br />Types: root · nav · tab · (none for screen)</>}
            </div>
            <textarea
              className="ft-modal-textarea"
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
            <div className="ft-modal-actions">
              <button className="ft-modal-btn ft-modal-btn-cancel" onClick={() => setModal(null)}>Cancel</button>
              <button className="ft-modal-btn ft-modal-btn-create" onClick={handleNewFromText}>Create Flow</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
