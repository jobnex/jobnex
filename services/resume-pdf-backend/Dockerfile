FROM rust:1.97-bookworm AS builder
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo test --release --locked && cargo build --release --locked

FROM ghcr.io/typst/typst:0.15.1 AS typst
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 fonts-liberation \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 app && useradd --uid 10001 --gid app --no-create-home app
WORKDIR /app
COPY --from=builder /build/target/release/resume-cloud-backend /app/resume-cloud-backend
COPY --from=typst /bin/typst /usr/local/bin/typst
COPY resume.typ /app/resume.typ
# Supply licensed Arial/Times New Roman font files here to preserve Windows wrapping.
COPY fonts/ /app/fonts/
ENV HOST=0.0.0.0 PORT=8080 APP_ROOT=/app TYPST_BIN=/usr/local/bin/typst TYPST_FONT_PATHS=/app/fonts MAX_COMPILATIONS=2 COMPILE_TIMEOUT_SECONDS=45
USER 10001:10001
EXPOSE 8080
CMD ["/app/resume-cloud-backend"]
