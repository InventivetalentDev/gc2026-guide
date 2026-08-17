#!/bin/sh
# Stages the deployable site into dist/, which is what `wrangler deploy`
# uploads. Run it from anywhere; it works on the repo root.
#
# The client still has no compilation step — dist/ is a copy, not a compile, and
# `python3 -m http.server` in the repo root serves the real thing exactly as
# before. It exists because a Worker's asset directory has to hold the site and
# nothing else. Pointing Wrangler at the repo root would mix server code,
# documentation and package metadata into the asset tree; it also makes local
# development watch the same directory where Wrangler writes its own scratch
# files.
#
# Every top-level entry has to be named in one of the two lists below. That is
# the point of them: a new asset directory nobody added here fails the deploy
# with the message at the bottom, rather than 404ing quietly in production
# because the copy step never knew about it.
set -eu

cd "$(dirname "$0")/.."

SITE="_headers css data fonts icons imprint.html index.html js manifest.de.webmanifest manifest.webmanifest map.html privacy.html sw.js"

# Repo furniture. CNAME used to sit here too — GitHub Pages' custom-domain
# marker — until Pages went; Cloudflare takes its hostnames from the routes in
# wrangler.toml instead.
NOT_SITE=".agents .codex .git .github .gitignore .idea .wrangler README.md LICENSE dist docs node_modules package-lock.json package.json test tools vitest.config.js vitest.config.mjs worker worker-configuration.d.ts wrangler.toml"

unclassified=""
for entry in $(ls -A); do
  case " $SITE $NOT_SITE " in
    *" $entry "*) ;;
    *)
      case "$entry" in
        .dev.vars|.dev.vars.*|.env|.env.*) ;;
        *) unclassified="$unclassified $entry" ;;
      esac
      ;;
  esac
done

if [ -n "$unclassified" ]; then
  echo "build-site.sh: unclassified top-level entries:$unclassified" >&2
  echo "Add each to SITE (ships to the edge) or NOT_SITE (stays in the repo)." >&2
  exit 1
fi

# Missing or stale German would ship as English fragments in a German page,
# which is exactly the kind of quiet breakage the check above exists to
# prevent. No SITE change is needed for the new files: js/i18n/ and
# data/i18n/ sit inside the already-listed js and data entries, and the
# cp -R below carries them.
node tools/check-i18n.mjs

rm -rf dist
mkdir dist
for entry in $SITE; do
  cp -R "$entry" dist/
done

echo "staged $(find dist -type f | wc -l | tr -d ' ') files into dist/"
