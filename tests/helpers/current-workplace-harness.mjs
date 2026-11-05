/** 実店舗表示/送信helperを架空DOMで検査。外部通信も保存もしない。 */
import fs from 'node:fs';import vm from 'node:vm';
export function currentWorkplaceHarness({href='https://tealabhokkaido.com/workforce/',embedded=false}={}){
 const events={},sent=[];
 const make=()=>({children:[],attrs:{},textContent:'',appendChild(n){this.children.push(n);},replaceChildren(){this.children=[];},setAttribute(k,v){this.attrs[k]=v;}});
 const banner=make(),window={location:{href},addEventListener(k,fn){events[k]=fn;}};window.top=embedded?{}:window;
 const context={window,URL,document:{querySelectorAll:s=>s==='[data-current-workplace]'?[banner]:[],createElement:make}};
 vm.runInNewContext(fs.readFileSync(new URL('../../workforce/current-workplace.js',import.meta.url),'utf8'),context);
 const api=window.TlhCurrentWorkplace;
 const form=(fields={})=>{const n=make(),attrs={method:'POST',action:api.config.endpoint};for(const key of ['method','action'])Object.defineProperty(n,key,{configurable:true,get:()=>attrs[key],set:v=>{attrs[key]=v;}});n.getAttribute=k=>attrs[k]??null;for(const[name,value]of Object.entries(fields))n.appendChild({name,value});n.submit=()=>sent.push(Object.fromEntries(n.children.map(x=>[x.name,x.value])));return n;};
 return {api,window,context,banner,form,sent,leave:()=>events.pagehide()};
}
