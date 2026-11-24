#!/usr/bin/env bash
# Trigger a Render deploy hook for $GITHUB_SHA. Inputs (env): HOOK (secret), NAME (secret name), WHAT.
# Cleans pasted values (spaces, line breaks, quotes) and explains a bad secret without printing it.
set -u

hook=$(printf '%s' "${HOOK:-}" | tr -d ' \t\r\n')
hook=${hook#\"}; hook=${hook%\"}; hook=${hook#\'}; hook=${hook%\'}

if [ -z "$hook" ]; then
  echo "::warning::$NAME secret is not set; $WHAT not deployed."
  exit 0
fi

if [[ "$hook" != https://api.render.com/deploy/srv-* || "$hook" != *"key="* ]]; then
  starts=$([[ "$hook" == https://* ]] && echo yes || echo no)
  host=$([[ "$hook" == *api.render.com/deploy/* ]] && echo yes || echo no)
  key=$([[ "$hook" == *"key="* ]] && echo yes || echo no)
  echo "::error::$NAME is not a Render deploy hook URL (expected https://api.render.com/deploy/srv-…?key=…)." \
       "Checks: ${#hook} characters, starts with https:// = $starts, api.render.com/deploy = $host, has key= = $key." \
       "Copy it again from Render -> service -> Settings -> Deploy Hook."
  exit 1
fi

sep='?'; [[ "$hook" == *\?* ]] && sep='&'
rc=0
code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${hook}${sep}ref=${GITHUB_SHA}") || rc=$?
if [ "$rc" -ne 0 ]; then
  echo "::error::Could not reach Render for the $WHAT deploy (curl exit $rc)."
  exit 1
fi
echo "Render answered HTTP $code for the $WHAT deploy"
case "$code" in
  200|202) echo "triggered=true" >> "$GITHUB_OUTPUT" ;;
  401) echo "::error::Render rejected $NAME (HTTP 401): the key in the hook URL is wrong or was regenerated."; exit 1 ;;
  404) echo "::error::Render answered 404 for $NAME: unknown service or commit."; exit 1 ;;
  *) echo "::error::Render answered HTTP $code for the $WHAT deploy."; exit 1 ;;
esac
