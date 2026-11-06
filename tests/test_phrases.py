import io
import json
import unittest
import tempfile
from pathlib import Path
import numpy as np
from analysis import analyze
from phrases import build_exercise
from app import app
from test_analysis import wav_bytes


def phrase_audio(notes, bpm=100, gap=.10):
    chunks = [np.zeros(3200)]
    for midi, beats in notes:
        length = int(beats * 60 / bpm * 16000)
        t = np.arange(length) / 16000
        hz = 440 * 2 ** ((midi-69)/12)
        sound = .4 * np.sin(2*np.pi*hz*t) + .08 * np.sin(4*np.pi*hz*t)
        if gap:
            sound[-int(gap*16000):] = 0
        chunks.append(sound)
    return np.concatenate(chunks)


class PhraseTests(unittest.TestCase):
    def test_detuned_notes_and_slow_performance(self):
        exercise = build_exercise({'id':'arpeggio'},60,100)
        notes = [(n['midi']+.35,n['beats']) for n in exercise['notes']]
        result = analyze(phrase_audio(notes),16000,60,100,exercise)
        self.assertEqual(result['sequence']['correct'],7)
        self.assertEqual(result['metrics']['accuracy'],0)
        self.assertGreater(result['metrics']['deviation'],25)
        slow = analyze(phrase_audio([(n['midi'],n['beats']) for n in exercise['notes']],bpm=80),16000,60,100,exercise)
        self.assertGreater(slow['metrics']['timingMs'],200)

    def test_api_persists_exercise_and_note_results(self):
        exercise = build_exercise({'id':'arpeggio'},60,100)
        original = app.config['DATABASE']
        try:
            with tempfile.TemporaryDirectory() as folder:
                app.config['DATABASE'] = Path(folder)/'practice.db'
                with app.test_client() as client:
                    signal = phrase_audio([(n['midi'],n['beats']) for n in exercise['notes']])
                    response = client.post('/api/analyze',data={'audio':(io.BytesIO(wav_bytes(signal)),'arpeggio.wav'), 'target':'60','bpm':'100','exercise':json.dumps({'id':'arpeggio'})})
                    self.assertEqual(response.status_code,200)
                    self.assertEqual(response.json['sequence']['correct'],7)
                    saved = client.get('/api/sessions').json[0]
                    self.assertEqual(saved['exercise']['signature'],exercise['signature'])
                    self.assertEqual(len(saved['sequence']['notes']),7)
        finally:
            app.config['DATABASE'] = original

    def test_connected_scale(self):
        exercise = build_exercise({'id':'major_scale'},60,100)
        result = analyze(phrase_audio([(n['midi'],n['beats']) for n in exercise['notes']],gap=0),16000,60,100,exercise)
        self.assertEqual(result['sequence']['correct'],15)
        self.assertGreater(result['metrics']['accuracy'],90)
        self.assertLess(result['metrics']['spread'],15)
        self.assertLess(result['metrics']['timingMs'],60)

    def test_repeated_notes_and_long_notes(self):
        exercise = build_exercise({'id':'little_answer'},60,100)
        result = analyze(phrase_audio([(n['midi'],n['beats']) for n in exercise['notes']]),16000,60,100,exercise)
        self.assertEqual(result['sequence']['correct'],14)
        self.assertEqual(result['sequence']['missed'],0)

    def test_wrong_missing_and_extra_notes(self):
        notes = [60,62,64,65,67]
        exercise = build_exercise({'id':'custom','notes':[{'midi':m,'beats':1} for m in notes]},60,100)
        wrong = analyze(phrase_audio([(m,1) for m in [60,62,63,65,67]]),16000,60,100,exercise)
        self.assertEqual(wrong['sequence']['wrong'],1)
        self.assertEqual(wrong['sequence']['notes'][2]['status'],'wrong')
        missing = analyze(phrase_audio([(m,1) for m in [60,62,65,67]]),16000,60,100,exercise)
        self.assertEqual(missing['sequence']['missed'],1)
        self.assertEqual(missing['sequence']['notes'][2]['status'],'missed')
        extra = analyze(phrase_audio([(m,1) for m in [60,62,64,66,65,67]]),16000,60,100,exercise)
        self.assertEqual(len(extra['sequence']['extras']),1)

    def test_validation_and_api(self):
        for spec in [None, {'id':'absent'}, {'id':'custom','notes':[]}, {'id':'custom','notes':[{'midi':60,'beats':True}]*2}]:
            with self.assertRaises(ValueError):
                build_exercise(spec,60,100)
        with self.assertRaises(ValueError):
            build_exercise({'id':'major_scale'},84,100)
        with app.test_client() as client:
            response = client.post('/api/analyze',data={'audio':(io.BytesIO(wav_bytes(phrase_audio([(60,1),(62,1)]))),'scale.wav'), 'exercise':json.dumps({'id':'unknown'})})
            self.assertEqual(response.status_code,400)


if __name__ == '__main__':
    unittest.main()
