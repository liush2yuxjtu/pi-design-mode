from pathlib import Path
import json,sys
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/site';OUT.mkdir(parents=True,exist_ok=True)
media=json.loads((ROOT/'site/media.json').read_text())
server=None
if len(sys.argv)>1:url=sys.argv[1]
else:
 import http.server,threading
 handler=lambda *a,**kw:http.server.SimpleHTTPRequestHandler(*a,directory=str(ROOT/'site'),**kw)
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
 threading.Thread(target=server.serve_forever,daemon=True).start()
 url=f'http://127.0.0.1:{server.server_port}/'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  context=browser.new_context(permissions=['clipboard-read','clipboard-write'],viewport={'width':1440,'height':1000})
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  response=page.goto(url);assert response.status==200
  expect(page.locator('html')).to_have_attribute('lang','en')
  page.locator('#copy').click();expect(page.locator('#copy-status')).to_have_text('Copied')
  assert page.evaluate('navigator.clipboard.readText()')=='pi install npm:pi-design-mode@0.3.1'
  page.locator('#hd-video summary').click()
  for language in ['en','zh','en']:
   if page.locator('html').get_attribute('lang')!=('en' if language=='en' else 'zh-CN'):page.locator('#language').click()
   video=page.locator('video');video.scroll_into_view_if_needed()
   page.evaluate("document.querySelector('video').play()")
   page.wait_for_function("document.querySelector('video').currentTime > 0.3",timeout=20000)
   actual=video.evaluate('(v)=>({time:v.currentTime,duration:v.duration,width:v.videoWidth,height:v.videoHeight,src:v.currentSrc})')
   expected=media[language]
   assert actual['time']>0 and abs(actual['duration']-expected['duration'])<.1,actual
   assert (actual['width'],actual['height'])==(expected['width'],expected['height'])
   assert actual['src'].endswith(expected['file'])
   assert page.locator('#download-video').get_attribute('href')==expected['file']
   video.evaluate('(v)=>v.pause()')
   if language=='zh':
    expect(page.locator('nav')).to_have_attribute('aria-label','主导航')
    expect(video).to_have_attribute('aria-label','真实界面操作演示')
    expect(page.locator('h1')).to_contain_text('留在文件里')
   page.screenshot(path=str(OUT/(language+'-desktop.png')),full_page=True)
  for width in [390,768,1440]:
   page.set_viewport_size({'width':width,'height':900})
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'mobile.png'),full_page=True)
  page.goto(url.split('?')[0]+'?lang=zh#demo');expect(page.locator('html')).to_have_attribute('lang','zh-CN')
  expect(page.locator('video')).to_have_attribute('src','demo.mp4')
  assert not errors,errors
  evidence={'url':url,'status':200,'checks':['both-videos-play','both-durations-and-dimensions','language-switch','language-deep-link','download-links','copy','responsive-390-768-1440'],'errors':errors}
  (OUT/'evidence.json').write_text(json.dumps(evidence,indent=2));print(json.dumps(evidence));browser.close()
finally:
 if server:server.shutdown();server.server_close()
