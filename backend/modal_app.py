"""Deploy Riemann Audio Lab backend (FastAPI + Demucs) ke Modal.
Cara deploy: modal deploy backend/modal_app.py
"""
import os
import subprocess
import pathlib
import modal

BACKEND_DIR = pathlib.Path(__file__).parent

app = modal.App(
    "riemann-audio-lab-api",
    image=modal.Image.from_dockerfile(
        "Dockerfile",
        context_dir=str(BACKEND_DIR),
    ),
)

vol = modal.Volume.from_name("riemann-data", create_if_missing=True)
secret = modal.Secret.from_name("riemann-yt-cookies")


@app.function(
    volumes={"/data": vol},
    secret=secret,
    cpu=4.0,
    memory=16000,  # MiB
    min_containers=1,  # hindari scale-down saat job berjalan
    timeout=3600,
)
@modal.web_server(port=8000, startup_timeout=120)
def serve():
    os.environ["JOBS_DIR"] = "/data/jobs"
    os.environ["HF_HOME"] = "/data/hf"
    os.environ["CLIENT_ORIGINS"] = os.environ.get(
        "CLIENT_ORIGINS", "https://audio-separation-navy.vercel.app"
    )
    subprocess.Popen(
        ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "75"]
    )
