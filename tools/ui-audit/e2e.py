"""Functional browser test of the main SportConnect flows (headless Chromium).

python /work/e2e.py   (env SC_EMAIL, SC_PASSWORD, SC_EMAIL2, SC_PASSWORD2)
"""
import json
import os
from datetime import date, datetime, timedelta
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

BASE = "http://localhost:3000"
OUT = Path("/work/audit/e2e"); OUT.mkdir(parents=True, exist_ok=True)
results, problems = [], []


def check(name, fn):
    try:
        fn(); results.append(("OK", name))
    except Exception as error:  # noqa: BLE001 - report every failing step
        results.append(("FAIL", name)); problems.append(f"{name}: {str(error)[:400]}")


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="nl-NL",
                              geolocation={"latitude": 51.4416, "longitude": 5.4697}, permissions=["geolocation"])
    ctx.request.post(BASE + "/api/auth/login", data={"email": os.environ["SC_EMAIL"], "wachtwoord": os.environ["SC_PASSWORD"]})
    other = browser.new_context()  # test account 2
    other.request.post(BASE + "/api/auth/login", data={"email": os.environ["SC_EMAIL2"], "wachtwoord": os.environ["SC_PASSWORD2"]})
    page = ctx.new_page()
    page.on("console", lambda m: m.type == "error" and problems.append(f"console: {m.text[:200]} @ {page.url}"))
    page.on("pageerror", lambda e: problems.append(f"pageerror: {e} @ {page.url}"))
    page.on("response", lambda r: r.status >= 400 and "tile.openstreetmap" not in r.url and problems.append(f"http {r.status}: {r.url}"))

    title = "[TEST] Via de kaart gekozen"
    start = (date.today() + timedelta(days=4)).isoformat()

    def create_with_map_picker():
        page.goto(BASE + "/"); page.wait_for_timeout(1500)
        page.get_by_role("button", name="Activiteit aanmaken").first.click()
        dialog = page.get_by_role("dialog", name="Activiteit aanmaken")
        dialog.get_by_label("Titel").fill(title)
        dialog.get_by_label("Datum").fill(start)
        dialog.get_by_label("Starttijd").fill("19:00")
        dialog.get_by_role("button", name="Kies op kaart").click()
        picker = page.get_by_role("dialog", name="Kies een locatie op de kaart")
        expect(picker).to_be_visible()
        page.wait_for_timeout(1200)
        box = picker.locator(".leaflet-container").bounding_box()
        page.mouse.click(box["x"] + box["width"] * 0.55, box["y"] + box["height"] * 0.5)
        expect(picker.get_by_text("Gekozen locatie")).to_be_visible(timeout=10000)
        page.screenshot(path=str(OUT / "picker.png"))
        picker.get_by_role("button", name="Deze locatie gebruiken").click()
        expect(picker).to_be_hidden()
        expect(dialog.get_by_text("Adres geselecteerd")).to_be_visible()
        assert dialog.locator("#activity-location").input_value(), "location field stayed empty"
        dialog.get_by_role("button", name="Activiteit publiceren").click()
        expect(page.get_by_role("heading", name=title)).to_be_visible(timeout=10000)
        page.screenshot(path=str(OUT / "created.png"))
    check("Activiteit aanmaken met locatie via de kaart", create_with_map_picker)

    def my_location_button():
        page.goto(BASE + "/"); page.wait_for_timeout(1200)
        page.get_by_role("button", name="Activiteit aanmaken").first.click()
        page.get_by_role("button", name="Kies op kaart").click()
        picker = page.get_by_role("dialog", name="Kies een locatie op de kaart")
        picker.get_by_role("button", name="Mijn locatie").click()
        expect(picker.get_by_text("Gekozen locatie")).to_be_visible(timeout=10000)
        page.keyboard.press("Escape")
        expect(picker).to_be_hidden()
        expect(page.get_by_role("dialog", name="Activiteit aanmaken")).to_be_visible()  # Escape closes only the picker
    check("Kaartkiezer: Mijn locatie en Escape", my_location_button)

    def pins_click_only():
        page.goto(BASE + "/"); page.wait_for_timeout(2000)
        pin = page.locator(f'.sport-pin[aria-label*="{title}"]')
        expect(pin).to_have_count(1)
        # dispatch on the pin itself: other [TEST] pins nearby may overlap it
        pin.dispatch_event("mouseover"); page.wait_for_timeout(400)
        assert page.locator(".leaflet-tooltip").count() == 0, "tooltip shown on hover"
        pin.dispatch_event("click")
        expect(page.get_by_role("dialog").get_by_role("heading", name=title)).to_be_visible()
    check("Kaartpin met sporticoon, geen hover, klik opent preview", pins_click_only)

    def chat_hub():
        page.goto(BASE + "/"); page.wait_for_timeout(1200)
        page.locator(".chat-fab").click()
        panel = page.get_by_role("dialog", name="Chats")
        expect(panel.locator(".chat-hub-item").first).to_be_visible(timeout=8000)
        color = panel.locator(".chat-hub-title").first.evaluate("e => getComputedStyle(e).color")
        assert color not in ("rgb(255, 255, 255)",), f"chat title is white: {color}"
        total = panel.locator(".chat-hub-item").count()
        panel.get_by_role("tab", name="Privé").click()
        private = panel.locator(".chat-hub-item").count()
        assert 0 < private < total, (private, total)
        page.keyboard.press("Escape"); expect(panel).to_be_hidden()
    check("Chatpaneel: titels zichtbaar, tabs filteren, Escape sluit", chat_hub)

    def notifications_wrap():
        # account 2 joins our activity, so there is at least one notification
        own = [r["activiteit_id"] for r in ctx.request.get(BASE + "/api/activities").json() if r["titel"] == title]
        other.request.post(f"{BASE}/api/activities/{own[0]}/join")
        page.goto(BASE + "/"); page.wait_for_timeout(1000)
        page.get_by_role("button", name="Meldingen openen", exact=False).click()
        item = page.locator(".notification-dropdown button").nth(1)
        expect(item).to_be_visible(timeout=5000)
        ws = item.evaluate("e => getComputedStyle(e).whiteSpace")
        assert ws != "nowrap", "notification text does not wrap"
    check("Meldingen: tekst loopt door (niet afgekapt)", notifications_wrap)

    def settings_change_location():
        ids = [int(r["activiteit_id"]) for r in ctx.request.get(BASE + "/api/activities").json() if r["titel"] == title]
        page.goto(f"{BASE}/activities/{ids[0]}/settings"); page.wait_for_timeout(1500)
        page.get_by_role("button", name="Kies op kaart").click()
        picker = page.get_by_role("dialog", name="Kies een locatie op de kaart")
        page.wait_for_timeout(1000)
        box = picker.locator(".leaflet-container").bounding_box()
        page.mouse.click(box["x"] + box["width"] * 0.3, box["y"] + box["height"] * 0.3)
        expect(picker.get_by_text("Gekozen locatie")).to_be_visible(timeout=10000)
        picker.get_by_role("button", name="Deze locatie gebruiken").click()
        page.get_by_role("button", name="Wijzigingen opslaan").click()
        expect(page.get_by_text("De wijzigingen zijn opgeslagen.")).to_be_visible(timeout=8000)
    check("Instellingen: locatie wijzigen via de kaart en opslaan", settings_change_location)

    def friends_search():
        page.goto(BASE + "/friends"); page.wait_for_timeout(800)
        page.get_by_role("searchbox").or_(page.locator('input[type="search"], input[placeholder*="naam" i]')).first.fill("Claude")
        page.keyboard.press("Enter")
        expect(page.get_by_text("Claude Testaccount 2").first).to_be_visible(timeout=8000)
    check("Vrienden zoeken", friends_search)

    def header_logout_spacing():
        page.goto(BASE + "/profile"); page.wait_for_timeout(800)
        avatar = page.locator(".header-avatar").bounding_box()
        logout = page.locator(".header-logout").bounding_box()
        gap = logout["x"] - (avatar["x"] + avatar["width"])
        assert gap >= 8, f"gap between avatar and logout only {gap}px"
        page.screenshot(path=str(OUT / "header.png"), clip={"x": 900, "y": 0, "width": 540, "height": 64})
    check("Header: ruimte tussen avatar en Uitloggen", header_logout_spacing)

    def login_via_form():
        anon = browser.new_context(viewport={"width": 1440, "height": 900}, locale="nl-NL").new_page()
        anon.goto(BASE + "/"); anon.wait_for_timeout(1000)
        anon.get_by_role("button", name="Inloggen", exact=True).first.click()
        dialog = anon.get_by_role("dialog", name="Welkom terug")
        dialog.get_by_label("E-mailadres").fill(os.environ["SC_EMAIL"])
        dialog.get_by_label("Wachtwoord", exact=True).fill(os.environ["SC_PASSWORD"])
        dialog.get_by_role("button", name="Inloggen", exact=True).first.click()
        expect(anon.locator(".header-avatar")).to_be_visible(timeout=8000)
        anon.context.close()
    check("Inloggen via het formulier", login_via_form)

    def join_someone_elses_activity():
        other_title = "[TEST] Activiteit van account 2"
        start_at = (datetime.now() + timedelta(days=5)).replace(second=0, microsecond=0).isoformat()
        created = other.request.post(BASE + "/api/activities", data={
            "sport_id": 1, "titel": other_title, "starttijd": start_at, "maximaal_aantal_deelnemers": 6,
            "locatie_naam": "Stratumseind 1, Eindhoven", "woonplaats": "Eindhoven", "land": "Nederland",
            "breedtegraad": 51.437, "lengtegraad": 5.481,
        })
        assert created.status == 201, created.text()
        page.goto(BASE + "/"); page.wait_for_timeout(1500)
        page.get_by_role("button", name=f"Bekijk {other_title}").first.click()
        page.get_by_role("button", name="Volledige activiteit bekijken").click()
        page.get_by_role("button", name="Deelnemen", exact=True).click()
        expect(page.get_by_role("button", name="Afmelden voor activiteit")).to_be_visible(timeout=8000)
        page.screenshot(path=str(OUT / "joined.png"))
    check("Deelnemen aan een activiteit van iemand anders", join_someone_elses_activity)

    def forgot_password():
        anon = browser.new_context(viewport={"width": 1440, "height": 900}, locale="nl-NL").new_page()
        anon.goto(BASE + "/wachtwoord-vergeten")
        anon.get_by_label("E-mailadres").fill("bestaat-niet-claude-test@example.com")
        anon.get_by_role("button", name="Stuur mij een herstellink").click()
        expect(anon.get_by_role("heading", name="Check je inbox")).to_be_visible(timeout=8000)
    check("Wachtwoord vergeten: aanvraag", forgot_password)

    browser.close()

print("\n".join(f"{status:4} {name}" for status, name in results))
print("PROBLEMS:" if problems else "No console errors or failed requests.")
for line in dict.fromkeys(problems):
    print("  -", line)
