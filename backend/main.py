import os
import re
import json
import hashlib
import subprocess
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import requests

app = FastAPI(
    title="Riemann Audio Lab API",
    description="Spotify resolver & AI Stem Separation backend service",
    version="1.0.0"
)

# CORS configuration for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / "cache"
DOWNLOADS_DIR = CACHE_DIR / "downloads"
STEMS_DIR = CACHE_DIR / "stems"

DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
STEMS_DIR.mkdir(parents=True, exist_ok=True)

# Mount static audio files
app.mount("/static", StaticFiles(directory=str(CACHE_DIR)), name="static")

class TrackRequest(BaseModel):
    url: str

class TrackResponse(BaseModel):
    success: bool = True
    track_id: str
    title: str
    artist: str
    stems: dict

def extract_spotify_meta(url: str) -> tuple[str, str]:
    """Mengambil metadata artis & judul dari Spotify via oEmbed resmi tanpa butuh API key"""
    try:
        oembed_url = f"https://open.spotify.com/oembed?url={url}"
        res = requests.get(oembed_url, timeout=5)
        if res.status_code == 200:
            data = res.json()
            title = data.get("title", "")
            # Judul oembed biasanya: "Song Title by Artist" atau sejenisnya
            if " by " in title:
                parts = title.split(" by ")
                return parts[0].strip(), parts[1].strip()
            return title.strip(), "Spotify Track"
    except Exception as e:
        print(f"oEmbed fetch error: {e}")

    # Fallback jika bukan Spotify atau oembed gagal: gunakan URL slug
    slug = url.split("/")[-1].split("?")[0]
    return f"Track {slug[:10]}", "Online Audio"

@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "service": "Riemann Audio Separation Backend",
        "cache_ready": True
    }

@app.post("/api/process-track")
def process_track(req: TrackRequest):
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL tidak boleh kosong.")

    # 1. Resolusi Metadata
    title, artist = extract_spotify_meta(url)
    search_query = f"{artist} - {title}".strip()
    track_hash = hashlib.md5(search_query.encode("utf-8")).hexdigest()[:12]

    # Cek apakah stem sudah ada di cache
    target_stem_dir = STEMS_DIR / "htdemucs" / track_hash
    if target_stem_dir.exists() and (target_stem_dir / "drums.wav").exists():
        return {
            "success": True,
            "track_id": track_hash,
            "title": title,
            "artist": artist,
            "cached": True,
            "stems": {
                "drums": f"/static/stems/htdemucs/{track_hash}/drums.wav",
                "bass": f"/static/stems/htdemucs/{track_hash}/bass.wav",
                "vocals": f"/static/stems/htdemucs/{track_hash}/vocals.wav",
                "other": f"/static/stems/htdemucs/{track_hash}/other.wav",
            }
        }

    # 2. Unduh audio via yt-dlp jika belum ada
    audio_path = DOWNLOADS_DIR / f"{track_hash}.mp3"
    if not audio_path.exists():
        try:
            cmd_dl = [
                "yt-dlp",
                "-x",
                "--audio-format", "mp3",
                "--audio-quality", "0",
                "-o", str(DOWNLOADS_DIR / f"{track_hash}.%(ext)s"),
                f"ytsearch1:{search_query} audio"
            ]
            subprocess.run(cmd_dl, check=True, timeout=60, capture_output=True)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Gagal mengunduh audio trek via yt-dlp: {str(e)}"
            )

    # 3. Jalankan Demucs AI Stem Separation
    try:
        cmd_demucs = [
            "python", "-m", "demucs",
            "-n", "htdemucs",
            "-o", str(STEMS_DIR),
            str(audio_path)
        ]
        subprocess.run(cmd_demucs, check=True, timeout=300, capture_output=True)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Eksekusi Demucs stem separation gagal: {str(e)}. Gunakan Client DSP / Preset bawaan."
        )

    return {
        "success": True,
        "track_id": track_hash,
        "title": title,
        "artist": artist,
        "cached": False,
        "stems": {
            "drums": f"/static/stems/htdemucs/{track_hash}/drums.wav",
            "bass": f"/static/stems/htdemucs/{track_hash}/bass.wav",
            "vocals": f"/static/stems/htdemucs/{track_hash}/vocals.wav",
            "other": f"/static/stems/htdemucs/{track_hash}/other.wav",
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
