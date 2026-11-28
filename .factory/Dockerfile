FROM node:22-bookworm

# Versions match the CLI interfaces checked while implementing this dispatcher.
# Update deliberately and run the offline contracts before rebuilding.
ARG CODEX_VERSION=0.148.0
ARG FACTORY_UID=1000
ARG FACTORY_GID=1000
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 git ca-certificates \
    && npm install -g @openai/codex@${CODEX_VERSION} \
    && npx --yes --package=@playwright/test@1.65.1 playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /workspace /home/node/.codex \
    && (getent group ${FACTORY_GID} || groupadd --gid ${FACTORY_GID} factory) \
    && usermod --uid ${FACTORY_UID} --gid ${FACTORY_GID} node \
    && chown -R ${FACTORY_UID}:${FACTORY_GID} /workspace /home/node /opt/browsers

ENV HOME=/home/node
ENV CODEX_HOME=/home/node/.codex
COPY --chmod=0444 read-tools.py /opt/factory-read-tools.py
COPY --chmod=0444 model-catalog.json /opt/factory-model-catalog.json
USER ${FACTORY_UID}:${FACTORY_GID}
WORKDIR /workspace
