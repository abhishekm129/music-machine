import io
import tempfile
import unittest
import wave
from pathlib import Path
import numpy as np
from analysis import analyze, read_wav
from app import app


def tone(hz=440, duration=2, rate=16000):
    t = np.arange(int(duration * rate)) / rate
    return .4 * np.sin(2 * np.pi * hz * t)


def wav_bytes(samples):
    output = io.BytesIO()
    with wave.open(output, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes((samples * 32767).astype('<i2').tobytes())
    return output.getvalue()


class AnalysisTests(unittest.TestCase):
    def test_reference_pitch(self):
        result = analyze(tone(), 16000)
        self.assertAlmostEqual(result['metrics']['medianHz'], 440, delta=2)
        self.assertGreater(result['metrics']['accuracy'], 95)
        self.assertIsNone(result['metrics']['timing'])

    def test_sharp_and_low_notes(self):
        self.assertAlmostEqual(analyze(tone(440 * 2 ** (30 / 1200)), 16000)['metrics']['deviation'], 30, delta=3)
        self.assertAlmostEqual(analyze(tone(130.81), 16000, target=48)['metrics']['medianHz'], 130.81, delta=2)

    def test_harmonics_and_silence(self):
        signal = tone(220) * .5 + tone(440) * .8
        self.assertAlmostEqual(analyze(signal, 16000, target=57)['metrics']['medianHz'], 220, delta=3)
        with self.assertRaises(ValueError):
            analyze(np.zeros(32000), 16000)

    def test_repeated_attacks(self):
        signal = np.concatenate([np.concatenate([tone(duration=.25), np.zeros(4000)]) for _ in range(6)])
        result = analyze(signal, 16000, bpm=120)
        self.assertGreaterEqual(len(result['onsets']), 5)
        self.assertLess(result['metrics']['timingMs'], 30)

    def test_wav_validation(self):
        samples, rate = read_wav(wav_bytes(tone()))
        self.assertEqual(rate, 16000)
        self.assertEqual(len(samples), 32000)
        with self.assertRaises(ValueError):
            read_wav(b'not audio')

    def test_session_lifecycle(self):
        with tempfile.TemporaryDirectory() as folder:
            app.config['DATABASE'] = Path(folder) / 'test.db'
            with app.test_client() as client:
                response = client.post('/api/analyze', data={'audio': (io.BytesIO(wav_bytes(tone())), 'note.wav'), 'target': '69', 'bpm': '100'})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(len(client.get('/api/sessions').json), 1)
                self.assertEqual(client.delete(f'/api/sessions/{response.json["id"]}').status_code, 204)
                self.assertEqual(client.get('/api/sessions').json, [])
                self.assertEqual(client.post('/api/analyze', data={'target': 'bad'}).status_code, 400)


if __name__ == '__main__':
    unittest.main()
