#!/usr/bin/env bash
# Jump the booted iOS simulator straight into a mock-backend scenario.
#
# Usage:
#   ./scripts/sim-as.sh player
#   ./scripts/sim-as.sh coach
#   ./scripts/sim-as.sh club-admin
#   ./scripts/sim-as.sh parent
#   ./scripts/sim-as.sh free-agent
#   ./scripts/sim-as.sh signed-out
#
# Requires Metro to be running on the default port (8082) and the
# Anstoss app to be installed in the booted simulator.

set -euo pipefail

SCENARIO="${1:-}"
PORT="${EXPO_PORT:-8082}"

case "$SCENARIO" in
  player|coach|club-admin|parent|free-agent|signed-out)
    ;;
  *)
    echo "Usage: $0 {player|coach|club-admin|parent|free-agent|signed-out}" >&2
    exit 1
    ;;
esac

# Expo dev-client deep link → /e2e?scenario=<role>
PATH_PART="/--/e2e?scenario=${SCENARIO}"
INNER_URL="http://localhost:${PORT}${PATH_PART}"
ENC=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$INNER_URL")
DEEP_LINK="exp+anstoss://expo-development-client/?url=${ENC}"

echo "→ Switching simulator to scenario: $SCENARIO"
xcrun simctl openurl booted "$DEEP_LINK"
echo "  Done. The app should now show the $SCENARIO mock state."
