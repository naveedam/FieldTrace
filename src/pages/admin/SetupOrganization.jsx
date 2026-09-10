import React, { useState } from 'react';
import { Building2, Link2, ScanLine, LogOut } from 'lucide-react';
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
                className="tap-target flex items-center gap-3 border-2 border-ink bg-ink px-4 py-3 text-left text-paper"
              >
                <Building2 size={18} className="text-amber" />
                <span>
                  <span className="block font-semibold">Create a new organization</span>
                  <span className="block text-xs text-line">You're setting up FieldTrace for your company</span>
                </span>
              </button>
              <button
                onClick={() => setMode('join')}
                className="tap-target flex items-center gap-3 border-2 border-line bg-white px-4 py-3 text-left text-ink"
              >
                <Link2 size={18} className="text-ink-600" />
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

function CreateOrgForm({ onDone, onBack }) {
  const toast = useToast();
  const [orgName, setOrgName] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!orgName.trim() || !fullName.trim()) return toast.error('Organization name and your name are required.');
    if (!/^\d{10}$/.test(phone)) return toast.error('Enter a valid 10-digit phone number.');

    setSubmitting(true);
    const { error } = await supabase.rpc('ft_bootstrap_organization', {
      p_org_name: orgName.trim(),
      p_full_name: fullName.trim(),
      p_phone: phone
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(`${orgName} is set up.`);
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="Organization name" hint="e.g. Novaspaces">
        <input value={orgName} onChange={(e) => setOrgName(e.target.value)} className={inputClass} placeholder="Novaspaces" />
      </Field>
      <Field label="Your full name">
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Your phone number" hint="10 digits — used to link field submissions to you">
        <input
          type="tel"
          inputMode="numeric"
          maxLength={10}
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          className={inputClass}
          placeholder="9876543210"
        />
      </Field>
      <PrimaryButton type="submit" loading={submitting}>
        Create organization
      </PrimaryButton>
      <button type="button" onClick={onBack} className="text-center text-sm text-ink-600 underline">
        Back
      </button>
    </form>
  );
}

function JoinByPhoneForm({ onDone, onBack }) {
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!/^\d{10}$/.test(phone)) return toast.error('Enter a valid 10-digit phone number.');

    setSubmitting(true);
    const { data, error } = await supabase.rpc('ft_find_and_claim_by_phone', { p_phone: phone });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(`Welcome, ${data.full_name} — linked to ${data.org_name} as ${data.role}.`);
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="Your phone number" hint="The number your admin used when adding you as staff">
        <input
          type="tel"
          inputMode="numeric"
          maxLength={10}
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          className={inputClass}
          placeholder="9876543210"
        />
      </Field>
      <PrimaryButton type="submit" loading={submitting}>
        Join
      </PrimaryButton>
      <button type="button" onClick={onBack} className="text-center text-sm text-ink-600 underline">
        Back
      </button>
    </form>
  );
}
