"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export type SiteHeaderProps = {
  theme: "light" | "dark";
  onThemeToggle: () => void;
  userName?: string | null;
  showMapToggle?: boolean;
  mapOnly?: boolean;
  onMapToggle?: () => void;
  onLogin?: () => void;
  onRegister?: () => void;
  onLogout?: () => Promise<void> | void;
  onHome?: () => void;
};

type Notice = { id: string; title: string; body: string; createdAt?: string; read?: boolean; activityId?: number | null; targetUrl?: string | null; };
type ChatPreview = { key: string; title: string; subtitle: string; preview: string; href: string; timestamp?: string; kind: "group" | "private" };

export default function SiteHeader({ theme, onThemeToggle, userName, showMapToggle = false, mapOnly = false, onMapToggle, onLogin, onRegister, onLogout, onHome }: SiteHeaderProps) {
  const router = useRouter();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [chatHubOpen, setChatHubOpen] = useState(false);
  const [chatPreviews, setChatPreviews] = useState<ChatPreview[]>([]);
  const [chatHubLoading, setChatHubLoading] = useState(false);
  const [chatHubError, setChatHubError] = useState("");
  const chatHubRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<Notice[]>([]);
  const notificationRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && Array.isArray(data)) setNotifications(data);
      } catch (error) {
        console.error("Notificaties laden mislukt:", error);
      }
    }

    void loadNotifications();

  const refreshInterval = window.setInterval(() => {
    if (!document.hidden) void loadNotifications();
  }, 15000);

  function refreshWhenVisible() {
    if (!document.hidden) void loadNotifications();
  }

  document.addEventListener("visibilitychange", refreshWhenVisible);

    function closeOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOutside);
    return () => {
      cancelled = true;
      document.removeEventListener("mousedown", closeOutside);
    };
  }, []);

  useEffect(() => {
    if (!userName || !chatHubOpen) return;
    let cancelled = false;
    async function loadChatPreviews() {
      setChatHubLoading(true); setChatHubError("");
      try {
        const [activityResponse, friendResponse] = await Promise.all([
          fetch("/api/activities", { cache: "no-store" }),
          fetch("/api/friends", { cache: "no-store" }),
        ]);
        const activityRows = activityResponse.ok ? await activityResponse.json() : [];
        const friendData = friendResponse.ok ? await friendResponse.json() : { friends: [] };
        const activities = Array.isArray(activityRows) ? activityRows : [];
        const friends = Array.isArray(friendData?.friends) ? friendData.friends : [];
        const jobs: Promise<ChatPreview | null>[] = [];
        for (const activity of activities) {
          const id = Number(activity.activiteit_id);
          if (!Number.isFinite(id) || !id) continue;
          const title = String(activity.titel || "Groepschat");
          const subtitle = [activity.sport, activity.woonplaats].filter(Boolean).join(" · ") || "Groepschat";
          jobs.push(fetch(`/api/activities/${id}/chat/messages?limit=1`, { cache: "no-store" }).then(async r => {
            if (!r.ok) return null;
            const data = await r.json(); const rows = Array.isArray(data.messages) ? data.messages : [];
            const latest = rows[rows.length - 1];
            return { key: `group-${id}`, title, subtitle, preview: latest ? `${latest.naam || latest.afzender_naam || "Deelnemer"}: ${latest.inhoud || latest.bericht || "Bericht"}` : "Nog geen berichten — start het gesprek", href: `/activities/${id}/chat`, timestamp: latest?.verzonden_op, kind: "group" as const };
          }).catch(() => null));
        }
        for (const friend of friends) {
          const id = Number(friend.gebruiker_id);
          if (!Number.isFinite(id) || !id) continue;
          jobs.push(fetch(`/api/messages/${id}?after_id=0`, { cache: "no-store" }).then(async r => {
            if (!r.ok) return null;
            const data = await r.json(); const rows = Array.isArray(data.messages) ? data.messages : [];
            const latest = rows[rows.length - 1];
            return { key: `private-${id}`, title: String(friend.naam || "Vriend"), subtitle: "Privébericht", preview: latest ? `${latest.afzender_naam || latest.naam || "Bericht"}: ${latest.inhoud || latest.bericht || "Bericht"}` : "Begin een privégesprek", href: `/messages/${id}`, timestamp: latest?.verzonden_op, kind: "private" as const };
          }).catch(() => null));
        }
        const results = (await Promise.all(jobs)).filter((x): x is ChatPreview => x !== null);
        results.sort((a,b) => (b.timestamp ? Date.parse(b.timestamp) : 0) - (a.timestamp ? Date.parse(a.timestamp) : 0));
        if (!cancelled) setChatPreviews(results);
      } catch { if (!cancelled) setChatHubError("Chats konden niet worden geladen. Probeer het opnieuw."); }
      finally { if (!cancelled) setChatHubLoading(false); }
    }
    loadChatPreviews();
    return () => { cancelled = true; };
  }, [userName, chatHubOpen]);

  function formatNoticeDate(value?: string) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("nl-NL", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function home() { if (onHome) onHome(); else router.push("/"); }
  async function logout() { if (onLogout) await onLogout(); else { try { await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); } finally { router.push("/"); } } }

  return <header className="site-header relative z-50 flex h-[72px] shrink-0 items-center justify-between border-b px-4 sm:px-6 md:px-8">
    <button type="button" onClick={home} className="flex min-w-0 items-center gap-2.5" aria-label="Naar de SportConnect-hoofdpagina">
      <Image src="/sportconnect-logo.png" alt="SportConnect" width={360} height={120} priority className="h-16 w-auto max-w-[min(55vw,380px)] object-contain" />
    </button>
    <div className="flex items-center gap-1.5 sm:gap-2.5">
      <button type="button" onClick={onThemeToggle} className="theme-toggle rounded-full border px-2.5 py-2 text-xs font-semibold transition hover:-translate-y-px sm:px-3 sm:text-sm" aria-label={theme === "light" ? "Donkere modus inschakelen" : "Lichte modus inschakelen"} title={theme === "light" ? "Donkere modus" : "Lichte modus"}>{theme === "light" ? "☾" : "☀"}<span className="ml-1.5 hidden sm:inline">{theme === "light" ? "Donker" : "Licht"}</span></button>
      {userName && showMapToggle && onMapToggle && <button type="button" onClick={onMapToggle} aria-pressed={mapOnly} className={`map-mode-toggle inline-flex rounded-full border px-2.5 py-2 text-xs font-semibold transition hover:-translate-y-px sm:px-3 sm:text-sm ${mapOnly ? "bg-emerald-700 text-white" : ""}`}>{mapOnly ? "▤" : "▦"}<span className="ml-1.5 hidden sm:inline">{mapOnly ? "Lijst tonen" : "Alleen kaart"}</span></button>}
      {userName && <>
        <div ref={notificationRef} className="relative">
          <button type="button" onClick={() => setNotificationsOpen((open) => !open)} aria-expanded={notificationsOpen} aria-label="Meldingen openen" title="Meldingen" className="relative grid h-9 w-9 place-items-center rounded-full border transition hover:-translate-y-px hover:bg-emerald-700/20">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            {notifications.some((n) => !n.read) && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[var(--header)]" />}
          </button>
          {notificationsOpen && <div className="notification-dropdown theme-surface absolute right-0 top-11 z-[100] w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-2xl border shadow-2xl" role="dialog" aria-label="Meldingen">
            <div className="flex items-center justify-between border-b p-4"><div><h2 className="font-bold">Meldingen</h2><p className="text-xs theme-muted">Updates van SportConnect</p></div><button type="button" onClick={async () => {
              try {
                const response = await fetch("/api/notifications", { method: "POST" });
                if (response.ok) {
                  setNotifications((items) => items.map((n) => ({ ...n, read: true })));
                }
              } catch (error) {
                console.error("Meldingen bijwerken mislukt:", error);
              }
            }} className="text-xs font-semibold text-emerald-600">Alles gelezen</button></div>
            <div className="max-h-80 overflow-y-auto">{notifications.length ? notifications.map((n) => <button
              type="button"
              key={n.id}
              onClick={() => {
                setNotificationsOpen(false);
                const target = n.targetUrl
                  || (n.activityId ? `/activities/${n.activityId}/chat` : "/friends");
                router.push(target);
              }}
              className={`block w-full border-b p-4 text-left transition hover:bg-emerald-700/10 last:border-b-0 ${n.read ? "opacity-70" : ""}`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="text-sm font-semibold">{n.title}</span>
                <span className="text-xs text-emerald-600" aria-hidden="true">↗</span>
              </span>
              <span className="mt-1 block text-sm theme-muted">{n.body}</span>
              {n.createdAt && <time className="mt-2 block text-xs theme-muted">{formatNoticeDate(n.createdAt)}</time>}
            </button>) : <div className="p-6 text-center"><span className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-emerald-700/10 text-emerald-600">♧</span><p className="text-sm font-semibold">Je bent helemaal bij</p><p className="mt-1 text-xs theme-muted">Nieuwe meldingen verschijnen hier.</p></div>}</div>
          </div>}
        </div>
        <button type="button" onClick={() => router.push("/friends")} className="grid h-9 w-9 place-items-center rounded-full border transition hover:-translate-y-px hover:bg-emerald-700/20" aria-label="Vrienden openen" title="Vrienden"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c.5-3.4 2.5-5 6-5s5.5 1.6 6 5M15 15c3.3-.3 5.2 1.3 5.7 4" strokeLinecap="round"/></svg></button>
        <button type="button" onClick={() => router.push("/profile")} className="grid h-9 w-9 place-items-center rounded-full border transition hover:-translate-y-px hover:bg-emerald-700/20" aria-label="Profiel openen" title="Profiel"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-3.4 3-5 7-5s6.3 1.6 7 5" strokeLinecap="round"/></svg></button>
        <button type="button" onClick={logout} className="rounded-lg border px-3 py-2 text-xs font-semibold transition hover:bg-emerald-700/20 sm:px-4 sm:text-sm">Uitloggen</button>
      </>}
      {!userName && <><button type="button" onClick={onLogin} className="rounded-lg border px-3 py-2 text-xs font-semibold transition hover:bg-emerald-700/20 sm:px-4 sm:text-sm">Inloggen</button><button type="button" onClick={onRegister} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:-translate-y-px hover:bg-emerald-600 sm:px-4 sm:text-sm">Registreren</button></>}
    </div>
    {userName && <div ref={chatHubRef} className="chat-hub-root">
      {chatHubOpen && <section className="chat-hub-panel theme-surface" role="dialog" aria-label="Alle chats">
        <div className="chat-hub-heading"><div><h2>Chats</h2><p>Groepsgesprekken en privéberichten</p></div><button type="button" onClick={() => setChatHubOpen(false)} aria-label="Chats sluiten">×</button></div>
        <div className="chat-hub-list">
          {chatHubLoading && <p className="chat-hub-empty">Chats en laatste berichten laden…</p>}
          {!chatHubLoading && chatHubError && <p className="chat-hub-empty">{chatHubError}</p>}
          {!chatHubLoading && !chatHubError && chatPreviews.length === 0 && <p className="chat-hub-empty">Nog geen chats gevonden. Doe mee aan een activiteit of stuur een vriend een privébericht.</p>}
          {!chatHubLoading && chatPreviews.map(chat => <button type="button" key={chat.key} className="chat-hub-item" onClick={() => { setChatHubOpen(false); router.push(chat.href); }}>
            <span className={`chat-hub-avatar ${chat.kind === "group" ? "is-group" : "is-private"}`} aria-hidden="true">{chat.kind === "group" ? "▣" : chat.title.slice(0,1).toUpperCase()}</span>
            <span className="chat-hub-copy"><span className="chat-hub-title">{chat.title}</span><span className="chat-hub-subtitle">{chat.subtitle}</span><span className="chat-hub-preview">{chat.preview}</span></span>
            <span className="chat-hub-kind">{chat.kind === "group" ? "Groep" : "Privé"}</span>
          </button>)}
        </div>
        <div className="chat-hub-footer"><button type="button" onClick={() => { setChatHubOpen(false); router.push("/friends"); }}>Vrienden en privéberichten <span>→</span></button></div>
      </section>}
      <button type="button" className="chat-hub-button" onClick={() => setChatHubOpen(v => !v)} aria-expanded={chatHubOpen} aria-label={chatHubOpen ? "Chats sluiten" : "Alle chats openen"} title="Alle chats"><svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-5.5A7.5 7.5 0 1 1 20 11.5Z" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 11h.01M12 11h.01M16 11h.01" strokeWidth="2.5" strokeLinecap="round"/></svg></button>
    </div>}
  </header>;
}
