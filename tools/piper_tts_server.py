import json
import os
import sys
import subprocess
import tempfile
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


HOST = os.environ.get("BOBOI_TTS_HOST", "127.0.0.1")
PORT = int(os.environ.get("BOBOI_TTS_PORT", "5505"))
PIPER_EXE = os.environ.get("PIPER_EXE", "piper")
PIPER_MODEL = os.environ.get("PIPER_MODEL", "")
PIPER_CONFIG = os.environ.get("PIPER_CONFIG", "")
VOICES_DIR = Path(os.environ.get("BOBOI_VOICES_DIR", Path(__file__).resolve().parents[1] / "voices"))
LOG_FILE = os.environ.get("BOBOI_TTS_LOG", "")


class TtsHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/voices":
            self.send_json(200, {"voices": list_voices()})
            return

        if self.path not in ("/", "/tts"):
            self.send_error(404, "Use /tts")
            return

        body = (
            "BOBOI Piper TTS server is running.\n\n"
            "This endpoint is meant for POST /tts, not direct browser GET.\n\n"
            "Voice list: GET /voices\n\n"
            "Example request body:\n"
            "{\"text\":\"Hello boboi\", \"voice\":\"en_US-amy-medium\"}\n"
        ).encode("utf-8")

        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_POST(self):
        if self.path != "/tts":
            self.send_error(404, "Use /tts")
            return

        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length)

        try:
            payload = json.loads(body.decode("utf-8"))
            text = str(payload.get("text", "")).strip()
            requested_voice = str(payload.get("voice", "")).strip()
        except Exception:
            self.send_error(400, "Expected JSON body: {\"text\":\"...\"}")
            return

        if not text:
            self.send_error(400, "Missing text")
            return

        try:
            model_path, config_path = resolve_voice(requested_voice)
        except ValueError as error:
            log(f"Voice resolution failed: {error}")
            self.send_error(400, str(error))
            return

        with tempfile.TemporaryDirectory() as temp_dir:
            out_file = Path(temp_dir) / "boboi.wav"
            command = build_piper_command() + [
                "-m",
                str(model_path),
                "-f",
                str(out_file),
            ]

            if config_path:
                command.extend(["-c", str(config_path)])

            try:
                log(f"Synthesizing voice={requested_voice or 'default'} chars={len(text)} model={model_path}")
                subprocess.run(
                    command,
                    input=text,
                    text=True,
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
                audio = out_file.read_bytes()
                log(f"Synthesized {len(audio)} bytes")
            except subprocess.CalledProcessError as error:
                log(f"Piper failed: {error.stderr[-1000:] if error.stderr else error}")
                self.send_error(500, error.stderr[-1000:] or "Piper failed")
                return
            except FileNotFoundError:
                log("Piper executable was not found")
                self.send_error(
                    500,
                    "Piper executable was not found. Install with `python -m pip install piper-tts`, "
                    "then restart this server.",
                )
                return

        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(audio)))
        self.end_headers()
        self.wfile.write(audio)

    def log_message(self, format, *args):
        log(f"{self.address_string()} - {format % args}")

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def list_voices():
    voices = []
    if not VOICES_DIR.exists():
        return voices

    for model_path in sorted(VOICES_DIR.glob("*.onnx")):
        config_path = model_path.with_suffix(model_path.suffix + ".json")
        voices.append({
            "id": model_path.stem,
            "name": model_path.stem.replace("_", " "),
            "model": str(model_path),
            "hasConfig": config_path.exists()
        })

    return voices


def build_piper_command():
    explicit_piper = os.environ.get("PIPER_EXE")
    if explicit_piper:
        return [explicit_piper]

    # The pip package always supports module execution. This avoids relying on
    # the Python Scripts directory being present in PATH on Windows.
    return [sys.executable, "-m", "piper"]


def log(message):
    line = f"[{datetime.now().isoformat(timespec='seconds')}] [BOBOI TTS] {message}"
    print(line, flush=True)
    if LOG_FILE:
        log_path = Path(LOG_FILE)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")


def resolve_voice(requested_voice):
    if PIPER_MODEL:
        model_path = Path(PIPER_MODEL)
        config_path = Path(PIPER_CONFIG) if PIPER_CONFIG else model_path.with_suffix(model_path.suffix + ".json")
        return model_path, config_path if config_path.exists() else None

    voices = list_voices()
    if not voices:
        raise ValueError(f"No Piper voices found in {VOICES_DIR}")

    voice = None
    if requested_voice:
        voice = next((candidate for candidate in voices if candidate["id"] == requested_voice), None)
        if not voice:
            raise ValueError(f"Voice not found: {requested_voice}")
    else:
        voice = voices[0]

    model_path = Path(voice["model"])
    config_path = model_path.with_suffix(model_path.suffix + ".json")
    return model_path, config_path if config_path.exists() else None


if __name__ == "__main__":
    print(f"BOBOI Piper TTS server running at http://{HOST}:{PORT}/tts")
    print(f"Voice folder: {VOICES_DIR}")
    print("Set PIPER_MODEL only if you want to force one specific .onnx voice file.")
    ThreadingHTTPServer((HOST, PORT), TtsHandler).serve_forever()
