import { useState } from 'react';
import { Eye, EyeOff, X, Check } from 'lucide-react';
import { getPAT, setPAT } from '../lib/figma';
import { useStore } from '../store';

export function FigmaTokenModal() {
  const { setFigmaTokenOpen } = useStore();
  const [val, setVal]     = useState(getPAT());
  const [show, setShow]   = useState(false);
  const [saved, setSaved] = useState(false);

  const close = () => setFigmaTokenOpen(false);

  const save = () => {
    setPAT(val);
    setSaved(true);
    setTimeout(close, 700);
  };

  const clear = () => { setPAT(''); setVal(''); setSaved(false); };

  return (
    <div className="fig-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="fig-modal-card" onClick={e => e.stopPropagation()}>
        <div className="fig-modal-header">
          <span className="fig-modal-title">Figma Access Token</span>
          <button className="fig-preview-icon-btn" onClick={close}><X size={14} /></button>
        </div>
        <p className="fig-modal-hint">
          Figma → Account Settings → Personal access tokens → Generate new token.
          Saved to browser only — never sent anywhere except Figma's API.
        </p>
        <div className="fig-modal-input-row">
          <input
            className="fig-modal-input"
            type={show ? 'text' : 'password'}
            value={val}
            onChange={e => { setVal(e.target.value); setSaved(false); }}
            placeholder="figd_..."
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') close(); }}
          />
          <button className="fig-preview-icon-btn" onClick={() => setShow(s => !s)} title={show ? 'Hide' : 'Show'}>
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <div className="fig-modal-actions">
          {val && <button className="fig-modal-btn fig-modal-btn-clear" onClick={clear}>Clear</button>}
          <button className="fig-modal-btn fig-modal-btn-cancel" onClick={close}>Cancel</button>
          <button className="fig-modal-btn fig-modal-btn-save" onClick={save}>
            {saved ? <><Check size={11} /> Saved</> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
