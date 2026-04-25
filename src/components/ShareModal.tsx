import { useState, useEffect } from 'react';
import { Link, Copy, Trash2, Eye, Edit3, X } from 'lucide-react';
import { useStore } from '../store';
import { getAuthHeaders } from '../lib/supabase';

interface ShareLink {
  id: string;
  token: string;
  permission: 'view' | 'edit';
  created_at: string;
  access_count: number;
  last_accessed_at: string | null;
}

export function ShareModal({ flowId, onClose }: { flowId: string; onClose: () => void }) {
  const { flows } = useStore();
  const flow = flows.find(f => f.id === flowId) ?? flows[0];
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<'view' | 'edit' | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetchShares();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchShares() {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/share?flowId=${encodeURIComponent(flow.id)}`, { headers });
      if (res.ok) setShares(await res.json() as ShareLink[]);
    } finally {
      setLoading(false);
    }
  }

  async function createShare(permission: 'view' | 'edit') {
    setCreating(permission);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ flowId: flow.id, permission }),
      });
      if (res.ok) await fetchShares();
    } finally {
      setCreating(null);
    }
  }

  async function revokeShare(token: string) {
    const headers = await getAuthHeaders();
    await fetch(`/api/share?token=${encodeURIComponent(token)}`, {
      method: 'DELETE',
      headers,
    });
    setShares(s => s.filter(sh => sh.token !== token));
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/?s=${token}`);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="sh-backdrop" onClick={onClose}>
      <div className="sh-card" onClick={e => e.stopPropagation()}>
        <div className="sh-header">
          <Link size={14} />
          <span>Share · {flow.name}</span>
          <button className="sh-close" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="sh-body">
          {loading ? (
            <div className="sh-empty">Loading…</div>
          ) : shares.length === 0 ? (
            <div className="sh-empty">No share links yet</div>
          ) : (
            <div className="sh-list">
              {shares.map(sh => (
                <div key={sh.token} className="sh-row">
                  <span className={`sh-badge sh-badge-${sh.permission}`}>
                    {sh.permission === 'view' ? <Eye size={10} /> : <Edit3 size={10} />}
                    {sh.permission}
                  </span>
                  <span className="sh-token" title={sh.token}>{sh.token.slice(0, 10)}…</span>
                  {sh.access_count > 0 && (
                    <span className="sh-count">{sh.access_count}×</span>
                  )}
                  <button
                    className="sh-copy"
                    title="Copy link"
                    onClick={() => copyLink(sh.token)}
                  >
                    {copied === sh.token ? '✓' : <Copy size={11} />}
                  </button>
                  <button
                    className="sh-revoke"
                    title="Revoke link"
                    onClick={() => revokeShare(sh.token)}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sh-footer">
          <button
            className="sh-create sh-create-view"
            disabled={!!creating}
            onClick={() => createShare('view')}
          >
            <Eye size={11} /> View link
          </button>
          <button
            className="sh-create sh-create-edit"
            disabled={!!creating}
            onClick={() => createShare('edit')}
          >
            <Edit3 size={11} /> Edit link
          </button>
        </div>
      </div>
    </div>
  );
}
