#!/usr/bin/env python3
"""Rebuild data/directory.json from the official gamescom exhibitor directory.

The directory has no public API, but its paginated AJAX endpoint answers without
a session, 20 entries per page, and reports the total in a `blaetternInfo(N)`
call. Every result item carries the company name, country and one hall-plan link
per stand (`halle=` / `standnr=`), which is everything the guide's directory
lookup needs.

    python3 tools/fetch-directory.py            # full show, writes data/directory.json
    python3 tools/fetch-directory.py --hall 10.1  # one hall, prints to stdout
    python3 tools/fetch-directory.py --skip-categories  # names and stands only, ~1 min

The same endpoint also filters by product group, which is where `cats` comes
from — see harvest_categories(). That sweep is what the trade list renders as
an exhibitor's categories, and it is most of the tool's runtime.

See docs/UPDATING.md. This file is the raw official list — the curated cards in
data/exhibitors.json are written by hand and are not generated from it.
"""

import argparse
import json
import pathlib
import re
import subprocess
import sys
import time
import urllib.parse

BASE = "https://exhibitors.gamescom.global/en/gamescom-exhibitors/list-of-exhibitors/"
PROFILE_BASE = "https://exhibitors.gamescom.global/en/exhibitor/"
PAGE = 20

# The endpoint accepts the search form's whole state as one JSON blob. Every key
# has to be present even when empty, so the hall filter rides along in a
# fully-populated copy of the untouched form.
FORM = {
    "stichwort": "", "suchart": "", "suchart2": "alle",
    "suchort": "", "suchort2": "alles",
    "GRUPPIERUNG[00098]": "", "origGRUPPIERUNG[00098]": "",
    "GRUPPIERUNG[00099]": "", "origGRUPPIERUNG[00099]": "",
    "hauptwarengruppe": "", "hauptwarengruppe2": "",
    "halle2": "", "orighalle2": "",
    "country2": "", "origcountry2": "",
    "alpha": "", "initial2": "", "stichwortTags": [""],
}

ITEM_RE = re.compile(r'<div class="item ["\s].*?(?=<div class="item ["\s]|</form>)', re.S)
NAME_RE = re.compile(
    r'<a href="/en/exhibitor/([^"]+)/"[^>]*class="initial_noline db-aslink">\s*<strong[^>]*>(.*?)</strong>',
    re.S,
)
COUNTRY_RE = re.compile(r'class="initial_noline db-aslink">.*?</a>\s*<p>\s*(.*?)\s*</p>', re.S)
STAND_RE = re.compile(r"halle=([^&\"]+)&standnr=([^&\"#]*)")
TOTAL_RE = re.compile(r"blaetternInfo\((\d+)\)")

# The product-group picker is not a <select> but a list of onclick handlers, each
# setting the filter id and carrying its label in a sibling <span rel="…">.
GROUP_RE = re.compile(
    r"""\$\('#hauptwarengruppe'\)\.val\('(\d+)'\).*?<span rel="\1"[^>]*>(.*?)</span>""", re.S
)


def url_for(start, hall=None, cat=None):
    query = f"?route=aussteller/blaettern&fw_ajax=1&start={start}"
    if hall or cat:
        form = dict(FORM)
        if hall:
            form.update(halle2=hall, orighalle2=hall)
        if cat:
            form.update(hauptwarengruppe=cat, hauptwarengruppe2=cat)
        blob = json.dumps(form, separators=(",", ":"))
        query += "&paginatevalues=" + urllib.parse.quote(blob, safe="")
    return BASE + query


def curl(url, floor=5000):
    """The endpoint answers a truncated page under load rather than an error, so
    a short body counts as a failure and is retried like a dropped connection."""
    for attempt in range(5):
        result = subprocess.run(
            ["curl", "-s", "--max-time", "90", url], capture_output=True, text=True
        )
        if result.returncode == 0 and len(result.stdout) > floor:
            return result.stdout
        time.sleep(2**attempt)
    return None


def fetch(start, hall=None, cat=None):
    html = curl(url_for(start, hall, cat))
    if html is None:
        raise SystemExit(f"directory fetch failed at start={start}")
    return html


def clean(raw):
    """Names arrive with trailing padding and the odd stray entity."""
    return re.sub(r"\s+", " ", raw).replace("&nbsp;", " ").strip()


def normalise_booth(raw):
    """`F010+E019` in the directory is `F010/E019` everywhere in this guide.

    URL-encoded commas survive the hall-plan links (`E035a%2C+E035`), so those
    are decoded before splitting or the separator ends up inside a booth number.
    """
    booth = urllib.parse.unquote(raw).strip()
    parts = [p.strip() for p in re.split(r"[+,/]", booth) if p.strip()]
    return "/".join(parts)


def parse(html):
    out = []
    body = html.split("<!-- AJAXRESULT -->", 1)[-1]
    for chunk in ITEM_RE.findall(body):
        name_match = NAME_RE.search(chunk)
        if not name_match:
            continue
        country = COUNTRY_RE.search(chunk)
        stands, seen = [], set()
        for hall, booth in STAND_RE.findall(chunk):
            stand = {"hall": urllib.parse.unquote(hall).strip(), "booth": normalise_booth(booth)}
            key = (stand["hall"], stand["booth"])
            if key not in seen:
                seen.add(key)
                stands.append(stand)
        out.append({
            "name": clean(name_match.group(2)),
            "country": clean(country.group(1)) if country else "",
            "slug": name_match.group(1),
            "stands": stands,
        })
    return out


def sweep(hall=None, cat=None, label=None):
    entries, seen, start, total = [], set(), 0, None
    while True:
        html = fetch(start, hall, cat)
        if total is None:
            match = TOTAL_RE.search(html)
            total = int(match.group(1)) if match else 0
            if label:
                print(f"{label}: {total}", file=sys.stderr)
            else:
                print(f"directory reports {total} exhibitors", file=sys.stderr)
        page = parse(html)
        if not page:
            break
        for entry in page:
            if entry["slug"] not in seen:
                seen.add(entry["slug"])
                entries.append(entry)
        if not label:
            print(f"  start={start} · {len(entries)}/{total}", file=sys.stderr)
        start += PAGE
        if start >= total:
            break
        time.sleep(0.25)
    entries.sort(key=lambda e: e["name"].lower())
    return entries, total


def harvest_categories():
    """Which product groups each exhibitor filed under.

    There is no per-exhibitor field for this — the taxonomy only exists as a
    search filter — so membership is read backwards: run the same paginated
    sweep once per group and record who comes back. About 28 ids, ~150 requests
    at the sweep's own pacing, and no per-profile fetching.

    Two quirks of the official picker are handled here. Labels come in
    near-duplicate id pairs ("600" and "601" are both *Service firms,
    contractors*) of which typically only one is populated, so ids are grouped
    by label and swept together under the lowest one that actually answers.
    And membership overlaps — a studio can be both *Development* and *Service
    firms* — so this is a list per exhibitor, not a single group.
    """
    page = curl(BASE, floor=50000)
    if page is None:
        raise SystemExit("could not load the search form to read its product groups")
    by_label = {}
    for gid, raw in GROUP_RE.findall(page):
        label = clean(re.sub(r"<[^>]+>", "", raw))
        if label:
            by_label.setdefault(label, []).append(gid)
    if not by_label:
        raise SystemExit("the search form no longer lists product groups — check GROUP_RE")
    print(f"product groups: {len(by_label)} labels across "
          f"{sum(len(v) for v in by_label.values())} ids", file=sys.stderr)

    groups, cats = {}, {}
    for label in sorted(by_label):
        members, keep = set(), None
        for gid in sorted(by_label[label], key=int):
            entries, _ = sweep(cat=gid, label=f"  [{gid}] {label}")
            if entries and keep is None:
                keep = gid
            members.update(entry["slug"] for entry in entries)
            time.sleep(0.25)
        # An id nobody filed under is a dead branch of the taxonomy, not a
        # category with zero members — it earns no entry in the table.
        if not members:
            continue
        groups[keep] = label
        for slug in members:
            cats.setdefault(slug, []).append(keep)
    return groups, cats


TOK_LEN = 5


def tok36(identity):
    """Mirror of tok36()/hash32() in js/app.js — see the note in js/marks.js on
    mirrored constants. A share link writes every saved item as this 5-char
    FNV-1a prefix, and trade rows enter that namespace as "dir:<slug>", so the
    tool that mints the slugs is where a collision should be caught.

    charCodeAt() walks UTF-16 code units, so astral characters hash as their
    surrogate pair; slugs are ASCII today and this keeps them agreeing anyway."""
    h = 0x811C9DC5
    raw = identity.encode("utf-16-be")
    for i in range(0, len(raw), 2):
        h ^= (raw[i] << 8) | raw[i + 1]
        h = (h * 0x01000193) & 0xFFFFFFFF
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    value = h
    while value:
        out = digits[value % 36] + out
        value //= 36
    return (out or "0").rjust(7, "0")[:TOK_LEN]


def is_business_hall(hall):
    """Mirror of isBusinessHall() in js/app.js: halls 2-4 are the business
    area. parseFloat's leading-number rule is what lets "F8" and "FI" fall
    out, so the match is anchored the same way rather than on float()."""
    match = re.match(r"\s*[-+]?(\d+\.?\d*|\.\d+)", str(hall))
    return bool(match) and 2 <= float(match.group(1)) < 5


def check_share_tokens(entries):
    """Every identity a share link can carry, hashed the way the guide hashes
    it. A token claimed twice is abandoned by both claimants at runtime — the
    item is silently unshareable rather than mistranslated — so this is a
    warning about what a visitor would quietly lose, not a corrupt file.

    Only rows with a business-hall stand are counted, because those are the
    only ones buildShareCodeMap() claims a "dir:" token for. Checking all 1658
    rows instead reports collisions against tokens the guide never mints."""
    cards = pathlib.Path("data/exhibitors.json")
    identities = {}
    if cards.exists():
        exhibitors = json.loads(cards.read_text())
        for ex in exhibitors:
            identities.setdefault(tok36(ex["id"]), []).append(ex["id"])
        for key in {
            " ".join(str(g["title"]).strip().lower().split())
            for ex in exhibitors
            for g in ex.get("games") or []
        }:
            identities.setdefault(tok36(key), []).append(key)
    for entry in entries:
        if not any(is_business_hall(s["hall"]) for s in entry.get("stands") or []):
            continue
        key = f"dir:{entry['slug']}"
        identities.setdefault(tok36(key), []).append(key)

    clashes = {tok: keys for tok, keys in identities.items() if len(keys) > 1}
    total = sum(len(keys) for keys in identities.values())
    if not clashes:
        print(f"share tokens: {total} identities, no collisions", file=sys.stderr)
        return
    print(f"warning: {len(clashes)} share-token collision(s) across {total} identities — "
          f"those items cannot ride a share link:", file=sys.stderr)
    for tok, keys in sorted(clashes.items()):
        print(f"  {tok}: {', '.join(sorted(keys))}", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--hall", help="restrict to one hall, e.g. 10.1 (prints to stdout)")
    ap.add_argument("--skip-categories", action="store_true",
                    help="names and stands only — skips the per-group sweep that fills `cats`")
    ap.add_argument("--out", default="data/directory.json")
    args = ap.parse_args()

    entries, total = sweep(args.hall)
    if len(entries) != total:
        print(f"warning: collected {len(entries)} of {total} reported", file=sys.stderr)

    payload = {
        "lastUpdated": time.strftime("%Y-%m-%d"),
        "count": len(entries),
        "source": BASE,
        "profileBase": PROFILE_BASE,
        "note": "Raw official exhibitor directory, refreshed with tools/fetch-directory.py. "
                "The curated cards in exhibitors.json are written by hand, not generated from this.",
        "exhibitors": entries,
    }

    # Categories are harvested for the whole show, not just the business halls
    # the trade list renders: the sweep yields both for the same requests, and
    # a business-only file would foreclose ever filtering the full directory.
    if not args.hall and not args.skip_categories:
        groups, cats = harvest_categories()
        for entry in entries:
            found = cats.get(entry["slug"])
            if found:
                entry["cats"] = sorted(found, key=int)
        payload["groups"] = {gid: groups[gid] for gid in sorted(groups, key=int)}
        tagged = sum(1 for entry in entries if entry.get("cats"))
        print(f"categories: {len(groups)} groups · {tagged}/{len(entries)} exhibitors tagged",
              file=sys.stderr)

    if args.hall:
        json.dump(payload, sys.stdout, indent=1, ensure_ascii=False)
        return
    check_share_tokens(entries)
    path = pathlib.Path(args.out)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"wrote {path} — {len(entries)} exhibitors", file=sys.stderr)


if __name__ == "__main__":
    main()
