FROM python:3.14

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
    && useradd -ms /bin/bash harr

USER harr

ENV PATH="/home/harr/.local/bin:$PATH"

WORKDIR /home/harr

RUN curl -fsSL https://claude.ai/install.sh | bash \
    && echo "alias apt='apt-get -o Acquire::http::proxy=\"http://proxy:3128\"'" >> ~/.bashrc
