"""Build exercises, segment one melodic voice and align it to a reference."""
import json
from pathlib import Path
import numpy as np

CATALOG = json.loads(Path(__file__).with_name('exercises.json').read_text(encoding='utf-8'))


def note_name(midi):
    return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][midi % 12] + str(midi // 12 - 1)


def build_exercise(spec, root, bpm):
    if not isinstance(spec, dict):
        raise ValueError('Choose a scale or melody exercise.')
    exercise_id = spec.get('id')
    if exercise_id == 'single':
        return None
    if exercise_id == 'custom':
        notes = spec.get('notes')
        name = 'Custom melody'
    else:
        preset = next((p for p in CATALOG if p['id'] == exercise_id), None)
        if preset is None:
            raise ValueError('Unknown exercise. Choose an exercise from the list.')
        notes = [{'midi': root + step, 'beats': beats} for step, beats in zip(preset['intervals'], preset['beats'])]
        name = preset['name']
    if not isinstance(notes, list) or not 2 <= len(notes) <= 32:
        raise ValueError('A melody needs 2–32 notes.')
    validated = []
    for n in notes:
        if not isinstance(n, dict):
            raise ValueError('Each melody note needs a pitch and beat length.')
        midi, beats = n.get('midi'), n.get('beats')
        if isinstance(midi, bool) or not isinstance(midi, int) or not 36 <= midi <= 84:
            raise ValueError('Every exercise note must be between C2 and C6. Choose a lower root for a scale.')
        if isinstance(beats, bool) or not isinstance(beats, (float, int)) or beats not in (.5, 1, 1.5, 2, 3, 4):
            raise ValueError('Note lengths must be 0.5, 1, 1.5, 2, 3 or 4 beats.')
        validated.append({'midi': midi, 'beats': beats, 'name': note_name(midi)})
    if sum(n['beats'] for n in validated) > 64 or sum(n['beats'] for n in validated) * 60 / bpm > 115:
        raise ValueError('Keep the melody within 64 beats and 115 seconds.')
    signature = ':'.join(f"{n['midi']}/{n['beats']:g}" for n in validated)
    return {'id': exercise_id, 'name': name, 'notes': validated, 'signature': signature}


def segment_notes(points, onsets):
    # Frame centers locate legato pitch changes; a median suppresses transitions.
    values = [69 + 12 * np.log2(p['hz'] / 440) if p['hz'] else None for p in points]
    smoothed = []
    for i, value in enumerate(values):
        window = [v for v in values[max(0, i-2):i+3] if v is not None]
        smoothed.append(round(float(np.median(window))) if value is not None else None)
    groups, current, last = [], [], None
    for i, midi in enumerate(smoothed):
        if midi is None:
            continue
        time = points[i]['time'] + .064
        if current and (midi != current[-1]['midi'] or time - last > .10):
            groups.append(current)
            current = []
        current.append({'time': time, 'midi': midi, 'hz': points[i]['hz']})
        last = time
    if current:
        groups.append(current)
    detected = []
    for group in groups:
        if len(group) < 5:
            continue
        start, end = max(0, group[0]['time'] - .01), group[-1]['time'] + .01
        # Repeated pitches with new attacks need separate note events too.
        cuts = [t for t in onsets if start + .12 < t < end - .10]
        boundaries = [start] + cuts + [end]
        for left, right in zip(boundaries, boundaries[1:]):
            chunk = [p for p in group if left <= p['time'] < right]
            if len(chunk) < 3:
                continue
            nearby = [t for t in onsets if abs(t-left) <= .10]
            onset = min(nearby, key=lambda t: abs(t-left)) if nearby else left
            frequencies = np.array([p['hz'] for p in chunk])
            midi = group[0]['midi']
            cents = 1200 * np.log2(frequencies / (440 * 2 ** ((midi-69)/12)))
            detected.append({'midi': midi, 'name': note_name(midi), 'start': round(onset, 3),
                             'duration': round(max(.06, right-onset), 3), 'cents': round(float(np.median(cents)), 1),
                             'spread': round(float(np.std(cents)), 1), 'frames': len(chunk)})
    return detected


def align_notes(expected, detected, beat):
    n, m = len(expected), len(detected)
    costs = np.zeros((n+1, m+1))
    costs[:, 0], costs[0, :] = np.arange(n+1), np.arange(m+1)
    actions = {}
    for i in range(1, n+1):
        for j in range(1, m+1):
            a, b = expected[i-1], detected[j-1]
            pitch_cost = 0 if a['midi'] == b['midi'] else 1.25
            duration_cost = min(.2, abs(b['duration'] / beat - a['beats']) * .08)
            choices = [costs[i-1, j-1] + pitch_cost + duration_cost, costs[i-1, j] + 1, costs[i, j-1] + 1]
            action = int(np.argmin(choices))
            costs[i, j] = choices[action]
            actions[i, j] = action
    pairs, extras, i, j = [], [], n, m
    while i or j:
        action = 2 if i == 0 else 1 if j == 0 else actions[i, j]
        if action == 0:
            pairs.append((i-1, j-1)); i -= 1; j -= 1
        elif action == 1:
            pairs.append((i-1, None)); i -= 1
        else:
            extras.append(j-1); j -= 1
    return list(reversed(pairs)), list(reversed(extras))


def evaluate_phrase(result, points, exercise, bpm):
    detected = segment_notes(points, result['onsets'])
    if not detected:
        raise ValueError('Could not identify a sequence of stable notes. Try a slower tempo and clearer notes.')
    expected = exercise['notes']
    beat = 60 / bpm
    pairs, extras = align_notes(expected, detected, beat)
    starts, position = [], 0
    for n in expected:
        starts.append(position * beat)
        position += n['beats']
    first = next(((i,j) for i,j in pairs if j is not None), None)
    offset = detected[first[1]]['start'] - starts[first[0]] if first else 0
    rows, timing, tuning = [], [], []
    for i, j in pairs:
        actual = detected[j] if j is not None else None
        correct_pitch = actual is not None and actual['midi'] == expected[i]['midi']
        status = 'missed' if actual is None else 'wrong' if not correct_pitch else 'in_tune' if abs(actual['cents']) <= 25 else 'out_of_tune'
        error = round((actual['start'] - offset - starts[i]) * 1000, 1) if actual else None
        if actual:
            if i != first[0]:
                timing.append(abs(error))
            if correct_pitch:
                tuning.append(actual['cents'])
        rows.append({'index': i, 'expected': expected[i], 'expectedStart': round(starts[i]+offset, 3),
                     'actual': actual, 'status': status, 'timingMs': error})
    count = max(len(expected), len(detected))
    accuracy = round(100 * sum(r['status'] == 'in_tune' for r in rows) / count)
    correct = sum(r['status'] in ('in_tune','out_of_tune') for r in rows)
    stability = float(np.sqrt(np.average([n['spread']**2 for n in detected], weights=[n['frames'] for n in detected])))
    timing_ms = round(float(np.mean(timing)), 1) if timing else None
    timing_score = round(max(0, 100 - timing_ms / (beat*1000) * 200)) if timing_ms is not None else None
    stable_score = round(max(0, 100 - stability*2))
    result['metrics'].update(accuracy=accuracy, noteAccuracy=round(100*correct/count), stability=stable_score,
        spread=round(stability,1), timing=timing_score, timingMs=timing_ms,
        deviation=round(float(np.median(tuning)),1) if tuning else None,
        overall=round(float(np.mean([accuracy,stable_score]+([timing_score] if timing_score is not None else [])))))
    result['exercise'] = exercise
    result['sequence'] = {'notes': rows, 'detected': detected, 'extras': [detected[j] for j in extras],
                          'correct': correct, 'total': len(expected), 'offset': round(offset,3),
                          'missed': sum(r['status']=='missed' for r in rows), 'wrong': sum(r['status']=='wrong' for r in rows)}
    result['feedback'] = [
        {'kind':'tuning','title':f'{correct} of {len(expected)} expected notes found',
         'detail':f"{result['sequence']['wrong']} wrong notes, {result['sequence']['missed']} missed notes, {len(extras)} extra notes. Review the note-by-note results before repeating the phrase."},
        {'kind':'stability','title':'Keep the tone steady within each note',
         'detail':f'Within-note pitch variation was {stability:.1f} cents. Intended changes between notes do not count as instability.'},
        {'kind':'timing','title':'Listen to the space between notes',
         'detail':f'Note starts averaged {timing_ms:.0f} ms from the exercise, relative to your first matched note.' if timing_ms is not None else 'Not enough matched notes for a timing comparison. Try the complete exercise at a slower tempo.'}]
    return result
