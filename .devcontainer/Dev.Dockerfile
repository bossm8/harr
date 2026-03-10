FROM python:3.14

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      nodejs \
      npm \
    && useradd -ms /bin/bash harr

# Pre-install Python test dependencies system-wide
RUN --mount=type=bind,src=./requirements-test.txt,dst=/tmp/requirements-test.txt,ro \
    pip install -r /tmp/requirements-test.txt

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NODE_PATH=/opt/harr-ui/node_modules \
    PATH="/opt/harr-ui/node_modules/.bin:$PATH"

RUN --mount=type=bind,src=./tests/ui/package.json,dst=/tmp/package.json,ro \
    --mount=type=bind,src=./tests/ui/package-lock.json,dst=/tmp/package-lock.json,ro \
    mkdir -p /opt/harr-ui \
    && cp /tmp/package.json /tmp/package-lock.json /opt/harr-ui \
    && npm ci --prefix /opt/harr-ui \
    && npx --prefix /opt/harr-ui playwright install chromium --with-deps \
    && rm -rf /opt/harr-ui/package.*.json \
    && chmod -R a+rX /opt/harr-ui /ms-playwright

USER harr

ENV PATH="/home/harr/.local/bin:$PATH"

WORKDIR /home/harr

RUN curl -fsSL https://claude.ai/install.sh | bash \
    && echo "alias apt='apt-get -o Acquire::http::proxy=\"http://proxy:3128\"'" >> ~/.bashrc
