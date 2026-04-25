import { useState } from 'react';
import { CloudUpload, Trash2, Loader } from 'lucide-react';
import type { Flow } from '../types';
import { claimFlowsRemote, loadFlowsRemote } from '../storage';
import { clearLocal } from '../storage';
import { useStore } from '../store';

interface Props {
  localFlows: Flow[];
  onDone: (cloudFlows: Flow[] | null) => void;
}

export function ClaimModal({ localFlows, onDone }: Props) {
  const { user } = useStore();
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    await claimFlowsRemote(localFlows);
    const cloud = await loadFlowsRemote();
    clearLocal();
    setLoading(false);
    onDone(cloud);
  };

  const handleDiscard = async () => {
    setLoading(true);
    const cloud = await loadFlowsRemote();
    clearLocal();
    setLoading(false);
    onDone(cloud);
  };

  return (
    <div className="auth-backdrop">
      <div className="auth-card" onClick={e => e.stopPropagation()}>
        <div className="auth-header">
          <span className="auth-title">Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}!</span>
        </div>
        <p className="auth-hint">
          You have <strong>{localFlows.length} local flow{localFlows.length > 1 ? 's' : ''}</strong> from before signing in.
          Save them to your cloud account?
        </p>
        <ul className="claim-list">
          {localFlows.map(f => (
            <li key={f.id} className="claim-item">{f.name || 'Untitled'}</li>
          ))}
        </ul>
        <div className="auth-actions">
          <button className="auth-btn-cancel" onClick={handleDiscard} disabled={loading}>
            {loading ? <Loader size={12} className="auth-spin" /> : <Trash2 size={12} />}
            Discard local
          </button>
          <button className="auth-btn-send" onClick={handleSave} disabled={loading}>
            {loading ? <Loader size={12} className="auth-spin" /> : <CloudUpload size={12} />}
            Save to cloud
          </button>
        </div>
      </div>
    </div>
  );
}
