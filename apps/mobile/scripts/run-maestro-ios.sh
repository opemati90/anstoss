#!/bin/zsh

set -euo pipefail

export PATH="$PATH:$HOME/.maestro/bin"
export MAESTRO_CLI_NO_ANALYTICS=1

maestro test .maestro
