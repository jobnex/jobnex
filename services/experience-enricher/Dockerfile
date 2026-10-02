FROM rust:1.97.1-bookworm AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY db ./db
RUN cargo build --locked --release && cargo test --locked

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/release/experience-enricher /usr/local/bin/experience-enricher
USER 65532:65532
ENTRYPOINT ["experience-enricher"]
