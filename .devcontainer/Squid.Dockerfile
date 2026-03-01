ARG SQUID_VERSION=7.4

FROM alpine:latest AS build

ARG SQUID_VERSION
ARG TARGETARCH

RUN apk add --no-cache  \
		  autoconf \
		  automake \
		  curl \
		  g++ \
		  gcc \
		  gnupg \
		  libc-dev \
		  libtool \
		  linux-headers \
		  make \
		  openssl-dev \
		  openssl-libs-static \
		  perl-dev \
		  pkgconfig

WORKDIR /tmp/build

RUN curl -LO --fail "https://github.com/squid-cache/squid/releases/download/SQUID_${SQUID_VERSION//./_}/squid-${SQUID_VERSION}.tar.gz" \
    && tar --strip 1 -xzf squid-${SQUID_VERSION}.tar.gz

ENV CFLAGS="-g0 -O2"
ENV CXXFLAGS="-g0 -O2"
ENV LDFLAGS="-s"

RUN ./configure \
		  --prefix=/usr \
		  --datadir=/usr/share/squid \
		  --sysconfdir=/etc/squid \
		  --libexecdir=/usr/lib/squid \
		  --localstatedir=/var \
		  --with-logdir=/var/log/squid \
		  --with-pidfile=/var/run/squid/squid.pid \
		  --with-default-user=squid \
		  --with-openssl \
		  --enable-follow-x-forwarded-for \
		  --enable-openssl \
		  --enable-referer-log \
		  --enable-ssl-crtd \
		  --enable-truncate \
		  --enable-useragent-log

RUN make -j $(nproc) \
	  && make install

# ---

FROM alpine:latest

ENV SQUID_CONFIG_FILE=/etc/squid/squid.conf

RUN apk add --no-cache \
		  libstdc++ \
		  libltdl \
    && addgroup -S squid -g 3128 \
    && adduser -S -u 3128 -G squid -g squid -H -D -s /bin/false -h /var/cache/squid squid \
    && install -d -o squid -g squid \
		    /var/cache/squid \
		    /var/log/squid \
		    /var/run/squid \
	  && install -d -m 755 -o squid -g squid \
		    /etc/squid/conf.d

COPY --from=build /etc/squid/ /etc/squid/
COPY --from=build /usr/lib/squid/ /usr/lib/squid/
COPY --from=build /usr/share/squid/ /usr/share/squid/
COPY --from=build /usr/sbin/squid /usr/sbin/squid
COPY --chown=squid:squid assets/squid.conf /etc/squid/squid.conf
COPY --chmod=755 assets/squid-entrypoint.sh /entrypoint.sh

EXPOSE 3128/tcp

USER squid

ENTRYPOINT ["/entrypoint.sh"]