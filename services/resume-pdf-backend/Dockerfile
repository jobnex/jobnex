FROM rust:1.97-bookworm AS builder
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY resume-document-v1.schema.json ./resume-document-v1.schema.json
COPY tests/canonical-fixture.json ./tests/canonical-fixture.json
RUN cargo test --release --locked && cargo build --release --locked

FROM builder AS test-builder
RUN cargo test --release --locked --no-default-features --features local-test && cargo build --release --locked --no-default-features --features local-test

FROM ghcr.io/typst/typst:0.15.1 AS typst
FROM debian:bookworm-slim AS runtime-base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 fonts-liberation python3 python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 app && useradd --uid 10001 --gid app --no-create-home app
RUN python3 -m venv /opt/pdfcheck && /opt/pdfcheck/bin/pip install --no-cache-dir pdfplumber==0.11.9 pypdf==6.10.0
WORKDIR /app
COPY --from=builder /build/target/release/resume-cloud-backend /app/resume-cloud-backend
COPY --from=typst /bin/typst /usr/local/bin/typst
COPY resume.typ /app/resume.typ
COPY validate_pdf.py /app/validate_pdf.py
# Supply licensed Arial/Times New Roman font files here to preserve Windows wrapping.
COPY fonts/ /app/fonts/
ENV HOST=0.0.0.0 PORT=8080 APP_ROOT=/app TYPST_BIN=/usr/local/bin/typst TYPST_FONT_PATHS=/app/fonts MAX_COMPILATIONS=2 COMPILE_TIMEOUT_SECONDS=45 PDF_CHECKER_PYTHON=/opt/pdfcheck/bin/python CERTIFIED_PUBLICATION_ENABLED=false RESUME_CERTIFIED_PUBLICATION_STRICT=false
USER 10001:10001
EXPOSE 8080
CMD ["/app/resume-cloud-backend"]

# The test stage exercises Linux binaries without putting the test adapter in production.
FROM runtime-base AS tester
USER root
RUN apt-get update && apt-get install -y --no-install-recommends nodejs && rm -rf /var/lib/apt/lists/* \
    && /opt/pdfcheck/bin/pip install --no-cache-dir reportlab==4.4.9
COPY --from=test-builder /build/target/release/resume-cloud-backend /app/test-resume-cloud-backend
COPY tests/ /app/tests/
COPY resume-document-v1.schema.json /app/resume-document-v1.schema.json
ENV SKIP_BUILD=true PDF_TEST_BINARY=/app/test-resume-cloud-backend CERTIFIED_SHARED_SCHEMA=/app/resume-document-v1.schema.json EXPECT_FONT_WARNINGS=arial,times\ new\ roman
RUN node tests/certified-render.mjs && node tests/certified-api.mjs && node tests/certified-build.mjs

FROM runtime-base AS final
