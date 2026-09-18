import React, { useState } from 'react';
import { Building2, Link2, ScanLine, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient.js';
import { Field, inputClass, PrimaryButton } from '../../components/ui.jsx';
import { useToast } from '../../lib/toast.jsx';

export default function SetupOrganization({ onLinked }) {
  const [mode, setMode] = useState(null); // null | 'create' | 'join'

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ink px-6 safe-top safe-bottom">
      <div className="mb-8 flex items-center gap-2.5 text-paper">
        <div className="flex h-9 w-9 items-center justify-center border-2 border-amber">
          <ScanLine size={18} className="text-amber" />
        </div>
        <span className="text-lg font-bold tracking-tight">FieldTrace</span>
      </div>

      <div className="w-full max-w-sm border-2 border-line bg-paper p-6">
        {!mode && (
          <>
            <h1 className="text-lg font-bold text-ink">One more step</h1>
            <p className="mt-1 mb-6 text-sm text-ink-600">You're signed in, but not yet linked to an organization.</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setMode('create')}
                className="tap-target flex items-center gap-3 border-2 border-ink bg-ink px-4 py-3 text-left text-paper transition-transform hover:scale-[1.01]"
              >
                <Building2 size={18} className="text-amber shrink-0" />
                <span>
                  <span className="block font-semibold">Create a new organization</span>
                  <span className="block text-xs text-line">You're setting up FieldTrace for your company</span>
                </span>
              </button>
              <button
                onClick={() => setMode('join')}
                className="tap-target flex items-center gap-3 border-2 border-line bg-white px-4 py-3 text-left text-ink transition-colors hover:border-ink"
              >
                <Link2 size={18} className="text-ink-600 shrink-0" />
                <span>
                  <span className="block font-semibold">Join with your phone number</span>
                  <span className="block text-xs text-ink-600">Your admin already added you as staff</span>
                </span>
              </button>
            </div>
          </>
        )}

        {mode === 'create' && <CreateOrgForm onDone={onLinked} onBack={() => setMode(null)} />}
        {mode === 'join' && <JoinByPhoneForm onDone={onLinked} onBack={() => setMode(null)} />}
      </div>

      <button
        onClick={() => supabase.auth.signOut()}
        className="tap-target mt-6 flex items-center gap-1.5 text-sm text-line hover:text-paper"
      >
        <LogOut size={14} /> Sign out
      </button>
    </div>
  );
}

const PHONE_RE = /^\d{10}$/;

function CreateOrgForm({ onDone, onBack }) {
  const toast = useToast();
  const [orgName, setOrgName] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const errors = {
    orgName: touched.orgName && !orgName.trim() ? 'Organization name is required.' : null,
    fullName: touched.fullName && !fullName.trim() ? 'Your name is required.' : null,
    phone: touched.phone && phone.length > 0 && !PHONE_RE.test(phone) ? 'Enter a valid 10-digit phone number.' : null
  };
  const canSubmit = orgName.trim() && fullName.trim() && PHONE_RE.test(phone);

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched({ orgName: true, fullName: true, phone: true });
    if (!canSubmit) return;

    setSubmitting(true);
    const { error } = await supabase.rpc('ft_bootstrap_organization', {
      p_org_name: orgName.trim(),
      p_full_name: fullName.trim(),
      p_phone: phone
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    setSuccess(true);
    toast.success(`${orgName} is set up.`);
    setTimeout(onDone, 500);
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <CheckCircle2 size={32} className="text-signal-green" />
        <p className="font-semibold text-ink">{orgName} is ready</p>
        <p className="text-sm text-ink-600">Taking you to your dashboard&hellip;</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Field label="Organization name" hint="e.g. Novaspaces">
        <input
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, orgName: true }))}
          className={`${inputClass} ${errors.orgName ? 'border-signal-red' : ''}`}
          placeholder="Novaspaces"
          disabled={submitting}
        />
        {errors.orgName && <FieldError text={errors.orgName} />}
      </Field>
      <Field label="Your full name">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
          className={`${inputClass} ${errors.fullName ? 'border-signal-red' : ''}`}
          disabled={submitting}
        />
        {errors.fullName && <FieldError text={errors.fullName} />}
      </Field>
      <Field label="Your phone number" hint="10 digits — used to link field submissions to you">
        <input
          type="tel"
          inputMode="numeric"
          maxLength={10}
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
          className={`${inputClass} ${errors.phone ? 'border-signal-red' : ''}`}
          placeholder="9876543210"
          disabled={submitting}
        />
        {errors.phone && <FieldError text={errors.phone} />}
      </Field>
      <PrimaryButton type="submit" loading={submitting} disabled={submitting}>
        Create organization
      </PrimaryButton>
      <button type="button" onClick={onBack} disabled={submitting} className="text-center text-sm text-ink-600 underline disabled:opacity-50">
        Back
      </button>
    </form>
  );
}

function JoinByPhoneForm({ onDone, onBack }) {
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null); // { full_name, org_name, role } | null

  const phoneError = touched && phone.length > 0 && !PHONE_RE.test(phone) ? 'Enter a valid 10-digit phone number.' : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (!PHONE_RE.test(phone)) return;

    setSubmitting(true);
    const { data, error } = await supabase.rpc('ft_find_and_claim_by_phone', { p_phone: phone });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    setSuccess(data);
    toast.success(`Welcome, ${data.full_name} — linked to ${data.org_name}.`);
    setTimeout(onDone, 700);
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <CheckCircle2 size={32} className="text-signal-green" />
        <p className="font-semibold text-ink">Welcome, {success.full_name}</p>
        <p className="text-sm text-ink-600">
          Linked to <span className="font-medium text-ink">{success.org_name}</span> as {success.role}. Taking you to your dashboard&hellip;
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Field label="Your phone number" hint="The number your admin used when adding you as staff">
        <input
          type="tel"
          inputMode="numeric"
          maxLength={10}
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          onBlur={() => setTouched(true)}
          className={`${inputClass} ${phoneError ? 'border-signal-red' : ''}`}
          placeholder="9876543210"
          disabled={submitting}
        />
        {phoneError && <FieldError text={phoneError} />}
      </Field>
      <PrimaryButton type="submit" loading={submitting} disabled={submitting}>
        Join
      </PrimaryButton>
      <button type="button" onClick={onBack} disabled={submitting} className="text-center text-sm text-ink-600 underline disabled:opacity-50">
        Back
      </button>
    </form>
  );
}

function FieldError({ text }) {
  return (
    <span className="mt-1 flex items-center gap-1 text-xs text-signal-red">
      <AlertCircle size={12} /> {text}
    </span>
  );
}
