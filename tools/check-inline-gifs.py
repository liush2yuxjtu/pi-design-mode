from pathlib import Path
import hashlib
import http.server
import json
import subprocess
import sys
import threading
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://liush2yuxjtu.github.io/pi-design-mode/'
FILES = ['demo-en.gif', 'demo.gif']


def check_readmes(read):
    for name in ['README.md', 'README.zh-CN.md']:
        text = read(name)
        for file in FILES:
            assert f']({BASE}{file})' in text, (name, file)
        assert '[![' not in text, name


if '--baseline' in sys.argv:
    if len(sys.argv) != 3 or sys.argv[1] != '--baseline':
        raise SystemExit('Usage: check-inline-gifs.py --baseline <git-ref>')
    revision = subprocess.check_output(['git', 'rev-parse', '--verify', '--end-of-options', sys.argv[2] + '^{commit}'], cwd=ROOT, text=True).strip()
    check_readmes(lambda name: subprocess.check_output(['git', 'show', f'{revision}:{name}'], cwd=ROOT, text=True))
    raise SystemExit('Baseline unexpectedly passed')

check_readmes(lambda name: (ROOT / name).read_text())
package = json.loads((ROOT / 'package.json').read_text())
assert package['pi']['image'] == BASE + FILES[0]
assert 'video' not in package['pi']
media = json.loads((ROOT / 'site/media.json').read_text())
evidence = {'files': {}}
for file, language in zip(FILES, ['en', 'zh']):
    path = ROOT / 'site' / file
    with Image.open(path) as image:
        assert image.size == (960, 492)
        assert image.n_frames > 400
        assert image.info['loop'] == 0
        duration = 0
        for frame in range(image.n_frames):
            image.seek(frame)
            duration += image.info.get('duration', 0)
        assert abs(duration / 1000 - media[language]['duration']) < 0.3
        evidence['files'][file] = {'frames': image.n_frames, 'duration': duration / 1000, 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}

server = None
if len(sys.argv) > 1:
    url = sys.argv[1]
else:
    handler = lambda *args, **kwargs: http.server.SimpleHTTPRequestHandler(*args, directory=str(ROOT / 'site'), **kwargs)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        page.goto(url, wait_until='networkidle')
        for file in FILES:
            candidates = page.locator(f'img[src$="/{file}"], img[src="{file}"]').all()
            image = next(i for i in candidates if i.evaluate('(e)=>!e.closest("a,button")'))
            image.scroll_into_view_if_needed()
            page.wait_for_function('(file) => [...document.images].some(i=>i.currentSrc.endsWith(file)&&i.complete&&i.naturalWidth===960)', arg=file)
            assert image.evaluate('(i)=>!i.closest("a,button")'), file
            before = image.screenshot()
            page.wait_for_timeout(2200)
            after = image.screenshot()
            assert hashlib.sha256(before).digest() != hashlib.sha256(after).digest(), ('not animated', file)
        if 'pi.dev' not in url:
            for width in [390, 768, 1440]:
                page.set_viewport_size({'width': width, 'height': 900})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
            page.emulate_media(reduced_motion='reduce')
            page.wait_for_function('document.querySelector(".inline-demo").currentSrc.endsWith("poster-en.png")')
        evidence['url'] = url
        evidence['zero_click_animation'] = True
        browser.close()
finally:
    if server:
        server.shutdown()
        server.server_close()
print(json.dumps(evidence, ensure_ascii=False, indent=2))
