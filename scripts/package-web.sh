#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
STATIC_DIR="$BACKEND_DIR/src/main/resources/static"
TARGET_STATIC_DIR="$BACKEND_DIR/target/classes/static"
BACKEND_JAR="$BACKEND_DIR/target/javanavi-backend-0.1.0.jar"
JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
MAVEN_REPO="${MAVEN_REPO:-$ROOT_DIR/.m2/repository}"
MAVEN_PROFILES="${MAVEN_PROFILES:-}"
MAVEN_EXTRA_ARGS="${MAVEN_EXTRA_ARGS:-}"

safe_rm_under_root() {
  local target
  for target in "$@"; do
    if [[ -z "$target" ]]; then
      echo "Refusing to remove an empty path" >&2
      exit 1
    fi
    local parent resolved
    parent="$(dirname "$target")"
    mkdir -p "$parent"
    resolved="$(cd "$parent" && pwd -P)/$(basename "$target")"
    case "$resolved" in
      "$ROOT_DIR"/*) rm -rf "$resolved" ;;
      *)
        echo "Refusing to remove path outside repository: $target" >&2
        exit 1
        ;;
    esac
  done
}

read_maven_extra_args() {
  if [[ -z "$MAVEN_EXTRA_ARGS" ]]; then
    return 0
  fi
  local -a extra_args=()
  local arg
  read -r -a extra_args <<< "$MAVEN_EXTRA_ARGS"
  for arg in "${extra_args[@]}"; do
    case "$arg" in
      -D*|-P*|--batch-mode|--offline|--no-transfer-progress|-U) printf '%s\0' "$arg" ;;
      *)
        echo "Unsupported MAVEN_EXTRA_ARGS entry: $arg" >&2
        echo "Allowed prefixes: -D, -P, --batch-mode, --offline, --no-transfer-progress, -U" >&2
        exit 1
        ;;
    esac
  done
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command npm
require_command mvn

if [[ ! -d "$JAVA_HOME" ]]; then
  echo "JAVA_HOME does not exist: $JAVA_HOME" >&2
  echo "Set JAVA_HOME to a Java 17+ installation and rerun." >&2
  exit 1
fi

export JAVA_HOME
mkdir -p "$MAVEN_REPO"

printf '\n== Build React static assets ==\n'
(
  cd "$FRONTEND_DIR"
  npm ci
  npm run build
)

printf '\n== Stage React assets for Spring Boot ==\n'
safe_rm_under_root "$STATIC_DIR" "$TARGET_STATIC_DIR"
mkdir -p "$STATIC_DIR"
cp -R "$FRONTEND_DIR/dist/." "$STATIC_DIR/"
rm -f "$BACKEND_JAR" "$BACKEND_JAR.original"

printf '\n== Build Java Web package ==\n'
(
  cd "$BACKEND_DIR"
  MAVEN_ARGS=(-Dmaven.repo.local="$MAVEN_REPO" -DskipTests)
  if [[ -n "$MAVEN_PROFILES" ]]; then
    MAVEN_ARGS+=("-P$MAVEN_PROFILES")
  fi
  if [[ -n "$MAVEN_EXTRA_ARGS" ]]; then
    while IFS= read -r -d '' arg; do
      MAVEN_ARGS+=("$arg")
    done < <(read_maven_extra_args)
  fi
  mvn "${MAVEN_ARGS[@]}" package
)

JAR_PATH="$BACKEND_DIR/target/javanavi-backend-0.1.0.jar"
if [[ ! -f "$JAR_PATH" ]]; then
  echo "Expected jar not found: $JAR_PATH" >&2
  exit 1
fi

if ! "$JAVA_HOME/bin/jar" tf "$JAR_PATH" | grep -q 'BOOT-INF/classes/static/index.html'; then
  echo "Packaged jar does not contain React static index.html" >&2
  exit 1
fi

printf 'WEB_PACKAGE_JAR=%s\n' "$JAR_PATH"
printf 'WEB_PACKAGE_BUILD=passed\n'
