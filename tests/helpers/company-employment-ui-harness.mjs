import fs from 'node:fs';import vm from 'node:vm';import {webcrypto,createHmac} from 'node:crypto';
export const source=fs.readFileSync(new URL('../../workforce/company-employment-info.js',import.meta.url),'utf8');
export const companies=()=>({version:1,accountId:'usr_other',companies:[{organizationId:'orgA',name:'A社'},{organizationId:'orgB',name:'B社'}]});
export const employee=(organizationId='orgA')=>({version:1,accountId:'usr_other',organizationId,employee:{employeeId:'empA',employeeCode:'AAA001',name:'架空本人',status:'ACTIVE',hireDate:'2026-01-01',terminationDate:''}});
export function companyUi(){const nodes=new Map(),handlers={},sent=[],timers=new Map();let seq=0,proof='other.jwt.proof';
 const el=()=>({value:'',children:[],events:{},attributes:{},textContent:'',disabled:false,contentWindow:{},setAttribute(k,v){this.attributes[k]=v;},replaceChildren(){this.children=[];},appendChild(v){this.children.push(v);},addEventListener(k,v){this.events[k]=v;},remove(){},submit(){sent.push(Object.fromEntries(this.children.map(x=>[x.name,x.value])));}});
 const n=id=>{if(!nodes.has(id))nodes.set(id,el());return nodes.get(id);};const window={addEventListener(k,v){handlers[k]=v;}};window.top=window;
 vm.runInNewContext(source,{window,document:{getElementById:id=>n(id.replace('company-self-','')),createElement:el,body:el()},crypto:webcrypto,TextEncoder,Uint8Array,Date,setTimeout(f){timers.set(++seq,f);return seq;},clearTimeout(k){timers.delete(k);}});
 const api=window.TlhCompanyEmploymentInfo.init({gasUrl:'https://script.google.com/macros/s/mock/exec',liff:{getIDToken:()=>proof}});
 function signed(code,dto,request=sent.at(-1)){const d={type:'TLH_COMPANY_EMPLOYMENT_V1',phase:request.phase,organizationId:request.organizationId,nonce:request.nonce,code,data:dto?JSON.stringify(dto):''};d.mac=createHmac('sha256',request.responseKey).update([d.type,d.phase,d.organizationId,d.nonce,d.code,d.data].join('\n')).digest('hex');return d;}
 const deliver=(d,event={})=>handlers.message({origin:'https://script.google.com',source:n('frame').contentWindow,data:d,...event});
 const choose=id=>{n('company').value=id;n('company').events.change();};
 async function ready(){api.load();await deliver(signed('COMPANY_EMPLOYMENT_COMPANIES_READY',companies()));}
 return {n,api,handlers,sent,timers,signed,deliver,choose,ready,setProof:v=>{proof=v;},parse:window.TlhCompanyEmploymentInfo.parse};
}
