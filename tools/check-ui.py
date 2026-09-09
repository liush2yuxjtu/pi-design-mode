"""真实浏览器回归。需要外部 Playwright Python，不调用模型。"""
import json, subprocess, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 for case in ['export-cache','metadata-draft','locked-undo']:
  work=Path(tempfile.mkdtemp(prefix='pi-design-ui-')).resolve()
  proc=subprocess.Popen(['node',str(ROOT/'extensions/html-studio/server.mjs'),str(work)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  page=browser.new_page(viewport={'width':1440,'height':1000});page.on('dialog',lambda dialog:dialog.accept())
  try:
   line=proc.stdout.readline()
   if not line:raise RuntimeError(proc.stderr.read())
   page.goto(json.loads(line)['url']);expect(page.frame_locator('#artifact').locator('#headline')).to_be_visible()
   if case=='export-cache':
    page.locator('[data-scene="4"]').click();page.locator('#export').click();expect(page.locator('#download-html')).to_be_enabled()
    page.locator('[data-scene="2"]').click();page.locator('#lock').click();expect(page.locator('#revision')).to_have_text('磁盘 v1')
    assert page.evaluate("exportedHtml === '' && document.getElementById('download-html').disabled"), '新版本仍保留旧导出'
   elif case=='metadata-draft':
    page.locator('[data-scene="3"]').click();page.locator('#radius').fill('18')
    page.locator('[data-scene="1"]').click();page.locator('#design-input').fill('# 修改后的说明');page.locator('#save-design').click();expect(page.locator('#revision')).to_have_text('磁盘 v1')
    assert page.evaluate('data.state.radius')==18, '保存说明丢失尚未保存的圆角'
   else:
    page.locator('[data-scene="2"]').click();page.locator('#lock').click();expect(page.locator('#revision')).to_have_text('磁盘 v1')
    page.locator('[data-scene="3"]').click();page.locator('#radius').fill('18')
    page.locator('[data-scene="2"]').click()
    assert page.locator('#undo').is_enabled(), '标题锁错误禁用了 token 撤销'
    page.locator('#undo').click();assert page.evaluate('draft.radius')==12
    assert page.locator('#redo').is_enabled();page.locator('#redo').click();assert page.evaluate('draft.radius')==18
   results.append({'case':case,'passed':True})
  except Exception as e:results.append({'case':case,'passed':False,'error':str(e)})
  finally:
   page.close();proc.terminate();proc.wait(timeout=8)
 browser.close()
print(json.dumps(results,ensure_ascii=False,indent=2))
assert all(r['passed'] for r in results)
