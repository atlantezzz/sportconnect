import { NextResponse } from "next/server";

const GEOAPIFY_REVERSE_URL = "https://api.geoapify.com/v1/geocode/reverse";

// Address for a point picked on the map, in the same shape as /api/geocode/autocomplete.
export async function GET(request: Request) {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Adreszoeken is momenteel niet geconfigureerd." }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: "Ongeldige coördinaten." }, { status: 400 });
  }

  const upstreamUrl = new URL(GEOAPIFY_REVERSE_URL);
  upstreamUrl.searchParams.set("lat", String(lat));
  upstreamUrl.searchParams.set("lon", String(lon));
  upstreamUrl.searchParams.set("lang", "nl");
  upstreamUrl.searchParams.set("format", "json");
  upstreamUrl.searchParams.set("apiKey", apiKey);

  try {
    const response = await fetch(upstreamUrl.toString(), { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      console.error("Geoapify-reverse gaf HTTP-status:", response.status);
      return NextResponse.json({ error: "Het adres kon niet worden opgezocht." }, { status: 502 });
    }
    const data = await response.json();
    const place = Array.isArray(data.results) ? data.results[0] : undefined;

    // The point itself is always kept, also when there is no address nearby.
    const location = {
      id: place?.place_id ?? null,
      // Geoapify returns an empty "formatted" for e.g. points at sea.
      formatted: place?.formatted || place?.name || `Gekozen punt (${lat.toFixed(5)}, ${lon.toFixed(5)})`,
      straatnaam: place?.street ?? null,
      huisnummer: place?.housenumber ?? null,
      postcode: place?.postcode ?? null,
      woonplaats: place?.city ?? place?.town ?? place?.village ?? place?.municipality ?? null,
      land: place?.country ?? null,
      breedtegraad: lat,
      lengtegraad: lon,
    };
    return NextResponse.json({ location }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Geoapify-reverse niet bereikbaar:", error instanceof Error ? error.message : "Onbekende fout");
    return NextResponse.json({ error: "Adreszoeken is tijdelijk niet beschikbaar." }, { status: 502 });
  }
}
