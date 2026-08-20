#!/usr/bin/env bash
#
# The two probes that tell you a Cloud Run revision is actually usable.
#
# One script rather than two copies, because the daily bug hunt and the deploy both need
# exactly these checks and a copy in each is how the two drift until one of them is quietly
# wrong. Same reasoning as lib/email/merge-tags.ts: what has to agree lives in one place.
#
# Subcommands, so the bug hunt keeps a separate step (and therefore a separate issue title)
# per failure mode while the deploy can run both in one go:
#
#   answers <url>   /login must be 200. /api/health is probed and reported but never gates:
#                   it answers 307 by design, because every page goes through the identity
#                   seam.
#   bundle  <url>   A client chunk must contain the Identity Platform browser key. This is
#                   the only evidence sign-in CAN work: NEXT_PUBLIC_* is inlined at build
#                   time, so a value set on the Cloud Run service reaches the server and
#                   never the browser. That failure has cost this project two days, twice,
#                   and it deploys perfectly green.
#   all     <url>   Both. What the deploy runs.
#
# The 200 check retries, because a revision that has just taken traffic can refuse one
# request while it warms. Three attempts over ~10s does not hide an outage, and a smoke
# check that flakes gets switched off, which is worse than not having one.

set -uo pipefail

MODE="${1:-}"
URL="${2:-}"
if [ -z "$MODE" ] || [ -z "$URL" ]; then
  echo "usage: smoke.sh <answers|bundle|all> <base-url>" >&2
  exit 2
fi
URL="${URL%/}"

probe() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$1" || echo 000
}

check_answers() {
  local code=""
  for attempt in 1 2 3; do
    code=$(probe "${URL}/login")
    [ "$code" = "200" ] && break
    echo "/login -> ${code} (attempt ${attempt})"
    [ "$attempt" -lt 3 ] && sleep 5
  done
  echo "/login -> ${code}"
  echo "/api/health -> $(probe "${URL}/api/health")"
  if [ "$code" != "200" ]; then
    echo "The running service is not answering on /login, whatever the last deploy said."
    return 1
  fi
  return 0
}

check_bundle() {
  local html chunk
  html=$(curl -s --max-time 40 "${URL}/login")
  for chunk in $(printf '%s' "$html" | grep -oE '/_next/static/chunks/[^"]+\.js' | sort -u | head -40); do
    if curl -s --max-time 40 "${URL}${chunk}" | grep -q 'AIzaSy'; then
      echo "Identity Platform config present in the bundle (${chunk})."
      return 0
    fi
  done
  echo "The Identity Platform API key is NOT in the client bundle."
  echo "Sign-in cannot work: NEXT_PUBLIC_* values are inlined at build time, so the build"
  echo "did not receive them as build arguments."
  return 1
}

case "$MODE" in
  answers) check_answers ;;
  bundle)  check_bundle ;;
  all)
    # Run both before reporting, so one failure does not hide the other's result.
    rc=0
    check_answers || rc=1
    check_bundle  || rc=1
    exit $rc
    ;;
  *) echo "unknown mode: $MODE" >&2; exit 2 ;;
esac
