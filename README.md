# Music Machine

A React and Flask music practice analyzer for monophonic recordings. Measures tuning, note stability and onset alignment to a selected tempo. SQLite stores sessions on this computer.

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

Open http://127.0.0.1:5173. Record with a microphone, upload a PCM WAV, or analyze the generated demo. Select a target note and tempo before analyzing. For best results play one note at a time in a quiet room. Chords, percussion and noisy recordings are not supported for pitch scoring.

## Analysis

The API uses windowed FFT autocorrelation for fundamental estimation, normalized correlation to reject unvoiced frames, parabolic peak interpolation, and a Hann-windowed Fourier spectrum. Pitch error is measured in cents against the chosen note; stability is the standard deviation of voiced pitch. Energy rises estimate note onsets, compared with the nearest beat after the first detected onset. Timing is relative to that first onset, not an externally synchronized metronome. Scores are practice heuristics, not calibrated musical assessments.

Recordings stay in memory and are not saved. Only analysis summaries are stored in `practice.db`. The app is intended for local use and has no account system. Fonts are loaded from Google Fonts with system font fallbacks.

## Verify

```powershell
.venv\Scripts\python -m unittest discover -s tests
npm run build
```

Tests cover known pitches, harmonics, silence, invalid audio, repeated note timing, session creation/deletion, and the JavaScript demo generator through the Python analyzer. The demo integration test requires Node.

After a production build, Flask also serves the frontend at http://127.0.0.1:5000, so only the Python server is needed to use the built app. For development, use the Vite address above for automatic frontend updates.
