"""
Riemann Audio Lab API
Job-based resolver: link video YouTube (yt-dlp) → Demucs (htdemucs_6s) → cached stems.
Dukungan Spotify (track/playlist/resolver akustik) dihapus.
Stems disimpan sebagai MP3 192kbps agar ringan di-fetch browser (±6 MB / stem).
"""
import os
import json
import pathlib
import re
import shutil
import tempfile
import hashlib
import sqlite3
import threading
import subprocess
import datetime
from pathlib import Path
from typing import Any

# Cache model HuggingFace Demucs HARUS persist antar rebuild container,
# kalau tidak setiap deploy direkt download ulang model (~1 GB) lewat
# request unauthenticated yang kena rate limit HF Hub.
os.environ.setdefault("HF_HOME", "/app/data/hf")

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import requests
import yt_dlp
import numpy as np

BASE_DIR = Path(__file__).resolve().parent
JOBS_DIR = Path(os.environ.get("JOBS_DIR", BASE_DIR / "cache" / "jobs"))
JOBS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Riemann Audio Lab API", version="1.1.0")

allowed = [o for o in os.environ.get("CLIENT_ORIGINS", "*").split(",") if o]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed,
    allow_origin_regex=r"https://audio-separation-[a-z0-9-]+\.vercel\.app",  # semua domain preview Vercel project ini
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
    try:
        conn.execute("ALTER TABLE songs ADD COLUMN cover TEXT")
    except sqlite3.OperationalError:
        pass  # kolom sudah ada
    return conn


def db_save(url: str, title: str, artist: str, job_id: str, stems: dict, cover: str | None = None) -> None:
    try:
        with db() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO songs (url, title, artist, job_id, stems, created_at, cover) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (url, title, artist, job_id, json.dumps(stems), datetime.datetime.now().isoformat(), cover),
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
CANCELLED: set[str] = set()
RUNNING_PROCS: dict[str, subprocess.Popen] = {}
# Demucs butuh RAM besar: job demucs HARUS serial (1 slot).
PIPELINE_SEM = threading.Semaphore(int(os.environ.get("RIEMANN_MAX_CONCURRENCY", "1") or 1))


def set_job(job_id: str, **fields: Any) -> None:
    with JOBS_LOCK:
        JOBS.setdefault(job_id, {})
        JOBS[job_id].update(fields)


def resolve_youtube_metadata(url: str) -> tuple[str, str]:
    """Judul + artis dari video YouTube: 'Artist - Song (…)' dipecah jadi dua."""
    import yt_dlp as _yd
    with _yd.YoutubeDL({"quiet": True, "skip_download": True}) as yd:
        info = yd.extract_info(url, download=False) or {}
    raw_title = str(info.get("title") or "Lagu YouTube")
    channel = str(info.get("channel") or info.get("uploader") or "")
    # Konvensi umum: "Artist - Judul kalau ada pemisah ' - ' dan bagian kiri mirip nama kanal
    if " - " in raw_title and len(raw_title.split(" - ")[0]) <= 60:
        artist, title = raw_title.split(" - ", 1)
        # Buang tanda kurung di judul seperti "(Official Video)"
        title = re.sub(r"[([].*?[)\]]", " ", title).strip()
        return title or raw_title, artist.strip()
    return raw_title, channel or "YouTube"


def _pipeline_core(job_id: str, source_url: str, title: str, artist: str) -> None:
    workdir = JOBS_DIR / job_id
    workdir.mkdir(parents=True, exist_ok=True)
    query = source_url
    set_job(job_id, status="downloading", message="Mengunduh audio dari YouTube...")

    # cookies YouTube (Render Secret File "cookies.txt") — dibutuhkan di IP datacenter
    # Render Secret File (file) ATAU env secret (HF Space) berisi Netscape cookies
    import os as _os
    cookie_txt = _os.environ.get("RIEMANN_YT_COOKIES", "")
    cookie_src = pathlib.Path("/etc/secrets/cookies.txt")
    cookie_file = None
    if cookie_txt:
        cookie_file = workdir / "cookies.txt"
        cookie_file.write_text(cookie_txt, encoding="utf-8")
        set_job(job_id, message="Memakai cookie resolver...")
    elif cookie_src.exists():
        # yt-dlp perlu file cookie yang bisa ditulis; /etc/secrets read-only -> salin
        cookie_file = workdir / "cookies.txt"
        shutil.copyfile(cookie_src, cookie_file)
        set_job(job_id, message="Memakai cookie resolver...")
    ydl_opts = {
        "format": "bestaudio/bestaudio*/best",
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
        # Render/VPS IP = bot wall YouTube ("Sign in to confirm you're not a bot").
        # Fallback client ekstraktor tanpa login: ios & tv_embedded sering lolos.
        # tanpa cookie: paksakan klien yang kadang lolos bot wall; dengan cookie: default web lebih stabil
        # solver JS challenge YouTube (n-challenge): pakai node di dalam container
        "js_runtimes": {"node": {}},
    }
    cover_rel: str | None = None
    # Cookie invalid membuat SEMUA percobaan gagal jika dipakai terus:
    # cookie hanya dipakai di percobaan pertama, lanjutan anonymous (cookiefile dilepas).
    attempts = []
    if cookie_file:
        attempts.append(("web_safari", True))
        attempts.append(("mweb", True))
    attempts += [("mweb", False), ("tv", False), ("ios", False)]
    dl_err = ""
    for cc, use_cookie in attempts:
        attempt = dict(ydl_opts)
        attempt["extractor_args"] = {"youtube": {"player_client": [cc]}}
        if cookie_file and use_cookie:
            attempt["cookiefile"] = str(cookie_file)
        try:
            set_job(job_id, message=f"Audio terverifikasi ({title}) — resolver client={cc}...")
            with yt_dlp.YoutubeDL(attempt) as ydl:
                ydl.download([query])
            dl_err = ""
            set_job(job_id, message=f"Audio SIAP (client={cc}), memisahkan 6 stem...")
            break
        except yt_dlp.utils.DownloadError as e:
            dl_err = str(e)[:160]
            (workdir / "source.mp3").unlink(missing_ok=True)
    if dl_err:
        set_job(job_id, status="error", message=f"Resolver gagal: {dl_err}")
        return
    try:
        # Thumbnail YouTube (link kini selalu YouTube)
        thumb = None
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl2:
                thumb = (ydl2.extract_info(query, download=False) or {}).get("thumbnail")
        except Exception:
            pass
        if thumb:
            res = requests.get(thumb, timeout=10)
            if res.ok and res.content:
                (workdir / "cover.jpg").write_bytes(res.content)
                cover_rel = f"/static/{job_id}/cover.jpg"
    except Exception:
        pass  # cover gagal tidak boleh memblokir pipeline

    audio_path = workdir / "source.mp3"
    if not audio_path.exists():
        raise RuntimeError("File audio hasil resolver tidak ditemukan.")

    set_job(job_id, status="separating", message="Memisahkan 6 stem (0,5–3 menit)...")
    if job_id in CANCELLED:
        set_job(job_id, status="error", message="Dibatalkan oleh pengguna.")
        return
    cmd = ["demucs", "-n", "htdemucs_6s", "--mp3", "--mp3-bitrate", "192", "-o", str(workdir), str(audio_path)]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    with JOBS_LOCK:
        RUNNING_PROCS[job_id] = proc
    try:
        _, errb = proc.communicate(timeout=900)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.communicate()
        raise RuntimeError("Demucs timeout (15 menit).")
    finally:
        with JOBS_LOCK:
            RUNNING_PROCS.pop(job_id, None)
    if proc.returncode != 0:
        raise subprocess.CalledProcessError(proc.returncode, cmd, stderr=errb)

    model_dir = workdir / "htdemucs_6s" / audio_path.stem
    out = {}
    for stem in ("drums", "bass", "vocals", "piano", "guitar", "other"):
        src = model_dir / f"{stem}.mp3"
        if src.exists():
            out[stem] = f"/static/{job_id}/{stem}.mp3"
            shutil.copy(src, workdir / f"{stem}.mp3")

    if len(out) < 6:
        raise RuntimeError("Demucs tidak menghasilkan 4 stem lengkap.")

    set_job(job_id, status="done", title=title, artist=artist, stems=out, cover=cover_rel)
    db_save(source_url, title, artist, job_id, out, cover_rel)


def run_pipeline(job_id: str, source_url: str, *, known_title: str | None = None, known_artist: str | None = None) -> None:
    try:
        source_url = source_url.strip()
        if job_id in CANCELLED:
            set_job(job_id, status="error", message="Dibatalkan oleh pengguna.")
            return
        if not re.search(r"(youtube\.com/watch|youtu\.be/)", source_url):
            set_job(job_id, status="error", message="Hanya link video YouTube yang didukung.")
            return
        title, artist = resolve_youtube_metadata(source_url)
        set_job(job_id, status="downloading", title=title, artist=artist, message="Mengambil info video...")
        # Gerbang: Resolver boleh paralel, tapi Demucs (butuh RAM besar)
        # HARUS serial — job berikutnya otomatis menunggu di sini.
        PIPELINE_SEM.acquire()
        try:
            if job_id in CANCELLED:
                set_job(job_id, status="error", message="Dibatalkan oleh pengguna.")
                return
            set_job(job_id, message="Selesai antri, mulai proses...")
            print(f"[pipeline] {job_id} mulai core", flush=True)
            _pipeline_core(job_id, source_url, title, artist)
        finally:
            PIPELINE_SEM.release()
    except subprocess.CalledProcessError as e:
        raw = e.stderr.decode("utf-8", errors="ignore") if e.stderr else str(e)
        lines = [ln for ln in raw.splitlines() if ln.strip() and "Warning:" not in ln and "%|" not in ln and "s/it" not in ln and "it/s" not in ln]
        err = " ".join(lines[-2:]).strip() or f"Demucs keluar dengan kode {e.returncode} (tanpa pesan error)."
        set_job(job_id, status="error", message=f"Demucs gagal: {err}")
    except Exception as e:
        set_job(job_id, status="error", message=str(e))


def cancel_job(job_id: str):
    CANCELLED.add(job_id)
    with JOBS_LOCK:
        job = JOBS.get(job_id, {})
        done = (job.get("status") or "") in ("done", "error")
    proc = RUNNING_PROCS.get(job_id)
    if proc is not None and proc.poll() is None:
        proc.kill()
    if not done:
        set_job(job_id, status="error", message="Dibatalkan oleh pengguna.")
    return {"ok": True}


@app.get("/api/search")
def search_songs(q: str):
    """Cari lagu di YouTube: daftar kandidat utk dipilih user (thumbnail/judul/kanal/durasi)."""
    q = (q or "").strip()
    if not q:
        raise HTTPException(400, "Query pencarian tidak boleh kosong.")
    jsopts = {"quiet": True, "skip_download": True, "extract_flat": "in_playlist", "js_runtimes": {"node": {}}}

    def _do_search(cookiefile=None):
        opts = dict(jsopts)
        if cookiefile:
            opts["cookiefile"] = cookiefile
        with yt_dlp.YoutubeDL(opts) as yd:
            info = yd.extract_info(f"ytsearch8:{q}", download=False) or {}
        out = []
        for e in (info.get("entries") or []):
            if not e or not e.get("id"):
                continue
            out.append({
                "id": e.get("id"),
                "title": e.get("title"),
                "channel": e.get("channel") or e.get("uploader") or "",
                "duration": e.get("duration"),
                "thumbnail": e.get("thumbnail") or "",
            })
        return out

    tmpcookie = None
    try:
        out = None
        cs = pathlib.Path("/etc/secrets/cookies.txt")
        # Coba tanpa cookie dulu (search hanya butuh metadata); cookie dicoba bila kosong.
        try:
            out = _do_search()
        except Exception:
            if cs.exists():
                tmpdir = tempfile.mkdtemp(prefix="ytsearch-")
                tmpcookie = pathlib.Path(tmpdir) / "cookies.txt"
                shutil.copyfile(cs, tmpcookie)
                out = _do_search(str(tmpcookie))
        if not out:
            raise HTTPException(502, "Pencarian YouTube tidak menghasilkan video.")
        return out
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Pencarian YouTube gagal: {e}")
    finally:
        if tmpcookie:
            shutil.rmtree(tmpcookie.parent, ignore_errors=True)


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
    set_job(job_id, status="queued", message="Diterima, memulai pipeline...")
    threading.Thread(target=run_pipeline, args=(job_id, url), daemon=True).start()
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
            "cover": r["cover"],
        }
        for r in rows
        if r["title"]
    ]


@app.post("/api/library/retrofill-covers")
def retrofill_covers():
    """Isi cover untuk lagu lama yang belum punya — pakai artwork resmi via Spotify oEmbed."""
    from requests import get as _get
    with db() as conn:
        rows = conn.execute(
            "SELECT id, url, job_id, title FROM songs WHERE (cover IS NULL OR cover = '') AND title IS NOT NULL"
        ).fetchall()
    filled, skipped = 0, 0
    for r in rows:
        url = r["url"] or ""
        try:
            if "open.spotify.com/track/" in url:
                res = _get("https://open.spotify.com/oembed", params={"url": url}, timeout=10)
                thumb = (res.json() or {}).get("thumbnail_url") if res.ok else None
            else:
                # entri playlist disimpan sebagai "Artist - Title" — cari thumbnail via YouTube info-only
                yopts = {"quiet": True, "skip_download": True, "default_search": "ytsearch"}
                with yt_dlp.YoutubeDL(yopts) as ydl:
                    info = ydl.extract_info(f"ytsearch:{r['title']}", download=False)
                    thumb = (info.get("entries") or [{}])[0].get("thumbnail")
            if not thumb:
                skipped += 1
                continue
            img = _get(thumb, timeout=10)
            if not img.ok:
                skipped += 1
                continue
            job_dir = JOBS_DIR / r["job_id"]
            job_dir.mkdir(parents=True, exist_ok=True)
            (job_dir / "cover.jpg").write_bytes(img.content)
            with db() as conn:
                conn.execute("UPDATE songs SET cover = ? WHERE id = ?", (f"/static/{r['job_id']}/cover.jpg", r["id"]))
            filled += 1
        except Exception:
            skipped += 1
    return {"filled": filled, "skipped": skipped}


@app.delete("/api/library/{song_id}")
def library_delete(song_id: int):
    with db() as conn:
        cur = conn.execute("DELETE FROM songs WHERE id = ?", (song_id,))
    if cur.rowcount == 0:
        raise HTTPException(404, "Lagu tidak ditemukan di pustaka.")
    return {"ok": True}
