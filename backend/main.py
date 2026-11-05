"""
Riemann Audio Lab API
Job-based Spotify resolver: YouTube search via yt-dlp → Demucs (htdemucs) → cached stems.
Stems disimpan sebagai MP3 192kbps agar ringan di-fetch browser (±6 MB / stem).
"""
import os
import json
import shutil
import hashlib
import sqlite3
import threading
import subprocess
import datetime
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


DB_PATH = JOBS_DIR / "library.db"


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        "CREATE TABLE IF NOT EXISTS songs ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT UNIQUE, "
        "title TEXT, artist TEXT, job_id TEXT, stems TEXT, created_at TEXT)"
    )
    return conn


def db_save(url: str, title: str, artist: str, job_id: str, stems: dict) -> None:
    try:
        with db() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO songs (url, title, artist, job_id, stems, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (url, title, artist, job_id, json.dumps(stems), datetime.datetime.now().isoformat()),
            )
    except Exception:
        pass  # pustaka gagal simpan tidak boleh make job gagal


def db_get(url: str) -> sqlite3.Row | None:
    with db() as conn:
        return conn.execute("SELECT * FROM songs WHERE url = ?", (url,)).fetchone()


def db_valid(row: sqlite3.Row) -> bool:
    try:
        stems = json.loads(row["stems"])
        stem0 = JOBS_DIR / str(stems["drums"]).removeprefix("/static/")
        return stem0.exists() and all(k in stems for k in ("drums", "bass", "vocals", "other"))
    except Exception:
        return False


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

        set_job(job_id, status="separating", message="Memisahkan 6 stem (0,5–3 menit)...")
        subprocess.run(
            ["demucs", "-n", "htdemucs_6s", "--mp3", "--mp3-bitrate", "192", "-o", str(workdir), str(audio_path)],
            check=True,
            timeout=900,
            capture_output=True,
        )

        model_dir = workdir / "htdemucs_6s" / audio_path.stem
        out = {}
        for stem in ("drums", "bass", "vocals", "piano", "guitar", "other"):
            src = model_dir / f"{stem}.mp3"
            if src.exists():
                out[stem] = f"/static/{job_id}/{stem}.mp3"
                shutil.copy(src, workdir / f"{stem}.mp3")

        if len(out) < 6:
            raise RuntimeError("Demucs tidak menghasilkan 4 stem lengkap.")

        set_job(job_id, status="done", title=title, artist=artist, stems=out)
        db_save(source_url, title, artist, job_id, out)

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
    cached = db_get(url)
    if cached and db_valid(cached):
        job_id = cached["job_id"]
        if job_id not in JOBS:
            JOBS[job_id] = {
                "status": "done",
                "title": cached["title"],
                "artist": cached["artist"],
                "stems": json.loads(cached["stems"]),
            }
        return {"job_id": job_id, "cached": True}

    job_id = hashlib.md5(url.encode()).hexdigest()[:12] + "-" + os.urandom(2).hex()
    threading.Thread(target=run_pipeline, args=(job_id, url), daemon=True).start()
    set_job(job_id, status="queued", message="Diterima, memulai pipeline...")
    return {"job_id": job_id, "cached": False}


@app.get("/api/job/{job_id}")
def job_status(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job tidak ditemukan.")
    return {**job, "job_id": job_id}


@app.get("/api/library")
def library_list():
    with db() as conn:
        rows = conn.execute("SELECT * FROM songs ORDER BY id DESC").fetchall()
    return [
        {
            "id": r["id"],
            "url": r["url"],
            "title": r["title"],
            "artist": r["artist"],
            "stems": json.loads(r["stems"]),
            "created_at": r["created_at"],
        }
        for r in rows
        if r["title"]
    ]


@app.delete("/api/library/{song_id}")
def library_delete(song_id: int):
    with db() as conn:
        cur = conn.execute("DELETE FROM songs WHERE id = ?", (song_id,))
    if cur.rowcount == 0:
        raise HTTPException(404, "Lagu tidak ditemukan di pustaka.")
    return {"ok": True}
