"use client";

import { useEffect, type ReactNode } from "react";
import Image from "next/image";

// Centered card for the standalone account pages (password forgotten / reset).
export default function AuthCard({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  useEffect(() => {
    try {
      document.documentElement.dataset.theme = localStorage.getItem("sportconnect-theme") === "dark" ? "dark" : "light";
    } catch {}
  }, []);

  return (
    <main className="auth-card-page theme-page grid min-h-screen place-items-center px-4 py-10">
      <section className="theme-surface w-full max-w-md overflow-hidden rounded-3xl border shadow-xl" aria-labelledby="auth-card-title">
        <div className="auth-card-bar h-1.5" aria-hidden="true" />
        <div className="p-6 sm:p-8">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full page load to "/" on purpose (client-side navigation to "/" showed a 404, see CLAUDE.md) */}
          <a href="/" aria-label="Naar SportConnect" className="auth-card-logo inline-block rounded-xl bg-white px-2 py-1">
            <Image src="/email-logo.png" alt="SportConnect" width={200} height={44} priority />
          </a>
          <h1 id="auth-card-title" className="mt-6 text-2xl font-black tracking-tight">{title}</h1>
          {intro && <p className="mt-2 text-sm leading-6 theme-muted">{intro}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </section>
    </main>
  );
}
