#!/bin/bash
set -euo pipefail
"$(dirname "$0")/cleanup.sh" started
printf 'Oseo runner job start: '
sw_vers -productVersion
