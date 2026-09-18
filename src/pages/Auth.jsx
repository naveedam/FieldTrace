import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ScanLine, Mail, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient.js';
import { Field, inputClass, PrimaryButton } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Auth() {
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({});
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const [justSignedIn, setJustSignedIn] = useState(false);

  const emailError = touched.email && !EMAIL_RE.test(email) ? 'Enter a valid email address.' : null;
  const passwordError =
    touched.password && mode === 'signup' && password.length > 0 && password.length < 6
      ? 'Password must be at least 6 characters.'
      : null;
  const canSubmit = EMAIL_RE.test(email) && (mode === 'signin' ? password.length > 0 : password.length >= 6);

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!canSubmit) return;

    setLoading(true);
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) return toast.error(error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : error.message);
      setJustSignedIn(true);
      setTimeout(() => navigate('/admin'), 400); // brief success flash before redirecting
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) return toast.error(error.message);
      if (data.session) {
        setJustSignedIn(true);
        setTimeout(() => navigate('/admin'), 400); // email confirmation off — straight in, setup screen takes it from here
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
        {justSignedIn ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2 size={32} className="text-signal-green" />
            <p className="font-semibold text-ink">You're in — one moment&hellip;</p>
          </div>
        ) : confirmSent ? (
          <div className="text-center">
            <Mail size={28} className="mx-auto mb-3 text-amber-600" />
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
                onClick={() => {
                  setMode('signin');
                  setTouched({});
                }}
                className={`flex-1 border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
                  mode === 'signin' ? 'border-amber text-ink' : 'border-transparent text-ink-600'
                }`}
              >
                Sign in
              </button>
              <button
                onClick={() => {
                  setMode('signup');
                  setTouched({});
                }}
                className={`flex-1 border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
                  mode === 'signup' ? 'border-amber text-ink' : 'border-transparent text-ink-600'
                }`}
              >
                Create account
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              <Field label="Email">
                <div className="relative">
                  <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-600" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                    className={`${inputClass} pl-9 ${emailError ? 'border-signal-red' : ''}`}
                    placeholder="you@company.com"
                    disabled={loading}
                  />
                </div>
                {emailError && (
                  <span className="mt-1 flex items-center gap-1 text-xs text-signal-red">
                    <AlertCircle size={12} /> {emailError}
                  </span>
                )}
              </Field>
              <Field label="Password">
                <div className="relative">
                  <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-600" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                    className={`${inputClass} pl-9 ${passwordError ? 'border-signal-red' : ''}`}
                    disabled={loading}
                  />
                </div>
                {passwordError ? (
                  <span className="mt-1 flex items-center gap-1 text-xs text-signal-red">
                    <AlertCircle size={12} /> {passwordError}
                  </span>
                ) : mode === 'signup' ? (
                  <span className="mt-1 block text-xs text-ink-600">At least 6 characters.</span>
                ) : null}
              </Field>
              <PrimaryButton type="submit" loading={loading} disabled={loading}>
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
