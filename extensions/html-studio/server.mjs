import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {DesignStore} from './store.mjs';
import {translate,translateForLocale,workspaceLanguage} from './locale.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
/** @param {{root:string,port?:number,onPrompt?:(task:string,text:string)=>Promise<void>,onCommit?:(revision:number)=>void,sessionId?:string,mutate?:(task:()=>unknown)=>Promise<unknown>|unknown}} options */
export async function startStudio({root,port=0,onPrompt,onCommit,sessionId='standalone',mutate=task=>task()}){
 const store=new DesignStore(root);const token=randomBytes(32).toString('hex');let origin='';let queue=Promise.resolve();let closed=false;
 const serial=fn=>{const result=queue.then(()=>mutate(fn));queue=result.catch(()=>{});return result};
 const server=http.createServer(async(req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self' about:; img-src 'self' data:; font-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
 const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))};
 try{if(closed)throw new Error('服务已关闭');if(req.headers.host!==new URL(origin).host)return json(403,{error:'Host 不匹配'});const url=new URL(req.url,origin);if(req.headers['sec-fetch-site']==='cross-site'&&url.pathname!=='/bridge.js')return json(403,{error:'跨站请求拒绝'});
 if(url.pathname.startsWith('/api/')){const supplied=req.headers['x-design-key'];if(typeof supplied!=='string'||supplied.length!==token.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(token)))return json(401,{error:'需要当前工作区授权'});if(req.headers.origin&&req.headers.origin!==origin)return json(403,{error:'Origin 不匹配'});
 if(req.method==='GET'&&url.pathname==='/api/state')return json(200,{...store.read(),sessionId,agentConnected:!!onPrompt});
 if(req.method!=='POST')return json(405,{error:'方法不允许'});if(req.headers.origin!==origin||req.headers['content-type']!=='application/json')return json(403,{error:'只接受同源 JSON 修改'});let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>100000){req.destroy();return}}const body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('请求体无效');
 if(url.pathname==='/api/apply'){if(Object.keys(body).some(k=>!['base','patch'].includes(k)))throw new Error('未知字段');const result=await serial(()=>store.apply(body.base,body.patch));if(onCommit)try{onCommit(result.revision)}catch{store.emit('Pi 记录通知失败','磁盘版本已保存，可重新查询')}return json(200,result)}
 if(url.pathname==='/api/restore'){if(Object.keys(body).some(k=>!['base','revision'].includes(k)))throw new Error('未知字段');return json(200,await serial(()=>store.restore(body.base,body.revision)))}
 if(url.pathname==='/api/export'){if(Object.keys(body).some(k=>k!=='base'))throw new Error('未知字段');return json(200,await serial(()=>store.exportFrontend(body.base)))}
 if(url.pathname==='/api/prompt'){if(Object.keys(body).some(k=>!['task','text'].includes(k))||!['reference','system','edit','frontend'].includes(body.task)||typeof body.text!=='string'||body.text.length>2000)throw new Error('任务无效');if(!onPrompt)return json(503,{error:'当前是独立工作区，未连接 Pi 会话；不会模拟 Agent 回复'});await onPrompt(body.task,body.text);store.emit('已发送给当前 Pi',body.task);return json(200,{status:'queued',note:'等待实际 Agent 执行，不代表完成'})}return json(404,{error:'接口不存在'})}
 if(req.method!=='GET')return json(405,{error:'方法不允许'});const files={'/':'index.html','/client.js':'client.js','/style.css':'style.css','/bridge.js':'bridge.js','/prototype.js':'prototype.js'};if(!Object.hasOwn(files,url.pathname))return json(404,{error:'文件不在允许列表'});const file=files[url.pathname];res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});const source=fs.readFileSync(path.join(HERE,'public',file),'utf8');res.end(file==='bridge.js'?translateForLocale(source,workspaceLanguage(store.values()['components.html'])):translate(source));
 }catch(e){if(!res.headersSent)json(e.status||400,{error:e.message});else res.end()}});
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})}catch(e){store.close();throw e}origin='http://127.0.0.1:'+server.address().port;
 return{url:origin+'/#'+token,origin,token,store,async close(){if(closed)return;closed=true;server.closeIdleConnections();await new Promise(resolve=>server.close(resolve));await queue;store.close()}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(process.argv[2]||'.pi-design');const app=await startStudio({root,port:Number(process.env.DESIGN_PORT||0)});process.stdout.write(JSON.stringify({url:app.url,pid:process.pid,root})+'\n');for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>app.close().then(()=>process.exit(0)));
}
