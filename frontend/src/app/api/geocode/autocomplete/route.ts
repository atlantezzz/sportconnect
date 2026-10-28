import { NextResponse } from "next/server";


const GEOAPIFY_URL =
  "https://api.geoapify.com/v1/geocode/autocomplete";

export async function GET(request: Request) {
  const apiKey = process.env.GEOAPIFY_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Adreszoeken is momenteel niet geconfigureerd." },
      { status: 503 },
    );
  }

  const requestUrl = new URL(request.url);
  const text = (requestUrl.searchParams.get("text") ?? "").trim();

  if (text.length < 3) {
    return NextResponse.json({ features: [] });
  }

  if (text.length > 200) {
    return NextResponse.json(
      { error: "De zoekopdracht is te lang." },
      { status: 400 },
    );
  }

  const upstreamUrl = new URL(GEOAPIFY_URL);
  upstreamUrl.searchParams.set("text", text);
  upstreamUrl.searchParams.set("apiKey", apiKey);
  upstreamUrl.searchParams.set("filter", "countrycode:nl");
  upstreamUrl.searchParams.set("lang", "nl");
  upstreamUrl.searchParams.set("limit", "5");
  upstreamUrl.searchParams.set("format", "geojson");

  try {
    const response = await fetch(upstreamUrl.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error(
        "Geoapify-autocomplete gaf HTTP-status:",
        response.status,
      );

      return NextResponse.json(
        { error: "Adressen ophalen is mislukt. Probeer het opnieuw." },
        { status: 502 },
      );
    }

    const data = await response.json();

    const features = Array.isArray(data.features)
      ? data.features.map((feature: {
          properties?: Record<string, unknown>;
          geometry?: {
            coordinates?: unknown;
            type?: string;
          };
        }) => {
          const properties = feature.properties ?? {};
          const coordinates = feature.geometry?.coordinates;

          return {
            id: properties.place_id ?? null,
            formatted: properties.formatted ?? "",
            straatnaam: properties.street ?? null,
            huisnummer: properties.housenumber ?? null,
            postcode: properties.postcode ?? null,
            woonplaats:
              properties.city ??
              properties.town ??
              properties.village ??
              properties.municipality ??
              null,
            land: properties.country ?? "Nederland",
            breedtegraad:
              Array.isArray(coordinates) &&
              typeof coordinates[1] === "number"
                ? coordinates[1]
                : typeof properties.lat === "number"
                  ? properties.lat
                  : null,
            lengtegraad:
              Array.isArray(coordinates) &&
              typeof coordinates[0] === "number"
                ? coordinates[0]
                : typeof properties.lon === "number"
                  ? properties.lon
                  : null,
          };
        })
      : [];

    return NextResponse.json(
      { features },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error(
      "Geoapify-autocomplete niet bereikbaar:",
      error instanceof Error ? error.message : "Onbekende fout",
    );

    return NextResponse.json(
      { error: "Adreszoeken is tijdelijk niet beschikbaar." },
      { status: 502 },
    );
  }
}
