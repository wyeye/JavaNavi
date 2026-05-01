#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
BACKEND_DIR="$ROOT_DIR/backend"
BACKEND_VERSION="$(awk '
  /<artifactId>javanavi-backend<\/artifactId>/ { found = 1; next }
  found && /<version>/ {
    sub(/.*<version>/, "")
    sub(/<\/version>.*/, "")
    print
    exit
  }
' "$BACKEND_DIR/pom.xml")"
if [[ -z "$BACKEND_VERSION" ]]; then
  echo "Unable to read javanavi-backend version from $BACKEND_DIR/pom.xml" >&2
  exit 1
fi
JAR_PATH="$BACKEND_DIR/target/javanavi-backend-$BACKEND_VERSION.jar"

if [[ ! -f "$JAR_PATH" ]]; then
  "$ROOT_DIR/scripts/package-web.sh"
fi

export JAVA_HOME
exec "$JAVA_HOME/bin/java" -jar "$JAR_PATH"
