"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import AuthCard from "@/components/AuthCard";

function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError("");
    if (password.length < 8) {
      setError("Je wachtwoord moet minimaal 8 tekens bevatten.");
      return;
    }
    if (password !== confirmation) {
      setError("De wachtwoorden komen niet overeen.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, wachtwoord: password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Je wachtwoord kon niet worden gewijzigd.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Je wachtwoord kon niet worden gewijzigd.");
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return (
      <AuthCard title="Deze link werkt niet" intro="De herstellink is onvolledig. Vraag een nieuwe link aan; die is een uur geldig.">
        <a href="/wachtwoord-vergeten" className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-600">
          Nieuwe link aanvragen
        </a>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Je wachtwoord is gewijzigd" intro="Je bent nu ingelogd. Op je andere apparaten ben je voor de zekerheid uitgelogd.">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full page load to "/" on purpose (client-side navigation to "/" showed a 404, see CLAUDE.md) */}
        <a href="/" className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-600">
          Naar SportConnect →
        </a>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Kies een nieuw wachtwoord" intro="Gebruik minimaal 8 tekens. Na het opslaan word je automatisch ingelogd.">
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-semibold">
          Nieuw wachtwoord
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="theme-field mt-2 w-full rounded-xl border px-3 py-3 font-normal"
          />
        </label>
        <label className="block text-sm font-semibold">
          Herhaal nieuw wachtwoord
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="theme-field mt-2 w-full rounded-xl border px-3 py-3 font-normal"
          />
        </label>
        {error && (
          <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm">
            {error}{" "}
            {error.includes("Vraag een nieuwe link aan") && <a href="/wachtwoord-vergeten" className="font-semibold underline">Nieuwe link aanvragen</a>}
          </p>
        )}
        <button type="submit" disabled={saving} className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? "Opslaan…" : "Wachtwoord opslaan"}
        </button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="theme-page grid min-h-screen place-items-center"><p className="text-sm theme-muted">Laden…</p></main>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
