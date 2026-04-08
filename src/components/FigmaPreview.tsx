import { useEffect, useState, useCallback } from 'react';
import { X, ExternalLink, RefreshCw } from 'lucide-react';
import { decodeRef, fetchPreviewUrl, getPAT } from '../lib/figma';
import { useStore } from '../store';

interface Props {
  figmaRef: string;
  nodeLabel: string;
  onClose: () => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ok'; url: string }
  | { status: 'err'; msg: string }
  | { status: 'no_pat' };

export function FigmaPreview({ figmaRef, nodeLabel, onClose }: Props) {
  const { setFigmaTokenOpen } = useStore();
  const [ls, setLs] = useState<LoadState>({ status: 'loading' });

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
    <div id="fig-preview" onClick={e => e.stopPropagation()}>
      <div id="fig-preview-header">
        <span id="fig-preview-title">{nodeLabel}</span>
        <div className="fig-preview-actions">
          {figmaUrl && (
            <a href={figmaUrl} target="_blank" rel="noreferrer" className="fig-preview-icon-btn" title="Open in Figma">
              <ExternalLink size={13} />
            </a>
          )}
          <button className="fig-preview-icon-btn" onClick={onClose} title="Close"><X size={13} /></button>
        </div>
      </div>
      <div id="fig-preview-body">
        {ls.status === 'loading' && (
          <div className="fig-center"><RefreshCw size={18} className="fig-spin" /></div>
        )}
        {ls.status === 'no_pat' && (
          <div className="fig-center fig-hint">
            <p>No Figma token.</p>
            <button className="fig-action-btn" onClick={() => setFigmaTokenOpen(true)}>Set token</button>
          </div>
        )}
        {ls.status === 'err' && (
          <div className="fig-center fig-hint">
            <p>{ls.msg}</p>
            <button className="fig-action-btn" onClick={load}>Retry</button>
          </div>
        )}
        {ls.status === 'ok' && (
          <img id="fig-preview-img" src={ls.url} alt={nodeLabel} />
        )}
      </div>
    </div>
  );
}
