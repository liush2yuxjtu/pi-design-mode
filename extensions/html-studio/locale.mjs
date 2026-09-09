import fs from 'node:fs';
const english=JSON.parse(fs.readFileSync(new URL('./english.json',import.meta.url),'utf8'));
export const language=process.env.PI_DESIGN_LANGUAGE==='en'?'en':'zh';
const pattern=new RegExp(Object.keys(english).sort((a,b)=>b.length-a.length).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
export function translate(text){return language==='en'?text.replace(pattern,s=>english[s]):text}
