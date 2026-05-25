FROM node:22-slim

# Install dependencies for Claude Code and GitHub CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install Cursor CLI
RUN curl https://cursor.com/install -fsS | bash
ENV PATH="/root/.local/bin:${PATH}"

# Install Paperclip and Claude Code
RUN npm install -g paperclipai@latest @anthropic-ai/claude-code@latest

WORKDIR /app

# Create instance directory structure
RUN mkdir -p /app/data/instances/default/secrets \
             /app/data/instances/default/data/storage \
             /app/data/instances/default/data/backups \
             /app/data/instances/default/logs \
             /root/.claude

COPY config.json /app/data/instances/default/config.json
COPY master.key /app/data/instances/default/secrets/master.key

# Stage GitHub Manager plugin for runtime install
COPY gaud_erp-paperclip-github-manager-1.0.0.tgz /app/plugins/github-manager.tgz

# Entrypoint script to inject credentials from env vars at runtime
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 3100

CMD ["/app/entrypoint.sh"]
