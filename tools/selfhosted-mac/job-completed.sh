#!/bin/bash
set -euo pipefail
"$(dirname "$0")/cleanup.sh" completed
printf 'Oseo runner job complete: '
sw_vers -productVersion
