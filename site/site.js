let language=new URLSearchParams(location.search).get('lang')==='zh'?'zh':'en';
const toggle=document.getElementById('language');
function renderLanguage(){
 document.documentElement.lang=language==='en'?'en':'zh-CN';
 document.querySelectorAll('[data-en]').forEach(el=>el.textContent=el.dataset[language]);
 toggle.textContent=language==='en'?'中文':'English';
 toggle.setAttribute('aria-label',language==='en'?'Switch to Chinese':'切换为英文');
 for(const [selector,en,zh] of [['nav','Main','主导航'],['.installation','Installation','安装'],['video','Real UI walkthrough','真实界面操作演示']])document.querySelector(selector).setAttribute('aria-label',language==='en'?en:zh);
 const video=document.querySelector('video'),file=language==='en'?'demo-en.mp4':'demo.mp4';
 if(video.getAttribute('src')!==file){video.pause();video.src=file;video.poster=language==='en'?'poster-en.png':'poster.png';video.load();}
 document.getElementById('download-video').href=file;
 document.getElementById('copy-status').textContent='';
}
toggle.addEventListener('click',()=>{language=language==='en'?'zh':'en';const url=new URL(location.href);url.searchParams.set('lang',language);history.replaceState(null,'',url);renderLanguage();});
document.getElementById('copy').addEventListener('click',async()=>{const status=document.getElementById('copy-status');try{await navigator.clipboard.writeText('pi install npm:pi-design-mode@0.3.0');status.textContent=language==='en'?'Copied':'已复制';}catch{status.textContent=language==='en'?'Select and copy the command above.':'请选中上方命令复制。';}});
renderLanguage();
