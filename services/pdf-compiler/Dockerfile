FROM rust:slim AS builder
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --bin resume-builder-rs
FROM python:3.12-slim
COPY --from=ghcr.io/typst/typst:latest /bin/typst /usr/local/bin/typst
WORKDIR /app
COPY --from=builder /build/target/release/resume-builder-rs ./resume-builder-rs
COPY fonts /usr/share/fonts/truetype/resume
COPY server.py .
ENV HOST=0.0.0.0 PORT=8080 PDF_CONCURRENCY=4
RUN useradd --create-home compiler
USER compiler
CMD ["python","server.py"]
