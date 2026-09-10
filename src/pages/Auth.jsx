import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { supabase } from '../lib/supabaseClient.js';
import { Field, inputClass, PrimaryButton } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

export default function Auth() {
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) return toast.error(error.message);
      navigate('/admin');
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) return toast.error(error.message);
      if (data.session) {
        navigate('/admin'); // email confirmation off — straight in, setup screen takes it from here
      } else {
        setConfirmSent(true); // confirmation required — nothing lost, setup happens after they confirm and sign in
      }
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ink px-6 safe-top safe-bottom">
      <div className="mb-8 flex items-center gap-2.5 text-paper">
        <div className="flex h-9 w-9 items-center justify-center border-2 border-amber">
          <ScanLine size={18} className="text-amber" />
        </div>
        <span className="text-lg font-bold tracking-tight">FieldTrace</span>
      </div>

      <div className="w-full max-w-sm border-2 border-line bg-paper p-6">
        {confirmSent ? (
          <div className="text-center">
            <h1 className="text-lg font-bold text-ink">Check your inbox</h1>
            <p className="mt-2 text-sm text-ink-600">
              We sent a confirmation link to <span className="font-medium text-ink">{email}</span>. Once you confirm,
              come back and sign in — you'll finish setting up your organization right after.
            </p>
            <button
              onClick={() => {
                setConfirmSent(false);
                setMode('signin');
              }}
              className="mt-4 text-sm font-semibold text-signal-blue underline"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6 flex border-b-2 border-line">
              <button
                onClick={() => setMode('signin')}
                className={`flex-1 border-b-2 pb-2.5 text-sm font-semibold ${
                  mode === 'signin' ? 'border-amber text-ink' : 'border-transparent text-ink-600'
                }`}
              >
                Sign in
              </button>
              <button
                onClick={() => setMode('signup')}
                className={`flex-1 border-b-2 pb-2.5 text-sm font-semibold ${
                  mode === 'signup' ? 'border-amber text-ink' : 'border-transparent text-ink-600'
                }`}
              >
                Create account
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Field label="Email">
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Password" hint={mode === 'signup' ? 'At least 6 characters' : undefined}>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <PrimaryButton type="submit" loading={loading}>
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </PrimaryButton>
            </form>

            {mode === 'signup' && (
              <p className="mt-4 text-center text-xs text-ink-600">
                Next step after this: create your organization, or join one you were invited to.
              </p>
            )}
          </>
        )}
      </div>

      <Link to="/" className="mt-6 text-sm text-line hover:text-paper">
        &larr; Back to FieldTrace
      </Link>
    </div>
  );
}
