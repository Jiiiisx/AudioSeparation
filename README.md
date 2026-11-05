# Riemann Audio Lab: Deteksi Dentuman Bass & Pemisahan Sinyal Musik Digital Berbasis Jumlah Riemann (Pertemuan 11)

Aplikasi laboratorium kalkulus interaktif dan *audio stem separator* untuk membuktikan bahwa materi **Pengantar Integral Tentu melalui Aproksimasi Luas Daerah Menggunakan Jumlah Riemann (Pertemuan 11)** merupakan fondasi komputasi nyata di balik sistem pemrosesan audio digital dan algoritma deteksi ketukan musik (*beat/bass detection*).

Proyek ini dibangun sebagai prototipe tugas akhir kalkulus untuk kelompok 1 Informatika, Fakultas Ilmu Komputer, UPN "Veteran" Jakarta.

---

## 1. Landasan Matematis & Teori Kalkulus (Pertemuan 11)

### A. Fungsi Daya Sinyal $P(t) = [f(t)]^2$
Gelombang suara $f(t)$ berosilasi naik dan turun secara simetris di sekitar nilai nol. Jika kita menghitung integral atau luas kurva amplitudo $f(t)$ secara langsung, luas positif dan negatif akan saling meniadakan sehingga total akumulasinya mendekati nol.
Oleh karena itu, dalam akustik dan kalkulus terapan digunakan fungsi daya:
$$P(t) = [f(t)]^2 \ge 0$$
Karena nilainya selalu non-negatif, kurva ini memenuhi syarat geometris luas daerah di bawah kurva pada materi Pertemuan 11 dan merepresentasikan energi fisik suara sesungguhnya.

### B. Partisi Waktu pada Audio Digital (Sampling Rate 44.100 Hz)
Pada standar audio CD ($F_s = 44.100\text{ Hz}$), selang waktu $[0, 1]$ detik secara alami terpartisi menjadi $N = 44.100$ balok diskrit dengan lebar alas seragam:
$$\Delta t = \frac{1}{44.100} \approx 22{,}67\,\mu\text{s}$$
Tinggi balok ke-$k$ ditentukan oleh nilai daya pada titik cuplikan:
$$L_k = P(t_k) \cdot \Delta t = [f(t_k)]^2 \cdot \Delta t$$

### C. Total Akumulasi Energi & Proses Limit Integral Tentu
Total energi suara pada selang $[a, b]$ diaproksimasi dengan menjumlahkan luas seluruh $N$ balok Riemann:
$$S_N = \sum_{k=1}^N [f(t_k)]^2 \cdot \Delta t$$
Ketika kerapatan partisi ditingkatkan mendekati tak hingga ($N \to \infty$), lebar balok mendekati nol ($\Delta t \to 0$), menghasilkan nilai integral tentu eksak:
$$\lim_{N \to \infty} \sum_{k=1}^N [f(t_k)]^2 \cdot \Delta t = \int_a^b [f(t)]^2 dt$$

### D. Deteksi Ketukan / Bass Menggunakan Moving Window Riemann (50 ms)
Lagu dibagi ke dalam jendela geser (*sliding window*) berdurasi $\Delta T = 50\text{ ms}$ ($M = 2.205$ balok):
$$E_{\text{window}} = \sum_{k=1}^M [f(t_k)]^2 \cdot \Delta t$$
Hentakan bass dikenali saat energi sesaat melonjak melampaui rata-rata latar belakang:
$$E_{\text{window}} > C \cdot E_{\text{avg}} \quad (C = 1{,}3 - 1{,}5)$$

### E. Komparasi Metode Integrasi Numerik (Bahan Analisis Artikel Ilmiah)
Aplikasi membandingkan 5 metode kalkulus numerik secara real-time:
1. **Riemann Kiri (Left Sum):** $S_{\text{left}} = \sum_{k=0}^{N-1} P(t_k) \Delta t$
2. **Riemann Kanan (Right Sum):** $S_{\text{right}} = \sum_{k=1}^N P(t_k) \Delta t$
3. **Riemann Titik Tengah (Midpoint):** $S_{\text{mid}} = \sum_{k=0}^{N-1} P(t_{k+1/2}) \Delta t$
4. **Aturan Trapesium:** $S_{\text{trap}} = \frac{\Delta t}{2} [P_0 + 2\sum P_k + P_N]$
5. **Aturan Simpson 1/3:** $S_{\text{simp}} = \frac{\Delta t}{3} [P_0 + 4\sum_{\text{ganjil}} P_k + 2\sum_{\text{genap}} P_k + P_N]$
Lengkap dengan galat relatif komputasi:
$$\text{Error} = \frac{|S_{\text{left}} - S_{\text{simp}}|}{S_{\text{simp}}} \times 100\%$$

---

## 2. Arsitektur Dual-Engine: Kalkulus & AI Stem Mixer

Aplikasi menggabungkan AI Stem Separation dan Analisis Riemann dalam satu alur kerja harmonis:
1. **AI / DSP Separator:** Memilah lagu campuran menjadi 4 stem terisolasi:
   - **Drums & Percussion** (Kick, Snare, Hi-hats)
   - **Bass Guitar & Sub-Bass** (Low-frequency)
   - **Vocals** (Center channel voice)
   - **Other / Melody** (Synth, Guitar, Piano)
2. **Kalkulus Analysis Engine:**
   Menjalankan rumus Riemann, sliding window beat detector, dan komparasi integrasi numerik pada sinyal stem yang dipilih pengguna.

---

## 3. Fitur Utama Web App

- **Interactive Canvas 2D:** Visualisasi kurva daya $P(t) = [f(t)]^2$ yang terbagi menjadi balok-balok persegi panjang $\Delta t$ interaktif dengan slider kerapatan $N$ (10 s.d. 300 balok).
- **Real-Time Beat Flash Indicator:** Lampu pulsa LED yang menyala otomatis saat $E_{\text{window}} > C \cdot E_{\text{avg}}$ disertai slider sensitivitas $C$.
- **4-Track Stem Mixer:** Fader volume individual, tombol **[S] Solo** (mendengarkan drum/bass saja), dan tombol **[M] Mute** (menghilangkan vokal untuk karaoke).
- **1-Click Zero-Risk Demo Presets:**
  - `EDM`: *Neon Cyber Drop* (Heavy 808 kick & sidechained sub-bass).
  - `POP`: *Midnight Groove* (Funk slap bassline & clean vocal melody).
  - `ROCK`: *Overdrive Ignition* (Acoustic kit double-kick & power chords).
  *Dihasilkan secara prosedural langsung di browser tanpa butuh koneksi internet atau download file saat presentasi!*
- **Custom File Uploader:** Decode file audio lokal (.mp3/.wav) secara instan via Web Audio API.
- **Spotify URL Input:** Integrasi backend Python FastAPI + yt-dlp + Demucs dengan sistem *caching* disk lokal.
- **Modal Kunci Q&A Dosen:** Kunci jawaban lengkap dari 3 pertanyaan ujian tanya jawab dosen yang tercantum di panduan silabus Pertemuan 11.

---

## 4. Cara Menjalankan Aplikasi

### Menjalankan Frontend (Vite + React TS):
```bash
cd frontend
npm install
npm run dev
```
Aplikasi akan aktif di `http://localhost:5173`.

### Menjalankan Backend (Opsional, untuk Spotify Resolver & Demucs):
```bash
cd backend
pip install -r requirements.txt
python main.py
```
Backend berjalan di `http://localhost:8000`.

---

## 5. Ringkasan Kunci Jawaban Ujian Dosen (Q&A)

1. **Q: Mengapa menghitung kurva daya $[f(t)]^2$ dan bukan amplitudo $f(t)$?**  
   *A:* Sinyal audio berosilasi simetris di sekitar nol. Menghitung luas $f(t)$ membuat luas positif dan negatif saling meniadakan (hasilnya mendekati 0). Pengkuadratan menjamin nilai non-negatif dan mencerminkan energi fisik suara.
2. **Q: Kaitan materi Jumlah Riemann dengan sampling rate 44.100 Hz?**  
   *A:* Sampling rate menentukan partisi waktu. Dalam 1 detik, interval $[0, 1]$ dibagi menjadi $N = 44.100$ partisi dengan $\Delta t \approx 22{,}7\,\mu\text{s}$.
3. **Q: Bagaimana Jumlah Riemann mendeteksi ketukan bass?**  
   *A:* Melalui sliding window 50 ms ($M = 2.205$ balok), luas energi $E_{\text{window}} = \sum [f(t_k)]^2 \Delta t$ melonjak tajam saat bass drum berbunyi. Ketika $E_{\text{window}} > C \cdot E_{\text{avg}}$, hentakan beat terdeteksi.

---
Dikembangkan oleh: **Kelompok 1 Kalkulus — Informatika UPN "Veteran" Jakarta**

## Deploy Backend (Render / Railway, graris 750 jam)

1. Buat repo GitHub `AudioSeparation` lalu push semua file ini.
2. Render: **New → Web Service → Deploy from GitHub**, pilih repo, environment **Docker**.
   - Root Directory: `backend`
   - Instance Type: Free (hati-hati: RAM 512 MB — Demucs bisa OOM; kalau gagal naikkan ke Starter).
   - Environment Variable: `CLIENT_ORIGINS = <url-vercel-kamu>,http://localhost:5173`
3. Copy URL backend, misal `https://riemann-api.onrender.com`.
4. Verify: `curl https://<backend>/api/health` → `{"status":"online",...}`

## Deploy Frontend (Vercel)

1. Vercel: Import repo GitHub, root `frontend`, framework Vite.
2. Environment Variable: `VITE_API_BASE_URL = https://<backend-url-di-render>`
3. Deploy, teman akses via URL Vercel dari HP/laptop mana pun.

### Catatan free tier
- Backend tidur setelah 15 menit idle; request pertama lambat 30-60 detik (cold start).
- yt-dlp dari IP cloud kadang kena block YouTube. Kalau sering gagal, fallback: tombol Unggah File tetap bekerja 100%.
