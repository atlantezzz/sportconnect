"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { sportEmoji } from "@/data/activities";

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

type Notice = { id: string; type?: string; title: string; body: string; createdAt?: string; read?: boolean; activityId?: number | null; targetUrl?: string | null; };
type ChatOverviewRow = { sleutel: string; soort: "groep" | "prive"; sport: string | null; titel: string; subtitel: string; geannuleerd: boolean; href: string; laatste_bericht: { afzender_naam: string; inhoud: string; verzonden_op: string } | null };
type ChatFilter = "all" | "group" | "private";

const CHAT_NOTIFICATION_TYPES = new Set(["group_chat", "private_messages"]);

const iconProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };

function formatNoticeDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

// "14:05" today, "Gisteren" yesterday, otherwise "3 nov".
function formatChatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  }
  if (date.toDateString() === yesterday.toDateString()) return "Gisteren";
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" }).format(date);
}

// Two overlapping speech bubbles: group chats and private messages.
function ChatIcon() {
  return (
    <svg {...iconProps} className="chat-fab-icon chat-fab-icon-bubbles h-7 w-7" strokeWidth={1.7}>
      <path d="M15.5 8.5h2A3.5 3.5 0 0 1 21 12v2.6a3.4 3.4 0 0 1-1 2.4V20l-2.6-1.6h-3.9a3.5 3.5 0 0 1-3.2-2.1" opacity=".65" />
      <path d="M3 6.5A3.5 3.5 0 0 1 6.5 3h6A3.5 3.5 0 0 1 16 6.5v3.2a3.5 3.5 0 0 1-3.5 3.5H8.4L5 15.6v-2.8a3.5 3.5 0 0 1-2-3.1Z" fill="currentColor" fillOpacity=".18" />
      <path d="M7 7.4h5M7 9.9h3" />
    </svg>
  );
}

export default function SiteHeader({ theme, onThemeToggle, userName, showMapToggle = false, mapOnly = false, onMapToggle, onLogin, onRegister, onLogout, onHome }: SiteHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [chatHubOpen, setChatHubOpen] = useState(false);
  const [chats, setChats] = useState<ChatOverviewRow[]>([]);
  const [chatHubLoading, setChatHubLoading] = useState(false);
  const [chatHubError, setChatHubError] = useState("");
  const [chatFilter, setChatFilter] = useState<ChatFilter>("all");
  const chatHubRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<Notice[]>([]);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Close the notification list and chat panel on an outside click or Escape.
  useEffect(() => {
    function closeOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) setNotificationsOpen(false);
      if (chatHubRef.current && !chatHubRef.current.contains(event.target as Node)) setChatHubOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") { setNotificationsOpen(false); setChatHubOpen(false); }
    }
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  // Poll notifications only while logged in, and only when the tab is visible.
  useEffect(() => {
    if (!userName) return;
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
    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [userName]);

  async function toggleChatHub() {
    if (chatHubOpen) { setChatHubOpen(false); return; }
    setChatHubOpen(true);
    setChatHubLoading(true);
    setChatHubError("");
    try {
      // One request for all group chats and friends, each with its latest message.
      const response = await fetch("/api/chats", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data: { chats?: ChatOverviewRow[] } = await response.json();
      setChats(data.chats ?? []);
    } catch {
      setChatHubError("Chats konden niet worden geladen. Probeer het opnieuw.");
    } finally {
      setChatHubLoading(false);
    }
  }

  function home() { if (onHome) onHome(); else window.location.href = "/"; }
  async function logout() { if (onLogout) await onLogout(); else { try { await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); } finally { window.location.href = "/"; } } }

  const unreadNotifications = notifications.filter((n) => !n.read).length;
  const unreadChats = notifications.filter((n) => !n.read && n.type && CHAT_NOTIFICATION_TYPES.has(n.type)).length;
  const visibleChats = chats.filter((chat) => chatFilter === "all" || (chatFilter === "group" ? chat.soort === "groep" : chat.soort === "prive"));
  const initial = userName?.trim().charAt(0).toUpperCase() || "?";

  return <header className="site-header relative z-50 flex h-16 shrink-0 items-center justify-between gap-3 border-b px-3 sm:px-6 md:px-8">
    <button type="button" onClick={home} className="site-logo flex min-w-0 items-center rounded-lg" aria-label="Naar de SportConnect-hoofdpagina">
      {/* Runner mark on phones, full logo from sm up. */}
      <Image src="/sportconnect-mark.png" alt="SportConnect" width={160} height={160} priority className="h-10 w-10 sm:hidden" />
      <Image src="/sportconnect-logo-light.png" alt="SportConnect" width={720} height={157} priority className="hidden h-9 w-auto object-contain sm:block" />
    </button>

    <nav className="site-header-nav flex items-center gap-1 sm:gap-2" aria-label="Hoofdmenu">
      <button type="button" onClick={onThemeToggle} className="header-icon-button" aria-label={theme === "light" ? "Donkere modus inschakelen" : "Lichte modus inschakelen"} title={theme === "light" ? "Donkere modus" : "Lichte modus"}>
        {theme === "light"
          ? <svg {...iconProps} className="h-5 w-5"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>
          : <svg {...iconProps} className="h-5 w-5"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>}
      </button>

      {userName && showMapToggle && onMapToggle && (
        <button type="button" onClick={onMapToggle} aria-pressed={mapOnly} className={`header-pill ${mapOnly ? "is-active" : ""}`} title={mapOnly ? "Lijst tonen" : "Alleen kaart"}>
          {mapOnly
            ? <svg {...iconProps} className="h-4 w-4"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>
            : <svg {...iconProps} className="h-4 w-4"><path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Zm0 0v13m6-10.5v13" /></svg>}
          <span className="hidden sm:inline">{mapOnly ? "Lijst tonen" : "Alleen kaart"}</span>
        </button>
      )}

      {userName && <>
        <div ref={notificationRef} className="relative">
          <button type="button" onClick={() => setNotificationsOpen((open) => !open)} aria-expanded={notificationsOpen} aria-label={unreadNotifications ? `Meldingen openen, ${unreadNotifications} ongelezen` : "Meldingen openen"} title="Meldingen" className="header-icon-button">
            <svg {...iconProps} className="h-5 w-5"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
            {unreadNotifications > 0 && <span className="header-badge">{unreadNotifications > 9 ? "9+" : unreadNotifications}</span>}
          </button>
          {notificationsOpen && <div className="notification-dropdown theme-surface absolute right-0 top-12 z-[100] w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-2xl border shadow-2xl" role="dialog" aria-label="Meldingen">
            <div className="flex items-center justify-between border-b p-4"><div><h2 className="font-bold">Meldingen</h2><p className="text-xs theme-muted">Updates van SportConnect</p></div><button type="button" onClick={async () => {
              try {
                const response = await fetch("/api/notifications/read-all", { method: "POST" });
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
            </button>) : <div className="p-6 text-center"><span className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-emerald-700/10 text-emerald-600">✓</span><p className="text-sm font-semibold">Je bent helemaal bij</p><p className="mt-1 text-xs theme-muted">Nieuwe meldingen verschijnen hier.</p></div>}</div>
          </div>}
        </div>

        <button type="button" onClick={() => router.push("/friends")} className={`header-icon-button ${pathname === "/friends" ? "is-active" : ""}`} aria-current={pathname === "/friends" ? "page" : undefined} aria-label="Vrienden openen" title="Vrienden">
          <svg {...iconProps} className="h-5 w-5"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c.5-3.4 2.5-5 6-5s5.5 1.6 6 5M15 15c3.3-.3 5.2 1.3 5.7 4" /></svg>
        </button>
        <button type="button" onClick={() => router.push("/profile")} className={`header-avatar ${pathname === "/profile" ? "is-active" : ""}`} aria-current={pathname === "/profile" ? "page" : undefined} aria-label={`Profiel van ${userName} openen`} title="Profiel">
          {initial}
        </button>
        <button type="button" onClick={logout} className="header-logout" aria-label="Uitloggen" title="Uitloggen">
          <svg {...iconProps} className="h-[18px] w-[18px] shrink-0"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" /></svg>
          <span className="hidden lg:inline">Uitloggen</span>
        </button>
      </>}

      {!userName && <>
        <button type="button" onClick={onLogin} className="header-pill">Inloggen</button>
        <button type="button" onClick={onRegister} className="header-pill is-primary">Registreren</button>
      </>}
    </nav>

    {userName && <div ref={chatHubRef} className="chat-hub-root">
      {chatHubOpen && <section className="chat-hub-panel theme-surface" role="dialog" aria-label="Chats">
        <div className="chat-hub-heading">
          <div><h2>Chats</h2><p>{chats.length ? `${chats.length} gesprekken` : "Groepsgesprekken en privéberichten"}</p></div>
          <button type="button" onClick={() => setChatHubOpen(false)} aria-label="Chats sluiten">
            <svg {...iconProps} className="h-5 w-5"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="chat-hub-tabs" role="tablist" aria-label="Chats filteren">
          {([["all", "Alles"], ["group", "Groepen"], ["private", "Privé"]] as const).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={chatFilter === value} className={chatFilter === value ? "is-active" : ""} onClick={() => setChatFilter(value)}>{label}</button>
          ))}
        </div>
        <div className="chat-hub-list">
          {chatHubLoading && <p className="chat-hub-empty">Chats laden…</p>}
          {!chatHubLoading && chatHubError && <p className="chat-hub-empty">{chatHubError}</p>}
          {!chatHubLoading && !chatHubError && visibleChats.length === 0 && (
            <p className="chat-hub-empty">{chatFilter === "private" ? "Nog geen vrienden om mee te chatten." : "Nog geen chats. Doe mee aan een activiteit of stuur een vriend een bericht."}</p>
          )}
          {!chatHubLoading && visibleChats.map((chat) => {
            const last = chat.laatste_bericht;
            const sender = last ? (last.afzender_naam === userName ? "Jij" : last.afzender_naam) : "";
            return <button type="button" key={chat.sleutel} className="chat-hub-item" onClick={() => { setChatHubOpen(false); router.push(chat.href); }}>
              <span className={`chat-hub-avatar ${chat.soort === "groep" ? "is-group" : ""}`} aria-hidden="true">
                {chat.soort === "groep" ? (sportEmoji[chat.sport ?? ""] ?? "👥") : chat.titel.trim().charAt(0).toUpperCase()}
              </span>
              <span className="chat-hub-copy">
                <span className="chat-hub-row"><span className="chat-hub-title">{chat.titel}</span>{last && <time className="chat-hub-time">{formatChatTime(last.verzonden_op)}</time>}</span>
                <span className="chat-hub-preview">{last ? <><strong>{sender}:</strong> {last.inhoud}</> : chat.soort === "groep" ? "Nog geen berichten — start het gesprek" : "Begin een privégesprek"}</span>
                <span className="chat-hub-subtitle">{chat.subtitel}{chat.geannuleerd && <span className="chat-hub-cancelled">Geannuleerd</span>}</span>
              </span>
            </button>;
          })}
        </div>
        <div className="chat-hub-footer"><button type="button" onClick={() => { setChatHubOpen(false); router.push("/friends"); }}>Vrienden en privéberichten <span aria-hidden="true">→</span></button></div>
      </section>}
      <button type="button" className={`chat-fab ${chatHubOpen ? "is-open" : ""}`} onClick={() => void toggleChatHub()} aria-expanded={chatHubOpen} aria-label={chatHubOpen ? "Chats sluiten" : unreadChats ? `Chats openen, ${unreadChats} nieuwe berichten` : "Chats openen"} title="Chats">
        <ChatIcon />
        <svg {...iconProps} className="chat-fab-icon chat-fab-icon-close h-6 w-6" strokeWidth={2.2}><path d="M6 6l12 12M18 6 6 18" /></svg>
        {unreadChats > 0 && !chatHubOpen && <span className="chat-fab-badge">{unreadChats > 9 ? "9+" : unreadChats}</span>}
      </button>
    </div>}
  </header>;
}
