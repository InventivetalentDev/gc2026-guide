#!/bin/sh
# Stages the deployable site into dist/, which is what `wrangler deploy`
# uploads. Run it from anywhere; it works on the repo root.
#
# The site itself still has no build step — dist/ is a copy, not a compile, and
# `python3 -m http.server` in the repo root serves the real thing exactly as
# before. It exists because a Worker's asset directory has to hold the site and
# nothing else. Pointing wrangler at the repo root does technically work, since
# .assetsignore keeps the docs out of the upload, but `wrangler dev` does not
# apply that file to its file watcher: it writes .wrangler/ into the directory
# it is watching, sees its own scratch files change, and reloads forever.
#
# Every top-level entry has to be named in one of the two lists below. That is
# the point of them: a new asset directory nobody added here fails the deploy
# with the message at the bottom, rather than 404ing quietly in production
# because the copy step never knew about it.
set -eu

cd "$(dirname "$0")/.."

SITE="_headers css data fonts icons imprint.html index.html js manifest.webmanifest map.html privacy.html sw.js"

# Repo furniture, plus CNAME: that one is GitHub Pages' custom-domain marker,
# and Cloudflare takes its hostnames from the routes in wrangler.toml instead.
NOT_SITE=".git .github .gitignore .idea .wrangler CNAME README.md LICENSE dist docs tools wrangler.toml"

unclassified=""
for entry in $(ls -A); do
  case " $SITE $NOT_SITE " in
    *" $entry "*) ;;
    *) unclassified="$unclassified $entry" ;;
  esac
done

if [ -n "$unclassified" ]; then
  echo "build-site.sh: unclassified top-level entries:$unclassified" >&2
  echo "Add each to SITE (ships to the edge) or NOT_SITE (stays in the repo)." >&2
  exit 1
fi

rm -rf dist
mkdir dist
for entry in $SITE; do
  cp -R "$entry" dist/
done

echo "staged $(find dist -type f | wc -l | tr -d ' ') files into dist/"
