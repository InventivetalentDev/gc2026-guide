#!/usr/bin/env python3
"""Rebuild data/directory.json from the official gamescom exhibitor directory.

The directory has no public API, but its paginated AJAX endpoint answers without
a session, 20 entries per page, and reports the total in a `blaetternInfo(N)`
call. Every result item carries the company name, country and one hall-plan link
per stand (`halle=` / `standnr=`), which is everything the guide's directory
lookup needs.

    python3 tools/fetch-directory.py            # full show, writes data/directory.json
    python3 tools/fetch-directory.py --hall 10.1  # one hall, prints to stdout

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


def url_for(start, hall=None):
    query = f"?route=aussteller/blaettern&fw_ajax=1&start={start}"
    if hall:
        form = dict(FORM, halle2=hall, orighalle2=hall)
        blob = json.dumps(form, separators=(",", ":"))
        query += "&paginatevalues=" + urllib.parse.quote(blob, safe="")
    return BASE + query


def fetch(start, hall=None):
    url = url_for(start, hall)
    for attempt in range(5):
        result = subprocess.run(
            ["curl", "-s", "--max-time", "90", url], capture_output=True, text=True
        )
        if result.returncode == 0 and len(result.stdout) > 5000:
            return result.stdout
        time.sleep(2**attempt)
    raise SystemExit(f"directory fetch failed at start={start}")


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


def sweep(hall=None):
    entries, seen, start, total = [], set(), 0, None
    while True:
        html = fetch(start, hall)
        if total is None:
            match = TOTAL_RE.search(html)
            total = int(match.group(1)) if match else 0
            print(f"directory reports {total} exhibitors", file=sys.stderr)
        page = parse(html)
        if not page:
            break
        for entry in page:
            if entry["slug"] not in seen:
                seen.add(entry["slug"])
                entries.append(entry)
        print(f"  start={start} · {len(entries)}/{total}", file=sys.stderr)
        start += PAGE
        if start >= total:
            break
        time.sleep(0.25)
    entries.sort(key=lambda e: e["name"].lower())
    return entries, total


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--hall", help="restrict to one hall, e.g. 10.1 (prints to stdout)")
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

    if args.hall:
        json.dump(payload, sys.stdout, indent=1, ensure_ascii=False)
        return
    path = pathlib.Path(args.out)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"wrote {path} — {len(entries)} exhibitors", file=sys.stderr)


if __name__ == "__main__":
    main()
