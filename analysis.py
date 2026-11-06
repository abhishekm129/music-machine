"""Monophonic practice analysis. All audio is processed in memory."""
import io
import wave
import numpy as np


def read_wav(data):
    try:
        with wave.open(io.BytesIO(data), 'rb') as wav:
            rate, width, channels = wav.getframerate(), wav.getsampwidth(), wav.getnchannels()
            if width not in (1, 2, 3, 4) or not 8000 <= rate <= 192000 or channels > 2:
                raise ValueError('Use an 8–192 kHz mono or stereo PCM WAV file.')
            if wav.getnframes() / rate > 120:
                raise ValueError('Recordings must be two minutes or shorter.')
            raw = wav.readframes(wav.getnframes())
        if width == 3:
            b = np.frombuffer(raw, np.uint8).reshape(-1, 3).astype(np.int32)
            values = b[:, 0] | b[:, 1] << 8 | b[:, 2] << 16
            values = (values ^ 0x800000) - 0x800000
            samples = values / 8388608
        else:
            values = np.frombuffer(raw, {1: np.uint8, 2: '<i2', 4: '<i4'}[width]).astype(float)
            samples = (values - 128) / 128 if width == 1 else values / 2 ** (width * 8 - 1)
        samples = samples.reshape(-1, channels).mean(axis=1)
    except (wave.Error, EOFError, OSError, KeyError) as exc:
        raise ValueError('Could not read this file. Export an uncompressed PCM WAV recording.') from exc
    if len(samples) < rate * .3:
        raise ValueError('Record at least 0.3 seconds of audio.')
    return samples, rate


def analyze(samples, rate, target=69, bpm=100, exercise=None):
    # Resample through interpolation to keep analysis cost independent of input rate.
    working_rate = 16000
    samples = np.interp(np.arange(0, len(samples), rate / working_rate), np.arange(len(samples)), samples)
    rate = working_rate
    size, hop = 2048, 320
    if len(samples) < size:
        samples = np.pad(samples, (0, size - len(samples)))
    frames = np.lib.stride_tricks.sliding_window_view(samples, size)[::hop]
    energies = np.sqrt(np.mean(frames ** 2, axis=1))
    threshold = max(.008, float(energies.max()) * .12)
    target_hz = 440 * 2 ** ((target - 69) / 12)
    points, pitches, deviations = [], [], []
    low, high = int(rate / 1200), int(rate / 65)
    for i, frame in enumerate(frames):
        frequency, cents = None, None
        if energies[i] >= threshold:
            centered = frame - frame.mean()
            fft = np.fft.rfft(centered, n=size * 2)
            corr = np.fft.irfft(fft * fft.conj())[:size]
            # Normalize for the decreasing overlap at larger lags.
            squares = np.concatenate(([0.], np.cumsum(centered ** 2)))
            lags = np.arange(low, high + 1)
            denom = np.sqrt((squares[size - lags]) * (squares[size] - squares[lags]))
            scores = corr[lags] / np.maximum(denom, 1e-12)
            candidates = np.where((scores[1:-1] > scores[:-2]) & (scores[1:-1] >= scores[2:]))[0] + 1
            if len(candidates):
                best_score = float(scores[candidates].max())
                good = candidates[scores[candidates] >= max(.82, best_score - .035)]
                if len(good):
                    lag = int(lags[good[0]])
                    a, b, c = corr[lag - 1:lag + 2]
                    shift = .5 * (a - c) / (a - 2 * b + c) if abs(a - 2 * b + c) > 1e-12 else 0
                    frequency = float(rate / (lag + np.clip(shift, -.5, .5)))
                    cents = float(1200 * np.log2(frequency / target_hz))
                    pitches.append(frequency)
                    deviations.append(cents)
        points.append({'time': round(i * hop / rate, 3), 'hz': round(frequency, 2) if frequency else None,
                       'cents': round(cents, 1) if cents is not None else None,
                       'level': round(float(energies[i]), 4)})
    if len(pitches) < 3:
        raise ValueError('No steady musical pitch detected. Try a clear sustained single note with a stronger recording level.')
    # Energy rises identify attacks. Suppress adjacent detections for 140 ms.
    onset_hop = 160
    short = samples[:len(samples) // onset_hop * onset_hop].reshape(-1, onset_hop)
    envelope = np.sqrt(np.mean(short ** 2, axis=1))
    rises = np.diff(envelope, prepend=0)
    candidates = np.where((rises > max(.005, envelope.max() * .13)) & (envelope >= threshold))[0]
    onsets = []
    for idx in candidates:
        time = idx * onset_hop / rate
        if not onsets or time - onsets[-1] > .14:
            onsets.append(round(time, 3))
    beat = 60 / bpm
    errors = [abs((t - onsets[0]) - round((t - onsets[0]) / beat) * beat) * 1000 for t in onsets[1:]]
    timing_ms = round(float(np.mean(errors)), 1) if errors else None
    median = float(np.median(deviations))
    stability = float(np.std(deviations))
    accuracy = round(100 * float(np.mean(np.abs(deviations) <= 25)))
    stable_score = round(max(0, 100 - stability * 2))
    timing_score = round(max(0, 100 - timing_ms / (beat * 1000) * 200)) if timing_ms is not None else None
    # Show the spectrum of the loudest frame, with logarithmic frequency spacing.
    peak_frame = frames[int(np.argmax(energies))] * np.hanning(size)
    spectrum = np.abs(np.fft.rfft(peak_frame))
    bins = np.fft.rfftfreq(size, 1 / rate)
    frequencies = np.geomspace(60, 4000, 180)
    amplitudes = np.interp(frequencies, bins, spectrum)
    db = 20 * np.log10(np.maximum(amplitudes, 1e-9) / max(spectrum.max(), 1e-9))
    feedback = []
    if abs(median) > 10:
        feedback.append({'kind': 'tuning', 'title': f'Your note tends {"sharp" if median > 0 else "flat"}',
                         'detail': f'Average center is {abs(median):.0f} cents {"above" if median > 0 else "below"} the target. Sustain the reference note and adjust slowly.'})
    else:
        feedback.append({'kind': 'tuning', 'title': 'Your tuning is centered', 'detail': 'Keep listening to the reference pitch and aim to stay within ±25 cents.'})
    feedback.append({'kind': 'stability', 'title': 'Work on a steady sustain' if stability > 15 else 'A steady tone',
                     'detail': f'Pitch spread was {stability:.1f} cents. Practice long tones with even breath or bow pressure.'})
    feedback.append({'kind': 'timing', 'title': 'Practice your note attacks' if timing_ms and timing_ms > 50 else 'Timing check',
                     'detail': f'Attacks averaged {timing_ms:.0f} ms from the beat grid. Play repeated notes with a metronome.' if timing_ms is not None else 'Play separated repeated notes to measure timing. One sustained note does not provide enough attacks.'})
    metrics = {'accuracy': accuracy, 'stability': stable_score, 'timing': timing_score,
               'medianHz': round(float(np.median(pitches)), 2), 'deviation': round(median, 1),
               'spread': round(stability, 1), 'timingMs': timing_ms, 'voicedPercent': round(100 * len(pitches) / len(frames)),
               'overall': round(np.mean([accuracy, stable_score] + ([timing_score] if timing_score is not None else [])))}
    result = {'metrics': metrics, 'pitch': points[::max(1, len(points) // 600)], 'onsets': onsets,
            'spectrum': [{'hz': round(float(hz), 1), 'db': round(float(value), 1)} for hz, value in zip(frequencies, db)],
            'feedback': feedback, 'duration': round(len(samples) / rate, 2)}
    if exercise:
        from phrases import evaluate_phrase
        return evaluate_phrase(result, points, exercise, bpm)
    return result
