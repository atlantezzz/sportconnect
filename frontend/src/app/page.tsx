"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ActivityCard from "@/components/ActivityCard";
import ActivityForm, { type NewActivityInput } from "@/components/ActivityForm";
import ActivityDetails from "@/components/ActivityDetails";
import ActivityMap from "@/components/ActivityMap";
import { sports, sportEmoji } from "@/data/activities";
import AuthModal, { type AuthMode } from "@/components/AuthModal";
import type { Activity } from "@/types/activity";
import SportPreferencesModal from "@/components/SportPreferencesModal";
import SiteHeader from "@/components/SiteHeader";
import LandingPage from "@/components/LandingPage";

type ActivityFilter = "all" | "mine" | "joined" | "friends";

type SportPreferences = { favoriet: string[]; verborgen: string[] };

async function fetchSportPreferences(): Promise<SportPreferences | null> {
  try {
    const response = await fetch("/api/profile", { cache: "no-store" });
    if (!response.ok) return null;
    const profile = await response.json();
    return { favoriet: profile.sporten?.favoriet ?? [], verborgen: profile.sporten?.verborgen ?? [] };
  } catch {
    return null;
  }
}

// Current activities for the logged-in user, mapped for the UI (ids offset by 100000).
async function fetchActivityList(): Promise<Activity[] | null> {
  try {
    const response = await fetch("/api/activities", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Activiteiten ophalen mislukt");
    }

        const rows: {
	  maker_id: number;
      activiteit_id: number;
      titel: string;
      beschrijving: string | null;
      starttijd: string;
      niveau: string;
      locatie_naam: string | null;
      woonplaats: string | null;
      straatnaam?: string | null;
      huisnummer?: string | null;
      postcode?: string | null;
      land?: string | null;
      breedtegraad?: number | null;
      lengtegraad?: number | null;
      externe_locatie_id?: string | null;
      maximaal_aantal_deelnemers: number;
      status: string;
      sport: string;
      organisator_naam: string;
      deelnemers: string[];
      deelnemer_ids: number[];
	  aantal_deelnemers: number;
    }[] = await response.json();

    const databaseActivities: Activity[] = rows.map((row) => {
      const start = new Date(row.starttijd);
      const dateLabel = start.toLocaleDateString("nl-NL", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      const timeLabel = start.toLocaleTimeString("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
      });

      return {
        id: 100000 + row.activiteit_id,
        sport: row.sport,
        title: row.titel,
        location: [row.locatie_naam, row.woonplaats]
          .filter(Boolean)
          .join(", "),
        latitude: row.breedtegraad ?? null,
        longitude: row.lengtegraad ?? null,
        time: `${dateLabel.charAt(0).toUpperCase()}${dateLabel.slice(1)}, ${timeLabel}`,
        participants: row.aantal_deelnemers,
        capacity: row.maximaal_aantal_deelnemers,
        level: row.niveau ?? "Alle niveaus",
        description: row.beschrijving ?? "",
        organizer: row.organisator_naam,
        organizerId: row.maker_id,
        members: (row.deelnemer_ids ?? []).map((memberId, index) => ({ id: memberId, name: row.deelnemers?.[index] ?? "Deelnemer" })),
        memberNames: [
          ...new Set(
            [row.organisator_naam, ...(row.deelnemers ?? [])].filter(
              (name): name is string => Boolean(name)
            )
          ),
        ],
        x: 20 + ((row.activiteit_id * 17) % 60),
        y: 20 + ((row.activiteit_id * 23) % 60),
        status: row.status === "GEANNULEERD" ? "GEANNULEERD" : undefined,
      };
    });

    return databaseActivities;
  } catch (error) {
    console.error("SportConnect-activiteiten laden:", error);
    return null;
  }
}

export default function Home() {
  const [activityList, setActivityList] = useState<Activity[]>([]);
  const [joinedActivityIds, setJoinedActivityIds] = useState<number[]>([]);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [hiddenSports, setHiddenSports] = useState<string[]>([]);
  const [favoriteSports, setFavoriteSports] = useState<string[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [mapVisible, setMapVisible] = useState(true);
  const [mapOnly, setMapOnly] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [previewActivityId, setPreviewActivityId] = useState<number | null>(null);
  const [chatLauncherOpen, setChatLauncherOpen] = useState(false);
  const [settingsOverlayActivityId, setSettingsOverlayActivityId] = useState<number | null>(null);
  const [selectedSport, setSelectedSport] = useState("Alles");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [sportIds, setSportIds] = useState<Record<string, number>>({});
  const [friendIds, setFriendIds] = useState<number[]>([]);
  const [notice, setNotice] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  useEffect(() => {
    const storedTheme = window.localStorage.getItem("sportconnect-theme");
    if (storedTheme === "dark" || storedTheme === "light") setTheme(storedTheme);
    if (new URLSearchParams(window.location.search).get("preferences") === "1") {
      setPreferencesOpen(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("sportconnect-theme", theme);
  }, [theme]);

   useEffect(() => {
     let cancelled = false;

     async function restoreSession() {
       try {
         const response = await fetch("/api/auth/me", {
           cache: "no-store",
           credentials: "same-origin",
         });

         if (!response.ok) return;

         const result = await response.json();

         if (!result.user) return;
         if (!cancelled && result.user.naam) {
           setCurrentUserName(result.user.naam);
	   setCurrentUserId(result.user.gebruiker_id);
         }

         const preferences = await fetchSportPreferences();
         if (!cancelled && preferences) {
           setFavoriteSports(preferences.favoriet);
           setHiddenSports(preferences.verborgen);
         }
       } catch (error) {
         console.error("SportConnect-sessie herstellen:", error);
       } finally {
	 if (!cancelled) {
	   setAuthChecked(true);
	 }
       }
     }

     restoreSession();

     return () => {
       cancelled = true;
     };
   }, []);
   useEffect(() => {
     async function loadSports() {
      try {
        const response = await fetch("/api/sports");

        if (!response.ok) {
          throw new Error("Sporten ophalen mislukt");
        }

        const rows: { sport_id: number; naam: string }[] =
          await response.json();

        const ids = Object.fromEntries(
         rows.map((sport) => [sport.naam, sport.sport_id]),
        );

         setSportIds(ids);
       } catch (error) {
         console.error("SportConnect-sporten laden:", error);
       }
     }

     loadSports();
   }, []);
   useEffect(() => {
     if (!currentUserId) { setFriendIds([]); return; }
     let cancelled = false;
     fetch("/api/friends", { cache: "no-store" })
       .then((r) => r.ok ? r.json() : [])
       .then((data) => { if (!cancelled) setFriendIds(Array.isArray(data.friends) ? data.friends.map((f: { gebruiker_id: number }) => f.gebruiker_id) : []); })
       .catch(() => { if (!cancelled) setFriendIds([]); });
     return () => { cancelled = true; };
   }, [currentUserId]);
  const loadActivities = useCallback(async () => {
    // Activities are only available to logged-in users (logging out reloads the page).
    if (currentUserId === null) return;
    const list = await fetchActivityList();
    if (list) setActivityList(list);
  }, [currentUserId]);

  useEffect(() => {
    if (!authChecked || currentUserId === null) return;
    let cancelled = false;
    void fetchActivityList().then((list) => {
      if (!cancelled && list) setActivityList(list);
    });
    return () => { cancelled = true; };
  }, [authChecked, currentUserId]);

  // The settings overlay (iframe) reports changes such as cancelling or transferring.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.data?.type !== "sportconnect:activity-changed") return;
      setSettingsOverlayActivityId(null);
      setSelectedActivityId(null);
      if (typeof event.data.message === "string") setNotice({ text: event.data.message, tone: "success" });
      void loadActivities();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [loadActivities]);
  useEffect(() => {
    if (!authChecked || activityList.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const rawActivityId = params.get("activity");

    if (!rawActivityId || !/^[0-9]+$/.test(rawActivityId)) return;

    const activityId = Number(rawActivityId);
    const frontendActivityId = 100000 + activityId;

    const activityExists = activityList.some(
      (activity) => activity.id === frontendActivityId
    );

    if (!activityExists) return;

    setSelectedActivityId(frontendActivityId);
    setPreviewActivityId(null);
    setMapOnly(false);

    params.delete("activity");
    const query = params.toString();

    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`
    );
  }, [authChecked, activityList]);
  const filteredActivities = useMemo(() => {
    const query = search.trim().toLowerCase();
    const locationQuery = location.trim().toLowerCase();

    const filtered = activityList.filter((activity) => {
      if (hiddenSports.includes(activity.sport)) return false;

      const isFriendActivity =
        (activity.organizerId !== undefined && friendIds.includes(activity.organizerId)) ||
        (activity.members ?? []).some((member) => friendIds.includes(member.id));
      const matchesOwnership =
        activityFilter === "all" ||
        (activityFilter === "mine" && activity.organizerId === currentUserId) ||
        (activityFilter === "joined" && joinedActivityIds.includes(activity.id)) ||
        (activityFilter === "friends" && isFriendActivity);

      const matchesSport =
        selectedSport === "Alles" || activity.sport === selectedSport;

      const matchesSearch =
        !query ||
        activity.title.toLowerCase().includes(query) ||
        activity.sport.toLowerCase().includes(query) ||
        activity.location.toLowerCase().includes(query);

      const matchesLocation =
        !locationQuery ||
        activity.location.toLowerCase().includes(locationQuery);

      return (
        matchesOwnership &&
        matchesSport &&
        matchesSearch &&
        matchesLocation
      );
    });
    return [...filtered].sort((a, b) => Number(a.status === "GEANNULEERD") - Number(b.status === "GEANNULEERD") || Number(a.participants >= a.capacity) - Number(b.participants >= b.capacity) || Number(favoriteSports.includes(b.sport)) - Number(favoriteSports.includes(a.sport)));
  }, [
    activityList,
    selectedSport,
    activityFilter,
    search,
    location,
    joinedActivityIds,
    hiddenSports,
    favoriteSports,
    friendIds,
    currentUserId,
  ]);

  useEffect(() => {
    if (!authChecked || currentUserId === null) {
      setJoinedActivityIds([]);
      return;
    }

    let cancelled = false;

    async function loadJoinedActivities() {
      try {
        const response = await fetch("/api/activities/joined", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Deelnames ophalen mislukt.");
        }

        const ids: number[] = await response.json();

        if (!cancelled) {
          setJoinedActivityIds(ids.map((id) => 100000 + id));
        }
      } catch (error) {
        console.error("Deelnames ophalen:", error);
      }
    }

    loadJoinedActivities();

    return () => {
      cancelled = true;
    };
  }, [authChecked, currentUserId]);

  const selectedActivity = activityList.find(
    (activity) => activity.id === selectedActivityId
  );
  const previewActivity = activityList.find(
    (activity) => activity.id === previewActivityId
  );

  async function joinActivity(activityId: number) {
  const activity = activityList.find((item) => item.id === activityId);

    if (
      !activity ||
      activity.organizerId === currentUserId ||
      activity.participants >= activity.capacity ||
      joinedActivityIds.includes(activityId)
    ) {
      return;
    }

    try {
      const response = await fetch(
        `/api/activities/${activityId - 100000}/join`,
        { method: "POST" }
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.detail ?? result.error ?? "Aanmelden is mislukt."
        );
      }

      setJoinedActivityIds((current) =>
        current.includes(activityId) ? current : [...current, activityId]
      );
      await loadActivities();
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Aanmelden is mislukt.", tone: "error" });
    }
  }

  async function leaveActivity(activityId: number) {
  if (!joinedActivityIds.includes(activityId)) return;

    try {
      const response = await fetch(
        `/api/activities/${activityId - 100000}/join`,
        { method: "DELETE" }
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.detail ?? result.error ?? "Afmelden is mislukt."
        );
      }

      setJoinedActivityIds((current) =>
        current.filter((id) => id !== activityId)
      );
      await loadActivities();
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Afmelden is mislukt.", tone: "error" });
    }
  }


  // Errors are thrown so the form can show them inline (and re-enable its button).
  async function createActivity(input: NewActivityInput) {
    if (!sportIds[input.sport]) {
      throw new Error(`De sport '${input.sport}' is nog niet beschikbaar. Probeer de pagina te verversen.`);
    }
    const response = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sport_id: sportIds[input.sport],
        titel: input.title,
        beschrijving: input.description || null,
        starttijd: `${input.date}T${input.startTime}:00`,
        niveau: input.level,
        locatie_naam: input.location.formatted,
        straatnaam: input.location.straatnaam,
        huisnummer: input.location.huisnummer,
        postcode: input.location.postcode,
        woonplaats: input.location.woonplaats,
        land: input.location.land,
        breedtegraad: input.location.breedtegraad,
        lengtegraad: input.location.lengtegraad,
        externe_locatie_id: input.location.id,
        maximaal_aantal_deelnemers: input.capacity,
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(typeof result?.detail === "string" ? result.detail : "Activiteit opslaan is mislukt.");
    }

    await loadActivities();
    setSelectedSport("Alles");
    setActivityFilter("all");
    setSearch("");
    setLocation("");
    setCreateModalOpen(false);
    setSelectedActivityId(100000 + result.activiteit_id);
  }


  function resetFilters() {
    setSelectedSport("Alles");
    setActivityFilter("all");
    setSearch("");
    setLocation("");
    setSelectedActivityId(null);
  }

  function openActivity(activityId: number) {
    setPreviewActivityId(activityId);
  }

  function goBack() {
    setSelectedActivityId(null);
  }

  return (
    <main className="sportconnect-app flex h-screen flex-col overflow-hidden bg-white text-gray-900">
      <SiteHeader
        theme={theme}
        onThemeToggle={() => setTheme((value) => value === "light" ? "dark" : "light")}
        userName={currentUserName}
        showMapToggle={!selectedActivity}
        mapOnly={mapOnly}
        onMapToggle={() => { setMapOnly((value) => !value); setMapVisible(true); setPreviewActivityId(null); }}
        onHome={() => { setSelectedActivityId(null); setMapOnly(false); setChatLauncherOpen(false); }}
        onLogin={() => setAuthMode("login")}
        onRegister={() => setAuthMode("register")}
        onLogout={async () => {
          try {
            const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store" });
            if (!response.ok) throw new Error("Uitloggen is niet bevestigd door de server.");
            setCurrentUserName(null); setCurrentUserId(null); setSelectedActivityId(null); setPreferencesOpen(false); setChatLauncherOpen(false); setFavoriteSports([]); setHiddenSports([]);
            window.location.replace("/");
          } catch (error) { console.error("Uitloggen mislukt:", error); setNotice({ text: "Uitloggen is niet gelukt. Probeer het opnieuw.", tone: "error" }); }
        }}
      />

      {!authChecked ? (
        <section className="flex min-h-0 flex-1 items-center justify-center bg-[#f6f8f4] p-8">
          <div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-700" /><p className="text-sm text-gray-600">SportConnect laden…</p></div>
        </section>
      ) : !currentUserName ? (
        <LandingPage onRegister={() => setAuthMode("register")} onLogin={() => setAuthMode("login")} />
      ) : selectedActivity ? (
        <ActivityDetails
          activity={selectedActivity}
          onBack={goBack}
          hasJoined={joinedActivityIds.includes(selectedActivity.id)}
          onJoin={() => joinActivity(selectedActivity.id)}
          onLeave={() => leaveActivity(selectedActivity.id)}
          isOrganizer={selectedActivity.organizerId === currentUserId}
          onManageSettings={() => {
            const databaseActivityId = selectedActivity.id - 100000;
            if (databaseActivityId > 0) setSettingsOverlayActivityId(databaseActivityId);
          }}
        />
      ) : (
        <div className={`activity-workspace relative flex min-h-0 flex-1 flex-row overflow-hidden ${mapVisible ? "activity-workspace-map-list" : "activity-workspace-list-only"}`}>
          <aside
            className={`activity-sidebar relative z-20 flex min-h-0 shrink-0 flex-col overflow-y-auto transition-[width,flex-basis] duration-300 ${!mapVisible ? "activity-list-only w-[260px] flex-none border-r" : "activity-filter-hidden-in-map"} ${mapOnly ? "hidden" : ""}`}
          >
            <div className={`activity-filter-toolbar activity-filter-panel shrink-0 px-5 pb-4 pt-5 md:px-6 ${mapVisible ? "activity-filter-sidebar" : "activity-filter-top"}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold tracking-tight">
                    Ontdek activiteiten
                  </h1>
                  <p className="mt-1 text-sm text-gray-500">
                    Sport samen met anderen.
                  </p>
                </div>
                <span className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                  {filteredActivities.length}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                Activiteit aanmaken
              </button>

              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Zoek een sport of activiteit..."
                className="mt-5 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />

              <input
                type="text"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Plaats of postcode"
                className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />

              {!mapVisible && <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Activiteiten tonen
                </p>
                <div className={`grid gap-2 ${mapVisible ? "grid-cols-2" : "grid-cols-2 xl:grid-cols-4"}`}>
                  {(
                    [
                      ["all", "Alles"],
                      ["mine", "Mijn activiteiten"],
                      ["joined", "Ik neem deel"],
                      ["friends", "Vrienden"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setActivityFilter(value)}
                      className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                        activityFilter === value
                          ? "border-emerald-700 bg-emerald-700 text-white"
                          : "border-gray-200 bg-white text-gray-600 hover:border-emerald-300 hover:text-emerald-800"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>}

              {!mapVisible && <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Sport
                  </p>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-900"
                  >
                    Wis filters
                  </button>
                </div>
                <div className={`sport-filter-options flex flex-wrap gap-2 ${mapVisible ? "sport-filter-sidebar-options" : ""}`}>
                  {sports.map((sport) => (
                    <button
                      key={sport}
                      type="button"
                      onClick={() => setSelectedSport(sport)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        selectedSport === sport
                          ? "border-emerald-700 bg-emerald-700 text-white"
                          : "border-gray-200 bg-white text-gray-600 hover:border-emerald-300 hover:text-emerald-800"
                      }`}
                      title={sport}
                    >
                      <span aria-hidden="true" className="mr-1">{sportEmoji[sport] ?? "•"}</span>{sport}
                    </button>
                  ))}
                </div>
              </div>}
              </div>

          </aside>

          {!mapOnly && (
            <section className={`activity-results-main min-w-0 overflow-y-auto transition-all duration-300 ${mapVisible && !mapOnly ? "activity-results-floating" : "flex-1"}`} aria-label="Activiteitenoverzicht">
              <button type="button" onClick={() => { setMapVisible((value) => !value); setMapOnly(false); setPreviewActivityId(null); }} className={`activity-list-expand-toggle ${mapVisible ? "is-expanded" : "is-collapsed"}`} aria-label={mapVisible ? "Activiteitenlijst vergroten en kaart verbergen" : "Kaart en lijst naast elkaar tonen"} title={mapVisible ? "Lijst vergroten" : "Kaart en lijst tonen"}><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d={mapVisible ? "M10 5l7 7-7 7" : "M14 5l-7 7 7 7"} strokeLinecap="round" strokeLinejoin="round"/></svg></button>
              <div className={`activity-results-inner mx-auto max-w-[1800px] ${mapVisible ? "p-4 md:p-5" : "p-4 md:p-6"}`}>
                {mapVisible && <div className="activity-floating-controls mb-4 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div><p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-600">Ontdek activiteiten</p><h2 className="mt-1 text-lg font-bold">Vind jouw volgende sportmoment</h2></div>
                    <span className="shrink-0 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{filteredActivities.length}</span>
                  </div>
                  <button type="button" onClick={() => setCreateModalOpen(true)} className="mb-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"><span aria-hidden="true">＋</span> Activiteit aanmaken</button>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Zoek een sport of activiteit..." className="min-h-10 w-full rounded-xl border px-3 py-2 text-sm" />
                    <input type="text" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Plaats of postcode" className="min-h-10 w-full rounded-xl border px-3 py-2 text-sm" />
                  </div>
                  <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider theme-muted">Activiteiten tonen</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{([["all", "Alles"], ["mine", "Mijn activiteiten"], ["joined", "Ik neem deel"], ["friends", "Vrienden"]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setActivityFilter(value)} className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${activityFilter === value ? "border-emerald-700 bg-emerald-700 text-white" : "theme-surface-muted theme-foreground"}`}>{label}</button>)}</div>
                  <div className="mb-2 mt-4 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider theme-muted">Sport</p><button type="button" onClick={resetFilters} className="text-xs font-semibold text-emerald-600">Wis filters</button></div>
                  <div className="activity-floating-sports flex flex-wrap gap-2">{sports.map((sport) => <button key={sport} type="button" onClick={() => setSelectedSport(sport)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${selectedSport === sport ? "border-emerald-700 bg-emerald-700 text-white" : "theme-surface theme-foreground hover:border-emerald-500"}`} title={sport}><span aria-hidden="true" className="mr-1">{sportEmoji[sport] ?? "•"}</span>{sport}</button>)}</div>
                </div>}

                <div className="mb-5 flex items-end justify-between gap-4 border-b pb-4" style={{ borderColor: "var(--border)" }}>
                  <div><p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-600">Ontdek in jouw buurt</p><h2 className="mt-1 text-xl font-bold sm:text-2xl">Activiteiten in de buurt</h2><p className="mt-1 text-sm theme-muted">Kies een activiteit die bij je past.</p></div>
                  <span className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold theme-muted-surface">{filteredActivities.length} resultaten</span>
                </div>
                {filteredActivities.length > 0 ? (
                  <div className={`grid items-stretch gap-3 ${mapVisible ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"}`}>
                    {filteredActivities.map((activity) => <ActivityCard key={activity.id} activity={activity} onOpen={() => openActivity(activity.id)} isJoined={joinedActivityIds.includes(activity.id)} compact={false} />)}
                  </div>
                ) : <div className="theme-surface rounded-2xl border border-dashed p-10 text-center"><h3 className="font-semibold">Geen activiteiten gevonden</h3><p className="mt-2 text-sm theme-muted">Pas je zoekopdracht of filters aan.</p><button type="button" onClick={resetFilters} className="mt-4 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Wis filters</button></div>}
              </div>
            </section>
          )}

          {mapVisible && !mapOnly && !selectedActivity && (
            <section
              className="map-surface map-surface-split relative min-w-0 flex-1 overflow-hidden bg-[#edf1e9]"
              aria-label="Kaart naast activiteitenlijst"
            >
              <ActivityMap
                activities={filteredActivities}
                selectedActivityId={selectedActivityId ?? previewActivityId}
                onActivityClick={openActivity}
                className="absolute inset-0"
              />
              <div className="pointer-events-none absolute left-4 top-4 z-[500] map-label rounded-xl border border-gray-200/80 bg-white/95 px-3 py-2 shadow-sm">
                <p className="text-sm font-semibold text-gray-900">Activiteiten op de kaart</p>
                <p className="mt-0.5 text-xs text-gray-600">
                  {filteredActivities.filter((a) => a.latitude != null && a.longitude != null).length} met locatie
                </p>
              </div>
            </section>
          )}

          {mapOnly && mapVisible && (
            <section
              className="map-surface relative min-w-0 flex-1 overflow-hidden bg-[#edf1e9]"
              aria-label="Kaart met sportactiviteiten"
            >
              <ActivityMap
                activities={filteredActivities}
                selectedActivityId={selectedActivityId ?? previewActivityId}
                onActivityClick={openActivity}
                className="absolute inset-0"
              />
              <div className="pointer-events-none absolute left-5 top-5 z-[500] map-label rounded-xl border border-gray-200/80 bg-white/95 px-4 py-3 shadow-sm md:left-6 md:top-6">
                <p className="text-sm font-semibold text-gray-900">Sportactiviteiten in de buurt</p>
                <p className="mt-0.5 text-xs text-gray-600">
                  {filteredActivities.filter((a) => a.latitude != null && a.longitude != null).length} met locatie
                </p>
              </div>
            </section>
          )}
        </div>
      )}


      {settingsOverlayActivityId !== null && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-950/55 p-2 backdrop-blur-sm sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOverlayActivityId(null); }}>
          <section role="dialog" aria-modal="true" aria-label="Activiteitinstellingen" className="flex h-[min(92vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/30 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-3"><div><p className="font-bold text-gray-900">Activiteitinstellingen</p><p className="text-xs text-gray-500">Pas de gegevens van je activiteit aan</p></div><button type="button" onClick={() => setSettingsOverlayActivityId(null)} className="rounded-full border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Sluiten ✕</button></div>
            <iframe title="Activiteitinstellingen" src={`/activities/${settingsOverlayActivityId}/settings`} className="min-h-0 flex-1 border-0 bg-white" />
          </section>
        </div>
      )}

      {previewActivity && currentUserName && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-gray-950/35 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewActivityId(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="activity-preview-title" className="activity-preview w-full max-w-md overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 bg-gradient-to-br from-emerald-800 to-emerald-600 p-5 text-white"><div><span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{previewActivity.sport}</span><h2 id="activity-preview-title" className="mt-3 text-xl font-black">{previewActivity.title}</h2><p className="mt-1 text-sm text-emerald-50">{previewActivity.time}</p></div><button type="button" onClick={() => setPreviewActivityId(null)} aria-label="Voorbeeld sluiten" className="rounded-full bg-white/15 px-3 py-2 hover:bg-white/25">✕</button></div>
            <div className="space-y-4 p-5"><div><p className="text-xs font-bold uppercase tracking-wider text-gray-400">Locatie</p><p className="mt-1 text-sm font-semibold text-gray-800">{previewActivity.location || "Locatie niet opgegeven"}</p></div><div><p className="text-xs font-bold uppercase tracking-wider text-gray-400">Organisator</p><p className="mt-1 text-sm font-semibold text-gray-800">{previewActivity.organizer}</p></div><div><p className="text-xs font-bold uppercase tracking-wider text-gray-400">Niveau</p><p className="mt-1 text-sm font-semibold text-gray-800">{previewActivity.level || "Alle niveaus"}</p></div><p className="line-clamp-3 text-sm leading-6 text-gray-600">{previewActivity.description || "Geen extra beschrijving toegevoegd."}</p><div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-3"><span className="text-sm text-gray-600">Deelnemers</span><span className="text-sm font-bold text-gray-900">{previewActivity.participants}/{previewActivity.capacity}</span></div><button type="button" onClick={() => { setSelectedActivityId(previewActivity.id); setPreviewActivityId(null); }} className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800">Volledige activiteit bekijken <span className="ml-1">→</span></button></div>
          </section>
        </div>
      )}

      {createModalOpen && (
        <ActivityForm
          sports={sports}
          onClose={() => setCreateModalOpen(false)}
          onSubmit={createActivity}
        />
      )}

      {authMode !== null && (
        <AuthModal
          mode={authMode}
          onClose={() => setAuthMode(null)}
          onSwitchMode={setAuthMode}
          onAuthenticated={(name, userId, registered) => {
            setCurrentUserName(name);
            setCurrentUserId(userId);
            setAuthMode(null);
            if (registered) setPreferencesOpen(true);
            void fetchSportPreferences().then((preferences) => {
              if (!preferences) return;
              setFavoriteSports(preferences.favoriet);
              setHiddenSports(preferences.verborgen);
            });
          }}
        />
      )}
      {notice && (
        <div role={notice.tone === "error" ? "alert" : "status"} className={`app-notice fixed left-1/2 top-20 z-[10000] flex w-[min(92vw,480px)] -translate-x-1/2 items-start gap-3 rounded-2xl border bg-white px-4 py-3 text-sm shadow-xl ${notice.tone === "error" ? "border-red-200 text-red-800" : "border-emerald-200 text-emerald-900"}`}>
          <span className="flex-1">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Melding sluiten" className="rounded-full px-2 hover:bg-gray-100">✕</button>
        </div>
      )}
      {preferencesOpen && (
        <SportPreferencesModal
          onClose={() => setPreferencesOpen(false)}
          onSaved={(favorite, hidden) => { setFavoriteSports(favorite); setHiddenSports(hidden); }}
        />
      )}
    </main>
  );
}
