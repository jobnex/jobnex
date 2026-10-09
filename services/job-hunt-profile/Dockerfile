FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 RESUME_SCRIPTS_DIR=/app
WORKDIR /app
COPY service/requirements.txt service/requirements.txt
RUN pip install --no-cache-dir -r service/requirements.txt
COPY scripts/resume_to_json.py scripts/resume_json_to_preferences.py scripts/
COPY service/main.py service/main.py
COPY service/confirmation.py service/confirmation.py
COPY service/resume_content.py service/resume_content.py
COPY service/test_main.py service/test_main.py
COPY service/test_resume_content.py service/test_resume_content.py
RUN JOB_HUNT_SERVICE_SECRET=container-test-only python -m unittest service.test_main service.test_resume_content
RUN useradd --create-home appuser
USER appuser
CMD ["sh", "-c", "exec uvicorn service.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
