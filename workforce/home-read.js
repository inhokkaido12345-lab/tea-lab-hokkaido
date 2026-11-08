/**
 * ホーム専用の読取通信。同期的に要求された固定READを、1回のPOSTと専用iframeへまとめる。
 * 概念: request coalescing（要求の合流）。保存・管理対象の読取は固定5actionの許可表に入れない。
 * 子要求のnonce/鍵/HMACを残し、既存controllerでも署名とDTOを検査してから表示する。
 * 削除影響: 新ホームの読取は失敗扱い。旧単独ページの通信と保存済みの台帳は維持される。
 * 魔改造: BridgeReadHome/API契約・拒否/遅延/離脱試験を同時変更。通信を減らすための認可省略は禁止。
 * 秘密と結果はページ内だけ。Storage/URL/polling/自動再試行を追加しない。
 */
(function(global){'use strict';
  const ACTION='bridgeReadHomeV1',TYPE='TLH_BRIDGE_READ_HOME_V1';
  const actions=['bridgeCheckStaffEnrollment','bridgeGetPunchReadiness','bridgeGetAttendanceJournalV2','bridgeGetDailySummary','bridgeGetMonthlyWorkSummary'];
  const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('');
  function related(source,frame){try{for(let i=0;source&&i<8;i++){if(source===frame)return true;const parent=source.parent;if(!parent||parent===source)return false;source=parent;}}catch(_e){}return false;}
  function init(options){
    let stopped=false,scheduled=false;const queue=[],pending=new Set();
    function fail(batch,code='READ_HOME_UNAVAILABLE'){if(!pending.delete(batch))return;clearTimeout(batch.timer);for(const child of batch.children)child.reject(Object.assign(Error(code),{code}));}
    function flush(){
      scheduled=false;if(stopped)return;
      // Different proofs or duplicate actions are separate requests, never silently merged.
      while(queue.length){
        const first=queue.shift(),children=[first];
        for(let i=0;i<queue.length&&children.length<5;){const child=queue[i];
          if(child.input.idToken===first.input.idToken&&!children.some(c=>c.input.action===child.input.action)){children.push(child);queue.splice(i,1);}else i++;
        }
        const batch={nonce:random(16),responseKey:random(32),children};pending.add(batch);
        batch.timer=setTimeout(()=>fail(batch),30000);
        const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target=options.frame.name||'tlhHomeReadFrame';form.hidden=true;
        const requests=children.map(c=>{const {idToken,...input}=c.input;return input;});
        for(const [name,value]of Object.entries({action:ACTION,nonce:batch.nonce,responseKey:batch.responseKey,idToken:first.input.idToken,requests:JSON.stringify(requests)})){
          const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);
        }
        document.body.appendChild(form);
        try{if(global.TlhCurrentWorkplace)global.TlhCurrentWorkplace.submit(form);else form.submit();}catch(_e){fail(batch);}finally{form.remove();}
      }
    }
    async function receive(event){
      if(stopped||!related(event.source,options.frame.contentWindow)||!(event.origin==='null'||event.origin==='https://script.google.com'||event.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin)))return;
      const d=event.data,batch=[...pending].find(b=>b.nonce===d?.nonce);
      if(!batch||!d||Object.keys(d).sort().join(',')!=='action,code,mac,nonce,replies,type'||d.type!==TYPE||d.action!==ACTION||
        !['READ_HOME_READY','READ_HOME_BUSY','READ_HOME_UNAVAILABLE','INVALID_REQUEST','LINE_VERIFY_REJECTED'].includes(d.code)||
        typeof d.replies!=='string'||d.replies.length>512000||typeof d.mac!=='string'||!/^[a-f0-9]{64}$/.test(d.mac))return;
      try{
        const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(batch.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
        if(!await crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),b=>parseInt(b,16)),enc.encode([TYPE,d.nonce,ACTION,d.code,d.replies].join('\n')))||stopped||!pending.has(batch))return;
        if(d.code!=='READ_HOME_READY'){fail(batch,d.code);return;}
        const replies=JSON.parse(d.replies);
        if(!Array.isArray(replies)||replies.length!==batch.children.length||batch.children.some((c,i)=>replies[i]?.nonce!==c.input.nonce||replies[i]?.action!==c.input.action))return;
        pending.delete(batch);clearTimeout(batch.timer);
        batch.children.forEach((c,i)=>c.resolve(replies[i]));
      }catch(_e){/* Unverified replies never reach controllers. Their timeout stays active. */}
    }
    global.addEventListener('message',receive);
    global.addEventListener('pagehide',()=>{stopped=true;for(const batch of [...pending])fail(batch);for(const child of queue.splice(0))child.reject(Error('READ_HOME_UNAVAILABLE'));});
    return Object.freeze({request(input){return new Promise((resolve,reject)=>{
      const journal=input?.action==='bridgeGetAttendanceJournalV2',fields=journal?['action','nonce','responseKey','idToken','mode','month','employeeCode']:['action','nonce','responseKey','idToken'];
      if(stopped||!input||!actions.includes(input.action)||Object.keys(input).sort().join(',')!==fields.sort().join(',')||journal&&(input.mode!=='self'||input.employeeCode!=='')){reject(Error('READ_HOME_INVALID'));return;}
      queue.push({input:{...input},resolve,reject});if(!scheduled){scheduled=true;Promise.resolve().then(flush);}
    });}});
  }
  global.TlhHomeRead=Object.freeze({init});
})(window);
