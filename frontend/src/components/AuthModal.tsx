"use client";

import { useState, type FormEvent } from "react";

export type AuthMode = "login" | "register";

type AuthModalProps = {
  mode: AuthMode;
  onClose: () => void;
  onSwitchMode: (mode: AuthMode) => void;
  onAuthenticated: (name: string, userId: number, registered?: boolean) => void;
};

export default function AuthModal({
  mode,
  onClose,
  onSwitchMode,
  onAuthenticated,
}: AuthModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [age, setAge] = useState("18");
  const [city, setCity] = useState("Eindhoven");
  const [country, setCountry] = useState("Nederland");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Je wachtwoord moet minimaal 8 tekens bevatten.");
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setError("De wachtwoorden komen niet overeen.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        isRegister ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(
            isRegister
              ? {
                  naam: name.trim(),
                  email: email.trim(),
                  wachtwoord: password,
                  leeftijd: Number(age),
                  woonplaats: city.trim(),
                  land: country.trim(),
                }
              : {
                  email: email.trim(),
                  wachtwoord: password,
                },
          ),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.detail ?? "Inloggen of registreren is mislukt.",
        );
      }

      if (!result.user?.naam) {
        throw new Error("De server gaf geen geldige gebruikersgegevens terug.");
      }

      if (typeof result.user.gebruiker_id !== "number") {
        throw new Error("De server gaf geen geldige gebruikers-ID terug.");
      }

      onAuthenticated(result.user.naam, result.user.gebruiker_id, isRegister);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "De server is momenteel niet bereikbaar.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-title"
    >
      <div className="relative my-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Venster sluiten"
          className="absolute right-4 top-4 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          ×
        </button>

        <div className="mb-6">
          <h2
            id="auth-title"
            className="text-2xl font-bold tracking-tight text-gray-900"
          >
            {isRegister ? "Account aanmaken" : "Welkom terug"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            {isRegister
              ? "Maak een account aan om samen te sporten."
              : "Log in om verder te gaan met SportConnect."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <>
              <div>
                <label htmlFor="auth-name" className="mb-1 block text-sm font-medium text-gray-700">
                  Naam
                </label>
                <input
                  id="auth-name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  minLength={2}
                  maxLength={100}
                  className="w-full rounded-lg border border-gray-200 px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label htmlFor="auth-age" className="mb-1 block text-sm font-medium text-gray-700">
                  Leeftijd
                </label>
                <input
                  id="auth-age"
                  type="number"
                  min={13}
                  max={120}
                  value={age}
                  onChange={(event) => setAge(event.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-200 px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label htmlFor="auth-city" className="mb-1 block text-sm font-medium text-gray-700">
                  Woonplaats
                </label>
                <input
                  id="auth-city"
                  autoComplete="address-level2"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  required
                  minLength={2}
                  maxLength={100}
                  className="w-full rounded-lg border border-gray-200 px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label htmlFor="auth-country" className="mb-1 block text-sm font-medium text-gray-700">
                  Land
                </label>
                <input
                  id="auth-country"
                  autoComplete="country-name"
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  required
                  minLength={2}
                  maxLength={100}
                  className="w-full rounded-lg border border-gray-200 px-3 py-3 text-sm"
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="auth-email" className="mb-1 block text-sm font-medium text-gray-700">
              E-mailadres
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              maxLength={254}
              className="w-full rounded-lg border border-gray-200 px-3 py-3 text-sm"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="mb-1 block text-sm font-medium text-gray-700">
              Wachtwoord
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={128}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-3 text-sm"
            />
          </div>

          {isRegister && (
            <div>
              <label htmlFor="auth-confirm-password" className="mb-1 block text-sm font-medium text-gray-700">
                Bevestig wachtwoord
              </label>
              <input
                id="auth-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                required
                className="w-full rounded-lg border border-gray-200 px-3 py-3 text-sm"
              />
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
          >
            {loading
              ? "Even wachten..."
              : isRegister
                ? "Registreren"
                : "Inloggen"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          {isRegister ? "Heb je al een account?" : "Nog geen account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setError("");
              onSwitchMode(isRegister ? "login" : "register");
            }}
            className="font-semibold text-emerald-700 hover:text-emerald-900"
          >
            {isRegister ? "Inloggen" : "Registreren"}
          </button>
        </p>
      </div>
    </div>
  );
}
