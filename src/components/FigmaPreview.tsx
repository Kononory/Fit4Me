import { useEffect, useState, useCallback, useRef } from 'react';
import { X, ExternalLink, RefreshCw, Play } from 'lucide-react';
import { decodeRef, fetchPreviewUrl, getPAT } from '../lib/figma';
import { useStore } from '../store';
import { Button, buttonVariants } from './ui/button';

interface Props {
  figmaRef: string;
  nodeLabel: string;
  onClose: () => void;
  onPreview?: () => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ok'; url: string }
  | { status: 'err'; msg: string }
  | { status: 'no_pat' };

export function FigmaPreview({ figmaRef, nodeLabel, onClose, onPreview }: Props) {
  const { setFigmaTokenOpen, figmaTokenOpen } = useStore();
  const [ls, setLs] = useState<LoadState>({ status: 'loading' });
  const prevTokenOpen = useRef(figmaTokenOpen);

  // Re-load when token modal closes (user just saved a token)
  useEffect(() => {
    if (prevTokenOpen.current && !figmaTokenOpen && ls.status === 'no_pat') load();
    prevTokenOpen.current = figmaTokenOpen;
  }); // runs every render, intentionally — checks ref transition

  const load = useCallback(() => {
    if (!getPAT()) { setLs({ status: 'no_pat' }); return; }
    const decoded = decodeRef(figmaRef);
    if (!decoded) { setLs({ status: 'err', msg: 'Invalid Figma ref' }); return; }
    setLs({ status: 'loading' });
    fetchPreviewUrl(decoded.fileKey, decoded.nodeId)
      .then(url => setLs({ status: 'ok', url }))
      .catch(e => {
        const msg = String((e as Error).message ?? e);
        setLs(msg === 'no_pat' ? { status: 'no_pat' } : { status: 'err', msg });
      });
  }, [figmaRef]);

  useEffect(() => { load(); }, [load]);

  const figmaUrl = (() => {
    const d = decodeRef(figmaRef);
    if (!d) return null;
    return `https://www.figma.com/design/${d.fileKey}?node-id=${d.nodeId.replace(':', '-')}`;
  })();

  return (
    <div className="absolute z-[90] flex flex-col overflow-hidden rounded-lg border bg-background shadow-lg font-mono" onClick={e => e.stopPropagation()} style={{ right: 20, top: 56, width: 300, maxHeight: 'calc(100vh - 80px)' }}>
      <div className="flex h-9 shrink-0 items-center border-b border-border px-3 gap-2">
        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold">{nodeLabel}</span>
        <div className="flex items-center gap-1">
          {onPreview && (
            <Button variant="ghost" size="icon-xs" onClick={onPreview} title="Preview prototype">
              <Play size={13} />
            </Button>
          )}
          {figmaUrl && (
            <a href={figmaUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'ghost', size: 'icon-xs' })} title="Open in Figma">
              <ExternalLink size={13} />
            </a>
          )}
          <Button variant="ghost" size="icon-xs" onClick={onClose} title="Close"><X size={13} /></Button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {ls.status === 'loading' && (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <RefreshCw size={18} className="animate-spin text-muted-foreground" />
          </div>
        )}
        {ls.status === 'no_pat' && (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <p className="text-xs text-muted-foreground">No Figma token.</p>
            <Button variant="outline" size="xs" onClick={() => setFigmaTokenOpen(true)}>Set token</Button>
          </div>
        )}
        {ls.status === 'err' && (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <p className="text-xs text-muted-foreground">{ls.msg}</p>
            <Button variant="outline" size="xs" onClick={load}>Retry</Button>
          </div>
        )}
        {ls.status === 'ok' && (
          <img className="block w-full" src={ls.url} alt={nodeLabel} />
        )}
      </div>
    </div>
  );
}
