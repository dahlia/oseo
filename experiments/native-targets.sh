#!/usr/bin/env bash

oseo_host=$(uname -s):$(uname -m)
case "$oseo_host" in
  Darwin:arm64)
    oseo_execution_target=macos-aarch64
    ;;
  Linux:x86_64)
    oseo_execution_target=linux-x86_64-gnu
    ;;
  *)
    echo "unsupported native execution host: $oseo_host" >&2
    exit 1
    ;;
esac

oseo_zig_target() {
  case "$1" in
    linux-aarch64-musl)
      echo aarch64-linux-musl
      ;;
    linux-x86_64-gnu)
      echo x86_64-linux-gnu
      ;;
    macos-aarch64)
      echo aarch64-macos
      ;;
    *)
      echo "unsupported Oseo target: $1" >&2
      return 1
      ;;
  esac
}

oseo_zig_execution_target=$(oseo_zig_target "$oseo_execution_target")
oseo_configured_targets=(
  linux-x86_64-gnu
  macos-aarch64
  linux-aarch64-musl
)
oseo_sanitizer=address,undefined
