import unittest
import numpy as np
from analysis import analyze
from phrases import build_exercise


def voice(hz, duration=.65, rate=16000, alternate=.4, noise=.003):
    """Synthetic harmonics, vibrato, breath noise and alternating-cycle level.

    Alternation introduces a subharmonic; the dominant carrier remains the
    intended pitch. This is a controlled ambiguity test, not a human sample.
    """
    t = np.arange(int(duration*rate))/rate
    frequency = hz*2**(8*np.sin(2*np.pi*5*t)/1200)
    phase = 2*np.pi*np.cumsum(frequency)/rate
    signal = sum(np.sin(k*phase)/k for k in range(1,7))
    signal *= 1+alternate*np.sin(phase/2)
    signal *= .4 / np.max(np.abs(signal))
    return signal + np.random.default_rng(12).normal(0,noise,len(signal))


class VocalPitchTests(unittest.TestCase):
    def test_vocal_like_g3_avoids_half_frequency(self):
        result = analyze(voice(195.9977,duration=2),16000,target=55)
        self.assertAlmostEqual(result['metrics']['medianHz'],195.9977,delta=2)
        self.assertGreater(result['metrics']['accuracy'],95)

    def test_real_lower_octave_is_not_forced_to_target(self):
        result = analyze(voice(97.9989,duration=2,alternate=0),16000,target=55)
        self.assertAlmostEqual(result['metrics']['medianHz'],97.9989,delta=2)
        self.assertAlmostEqual(result['metrics']['deviation'],-1200,delta=15)
        self.assertEqual(result['metrics']['accuracy'],0)

    def test_voice_scale_does_not_drop_an_octave(self):
        exercise = build_exercise({'id':'major_scale'},55,100)
        chunks = [np.zeros(3200)]
        for n in exercise['notes']:
            hz = 440*2**((n['midi']-69)/12)
            sound = voice(hz,duration=n['beats']*.6)
            sound[-960:] = 0
            chunks.append(sound)
        result = analyze(np.concatenate(chunks),16000,55,100,exercise)
        self.assertGreaterEqual(result['sequence']['correct'],14)
        self.assertNotIn('registerHint',result['sequence'])

    def test_register_hint_preserves_lower_octave_notes_and_scores(self):
        exercise = build_exercise({'id':'major_scale'},55,100)
        chunks = [np.zeros(3200)]
        for n in exercise['notes']:
            sound = voice(440*2**((n['midi']-12-69)/12),duration=n['beats']*.6,alternate=0)
            sound[-960:] = 0
            chunks.append(sound)
        result = analyze(np.concatenate(chunks),16000,55,100,exercise)
        self.assertEqual(result['sequence']['registerHint']['semitones'],-12)
        self.assertEqual(result['sequence']['notes'][0]['actual']['midi'],43)
        self.assertEqual(result['metrics']['accuracy'],0)

    def test_noise_is_not_a_reliable_pitch(self):
        with self.assertRaises(ValueError):
            analyze(np.random.default_rng(42).normal(0,.1,32000),16000)


if __name__ == '__main__':
    unittest.main()
