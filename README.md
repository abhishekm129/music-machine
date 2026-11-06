# Music Machine

A React and Flask music practice analyzer for scales, short melodies, and single-note exercises. Tracks one melodic voice, compares it with an expected phrase, and measures tuning, note stability and rhythmic timing. SQLite stores sessions on this computer.

## Run locally

Python 3.11+ and Node 20.19+ are required.

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
npm install
```

Start the API and frontend in separate terminals:

```powershell
.venv\Scripts\python app.py
```

```powershell
npm run dev
```

Open http://127.0.0.1:5173. Choose an exercise and tempo, then record with a microphone, upload audio, or analyze the generated demo. The default exercise is a major scale. Connected notes are supported: you do not need silence between different notes. Clear attacks help distinguish repeated notes at the same pitch. Chords, simultaneous melodic parts, percussion, and very noisy recordings are not supported.

## Scales and melodies

- Choose a major scale, natural minor scale, major arpeggio, or either short melody; the root note transposes the exercise.
- Select **Write a short melody** for your own phrase. Enter scientific pitch names, such as `C4 D4 E4:2 D4 C4:2`. `C4` is middle C, `F#4` and `Bb3` are supported, and `:2` means two beats. Notes without a length last one beat. Custom pitches are absolute; the root selector is disabled in this mode.
- Melodies may contain 2–32 notes from C2 to C6, up to 64 beats and 115 seconds. Allowed lengths are 0.5, 1, 1.5, 2, 3, and 4 beats. Rests are not supported in this version. Each note must last at least 0.18 seconds; slower tempos work best.
- Use **Hear exercise** to listen to the whole phrase before recording. **Open a demo exercise** generates and analyzes that exercise.
- Turn on **Metronome** before or during **Hear exercise** to hear synchronized beat clicks. The first click aligns with the first note; held notes continue across beats. Enabling clicks during playback joins the next scheduled beat. Stopping or finishing the reference stops both sounds. Without reference playback, the metronome runs independently. Clicks use the Web Audio clock rather than timer firing times and are not mixed into demo recordings sent for analysis.
- The pitch chart overlays your detected pitch with dashed expected notes. The note table identifies notes that are in tune, out of tune, wrong, or not detected, and lists extras. A note that was played quietly or unclearly may be marked not detected.
- Phrase pitch accuracy is the percentage of expected notes within ±25 cents, divided by the larger of expected and detected note counts so extra notes reduce the score. The summary's notes-found count measures correct note identities, including notes needing a tuning adjustment. Stability measures variation *within* notes, not deliberate melodic pitch changes.
- Timing compares aligned note starts with the written beat lengths, anchored to the first matched note. It does not measure your start against an external metronome. Signed timing in the table means early (negative) or late (positive).

Single-note mode remains available for sustained tones or repeated notes at one pitch.

During recording, level guidance helps you avoid a weak or clipped signal. The reference exercise stops when recording begins. The metronome can keep playing, and you can switch it on or off during recording without changing the tempo. It stops when the recording ends.

Use headphones when recording with the metronome. The app records only the original microphone stream: clicks and reference playback are never digitally mixed into it. However, speakers can physically leak into a microphone, so speaker clicks cannot be guaranteed absent from analysis. No frequency filtering is applied to remove clicks, because this could also remove part of your instrument's tone.

Session history includes name search, root-note filtering, date/score sorting, and CSV export of the displayed sessions. The app loads the most recent 100 sessions. Audio is not included in exports. Progress charts compare only identical exercise notes and durations at the same root and tempo. Old single-note sessions remain separate from scales and melodies. CSV summaries include exercise names and note counts. A missing timing measurement is never treated as zero.

## Analysis

The API uses a YIN-style cumulative mean normalized difference function for fundamental estimation. A fixed-length comparison window, FFT-accelerated differences, earliest acceptable period minimum, and parabolic interpolation reduce octave drops on irregular vocal-like signals. Pitch estimation does not use the selected target to force an octave. A Hann-windowed Fourier spectrum shows harmonic content. This implementation follows the approach described by [de Cheveigné & Kawahara (2002)](https://doi.org/10.1121/1.1458024); [librosa's YIN documentation](https://librosa.org/doc/main/api/generated/librosa.yin.html) describes the same period-selection method. No additional Python dependencies are required.

For single notes, pitch error is measured in cents against the chosen note and stability is the standard deviation of voiced pitch. A 50 ms smoothed energy envelope identifies note attacks without treating short-window fluctuations in low voices as separate notes. Timing is relative to the first onset, not an externally synchronized metronome. Scores are practice heuristics, not calibrated musical assessments.

When most of a phrase follows the expected pattern one or two octaves away, an octave-check notice explains the mismatch. The actual pitches and low pitch-accuracy score are preserved; no automatic transposition is applied. Use the reference playback and the root note's displayed frequency to check register. Synthetic vocal-like tests include harmonics, vibrato, breath noise and alternating-cycle amplitude; these cannot guarantee accuracy for every real voice.

Saved sessions keep their original measurements. Re-analyze the original take to use the updated detector. Earlier-detector results are kept separate from current results in progress comparisons. Use **Save recording as WAV** beneath the audio player to keep a take for later analysis; audio is still not stored on the server.

For phrases, median-smoothed pitch frames and energy attacks are segmented into note events. Very short transitions are discarded. Dynamic-programming sequence alignment associates events with expected notes while allowing insertions, omissions, and substitutions. Tuning is measured against each note's reference; stability excludes frames at note edges. The shared `exercises.json` catalog supplies both the UI and backend; the backend validates all submitted exercises. This is a lightweight signal-processing approach, so pitch slides, heavy vibrato, overlapping sustain, and very fast ornaments can produce segmentation errors.

Recordings stay in memory and are not saved. Only analysis summaries are stored in `practice.db`. The app is intended for local use and has no account system. Typography uses local serif, sans-serif, and monospace font stacks without external font requests.

## Verify

```powershell
.venv\Scripts\python -m unittest discover -s tests
npm test
npm run build
```

Tests cover known pitches, harmonics, silence, invalid audio, repeated note timing, session creation/deletion, asset MIME types, and the JavaScript demo generator through the Python analyzer. JavaScript tests cover signal levels, history filtering and sorting, CSV escaping, and matching-session comparisons. The demo integration test requires Node.

UI rendering checks exercise the studio's empty, recording, loading and result states, plus empty and filtered journals. These catch rendering regressions but do not replace browser-based checks of layout or microphone permissions.

After a production build, Flask also serves the frontend at http://127.0.0.1:5000, so only the Python server is needed to use the built app. For development, use the Vite address above for automatic frontend updates.
