"""Visual/contrast audit of SportConnect with headless Chromium + axe-core.

Usage (in the sc-playwright container, --network host, scratchpad mounted on /work):
  python /work/audit.py <run-name>
Env: SC_EMAIL, SC_PASSWORD, IDS="i1 i2 i3 i4", FRIEND_ID
"""
import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
RUN = sys.argv[1] if len(sys.argv) > 1 else "run"
OUT = Path("/work/audit") / RUN
OUT.mkdir(parents=True, exist_ok=True)
AXE = Path("/work/vendor/axe.min.js").read_text()
IDS = os.environ["IDS"].split()
FRIEND = os.environ.get("FRIEND_ID", "6")
VIEWPORTS = {"desktop": {"width": 1440, "height": 900}, "mobile": {"width": 390, "height": 844}}
ONLY = os.environ.get("ONLY")  # optional comma list of state names

report = {"contrast": [], "incomplete": [], "console": [], "http": [], "errors": []}


def axe_check(page, state):
    page.add_script_tag(content=AXE)
    result = page.evaluate(
        """async () => {
            const r = await axe.run(document, { runOnly: ['color-contrast'], resultTypes: ['violations', 'incomplete'] });
            const pick = (items) => items.flatMap(v => v.nodes.map(n => ({
                target: n.target.join(' '), html: n.html.slice(0, 160),
                data: (n.any[0] || {}).data || null, message: (n.any[0] || {}).message || ''
            })));
            return { violations: pick(r.violations), incomplete: pick(r.incomplete) };
        }"""
    )
    for node in result["violations"]:
        report["contrast"].append({"state": state, **node})
    for node in result["incomplete"]:
        report["incomplete"].append({"state": state, **node})


def shot(page, state):
    page.wait_for_timeout(700)
    page.screenshot(path=str(OUT / f"{state}.png"), full_page=False)
    axe_check(page, state)


def attach_listeners(page, label):
    page.on("console", lambda m: m.type == "error" and report["console"].append({"where": label, "url": page.url, "text": m.text[:300]}))
    page.on("pageerror", lambda e: report["errors"].append({"where": label, "url": page.url, "text": str(e)[:300]}))
    page.on("response", lambda r: r.status >= 400 and "tile.openstreetmap" not in r.url and report["http"].append({"where": label, "status": r.status, "url": r.url}))


def want(name):
    return not ONLY or any(part in name for part in ONLY.split(","))


with sync_playwright() as p:
    browser = p.chromium.launch()
    for theme in ("light", "dark"):
        for vp_name, vp in VIEWPORTS.items():
            tag = f"{theme}-{vp_name}"
            # Logged out
            ctx = browser.new_context(viewport=vp, locale="nl-NL")
            ctx.add_init_script(f"localStorage.setItem('sportconnect-theme', '{theme}')")
            page = ctx.new_page(); attach_listeners(page, tag + "-anon")
            if want("welcome"):
                page.goto(BASE + "/"); page.wait_for_timeout(1500); shot(page, f"{tag}-welcome")
                page.get_by_role("button", name="Ik heb al een account").first.click(); shot(page, f"{tag}-login-modal")
            if want("forgot"):
                page.goto(BASE + "/wachtwoord-vergeten"); shot(page, f"{tag}-forgot")
                page.goto(BASE + "/wachtwoord-herstellen?token=" + "x" * 43); shot(page, f"{tag}-reset")
            ctx.close()

            # Logged in
            ctx = browser.new_context(viewport=vp, locale="nl-NL")
            ctx.add_init_script(f"localStorage.setItem('sportconnect-theme', '{theme}')")
            r = ctx.request.post(BASE + "/api/auth/login", data={"email": os.environ["SC_EMAIL"], "wachtwoord": os.environ["SC_PASSWORD"]})
            assert r.ok, r.text()
            page = ctx.new_page(); attach_listeners(page, tag)
            if want("home"):
                page.goto(BASE + "/"); page.wait_for_timeout(2000); shot(page, f"{tag}-home")
                page.get_by_role("button", name="Bekijk", exact=False).first.click(); shot(page, f"{tag}-preview")
                page.get_by_role("button", name="Volledige activiteit bekijken").click(); shot(page, f"{tag}-details")
                page.goto(BASE + "/"); page.wait_for_timeout(1200)
                page.get_by_role("button", name="Activiteit aanmaken").first.click(); shot(page, f"{tag}-create")
                page.mouse.wheel(0, 2000); page.wait_for_timeout(300); shot(page, f"{tag}-create-bottom")
                page.keyboard.press("Escape")
                page.goto(BASE + "/"); page.wait_for_timeout(1200)
                page.locator(".chat-fab").click(); page.wait_for_timeout(900); shot(page, f"{tag}-chathub")
                page.keyboard.press("Escape")
                page.get_by_role("button", name="Meldingen openen", exact=False).click(); shot(page, f"{tag}-notifications")
            if want("pages"):
                for name, path in [("profile", "/profile"), ("friends", "/friends"), ("user", f"/users/{FRIEND}"),
                                   ("messages", f"/messages/{FRIEND}"), ("chat", f"/activities/{IDS[0]}/chat"),
                                   ("settings", f"/activities/{IDS[0]}/settings")]:
                    page.goto(BASE + path); page.wait_for_timeout(1500); shot(page, f"{tag}-{name}")
                page.goto(BASE + "/profile"); page.wait_for_timeout(1200)
                page.mouse.wheel(0, 4000); page.wait_for_timeout(400); shot(page, f"{tag}-profile-bottom")
            ctx.close()
    browser.close()

(OUT / "report.json").write_text(json.dumps(report, indent=1, ensure_ascii=False))
print(json.dumps({k: len(v) for k, v in report.items()}))
