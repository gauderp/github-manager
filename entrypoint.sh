#!/bin/bash
set -e

# Inject Claude Code credentials from secret env var
if [ -n "$CLAUDE_CREDENTIALS_JSON" ]; then
  mkdir -p /root/.claude
  echo "$CLAUDE_CREDENTIALS_JSON" > /root/.claude/.credentials.json
  echo "Claude Code credentials injected"
fi

# Inject Cursor credentials from secret env vars
if [ -n "$CURSOR_AUTH_JSON" ]; then
  mkdir -p /root/.cursor
  echo "$CURSOR_AUTH_JSON" > /root/.cursor/auth.json
  echo "Cursor auth.json injected"
fi

if [ -n "$CURSOR_CLI_CONFIG_JSON" ]; then
  mkdir -p /root/.cursor
  echo "$CURSOR_CLI_CONFIG_JSON" > /root/.cursor/cli-config.json
  echo "Cursor cli-config.json injected"
fi

# Inject GitHub CLI auth from secret env var
if [ -n "$GH_TOKEN" ]; then
  echo "GitHub CLI token configured via GH_TOKEN"
fi

# Start Paperclip in background, install pending plugins, then foreground it
paperclipai run --data-dir /app/data --no-repair &
PAPERCLIP_PID=$!

# Wait for Paperclip API to be ready
echo "Waiting for Paperclip API..."
for i in $(seq 1 60); do
  if curl -sf http://127.0.0.1:3100/api/health > /dev/null 2>&1; then
    echo "Paperclip API ready"
    break
  fi
  sleep 1
done

# Install staged plugins
for tgz in /app/plugins/*.tgz; do
  [ -f "$tgz" ] || continue
  plugin_name=$(basename "$tgz" .tgz)
  echo "Installing plugin: $plugin_name"
  if paperclipai plugin install "$tgz" --data-dir /app/data --local 2>&1; then
    echo "Plugin $plugin_name installed successfully"
    rm "$tgz"
  else
    echo "Plugin $plugin_name install failed (may already be installed)"
  fi
done

# Wait for the Paperclip process
wait $PAPERCLIP_PID
