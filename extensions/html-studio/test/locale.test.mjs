import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const store=new URL('../store.mjs',import.meta.url).href;
const server=new URL('../server.mjs',import.meta.url).href;
const locale=new URL('../locale.mjs',import.meta.url).href;
const run=(code,language='en')=>execFileSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',env:{...process.env,PI_DESIGN_LANGUAGE:language}});
test('英文模式初始化真实英文真源，用户内容不被翻译，导出保留主题',()=>{
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pi-design-en-项目-'));
 try { run(`import assert from 'node:assert/strict';import {DesignStore} from ${JSON.stringify(store)};const s=new DesignStore(${JSON.stringify(root)});try{let a=s.read();assert.ok(a.events[0].detail.includes(${JSON.stringify(root)}));assert.equal(a.state.headline,'Make room for important work.');assert.match(a.values['components.html'],/lang="en-US"/);a=s.apply(a.etag,{headline:'用户自己的标题',theme:'dark'});assert.equal(a.state.headline,'用户自己的标题');const out=s.exportFrontend(a.etag);assert.match(out.html,/lang="en-US" data-theme="dark"/);assert.match(out.html,/用户自己的标题/);assert.match(out.html,/Local prototype received/);}finally{s.close()}`); }
 finally {fs.rmSync(root,{recursive:true,force:true})}
});
test('英文界面不重写已存在的中文工作区',()=>{
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pi-design-existing-'));
 try { const code=`import {DesignStore} from ${JSON.stringify(store)};const s=new DesignStore(${JSON.stringify(root)});console.log(s.read().etag);s.close();`;assert.equal(run(code,'zh'),run(code,'en')); }
 finally {fs.rmSync(root,{recursive:true,force:true})}
});
test('英文 HTTP 界面与脚本保持有效，翻译只做一次替换',()=>{
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pi-design-http-en-'));
 try {run(`import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {startStudio} from ${JSON.stringify(server)};import {translate} from ${JSON.stringify(locale)};const app=await startStudio({root:${JSON.stringify(root)}});try{const html=await (await fetch(app.origin)).text();assert.match(html,/Apply to project/);assert.match(html,/lang="en-US"/);for(const file of ['client.js','bridge.js','prototype.js']){const js=await(await fetch(app.origin+'/'+file)).text();const result=spawnSync(process.execPath,['--check'],{input:js,encoding:'utf8'});assert.equal(result.status,0,result.stderr);}assert.equal(translate('设计工作区已读取'),'Workspace loaded');}finally{await app.close()}`);}
 finally {fs.rmSync(root,{recursive:true,force:true})}
});
test('重启切换界面语言后，预览交互与导出继续使用设计语言',()=>{
 for(const designLanguage of ['zh','en']){
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pi-design-mixed-'));
  try{
   run(`import {DesignStore} from ${JSON.stringify(store)};const s=new DesignStore(${JSON.stringify(root)});s.close()`,designLanguage);
   const exportText=designLanguage==='en'?'Local prototype received':'本地原型已收到';
   const bridgeText=designLanguage==='en'?'Prototype message':'原型消息';
   run(`import assert from 'node:assert/strict';import {startStudio} from ${JSON.stringify(server)};const app=await startStudio({root:${JSON.stringify(root)}});try{const out=app.store.exportFrontend(app.store.read().etag);assert.ok(out.html.includes(${JSON.stringify(exportText)}));const bridge=await(await fetch(app.origin+'/bridge.js')).text();assert.ok(bridge.includes(${JSON.stringify(bridgeText)}));}finally{await app.close()}`,designLanguage==='en'?'zh':'en');
  }finally{fs.rmSync(root,{recursive:true,force:true})}
 }
});
