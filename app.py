import json
import mimetypes
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import RequestEntityTooLarge
from analysis import analyze, read_wav

# Windows registry MIME mappings can identify .js as text/plain. Module scripts
# require a JavaScript MIME type regardless of the host's registry settings.
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/css', '.css')

app = Flask(__name__, static_folder='dist')
app.config.update(MAX_CONTENT_LENGTH=48 * 1024 * 1024, DATABASE=Path(__file__).with_name('practice.db'))


@contextmanager
def database():
    connection = sqlite3.connect(app.config['DATABASE'])
    connection.row_factory = sqlite3.Row
    try:
        with connection:
            connection.execute('CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY, created TEXT, name TEXT, target INTEGER, bpm INTEGER, result TEXT)')
            yield connection
    finally:
        connection.close()


@app.get('/api/sessions')
def sessions():
    with database() as db:
        rows = db.execute('SELECT * FROM sessions ORDER BY id DESC LIMIT 100').fetchall()
    return jsonify([dict(id=r['id'], created=r['created'], name=r['name'], target=r['target'], bpm=r['bpm'], **json.loads(r['result'])) for r in rows])


@app.delete('/api/sessions/<int:session_id>')
def delete_session(session_id):
    with database() as db:
        changed = db.execute('DELETE FROM sessions WHERE id = ?', (session_id,)).rowcount
    return ('', 204) if changed else (jsonify(error='Session not found.'), 404)


@app.post('/api/analyze')
def analyze_recording():
    try:
        target = int(request.form.get('target', 69))
        bpm = int(request.form.get('bpm', 100))
        if not 36 <= target <= 84 or not 40 <= bpm <= 240:
            raise ValueError('Choose a target from C2–C6 and a tempo from 40–240 BPM.')
        recording = request.files.get('audio')
        if recording is None:
            raise ValueError('Choose a WAV file or make a recording first.')
        samples, rate = read_wav(recording.read())
        result = analyze(samples, rate, target, bpm)
        name = str(request.form.get('name') or 'Practice session').strip()[:100] or 'Practice session'
        created = datetime.now(timezone.utc).isoformat()
        with database() as db:
            cursor = db.execute('INSERT INTO sessions(created,name,target,bpm,result) VALUES (?,?,?,?,?)',
                                (created, name, target, bpm, json.dumps(result)))
            session_id = cursor.lastrowid
        return jsonify(id=session_id, created=created, name=name, target=target, bpm=bpm, **result)
    except (ValueError, OverflowError) as exc:
        return jsonify(error=str(exc)), 400


@app.errorhandler(RequestEntityTooLarge)
def too_large(_):
    return jsonify(error='This recording is too large. Use a WAV file under 48 MB and two minutes.'), 413


@app.get('/')
def index():
    if not (Path(app.static_folder) / 'index.html').exists():
        return 'Start the React frontend with npm run dev.', 200
    return send_from_directory(app.static_folder, 'index.html')


@app.get('/<path:path>')
def assets(path):
    return send_from_directory(app.static_folder, path)


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000)
