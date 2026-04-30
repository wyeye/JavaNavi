#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
JAR_PATH="$ROOT_DIR/backend/target/javanavi-backend-0.1.0.jar"

if [[ ! -f "$JAR_PATH" ]]; then
  "$ROOT_DIR/scripts/package-web.sh"
fi

export JAVA_HOME
exec "$JAVA_HOME/bin/java" -jar "$JAR_PATH"
