import hmac, json, os, subprocess, tempfile, threading, urllib.parse, urllib.request, urllib.error
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
CAPACITY = int(os.environ.get("PDF_CONCURRENCY", "4"))
slots = threading.BoundedSemaphore(CAPACITY)
TEMPLATES = {"mit-capd":2,"modern-ivy":3,"tech-specialist":6,"minimalist-exec":5,"contemporary-compact":3,"standard-overleaf":2}
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def send_json(self, status, value):
        body=json.dumps(value).encode()
        self.send_response(status); self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(body))); self.send_header("Cache-Control","no-store")
        self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        self.send_json(200, {"status":"ok","capacity":CAPACITY}) if self.path == "/health" else self.send_json(404, {})
    def do_POST(self):
        if self.path != "/api/v1/ui-export": return self.send_json(404,{})
        secret=os.environ.get("RESUME_COMPILER_SECRET","")
        if not secret or not hmac.compare_digest(self.headers.get("Authorization",""),"Bearer "+secret):
            return self.send_json(401,{"error":"Unauthorized"})
        try:
            length=int(self.headers.get("Content-Length","0"))
            if length <= 0 or length > 256000: return self.send_json(413,{"error":"Request too large"})
            data=json.loads(self.rfile.read(length))
            if TEMPLATES.get(data.get("templateId")) != data.get("theme") or not isinstance(data.get("resume"),dict): raise ValueError()
            url=urllib.parse.urlparse(data.get("uploadUrl",""))
            if url.scheme != "https" or not (url.hostname or "").endswith(".r2.cloudflarestorage.com") or url.username or url.port not in (None,443):
                raise ValueError()
        except (ValueError, TypeError): return self.send_json(400,{"error":"Invalid export"})
        if not slots.acquire(blocking=False): return self.send_json(429,{"error":"Compiler busy; retry shortly"})
        try:
            with tempfile.TemporaryDirectory(prefix="resume-export-") as folder:
                work=Path(folder); source=work/"request.json"
                source.write_text(json.dumps(data["resume"],ensure_ascii=False),encoding="utf-8")
                binary=os.environ.get("RESUME_RUST_BIN",str(Path(__file__).parent/"resume-builder-rs"))
                result=subprocess.run([binary,"--ui-json",str(data["theme"]),"resume",str(source)],cwd=folder,capture_output=True,timeout=50)
                if result.returncode: raise RuntimeError()
                pdf=(work/"resume.pdf").read_bytes()
                if not pdf.startswith(b"%PDF-"): raise RuntimeError()
                request=urllib.request.Request(data["uploadUrl"],data=pdf,method="PUT",headers={"Content-Type":"application/pdf"})
                with urllib.request.build_opener(NoRedirect).open(request,timeout=25) as response:
                    if response.status not in (200,201,204): raise RuntimeError()
            self.send_json(200,{"uploaded":True,"fileSize":len(pdf)})
        except (OSError,RuntimeError,subprocess.TimeoutExpired,urllib.error.URLError):
            self.send_json(502,{"error":"Compilation or R2 upload failed"})
        finally: slots.release()
if __name__ == "__main__":
    ThreadingHTTPServer((os.environ.get("HOST","127.0.0.1"),int(os.environ.get("PORT","8081"))),Handler).serve_forever()
