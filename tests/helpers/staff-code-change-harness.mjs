/** 架空DOM＋実WebCryptoで確認→保存の制御を検査。外部通信・実人物は使わない。 */
import vm from 'node:vm';import fs from 'node:fs';import {createHmac,webcrypto} from 'node:crypto';
export function staffCodeChangeHarness(){
 const nodes=new Map(),handlers={},sent=[],timers=new Map();let seq=0,token='fake.jwt.proof';
 function n(key){if(!nodes.has(key))nodes.set(key,{value:'',hidden:true,disabled:false,textContent:'',events:{},contentWindow:{},addEventListener(type,fn){this.events[type]=fn;},setAttribute(k,v){this[k]=v;},reportValidity(){return true;}});return nodes.get(key);}
 const window={addEventListener:(type,fn)=>{handlers[type]=fn;}};window.top=window;
 const context={window,crypto:webcrypto,Uint8Array,TextEncoder,document:{getElementById:id=>n(id.replace('code-change-','')),body:{appendChild(){}},createElement(){return {children:[],appendChild(el){this.children.push(el);},submit(){sent.push(Object.fromEntries(this.children.map(x=>[x.name,x.value])));},remove(){}};}},setTimeout(fn){const id=++seq;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(fs.readFileSync(new URL('../../workforce/staff-code-change.js',import.meta.url),'utf8'),context);window.TlhStaffCodeChange.init({liff:{getIDToken:()=>token},gasUrl:'https://script.google.com/fake'});
 n('old').value='OLD001';n('new').value='NEW001';n('name').value='架空の番号変更社員';n('date').value='';
 const preview=()=>n('form').events.submit({preventDefault(){}}),commit=()=>n('commit').events.click(),reset=()=>n('reset').events.click();
 async function receive(data,{origin='null',source=n('frame').contentWindow}={}){await handlers.message({data,origin,source});}
 async function reply(r,code,revision='',patch={},event={}){const d={type:'TLH_BRIDGE_STAFF_CODE_CHANGE',nonce:r.nonce,action:r.action,command:r.command,code,revision};d.mac=createHmac('sha256',r.responseKey).update([d.type,d.nonce,d.action,d.command,d.code,d.revision].join('\n')).digest('hex');await receive({...d,...patch},event);}
 return {n,sent,timers,preview,commit,reset,reply,receive,window,leave:()=>handlers.pagehide(),setToken:v=>{token=v;},timeout:()=>{for(const fn of [...timers.values()])fn();}};
}
