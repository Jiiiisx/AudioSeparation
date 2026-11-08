"""
Riemann Audio Lab API
Job-based Spotify resolver: YouTube search via yt-dlp → Demucs (htdemucs) → cached stems.
Stems disimpan sebagai MP3 192kbps agar ringan di-fetch browser (±6 MB / stem).
"""
import os
import json
import pathlib
import re
import concurrent.futures
import shutil
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


def set_job(job_id: str, **fields: Any) -> None:
    with JOBS_LOCK:
        JOBS.setdefault(job_id, {})
        JOBS[job_id].update(fields)


def resolve_metadata(url: str) -> tuple[str, str]:
    """Judul + nama artis dari halaman Spotify ("<title>"X - song and lyrics by Y")
    — oEmbed kerap tidak memberikan artis; tanpa artis, pencarian YouTube
    menjadi 'Spotify - <judul>' dan hasilnya bisa lagu yang salah."""
    if "open.spotify.com" in url or "spotify:" in url:
        try:
            res = requests.get(url.strip().split("?")[0].rstrip("/"), headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}, timeout=10)
            if res.ok:
                m = re.search(r"<title>(.+?) - song and lyrics by (.+?) \| Spotify</title>", res.text)
                if m:
                    return m.group(1).strip(), m.group(2).strip()
        except Exception:
            pass
        try:
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


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", (s or "").lower())


def _itunes_ref(artist: str, title: str) -> tuple[float | None, str | None]:
    """Durasi + URL preview 30 s lagu dari iTunes Search API (gratis, tanpa API key)."""
    try:
        req = requests.get(
            "https://itunes.apple.com/search",
            params={"term": f"{artist} {title}", "entity": "song", "limit": 10},
            timeout=8,
        )
        for row in (req.json().get("results") or []):
            name = _norm(str(row.get("trackName") or ""))
            art = _norm(str(row.get("artistName") or ""))
            t_n, a_n = _norm(title), _norm(artist)
            if t_n and (t_n in name or name in t_n) and (not a_n or a_n in art):
                ms = row.get("trackTimeMillis")
                return (int(ms) / 1000.0 if ms else None), row.get("previewUrl")
    except Exception:
        pass
    return None, None


def _expected_duration_s(artist: str, title: str) -> float | None:
    """Durasi eksak lagu dari iTunes Search API (gratis, tanpa API key).
    Dipakai sebagai anchor supaya kandidat YouTube yang judulnya mirip tapi
    lagunya beda (durasi meleset) bisa ditolak."""
    return _itunes_ref(artist, title)[0]


def _audio_embed(path: str, offset: float = 0.0, dur: float = 30.0) -> list | None:
    """Vektor akustik dari file mp3: 64 bin log-spektrum, dicahek per 5 s.
    Pencocokan cosine per potongan toleran terhadap beda offset mulai video."""
    try:
        raw = subprocess.run(
            ["ffmpeg", "-v", "quiet", "-ss", str(offset), "-t", str(dur),
             "-i", path, "-ac", "1", "-ar", "16000", "-f", "s16le", "pipe:1"],
            capture_output=True, timeout=40,
        ).stdout
        audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    except Exception:
        return None
    if audio.size < 16000 * 5:
        return None
    audio = audio - audio.mean()
    chunks = []
    step = 16000 * 5  # 5 detik per chunk
    for start in range(0, min(len(audio), step * 8) - step + 1, step // 2):
        seg = audio[start:start + step]
        spec = np.abs(np.fft.rfft(np.hanning(len(seg)) * seg)) + 1e-9
        logspec = np.log(spec)
        # 64 bin log-skala; edges unik agar tidak ada slice kosong (NaN) di bin rendah
        # Sub-bin 1 s (5x64) menangkap struktur waktu lagu, bukan hanya rata-an spektrum
        # Sub-bin 1 s (5x64) menangkap struktur waktu lagu; indeks bin spektrum 1/5 panjang
        sub = len(logspec) // 5
        flat = []
        for i in range(5):
            si = logspec[i * sub:(i + 1) * sub]
            edges = np.unique(np.geomspace(1, len(si), 65).astype(int))
            bm = [si[a:b].mean() for a, b in zip(edges[:-1], edges[1:])]
            flat.extend(bm)
        v = np.array(flat)
        v -= v.mean()
        n = np.linalg.norm(v)
        if n:
            chunks.append((v / n))
    return chunks or None


def _matched_audio(a: list, b: list) -> float:
    """Rata-rata cosine terbaik tiap chunk A terhadap semua chunk B (0..1)."""
    am = np.stack(a)
    bm = np.stack(b)
    sim = am @ bm.T
    return float(sim.max(axis=1).mean())


def _pick_youtube_track(artist: str, title: str):
    """Pilih video YouTube yang BENAR-BENAR lagunya, bukan podcast/cover/live.
    Skor kata/kanal/durasi menyaring kandidat, lalu PEMERIKSA AKUSTIK:
    bandingkan preview 30 s iTunes vs kandidat (cosine per 5 s)."""
    try:
        with yt_dlp.YoutubeDL({"quiet": True, "skip_download": True,
                                "js_runtimes": ["node"]}) as ydl:
            info = ydl.extract_info(f"ytsearch10:{artist} - {title}", download=False)
        entries = [e for e in ((info or {}).get("entries") or []) if e]
    except Exception:
        return None
    if not entries:
        return None
    t_n, a_n = _norm(title), _norm(artist)
    anchor, preview_url = _itunes_ref(artist, title)
    print(f"[resolver] anchor={anchor} preview={'ya' if preview_url else 'TIDAK'}")
    words = [w for w in t_n.split() if len(w) > 2]
    def score(c) -> float:
        t = _norm(str(c.get("title") or ""))
        s = 0.0
        dur = c.get("duration") or 0
        if not (60 <= dur <= 600):  # 1-10 menit: lagu populer berdurasi panjang pun valid
            s -= 1000.0
        # Anchor durasi sesungguhnya (iTunes): kandidat meleset >6 s dianggap bukan lagu itu
        if anchor is not None:
            diff = abs(dur - anchor)
            s += (60.0 - min(diff, 6.0) * 10.0) if diff <= 6.0 else -800.0
        t_low = (c.get("title") or "").lower()
        for bad in ("live", "cover", "karaoke", "nightcore", "podcast", "instrumental",
                    "sped up", "slowed", "tiktok", "reaction", "mashup", "interview",
                    "full album", "1 hour", "10 minutes", "loop", "versi jawa", "leaked"):
            if bad in t_low:
                s -= 500.0
        if "sped" in t_low or "nightcore" in t_low or "pitched" in t_low:
            s -= 300.0
        for kw in ("official audio", "topic", "official music video", "official lyric"):
            if kw in t_low:
                s += 8.0
        # Kanal unggah resmi = sinyal terkuat: "Artist - Topic", VEVO, kanal artis sendiri
        ch = _norm(str(c.get("channel") or c.get("uploader") or ""))
        if a_n and a_n in ch:
            s += 120.0
        for good in ("topic", "vevo", "official"):
            if good in ch:
                s += 40.0
                break
        # Judul dengan artis + judul lagu lengkap = kandidat paling spesifik
        if t_n and t_n in t and a_n and a_n in t:
            s += 30.0
        if t_n and (t_n in t or t in t_n):
            s += 100.0
        s += 8.0 * sum(1 for w in words if w in t)
        if a_n and a_n in t:
            s += 60.0
        return s
    # Susu kata/kanal/durasi: kandidat layak sesudah skor
    good = sorted([c for c in entries if score(c) > 0], key=score, reverse=True)
    if not good:
        return None
    best = {k: good[0].get(k) for k in ("id", "title", "duration", "channel", "uploader")}
    # PEMERIKSA AKUSTIK: bandingkan preview 30 s iTunes vs audio kandidat
    if preview_url:
        import tempfile, os
        ref = None
        tmpdir = tempfile.mkdtemp(prefix="apx-")
        try:
            mp = os.path.join(tmpdir, "ref.mp3")
            res = requests.get(preview_url, timeout=15)
            if res.ok:
                with open(mp, "wb") as f:
                    f.write(res.content)
                ref = _audio_embed(mp)
        except Exception:
            ref = None
            print("[resolver] _audio_embed preview gagal (ref=None)")
        finally:
            import shutil
            shutil.rmtree(tmpdir, ignore_errors=True)
        if ref is not None:
            # Uji maksimal 3 kandidat teratas; ambil similarity tertinggi
            sims = []
            for cand in good[:3]:
                cid = cand.get("id")
                s0 = _similarity_candidate(cid, ref)  # menggunakan yt-dlp parsial 35 s
                sims.append((s0, cand))
                print(f"[resolver] audio-match {cand.get('title')!r} → sim={s0:.3f}")
            sims = [(s, c) for s, c in sims if s is not None]
            if sims:
                best_sim, cand_best = max(sims, key=lambda x: x[0])
                best = {k: cand_best.get(k) for k in ("id", "title", "duration", "channel", "uploader")}
                if best_sim < 0.45:
                    print(f"[resolver] sim tertinggi {best_sim:.3f} < 0.45 → tolak semua kandidat")
                    return None
                print(f"[resolver] dipilih via akustik sim={best_sim:.3f}")
    return best


def _similarity_candidate(video_id: str, ref: list):
    """Unduh 35 s audio pertama kandidat (format terendah, hemat), hitung similarity
    terhadap vektor preview iTunes. Return None bila infrastruktur gagal."""
    import tempfile, os, shutil, glob
    tmpdir = tempfile.mkdtemp(prefix="apc-")
    try:
        out = os.path.join(tmpdir, "cand.%(ext)s")
        opts = {
            "quiet": True, "skip_download": False,
            "format": "bestaudio/best",
            "outtmpl": out,
            "download_ranges": lambda info, ydl: [{"start_time": 0, "end_time": 35.0}],
            "force_keyframes_at_cuts": True,
            "js_runtimes": ["node"],
        }
        with yt_dlp.YoutubeDL(opts) as yd:
            yd.download([f"https://www.youtube.com/watch?v={video_id}"])
        files = glob.glob(os.path.join(tmpdir, "cand.*"))
        cand_vecs = None
        for f in files:
            cand_vecs = _audio_embed(f)
            if cand_vecs:
                break
        if cand_vecs is None:
            return None
        return _matched_audio(ref, cand_vecs)
    except Exception as e:
        print(f"[resolver] kandidat {video_id} gagal diuji: {type(e).__name__}")
        return None
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _pipeline_core(job_id: str, source_url: str, title: str, artist: str) -> None:
    workdir = JOBS_DIR / job_id
    workdir.mkdir(parents=True, exist_ok=True)
    query = source_url
    if "open.spotify.com" in source_url:
        set_job(job_id, status="downloading", message="Mencari audio asli lagu...")
        best = _pick_youtube_track(artist, title)
        if best is None:
            set_job(job_id, status="error", message="Audio lagu tidak ditemukan di YouTube dengan keyakinan tinggi. Coba lagu lain (durasi 1–10 menit).")
            return
        query = f"https://www.youtube.com/watch?v={best['id']}"
        set_job(job_id, status="downloading", message=f"Audio terverifikasi: {title}")
    set_job(job_id, status="downloading", message="Meminjam audio via resolver...")

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
        "js_runtimes": ["node"],
        # web_safari stabil bersama cookie; fallback ios/tv/mweb tanpa cookie
        **({"extractor_args": {"youtube": {"player_client": ["web_safari"]}} if cookie_file else {"extractor_args": {"youtube": {"player_client": ["ios", "tv", "mweb"]}}}}),
        **({"cookiefile": str(cookie_file)} if cookie_file else {}),
    }
    cover_rel: str | None = None
    # foku 1: download audio. client dirotor terkait bot wall
    client_list = ["web_safari", "mweb", "tv", "ios"] if cookie_file else ["mweb", "ios", "tv"]
    dl_err = ""
    for cc in client_list:
        attempt = dict(ydl_opts)
        attempt["extractor_args"] = {"youtube": {"player_client": [cc]}}
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
        # Artwork resmi dari Spotify oEmbed; fallback thumbnail YouTube
        thumb = None
        try:
            res = requests.get("https://open.spotify.com/oembed", params={"url": source_url}, timeout=8)
            if res.ok:
                thumb = res.json().get("thumbnail_url")
        except Exception:
            pass
        if not thumb:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl2:
                thumb = (ydl2.extract_info(query, download=False) or {}).get("thumbnail")
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
        source_url = source_url.strip().split("?")[0].rstrip("/")
        if job_id in CANCELLED:
            set_job(job_id, status="error", message="Dibatalkan oleh pengguna.")
            return
        bid = _batch_of(job_id)
        if bid and _batch_cancelled(bid):
            set_job(job_id, status="error", message="Dibatalkan oleh pengguna.")
            return
        if known_title:
            title, artist = known_title, (known_artist or "Spotify")
        elif re.search(r"(youtube\.com/watch|youtu\.be/)", source_url):
            title, artist = resolve_youtube_metadata(source_url)
        else:
            title, artist = resolve_metadata(source_url)
        set_job(job_id, status="queued", title=title, artist=artist, message="Antrian...")
        # Gerbang: Resolver boleh paralel, tapi Demucs (butuh RAM besar)
        # HARUS serial — job berikutnya otomatis menunggu di sini.
        PIPELINE_SEM.acquire()
        try:
            if bid and _batch_cancelled(bid):
                set_job(job_id, status="error", message="Dibatalkan oleh pengguna.")
                return
            if job_id in CANCELLED:
                set_job(job_id, status="error", message="Dibatalkan oleh pengguna.")
                return
            set_job(job_id, message="Selesai antri, mulai proses...")
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


SPOTIFY_KIND_RE = re.compile(r"open\.spotify\.com/(playlist|album)/(\w+)")


def _sp_embed_tracks(kind: str, list_id: str) -> list[dict]:
    """Ambil tracklist dari halaman embed Spotify (tanpa API key)."""
    res = requests.get(f"https://open.spotify.com/embed/{kind}/{list_id}",
                       headers={"User-Agent": "Mozilla/5.0"}, timeout=12)
    res.raise_for_status()
    if "Page not available" in res.text:
        raise RuntimeError(
            "Spotify tidak mengizinkan playlist ini dibaca otomatis "
            "(khas playlist personal/kolaboratif atau profil tertutup). "
            "Coba playlist resmi/editorial, atau playlist berisi lagu per lagu."
        )
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', res.text, re.S)
    if not m:
        raise RuntimeError("Halaman embed Spotify tidak berisi data tracklist.")
    try:
        data = json.loads(m.group(1))
        ents = data["props"]["pageProps"]["state"]["data"]["entity"]
        if kind == "playlist":
            tracks = ents["trackList"]
        else:
            tracks = ents["trackList"]
    except Exception as e:
        raise RuntimeError(f"Struktur embed Spotify berubah: {e}")
    out = []
    for t in tracks:
        name = (t.get("title") or "").strip()
        art = (t.get("subtitle") or "").strip()
        if name:
            out.append({"title": name, "artist": art})
    if not out:
        raise RuntimeError("Playlist Spotify kosong.")
    return out


MAX_PLAYLIST = 50
MAX_WORKERS = int(os.environ.get("RIEMANN_MAX_WORKERS", "2"))

# Ponytail: Demucs (6-stem) butuh 2.5-3 GB RAM; hanya BOLEH 1 proses paralel
# default. Naikkan lewat env RIEMANN_MAX_CONCURRENCY jika RAM diizinkan.
PIPELINE_SEM = threading.BoundedSemaphore(int(os.environ.get("RIEMANN_MAX_CONCURRENCY", "1")))
# Proses Demucs yang sedang berjalan per job (untuk cancel jog yang mematikan).
RUNNING_PROCS: dict[str, subprocess.Popen] = {}
CANCELLED: set[str] = set()

# Registry eksekusi batch agar bisa dihentikan: batch_id -> {"pool": ..., "cancelled": bool}
BATCH_RUNS: dict[str, dict] = {}
BATCH_LOCK = threading.Lock()


def _batch_cancelled(batch_id: str) -> bool:
    with BATCH_LOCK:
        r = BATCH_RUNS.get(batch_id)
        return bool(r and r.get("cancelled"))


@app.post("/api/process-playlist")
def process_playlist(req: TrackRequest):
    url = req.url.strip()
    m = SPOTIFY_KIND_RE.search(url)
    if not m:
        raise HTTPException(400, "URL harus playlist/album Spotify.")
    if _active_track_count() >= MAX_PLAYLIST:
        raise HTTPException(429, "Terlalu banyak job aktif. Tunggu yang lain selesai.")
    try:
        tracks = _sp_embed_tracks(m.group(1), m.group(2))
    except Exception as e:
        raise HTTPException(502, f"Gagal membaca playlist: {e}")
    tracks = tracks[:MAX_PLAYLIST]
    batch_id = "pl-" + hashlib.md5(url.encode()).hexdigest()[:8] + "-" + os.urandom(2).hex()

    items = []
    for i, t in enumerate(tracks):
        job_id = f"{batch_id}-{i}"
        items.append({"job_id": job_id, "title": t["title"], "artist": t["artist"], "status": "queued"})
        set_job(job_id, status="queued", title=t["title"], artist=t["artist"], batch=batch_id, message="Dalam antrian playlist.")

    def _worker():
        pool = concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS)
        with BATCH_LOCK:
            BATCH_RUNS[batch_id] = {"pool": pool, "cancelled": False}
        futs = [pool.submit(run_pipeline_safe, it) for it in items]
        concurrent.futures.wait(futs)
        done_n = sum(1 for it in items if JOBS.get(it["job_id"], {}).get("status") == "done")
        with BATCH_LOCK:
            cancelled = BATCH_RUNS.get(batch_id, {}).get("cancelled", False)
            BATCH_RUNS.pop(batch_id, None)
        if cancelled:
            set_job(batch_id, status="done", message=f"Dihentikan oleh pengguna: {done_n}/{len(items)} lagu selesai")
        else:
            set_job(batch_id, status="done", message=f"Selesai: {done_n}/{len(items)} lagu")
        pool.shutdown()

    set_job(batch_id, status="running", message=f"Memproses {len(items)} lagu", tracks=[{k: v for k, v in it.items() if k in ("job_id", "title", "artist", "status")} for it in items])
    threading.Thread(target=_worker, daemon=True).start()
    return {"batch_id": batch_id, "total": len(items)}


def run_pipeline_safe(item: dict) -> None:
    job_id = item["job_id"]
    try:
        # ponytail: resolver Spotify per lagu pakai pencarian YouTube "artist - title"
        run_pipeline(job_id, f"{item['artist']} - {item['title']}",
                     known_title=item["title"], known_artist=item["artist"])
    except Exception as e:
        set_job(job_id, status="error", message=str(e))
    with JOBS_LOCK:
        b = JOBS.get(_batch_of(job_id))
        if b:
            for t in b.get("tracks", []):
                if t["job_id"] == job_id:
                    j = JOBS.get(job_id, {})
                    t["status"] = j.get("status", "error")
                    t["message"] = j.get("message", "gagal")


def _batch_of(job_id: str) -> str:
    return job_id.rsplit("-", 2)[0] if job_id.startswith("pl-") else ""


def _active_track_count() -> int:
    return sum(1 for j in JOBS.values() if (j.get("status") or "") not in ("done", "error"))


@app.post("/api/batch/{batch_id}/cancel")
def cancel_batch(batch_id: str):
    b = JOBS.get(batch_id)
    if not b:
        raise HTTPException(404, "Batch tidak ditemukan.")
    with BATCH_LOCK:
        r = BATCH_RUNS.get(batch_id)
        if r:
            r["cancelled"] = True
            try:
                r["pool"].shutdown(wait=False, cancel_futures=True)
            except Exception:
                pass
    stopped = 0
    with JOBS_LOCK:
        for t in b.get("tracks", []):
            j = JOBS.get(t["job_id"], {})
            if (j.get("status") or "") == "queued":
                set_job(t["job_id"], status="error", message="Dibatalkan oleh pengguna.")
                t["status"] = "error"
                t["message"] = "Dibatalkan oleh pengguna."
                stopped += 1
    return {"batch_id": batch_id, "stopped": stopped}


@app.get("/api/batch/{batch_id}")
def batch_status(batch_id: str):
    b = JOBS.get(batch_id)
    if not b:
        raise HTTPException(404, "Batch tidak ditemukan.")
    with JOBS_LOCK:
        tracks = []
        for t in b.get("tracks", []):
            j = JOBS.get(t["job_id"], {})
            tracks.append({
                "job_id": t["job_id"],
                "title": t["title"],
                "artist": t["artist"],
                "status": j.get("status", t.get("status", "queued")),
                "message": j.get("message"),
            })
    done = sum(1 for t in tracks if t["status"] == "done")
    return {
        "batch_id": batch_id,
        "status": "done" if b.get("status") == "done" else ("running" if done < len(tracks) else "done"),
        "done": done,
        "total": len(tracks),
        "tracks": tracks,
    }


@app.get("/api/health")
def health():
    return {"status": "online", "jobs_active": sum(1 for j in JOBS.values() if j.get("status") not in ("done", "error"))}


@app.post("/api/job/{job_id}/cancel")
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


@app.post("/api/process-track")
def process_track(req: TrackRequest):
    url = req.url.strip().split("?")[0].rstrip("/")
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
