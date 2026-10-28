"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { sports, sportEmoji } from "@/data/activities";

type LandingPageProps = {
  onRegister: () => void;
  onLogin: () => void;
};

// Example activities for the animated showcase (illustration only, not real data).
const SHOWCASE = [
  { sport: "Hardlopen", title: "5 km rustig tempo", when: "Vandaag · 19:00", where: "Stadswandelpark, Eindhoven", filled: 4, capacity: 6, pin: { x: 30, y: 34 } },
  { sport: "Padel", title: "Dubbelspel, gemengd niveau", when: "Morgen · 20:30", where: "Padelcentrum, Utrecht", filled: 3, capacity: 4, pin: { x: 68, y: 26 } },
  { sport: "Voetbal", title: "Potje 7 tegen 7", when: "Zaterdag · 10:00", where: "Sportpark Noord, Tilburg", filled: 11, capacity: 14, pin: { x: 58, y: 64 } },
  { sport: "Fietsen", title: "Rondje Kempen, 60 km", when: "Zondag · 09:30", where: "Markt, Valkenswaard", filled: 5, capacity: 10, pin: { x: 22, y: 70 } },
];

const ROTATING_WORDS = ["hardloopmaatje", "padelpartner", "voetbalteam", "fietsgroep", "sportbuddy"];

const STEPS = [
  { title: "Kies wat bij je past", text: "Filter op sport, plaats en niveau en zie op de kaart waar anderen afspreken." },
  { title: "Sluit aan of organiseer", text: "Doe mee met een open activiteit of zet zelf iets neer, met een maximumaantal deelnemers." },
  { title: "Stem samen af", text: "In de groepschat regel je de details. Na afloop voeg je je nieuwe sportmaatjes toe als vriend." },
];

const FEATURES: { title: string; text: string; icon: ReactNode }[] = [
  {
    title: "Alles op de kaart",
    text: "Zie in één oogopslag wat er bij jou in de buurt gebeurt, met adres en tijd.",
    icon: <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Zm0 0v13m6-10.5v13" strokeLinejoin="round" />,
  },
  {
    title: "Groepschat per activiteit",
    text: "Iedereen die meedoet zit automatisch in de chat. Wie zich afmeldt, is er ook weer uit.",
    icon: <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-5.5A7.5 7.5 0 1 1 20 11.5ZM8 11h.01M12 11h.01M16 11h.01" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    title: "Vrienden en privéberichten",
    text: "Houd contact met de mensen met wie je graag sport en zie welke activiteiten zij plannen.",
    icon: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8 1.5a2.75 2.75 0 1 0 0-5.5M3 20c.6-3.5 2.8-5.5 6-5.5s5.4 2 6 5.5m2-5c2.8.2 4.3 1.8 4.8 4.5" strokeLinecap="round" />,
  },
  {
    title: "Jij bepaalt wat anderen zien",
    text: "Maak je profiel openbaar of alleen zichtbaar voor vrienden. Anderen zien je leeftijd, nooit je geboortedatum.",
    icon: <path d="M12 3 5 6v5.5c0 4.3 3 7.6 7 9.5 4-1.9 7-5.2 7-9.5V6l-7-3Zm-3 9 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />,
  },
];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

// Adds .is-visible to [data-reveal] elements once they scroll into view.
function useRevealOnScroll(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const targets = container.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.18 },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [root]);
}

function useCycle(length: number, intervalMs: number, paused: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % length), intervalMs);
    return () => window.clearInterval(timer);
  }, [length, intervalMs, paused]);
  return index;
}

// Moves the soft highlight on a feature card with the pointer.
function trackSpotlight(event: ReactMouseEvent<HTMLElement>) {
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  card.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
  card.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
}

export default function LandingPage({ onRegister, onLogin }: LandingPageProps) {
  const pageRef = useRef<HTMLElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [showcasePaused, setShowcasePaused] = useState(false);
  const activeIndex = useCycle(SHOWCASE.length, 3400, reducedMotion || showcasePaused);
  const wordIndex = useCycle(ROTATING_WORDS.length, 2200, reducedMotion);
  useRevealOnScroll(pageRef);

  const active = SHOWCASE[activeIndex];
  const sportList = sports.filter((sport) => sport !== "Alles");

  return (
    <section ref={pageRef} className="welcome min-h-0 flex-1 overflow-y-auto" aria-label="Welkom bij SportConnect">
      {/* Hero */}
      <div className="welcome-hero relative isolate overflow-hidden">
        <div className="welcome-blob welcome-blob-a" aria-hidden="true" />
        <div className="welcome-blob welcome-blob-b" aria-hidden="true" />
        <div className="welcome-grid" aria-hidden="true" />

        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-12 sm:px-8 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:px-12 lg:pb-24">
          <div className="max-w-2xl">
            <p className="welcome-badge welcome-rise" style={{ animationDelay: "40ms" }}>
              <span className="welcome-badge-dot" aria-hidden="true" /> Sport is leuker samen
            </p>

            <h1 className="welcome-title mt-6">
              <span className="welcome-rise block" style={{ animationDelay: "120ms" }}>Vind je</span>
              <span className="welcome-rotator welcome-rise" style={{ animationDelay: "220ms" }} aria-live="off">
                <span key={ROTATING_WORDS[wordIndex]} className="welcome-rotator-word">{ROTATING_WORDS[wordIndex]}</span>
              </span>
              <span className="welcome-rise block" style={{ animationDelay: "320ms" }}>in de buurt.</span>
            </h1>

            <p className="welcome-lead welcome-rise mt-6" style={{ animationDelay: "440ms" }}>
              Ontdek sportactiviteiten om de hoek, sluit aan bij anderen of organiseer zelf een potje.
              Van een spontane hardloopronde tot een vaste teamsport.
            </p>

            <div className="welcome-rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: "560ms" }}>
              <button type="button" onClick={onRegister} className="welcome-cta">
                Maak gratis een account <span className="welcome-cta-arrow" aria-hidden="true">→</span>
              </button>
              <button type="button" onClick={onLogin} className="welcome-secondary">
                Ik heb al een account
              </button>
            </div>

            <ul className="welcome-rise mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm" style={{ animationDelay: "680ms" }}>
              {["Vind sportmaatjes", "Organiseer activiteiten", "Chat met je groep"].map((item) => (
                <li key={item} className="welcome-check">{item}</li>
              ))}
            </ul>
          </div>

          {/* Animated product showcase */}
          <div
            className="welcome-showcase welcome-rise relative mx-auto w-full max-w-xl"
            style={{ animationDelay: "300ms" }}
            onMouseEnter={() => setShowcasePaused(true)}
            onMouseLeave={() => setShowcasePaused(false)}
            aria-hidden="true"
          >
            <div className="welcome-device">
              <div className="welcome-device-bar">
                <span className="welcome-logo-mark">S</span>
                <span className="font-bold">Ontdek activiteiten</span>
                <span className="welcome-pill ml-auto">In de buurt</span>
              </div>

              <div className="grid gap-3 p-3 sm:grid-cols-[1fr_1.05fr]">
                <div className="welcome-stack">
                  {SHOWCASE.map((item, index) => {
                    const offset = (index - activeIndex + SHOWCASE.length) % SHOWCASE.length;
                    return (
                      <article key={item.title} className="welcome-mini-card" data-offset={offset}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="welcome-sport-chip">{sportEmoji[item.sport] ?? "•"} {item.sport}</span>
                          <span className="text-[11px] font-semibold text-emerald-600">● Open</span>
                        </div>
                        <h3 className="mt-2 text-sm font-bold">{item.title}</h3>
                        <p className="welcome-muted mt-1 text-xs">{item.when}</p>
                        <p className="welcome-muted text-xs">{item.where}</p>
                        <div className="welcome-progress mt-3"><span style={{ width: `${(item.filled / item.capacity) * 100}%` }} /></div>
                        <p className="welcome-muted mt-1 text-right text-[11px]">{item.filled} van {item.capacity} deelnemers</p>
                      </article>
                    );
                  })}
                </div>

                <div className="welcome-map">
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                    <path d="M-5 72 C 20 60, 30 80, 52 62 S 85 40, 105 48" className="welcome-road" />
                    <path d="M18 -5 C 26 30, 40 40, 36 60 S 44 90, 40 105" className="welcome-road" />
                    <path d="M60 -5 C 62 20, 78 34, 72 58 S 80 88, 92 105" className="welcome-road welcome-road-thin" />
                    <path d="M30 34 C 42 30, 56 28, 68 26" className="welcome-route" />
                  </svg>
                  <span className="welcome-map-park" />
                  {SHOWCASE.map((item, index) => (
                    <span
                      key={item.title}
                      className={`welcome-pin ${index === activeIndex ? "is-active" : ""}`}
                      style={{ left: `${item.pin.x}%`, top: `${item.pin.y}%` }}
                    >
                      {sportEmoji[item.sport] ?? "•"}
                    </span>
                  ))}
                  <div className="welcome-map-card">
                    <p className="text-xs font-bold">{active.title}</p>
                    <p className="welcome-muted mt-0.5 text-[11px]">{active.where}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="welcome-toast welcome-toast-a">
              <span className="welcome-toast-icon">+1</span>
              <span><strong className="block text-xs">Nieuwe deelnemer</strong><span className="welcome-muted text-[11px]">Lisa doet mee met je padelpotje</span></span>
            </div>
            <div className="welcome-toast welcome-toast-b">
              <span className="welcome-toast-icon">💬</span>
              <span><strong className="block text-xs">Groepschat</strong><span className="welcome-muted text-[11px]">“Ik neem een extra bal mee!”</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* Sports marquee */}
      <div className="welcome-marquee" aria-label={`${sportList.length} sporten om uit te kiezen`}>
        <div className="welcome-marquee-track" aria-hidden="true">
          {[...sportList, ...sportList].map((sport, index) => (
            <span key={`${sport}-${index}`} className="welcome-marquee-item">
              <span aria-hidden="true">{sportEmoji[sport] ?? "•"}</span> {sport}
            </span>
          ))}
        </div>
      </div>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24 lg:px-12" aria-labelledby="welcome-steps-title">
        <div className="max-w-2xl" data-reveal>
          <p className="welcome-eyebrow">Zo werkt het</p>
          <h2 id="welcome-steps-title" className="welcome-h2 mt-2">Van eerste klik naar samen sporten.</h2>
          <p className="welcome-lead mt-4">Je hoeft niet al een team te hebben. Kijk wat er gebeurt, sluit aan of begin zelf iets.</p>
        </div>
        <ol className="welcome-steps mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="welcome-step" data-reveal style={{ transitionDelay: `${index * 120}ms` }}>
              <span className="welcome-step-number">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="mt-4 text-lg font-bold">{step.title}</h3>
              <p className="welcome-muted mt-2 text-sm leading-6">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section className="welcome-features-band" aria-labelledby="welcome-features-title">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24 lg:px-12">
          <div className="max-w-2xl" data-reveal>
            <p className="welcome-eyebrow">Alles wat je nodig hebt</p>
            <h2 id="welcome-features-title" className="welcome-h2 mt-2">Minder appen, meer bewegen.</h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature, index) => (
              <article
                key={feature.title}
                className="welcome-feature"
                data-reveal
                style={{ transitionDelay: `${index * 90}ms` }}
                onMouseMove={trackSpotlight}
              >
                <span className="welcome-feature-icon">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">{feature.icon}</svg>
                </span>
                <h3 className="mt-5 text-lg font-bold">{feature.title}</h3>
                <p className="welcome-muted mt-2 text-sm leading-6">{feature.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Final call to action */}
      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12" aria-labelledby="welcome-final-title">
        <div className="welcome-final" data-reveal>
          <div className="relative z-10 max-w-xl">
            <h2 id="welcome-final-title" className="text-2xl font-black tracking-tight text-white sm:text-3xl">Zin om in beweging te komen?</h2>
            <p className="mt-3 text-sm leading-6 text-emerald-50 sm:text-base">Maak een account aan en ontdek welke activiteiten bij jou in de buurt passen. Het is gratis.</p>
          </div>
          <div className="relative z-10 flex flex-wrap gap-3">
            <button type="button" onClick={onRegister} className="welcome-cta welcome-cta-light">
              Gratis registreren <span className="welcome-cta-arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" onClick={onLogin} className="welcome-secondary welcome-secondary-light">Inloggen</button>
          </div>
        </div>
        <p className="welcome-muted mt-10 text-center text-xs">SportConnect · Samen sporten in Nederland</p>
      </section>
    </section>
  );
}
