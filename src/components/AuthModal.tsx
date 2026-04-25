import { useState } from 'react';
import { X, Mail, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store';

type Step = 'input' | 'sent';

export function AuthModal() {
  const { setAuthModalOpen } = useStore();
  const [email, setEmail] = useState('');
  const [step, setStep]   = useState<Step>('input');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const close = () => setAuthModalOpen(false);

  const send = async () => {
    if (!email.trim() || !supabase) return;
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setStep('sent');
  };

  return (
    <div className="auth-backdrop" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="auth-card" onClick={e => e.stopPropagation()}>
        <div className="auth-header">
          <span className="auth-title">Sign in</span>
          <button className="fig-preview-icon-btn" onClick={close}><X size={14} /></button>
        </div>

        {step === 'input' ? (
          <>
            <p className="auth-hint">
              Enter your email — we'll send a magic link. No password needed.
            </p>
            <div className="auth-input-row">
              <Mail size={13} className="auth-input-icon" />
              <input
                className="auth-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(null); }}
                onKeyDown={e => { if (e.key === 'Enter') send(); }}
                autoFocus
              />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <div className="auth-actions">
              <button className="auth-btn-cancel" onClick={close}>Cancel</button>
              <button className="auth-btn-send" onClick={send} disabled={loading || !email.trim()}>
                {loading ? <Loader size={12} className="auth-spin" /> : null}
                Send magic link
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="auth-sent-icon"><Mail size={28} /></div>
            <p className="auth-sent-title">Check your email</p>
            <p className="auth-hint">
              We sent a link to <strong>{email}</strong>.<br />
              Click it to sign in — the tab will update automatically.
            </p>
            <div className="auth-actions">
              <button className="auth-btn-cancel" onClick={() => setStep('input')}>← Back</button>
              <button className="auth-btn-send" onClick={close}>Got it</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
