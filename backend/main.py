"""
Riemann Audio Lab API
Job-based Spotify resolver: YouTube search via yt-dlp → Demucs (htdemucs) → cached stems.
Stems disimpan sebagai MP3 192kbps agar ringan di-fetch browser (±6 MB / stem).
"""
import os
import shutil
import hashlib
import threading
import subprocess
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import requests
import yt_dlp

BASE_DIR = Path(__file__).resolve().parent
JOBS_DIR = Path(os.environ.get("JOBS_DIR", BASE_DIR / "cache" / "jobs"))
JOBS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Riemann Audio Lab API", version="1.1.0")

allowed = [o for o in os.environ.get("CLIENT_ORIGINS", "*").split(",") if o]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(JOBS_DIR)), name="static")


class TrackRequest(BaseModel):
    url: str


JOBS: dict[str, dict[str, Any]] = {}
JOBS_LOCK = threading.Lock()


def set_job(job_id: str, **fields: Any) -> None:
    with JOBS_LOCK:
        JOBS.setdefault(job_id, {})
        JOBS[job_id].update(fields)


def resolve_metadata(url: str) -> tuple[str, str]:
    """Metadata via Spotify oEmbed resmi (tanpa API key), fallback saat bukan link Spotify."""
    try:
        if "open.spotify.com" in url or "spotify:" in url:
            res = requests.get("https://open.spotify.com/oembed", params={"url": url}, timeout=8)
            if res.ok:
                data = res.json()
                title = data.get("title", "")
                if " by " in title:
                    a, b = title.split(" by ", 1)
                    return a.strip(), b.strip()
                return title.strip(), "Spotify"
    except Exception:
        pass
    return url[-40:], "Resolver"


def run_pipeline(job_id: str, source_url: str) -> None:
    workdir = JOBS_DIR / job_id
    workdir.mkdir(parents=True, exist_ok=True)
    try:
        set_job(job_id, status="downloading", message="Meminjam audio via resolver...")

        title, artist = resolve_metadata(source_url)
        query = f"{artist} - {title}" if "open.spotify.com" in source_url else source_url

        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": str(workdir / "source.%(ext)s"),
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }],
            "noplaylist": True,
            "default_search": "ytsearch1",
            "quiet": True,
            "no_warnings": True,
            "retries": 2,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([query])

        audio_path = workdir / "source.mp3"
        if not audio_path.exists():
            raise RuntimeError("File audio hasil resolver tidak ditemukan.")

        set_job(job_id, status="separating", message="AI memisahkan 4 stem (0,5–3 menit)...")
        subprocess.run(
            ["demucs", "--mp3", "192", "--two-stems", "none", "-n", "htdemucs", "-o", str(workdir), str(audio_path)],
            check=True,
            timeout=900,
            capture_output=True,
        )

        model_dir = workdir / "htdemucs" / audio_path.stem
        out = {}
        for stem in ("drums", "bass", "vocals", "other"):
            src = model_dir / f"{stem}.mp3"
            if src.exists():
                out[stem] = f"/static/{job_id}/{stem}.mp3"
                shutil.copy(src, workdir / f"{stem}.mp3")

        if len(out) < 4:
            raise RuntimeError("Demucs tidak menghasilkan 4 stem lengkap.")

        set_job(job_id, status="done", title=title, artist=artist, stems=out)

    except subprocess.CalledProcessError as e:
        err = e.stderr.decode("utf-8", errors="ignore")[-400:] if e.stderr else str(e)
        set_job(job_id, status="error", message=f"Demucs gagal: {err}")
    except Exception as e:
        set_job(job_id, status="error", message=str(e))


@app.get("/api/health")
def health():
    return {"status": "online", "jobs_active": sum(1 for j in JOBS.values() if j.get("status") not in ("done", "error"))}


@app.post("/api/process-track")
def process_track(req: TrackRequest):
    url = req.url.strip()
    if not url:
        raise HTTPException(400, "URL tidak boleh kosong.")
    job_id = hashlib.md5(url.encode()).hexdigest()[:12] + "-" + os.urandom(2).hex()
    threading.Thread(target=run_pipeline, args=(job_id, url), daemon=True).start()
    set_job(job_id, status="queued", message="Diterima, memulai pipeline...")
    return {"job_id": job_id}


@app.get("/api/job/{job_id}")
def job_status(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job tidak ditemukan.")
    return {**job, "job_id": job_id}
