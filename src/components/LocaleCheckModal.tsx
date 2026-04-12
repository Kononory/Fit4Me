import { useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { getPAT } from '../lib/figma';
import type { LocaleCheckResponse, LocaleStatus } from '../lib/locale-types';

const LANGUAGES = [
  { code: 'DE', name: 'German' },
  { code: 'FR', name: 'French' },
  { code: 'ES', name: 'Spanish' },
  { code: 'PT', name: 'Portuguese' },
  { code: 'IT', name: 'Italian' },
  { code: 'RU', name: 'Russian' },
  { code: 'AR', name: 'Arabic' },
  { code: 'HE', name: 'Hebrew' },
  { code: 'ZH', name: 'Chinese' },
  { code: 'JA', name: 'Japanese' },
  { code: 'KO', name: 'Korean' },
  { code: 'TR', name: 'Turkish' },
  { code: 'NL', name: 'Dutch' },
  { code: 'PL', name: 'Polish' },
];

const STATUS_ICON: Record<LocaleStatus, string> = {
  fit:           '✓',
  overflow:      '↕',
  collision:     '✕',
  frame_overflow:'✕',
};

const STATUS_TITLE: Record<LocaleStatus, string> = {
  fit:           'Fits',
  overflow:      'Overflows container (no collision)',
  collision:     'Overflows and collides with sibling',
  frame_overflow:'Overflows frame boundary',
};

interface Props {
  fileKey: string;
  nodeId: string;
  screenName: string;
  onClose: () => void;
}

export function LocaleCheckModal({ fileKey, nodeId, screenName, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(['DE', 'FR', 'ES', 'AR', 'ZH', 'JA'])
  );
  const [state, setState] = useState<
    | { phase: 'pick' }
    | { phase: 'loading' }
    | { phase: 'done'; data: LocaleCheckResponse }
    | { phase: 'error'; msg: string }
  >({ phase: 'pick' });

  function toggleLang(code: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  async function runCheck() {
    const locales = [...selected];
    if (locales.length === 0) return;
    setState({ phase: 'loading' });
    try {
      const res = await fetch('/api/locale-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileKey, nodeId, token: getPAT(), locales }),
      });
      const body = await res.json() as LocaleCheckResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setState({ phase: 'done', data: body });
    } catch (e) {
      setState({ phase: 'error', msg: String((e as Error).message ?? e) });
    }
  }

  const locales = state.phase === 'done'
    ? Object.keys(state.data.results[0]?.locales ?? {})
    : [];

  return (
    <>
      <div id="lc-backdrop" onClick={onClose} />
      <div id="lc-modal" onClick={e => e.stopPropagation()}>
        <div className="lc-header">
          <span className="lc-title">Locale check — {screenName}</span>
          <button className="lc-close" onClick={onClose}><X size={12} /></button>
        </div>

        {/* Language picker */}
        <div className="lc-section">
          <div className="lc-lang-grid">
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                className={`lc-lang-pill${selected.has(l.code) ? ' active' : ''}`}
                onClick={() => toggleLang(l.code)}
              >
                {l.code}
              </button>
            ))}
          </div>
          <button
            className="lc-run-btn"
            disabled={selected.size === 0 || state.phase === 'loading'}
            onClick={runCheck}
          >
            {state.phase === 'loading'
              ? <><RefreshCw size={11} className="fig-spin" /> Checking…</>
              : `Check ${selected.size} locale${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>

        {/* Results */}
        {state.phase === 'error' && (
          <div className="lc-error">{state.msg}</div>
        )}

        {state.phase === 'done' && (
          state.data.results.length === 0
            ? <div className="lc-empty">No text layers found in this frame.</div>
            : (
              <div className="lc-table-wrap">
                <table className="lc-table">
                  <thead>
                    <tr>
                      <th className="lc-th lc-th-name">Layer</th>
                      {locales.map(l => <th key={l} className="lc-th">{l}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.results.map(row => (
                      <tr key={row.id} className="lc-tr">
                        <td className="lc-td lc-td-name" title={row.original}>{row.name}</td>
                        {locales.map(locale => {
                          const r = row.locales[locale];
                          if (!r) return <td key={locale} className="lc-td" />;
                          const tip = [
                            STATUS_TITLE[r.status],
                            r.translated,
                            r.collidesWith?.length ? `Hits: ${r.collidesWith.join(', ')}` : '',
                            r.expandedH ? `Needs ${Math.round(r.expandedH)}px (has ${row.h}px)` : '',
                            r.isRtl ? 'RTL' : '',
                          ].filter(Boolean).join('\n');
                          return (
                            <td key={locale} className="lc-td" title={tip}>
                              <span className={`lc-status lc-status-${r.status}`}>
                                {STATUS_ICON[r.status]}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        )}

        {/* Legend */}
        {state.phase === 'done' && state.data.results.length > 0 && (
          <div className="lc-legend">
            <span className="lc-status lc-status-fit">✓</span> fits
            <span className="lc-status lc-status-overflow">↕</span> overflow
            <span className="lc-status lc-status-collision">✕</span> collision / frame
          </div>
        )}
      </div>
    </>
  );
}
