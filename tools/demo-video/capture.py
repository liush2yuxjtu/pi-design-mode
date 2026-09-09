from pathlib import Path
import json,subprocess,tempfile,time,sys,socket
from playwright.sync_api import sync_playwright,expect
if 'mini' not in socket.gethostname().lower():raise SystemExit('Mac mini only')
ROOT=Path(__file__).resolve().parents[2];record='--record' in sys.argv
OUT=ROOT/'artifacts/public-demo'/('record' if record else 'rehearsal');OUT.mkdir(parents=True,exist_ok=True)
work=Path(tempfile.mkdtemp(prefix='pi-design-public-demo-')).resolve()
proc=subprocess.Popen(['node',str(ROOT/'extensions/html-studio/server.mjs'),str(work)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
markers=[]
try:
 line=proc.stdout.readline()
 if not line:raise RuntimeError(proc.stderr.read())
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=p.chromium.executable_path)
  opts={'viewport':{'width':1440,'height':960},'bypass_csp':True}
  if record:opts.update(record_video_dir=str(OUT/'raw'),record_video_size={'width':1440,'height':960})
  ctx=browser.new_context(**opts);page=ctx.new_page();page.goto(json.loads(line)['url']);frame=page.frame_locator('#artifact');expect(frame.locator('#headline')).to_be_visible()
  # Recording-only framing. Hide private path/proof fields, not product states.
  css='''.hero,.audit,footer,.window.terminal,#root-path,#export-result,#proof{display:none!important}.stage{height:790px!important;margin:0 20px!important}.studio{left:0!important;top:0!important;width:100%!important;height:100%!important}.studio-content{grid-template-columns:1fr 290px!important}.frame-wrap{max-width:960px!important}.frame-wrap iframe{height:605px!important}.canvas{padding:16px!important}body{overflow:hidden!important}.tour{padding:16px 20px!important}#demo-pointer{position:fixed;z-index:99999;pointer-events:none;width:15px;height:22px;background:#b86632;clip-path:polygon(0 0,0 100%,35% 65%,65% 100%,87% 85%,55% 55%,100% 50%)}'''
  def mount():
   page.add_style_tag(content=css);page.evaluate("()=>{const c=document.createElement('i');c.id='demo-pointer';document.body.append(c);document.addEventListener('mousemove',e=>{c.style.left=e.clientX+'px';c.style.top=e.clientY+'px'})}")
  mount();start=time.monotonic()
  def hold(n):page.wait_for_timeout(n*1000 if record else 80)
  def mark(name):markers.append({'action':name,'elapsedMs':round((time.monotonic()-start)*1000)})
  def click(selector):
   el=page.locator(selector) if isinstance(selector,str) else selector;el.scroll_into_view_if_needed();b=el.bounding_box();assert b and b['x']>=0 and b['y']>=0 and b['x']+b['width']<=1440 and b['y']+b['height']<=960
   page.mouse.move(b['x']+b['width']/2,b['y']+b['height']/2,steps=12);hold(.3);el.click();hold(.8)
  hold(2);mark('edit-headline');click('[data-scene="2"]');click('#headline-input');page.locator('#headline-input').fill('');page.locator('#headline-input').press_sequentially('让设计成为真实文件',delay=100 if record else 1);page.locator('#headline-input').press('Tab');expect(frame.locator('#headline')).to_have_text('让设计成为真实文件');hold(2)
  mark('tokens');click('[data-scene="3"]');click('[data-accent="#345b8a"]');click('#radius');page.locator('#radius').press('ArrowRight');hold(2)
  mark('save');click('#save');expect(page.locator('#revision')).to_have_text('磁盘 v1');hold(2)
  mark('interact');click('#mode');click(frame.locator('#message'));frame.locator('#message').press_sequentially('整理本周工作',delay=100 if record else 1);click(frame.locator('#chat-form button'));expect(frame.locator('#answer')).to_contain_text('整理本周工作');hold(2)
  mark('export');click('[data-scene="4"]');click('#export');expect(page.locator('#download-html')).to_be_enabled();file=work/'frontend-v1/index.html';assert file.exists();hold(2)
  mark('standalone-html');page.goto(file.as_uri());mount();click('#message');page.locator('#message').press_sequentially('检查导出交互',delay=100 if record else 1);click('#chat-form button');expect(page.locator('#answer')).to_contain_text('检查导出交互');hold(4)
  page.screenshot(path=str(OUT/'final.png'));video=page.video;ctx.close()
  if record:video.save_as(str(OUT/'raw.webm'))
  browser.close()
 (OUT/'evidence.json').write_text(json.dumps({'record':record,'markers':markers,'checks':['headline','tokens','disk-v1','local-interaction','export','standalone-interaction','target-framing'],'modelInvoked':False,'subtitles':False,'intro':False,'privacy':'Private path/proof fields omitted; studio event sidebar hidden for framing. Real file service, not Pi model invocation.'},ensure_ascii=False,indent=2))
finally:
 proc.terminate()
 try:proc.wait(timeout=10)
 except subprocess.TimeoutExpired:proc.kill();proc.wait()
