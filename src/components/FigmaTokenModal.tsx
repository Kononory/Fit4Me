import { useState } from 'react';
import { Eye, EyeOff, Check } from 'lucide-react';
import { getPAT, setPAT } from '../lib/figma';
import { useStore } from '../store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';

export function FigmaTokenModal() {
  const { setFigmaTokenOpen } = useStore();
  const [val, setVal]     = useState(getPAT);
  const [show, setShow]   = useState(false);
  const [saved, setSaved] = useState(false);
  const close = () => setFigmaTokenOpen(false);
  const save  = () => { setPAT(val); setSaved(true); setTimeout(close, 700); };
  const clear = () => { setPAT(''); setVal(''); setSaved(false); };

  return (
    <Dialog open onOpenChange={open => !open && close()}>
      <DialogContent showCloseButton={false} className="max-w-sm font-mono">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">Figma Access Token</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Figma → Account Settings → Personal access tokens → Generate new token.
          Saved to browser only.
        </p>
        <div className="flex gap-1.5">
          <Input
            type={show ? 'text' : 'password'}
            value={val}
            onChange={e => { setVal(e.target.value); setSaved(false); }}
            placeholder="figd_…"
            autoFocus
            className="font-mono text-xs"
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') close(); }}
          />
          <Button variant="outline" size="icon-sm" onClick={() => setShow(s => !s)}>
            {show ? <EyeOff size={13} /> : <Eye size={13} />}
          </Button>
        </div>
        <DialogFooter>
          {val && <Button variant="ghost" size="sm" onClick={clear} className="mr-auto">Clear</Button>}
          <Button variant="outline" size="sm" onClick={close}>Cancel</Button>
          <Button size="sm" onClick={save}>{saved ? <><Check size={11} /> Saved</> : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
