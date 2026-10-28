"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";

type Activity = {
  activiteit_id: number;
  titel: string;
  starttijd: string | null;
  locatie_naam: string | null;
  woonplaats: string | null;
  status: string | null;
  maker_id?: number;
};

type ChatMessage = {
  bericht_id: number;
  inhoud: string;
  verzonden_op: string | null;
  gebruiker_id: number;
  afzender_naam: string;
};

function errorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

function formatDate(value: string | null) {
  if (!value) return "Tijd onbekend";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tijd onbekend";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function ActivityChatContent() {
  const params = useParams<{ activityId: string }>();
  const router = useRouter();
  const activityId = params.activityId;
  const [activity, setActivity] = useState<Activity | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userId, setUserId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const lastMessageId = useRef(0);
  useEffect(() => {
    const saved = window.localStorage.getItem("sportconnect-theme");
    const initial = saved === "dark" || saved === "light" ? saved : "light";
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("sportconnect-theme", theme);
  }, [theme]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [chatResponse, meResponse, messagesResponse] = await Promise.all([
        fetch(`/api/activities/${activityId}/chat`, { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" }),
        fetch(`/api/activities/${activityId}/chat/messages?limit=100`, { cache: "no-store" }),
      ]);
      const [chatData, meData, messagesData] = await Promise.all([
        chatResponse.json(), meResponse.json(), messagesResponse.json(),
      ]);

      if (meResponse.status === 401) {
        router.replace("/");
        return;
      }
      if (!chatResponse.ok) throw new Error(errorMessage(chatData, "De chat kon niet worden geopend."));
      if (!messagesResponse.ok) throw new Error(errorMessage(messagesData, "Berichten konden niet worden opgehaald."));

      setActivity(chatData.activiteit as Activity);
      setUserId(meData?.user?.gebruiker_id ?? null);
      const initialMessages = (messagesData.messages ?? []) as ChatMessage[];
      setMessages(initialMessages);
      lastMessageId.current = initialMessages.reduce((max, message) => Math.max(max, message.bericht_id), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Er ging iets mis bij het openen van de chat.");
    } finally {
      setLoading(false);
    }
  }, [activityId, router]);

  useEffect(() => {
    if (!/^\d+$/.test(activityId)) {
      setError("Ongeldig activiteit-ID.");
      setLoading(false);
      return;
    }
    void loadInitial();
  }, [activityId, loadInitial]);

  useEffect(() => {
    if (!activity) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(
          `/api/activities/${activityId}/chat/messages?after_id=${lastMessageId.current}&limit=100`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok) {
          setError(errorMessage(data, "De chatverbinding is onderbroken."));
          return;
        }
        const incoming = (data.messages ?? []) as ChatMessage[];
        if (incoming.length) {
          setMessages((current) => {
            const known = new Set(current.map((message) => message.bericht_id));
            return [...current, ...incoming.filter((message) => !known.has(message.bericht_id))];
          });
          lastMessageId.current = Math.max(
            lastMessageId.current,
            ...incoming.map((message) => message.bericht_id),
          );
          setError("");
        }
      } catch {
        setError("Geen verbinding met de chat. Opnieuw proberen…");
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activity, activityId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const inhoud = draft.trim();
    if (!inhoud || sending) return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/activities/${activityId}/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inhoud }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(errorMessage(data, "Bericht versturen is mislukt."));
      const message = data as ChatMessage;
      setMessages((current) => current.some((item) => item.bericht_id === message.bericht_id)
        ? current
        : [...current, message]);
      lastMessageId.current = Math.max(lastMessageId.current, message.bericht_id);
      setDraft("");
      draftRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bericht versturen is mislukt.");
    } finally {
      setSending(false);
    }
  }

  const place = [activity?.locatie_naam, activity?.woonplaats].filter(Boolean).join(", ");

  return (
    <main className="chat-page min-h-screen flex flex-col" style={{ ...styles.page, padding: 0 }}>
      <SiteHeader
        theme={theme}
        onThemeToggle={() => setTheme((value) => value === "light" ? "dark" : "light")}
        userName="Ingelogd"
        onHome={() => router.push("/")}
      />
      <div className="chat-page-body" style={{ padding: "24px 16px", flex: 1, minHeight: 0 }}>
      <div className="chat-workspace">
      <aside className="chat-activity-sidebar theme-surface">
        <p className="chat-sidebar-eyebrow">BIJ DEZE GROEPSCHAT</p>
        <h2>{activity?.titel ?? (loading ? "Activiteit laden…" : "Activiteit")}</h2>
        <p className="theme-muted">{activity?.starttijd ? formatDate(activity.starttijd) : "Tijd onbekend"}</p>
        <div className="chat-activity-fact"><span>Locatie</span><strong>{place || "Nog geen locatie"}</strong></div>
        <div className="chat-activity-fact"><span>Status</span><strong>{activity?.status ?? "Onbekend"}</strong></div>
        <button type="button" className="chat-sidebar-secondary" onClick={() => router.push(`/?activity=${activityId}`)}>Activiteitenoverzicht</button>
        {activity?.maker_id !== userId && <button type="button" className="chat-leave-button" disabled={leaving || loading || !activity} onClick={async () => {
          if (!window.confirm("Wil je deze activiteit verlaten? Je verliest dan toegang tot de groepschat.")) return;
          setLeaving(true);
          try {
            const response = await fetch(`/api/activities/${activityId}/join`, { method: "DELETE", credentials: "same-origin" });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.detail || data.error || "Afmelden is niet gelukt.");
            router.push("/");
          } catch (err) { setError(err instanceof Error ? err.message : "Afmelden is niet gelukt."); }
          finally { setLeaving(false); }
        }}>{leaving ? "Afmelden…" : "Activiteit verlaten"}</button>}
        {activity?.maker_id === userId && <p className="chat-sidebar-note">Je bent de organisator. Gebruik de activiteitinstellingen om de activiteit te beheren.</p>}
        <p className="chat-sidebar-note">Je kunt de activiteit ook via het activiteitenoverzicht terugvinden.</p>
      </aside>
      <section className="chat-page-shell" style={styles.shell}>
        <header style={styles.header}>
          <button type="button" onClick={() => router.back()} style={styles.backButton} aria-label="Terug">
            ← Terug
          </button>
          <div style={styles.headerCopy}>
            <div style={styles.eyebrow}>SPORTCONNECT · GROEPSCHAT</div>
            <h1 style={styles.title}>{activity?.titel ?? (loading ? "Chat laden…" : "Groepschat")}</h1>
            <p style={styles.subtitle}>
              {activity?.starttijd ? formatDate(activity.starttijd) : "Gesprek met deelnemers"}
              {place ? ` · ${place}` : ""}
            </p>
          </div>
          <span style={styles.statusPill}>Activiteit</span>
        </header>

        {error && <div role="alert" style={styles.error}>{error}</div>}
        {notice && <div role="status" style={styles.notice}>{notice}</div>}

        <div className="chat-page-messages" style={styles.messages} aria-live="polite" aria-label="Chatberichten">
          {loading ? (
            <div style={styles.emptyState}>De chat wordt geladen…</div>
          ) : messages.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>✉</div>
              <strong>Start het gesprek</strong>
              <p>Stel iets voor, spreek af waar jullie elkaar ontmoeten of stel een vraag aan de groep.</p>
            </div>
          ) : messages.map((message) => {
            const own = message.gebruiker_id === userId;
            return (
              <article key={message.bericht_id} style={{ ...styles.messageRow, ...(own ? styles.ownRow : {}) }}>
                {!own && <div style={styles.avatar}>{(message.afzender_naam || "?").trim().charAt(0).toUpperCase()}</div>}
                <div style={{ ...styles.messageContent, ...(own ? styles.ownContent : {}) }}>
                  <div className="chat-message-meta" style={{ ...styles.messageMeta, ...(own ? styles.ownMeta : {}) }}>
                    <strong>{own ? "Jij" : message.afzender_naam}</strong>
                    <time>{formatDate(message.verzonden_op)}</time>
                  </div>
                  <div className={!own ? "chat-message-bubble" : undefined} style={{ ...styles.bubble, ...(own ? styles.ownBubble : {}) }}>{message.inhoud}</div>
                </div>
              </article>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <form className="chat-page-composer" onSubmit={sendMessage} style={styles.composer}>
          <textarea
            ref={draftRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Typ een bericht…"
            aria-label="Bericht"
            maxLength={2000}
            rows={2}
            style={styles.input}
            disabled={loading || sending || !activity}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button type="submit" disabled={loading || sending || !draft.trim()} style={styles.sendButton}>
            {sending ? "Versturen…" : "Verstuur"}
          </button>
          <div style={styles.composerHint}>Enter om te versturen · Shift + Enter voor een nieuwe regel</div>
        </form>
      </section>
      </div>
      </div>
      {chatMenuOpen && <div className="chat-route-launcher-panel theme-surface" role="dialog" aria-label="Groepschats"><div className="flex items-center justify-between border-b p-3"><strong className="text-sm">Groepschats</strong><button type="button" onClick={() => setChatMenuOpen(false)} aria-label="Sluiten">×</button></div><a className="block border-b p-3 text-sm" href={`/activities/${activityId}/chat`}><strong>{activity?.titel ?? "Huidige groepschat"}</strong><span className="mt-1 block text-xs theme-muted">Je bent deze chat aan het bekijken</span></a><button type="button" className="w-full p-3 text-left text-sm font-semibold text-emerald-600" onClick={() => router.push("/")}>Activiteiten en andere groepschats bekijken →</button></div>}
      <button
        type="button"
        onClick={() => setChatMenuOpen((open) => !open)}
        aria-expanded={chatMenuOpen}
        aria-label="Groepschats openen"
        title="Groepschats openen"
        className="chat-launcher-button" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 120, width: 58, height: 58, borderRadius: 999, border: "2px solid #047857", background: "#047857", color: "#fff", boxShadow: "0 8px 28px rgba(0,0,0,.28)", display: "grid", placeItems: "center", cursor: "pointer", transition: "transform 180ms ease, box-shadow 180ms ease" }}
        onMouseEnter={(event) => { event.currentTarget.style.transform = "translateY(-3px) scale(1.03)"; }}
        onMouseLeave={(event) => { event.currentTarget.style.transform = "translateY(0) scale(1)"; }}
      >
        <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-5.5A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8 11h.01M12 11h.01M16 11h.01" strokeWidth="2.5" strokeLinecap="round"/></svg>
      </button>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "var(--background)", padding: "32px 16px", color: "var(--foreground)" },
  shell: { maxWidth: 900, height: "min(850px, calc(100vh - 120px))", minHeight: 520, margin: "0 auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 22, boxShadow: "0 12px 40px rgba(22, 54, 32, .07)", display: "flex", flexDirection: "column", overflow: "hidden" },
  header: { display: "flex", alignItems: "center", gap: 18, padding: "22px 26px", borderBottom: "1px solid #e8eee9", background: "#fff" },
  backButton: { border: "1px solid #dbe6dc", background: "#fff", borderRadius: 10, padding: "10px 12px", color: "#2c5036", cursor: "pointer", whiteSpace: "nowrap" },
  headerCopy: { minWidth: 0, flex: 1 },
  eyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: 800, color: "#32814a", marginBottom: 5 },
  title: { margin: 0, fontSize: 22, fontWeight: 750, lineHeight: 1.25, overflowWrap: "anywhere" },
  subtitle: { margin: "6px 0 0", fontSize: 13, color: "#69766c" },
  statusPill: { borderRadius: 999, padding: "7px 11px", fontSize: 12, fontWeight: 700, color: "#28753e", background: "#eaf6ec", whiteSpace: "nowrap" },
  messages: { flex: 1, overflowY: "auto", padding: "24px clamp(14px, 4vw, 32px)", background: "linear-gradient(180deg, #fbfdfb 0%, #f7faf7 100%)" },
  emptyState: { minHeight: 260, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", color: "#66756a", gap: 8, maxWidth: 400, margin: "0 auto" },
  emptyIcon: { display: "grid", placeItems: "center", width: 52, height: 52, borderRadius: 17, background: "#e9f5eb", color: "#2b7b41", fontSize: 24, marginBottom: 8 },
  messageRow: { display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 18 },
  ownRow: { justifyContent: "flex-end" },
  avatar: { flex: "0 0 32px", width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: 11, background: "#e1eee4", color: "#27653a", fontWeight: 800, fontSize: 13 },
  messageContent: { maxWidth: "min(78%, 560px)" },
  ownContent: { alignItems: "flex-end" },
  messageMeta: { display: "flex", gap: 10, alignItems: "baseline", margin: "0 0 6px 3px", color: "#5e6b61", fontSize: 12 },
  ownMeta: { justifyContent: "flex-end", marginRight: 3 },
  bubble: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", border: "1px solid var(--border)", background: "var(--surface-muted)", color: "var(--foreground)", padding: "11px 14px", borderRadius: "4px 16px 16px 16px", fontSize: 14, lineHeight: 1.5, boxShadow: "0 2px 4px rgba(20, 40, 25, .025)" },
  ownBubble: { background: "#087f5b", borderColor: "#087f5b", color: "#fff", borderRadius: "16px 4px 16px 16px" },
  error: { margin: "14px 24px 0", padding: "10px 12px", borderRadius: 10, background: "#fff0ef", border: "1px solid #f1c6c2", color: "#9d3028", fontSize: 13 },
  notice: { margin: "14px 24px 0", padding: "10px 12px", borderRadius: 10, background: "#edf8ef", border: "1px solid #cce6d0", color: "#27653a", fontSize: 13 },
  composer: { display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", padding: "18px 22px 14px", borderTop: "1px solid #e5ece6", background: "#fff" },
  input: { flex: "1 1 400px", resize: "vertical", minHeight: 52, maxHeight: 150, border: "1px solid #d7e2d9", borderRadius: 13, padding: "13px 14px", font: "inherit", fontSize: 14, outlineColor: "#32814a", color: "#17231b", background: "#fbfdfb" },
  sendButton: { minHeight: 48, border: 0, borderRadius: 12, padding: "0 22px", color: "#fff", background: "#24783c", fontWeight: 750, cursor: "pointer" },
  composerHint: { flexBasis: "100%", fontSize: 11, color: "#8a968d", marginTop: -5, paddingLeft: 3 },
};

export default function ActivityChatPage() {
  return (
    <Suspense fallback={<main className="p-6">Chat laden...</main>}>
      <ActivityChatContent />
    </Suspense>
  );
}
