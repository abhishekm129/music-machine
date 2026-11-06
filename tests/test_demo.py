"""Exercise the browser's JavaScript demo generator against the Python analyzer."""
import base64
from pathlib import Path
import shutil
import subprocess
import unittest
from analysis import analyze, read_wav


@unittest.skipUnless(shutil.which('node'), 'Node is required for the JavaScript demo integration test')
class DemoIntegrationTests(unittest.TestCase):
    def test_generated_demo_has_expected_pitch_and_attacks(self):
        script = """
import { demoAudio } from './src/audio.js';
const blob = demoAudio(69, 100);
process.stdout.write(Buffer.from(await blob.arrayBuffer()).toString('base64'));
"""
        encoded = subprocess.check_output(['node', '--input-type=module', '-e', script],
                                          cwd=Path(__file__).resolve().parents[1])
        samples, rate = read_wav(base64.b64decode(encoded))
        result = analyze(samples, rate, target=69, bpm=100)
        self.assertGreater(result['metrics']['accuracy'], 95)
        self.assertAlmostEqual(result['metrics']['deviation'], 8, delta=6)
        self.assertGreaterEqual(len(result['onsets']), 10)
        self.assertLess(result['metrics']['timingMs'], 25)


if __name__ == '__main__':
    unittest.main()
