#!/usr/bin/env bash

oseo_host=$(uname -s):$(uname -m)
case "$oseo_host" in
  Darwin:arm64)
    oseo_execution_target=aarch64-macos
    ;;
  Linux:x86_64)
    oseo_execution_target=x86_64-linux-gnu
    ;;
  *)
    echo "unsupported native execution host: $oseo_host" >&2
    exit 1
    ;;
esac

oseo_configured_targets=(
  x86_64-linux-gnu
  aarch64-macos
  aarch64-linux-musl
)
oseo_sanitizer=address,undefined
