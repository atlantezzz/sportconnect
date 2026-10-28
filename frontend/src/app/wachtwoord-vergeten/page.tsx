"use client";

import { useState, type FormEvent } from "react";
import AuthCard from "@/components/AuthCard";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentMessage, setSentMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Er ging iets mis. Probeer het opnieuw.");
      setSentMessage(data?.detail ?? "Controleer je e-mail.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setSending(false);
    }
  }

  if (sentMessage) {
    return (
      <AuthCard title="Check je inbox" intro={sentMessage}>
        <div className="theme-muted-surface rounded-2xl border p-4 text-sm leading-6">
          <p className="font-semibold">Geen e-mail ontvangen?</p>
          <p className="mt-1 theme-muted">Kijk ook in je map met ongewenste e-mail. De link is een uur geldig.</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full page load to "/" on purpose (client-side navigation to "/" showed a 404, see CLAUDE.md) */}
        <a href="/" className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-600">
          Terug naar SportConnect
        </a>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Wachtwoord vergeten?" intro="Geen probleem. Vul je e-mailadres in en we sturen je een link om een nieuw wachtwoord in te stellen.">
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-semibold">
          E-mailadres
          <input
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="theme-field mt-2 w-full rounded-xl border px-3 py-3 font-normal"
            placeholder="jij@voorbeeld.nl"
          />
        </label>
        {error && <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm">{error}</p>}
        <button type="submit" disabled={sending} className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60">
          {sending ? "Versturen…" : "Stuur mij een herstellink"}
        </button>
        <p className="text-center text-sm theme-muted">
          Weet je het weer?{" "}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full page load to "/" on purpose (client-side navigation to "/" showed a 404, see CLAUDE.md) */}
          <a href="/" className="font-semibold text-emerald-600 hover:underline">Inloggen</a>
        </p>
      </form>
    </AuthCard>
  );
}
