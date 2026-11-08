/**
 * 通信表示: aria-busyを実pendingに同期し、CSSだけで回す。成功/失敗/timeout後は停止。認可/送信条件は不変。
 * 現役・管理用UIの起動時確認。LIFF準備後のstart→既存署名付き読取→表示許可を一度通知。
 * 削除影響: 管理用UIは初期disabledのまま。GASの管理者権限や保存データは変わらない。
 * 一般化: fail closed / one-shot request / presentation gate。画面の利用制御とサーバー認可は別。
 * 改造: 結果の文言はreport、タブ/optionの見た目は呼出側とapp.css。操作の認可はGASで毎回。
 * 境界: D8の診断結果は使わず、D11のHMAC/nonce/actionと専用iframeの送信元を検証。
 * token/応答鍵/権限結果はページメモリだけ。URL/ログ/Storageなし、再送・定期送信なし。
 * 検証: admin-access.test.mjs→layout/全UI→両repo連結。権限付与や実打刻はしない。
 */
(function(global){
  'use strict';
  const ACTION='bridgeCheckStaffEnrollment',TYPE='TLH_BRIDGE_STAFF_ENROLLMENT';
  const codes=['STAFF_ADMIN_READY','TLH_ADMIN_REQUIRED','LINE_VERIFY_REJECTED','INVALID_REQUEST',
    'ENROLLMENT_UNAVAILABLE','ENROLLMENT_BUSY','WRITE_REVIEW_REQUIRED','STAFF_STORAGE_NOT_READY','ACCOUNT_REVIEW_REQUIRED'];
  function related(source,frame){try{for(let i=0;source&&i<8;i++){if(source===frame)return true;const parent=source.parent;if(!parent||parent===source)return false;source=parent;}}catch(_e){}return false;}
  /** 固定APIの返信全体を既存Bridgeと同じ順で検証。成功codeだけの偽postMessageを受け付けない。 */
  async function verify(data,request){
    if(!data||data.type!==TYPE||data.action!==ACTION||data.nonce!==request.nonce||!codes.includes(data.code)||
      typeof data.mac!=='string'||!/^[a-f0-9]{64}$/.test(data.mac))return false;
    const encoder=new TextEncoder(),key=await crypto.subtle.importKey('raw',encoder.encode(request.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('HMAC',key,Uint8Array.from(data.mac.match(/../g),part=>parseInt(part,16)),
      encoder.encode([TYPE,data.nonce,data.action,data.code].join('\n')));
  }
  /**
   * @param {Object} options 固定gasUrl/LIFF/専用frame、onState(allowed,reason)、任意status。
   * @return {{start:Function}} startを何度呼んでも送信は起動中1回だけ。init自体は送らない。
   * @throws {Error} 必須構成欠落。呼出前からHTML/layoutの管理用UIをdisabledにしておく。
   * timeout/例外/退場は許可しない。再確認が必要ならページを開き直す。バックオフなしの再試行を足さない。
   */
  function init(options){
    if(!options||!options.frame||typeof options.onState!=='function')throw Error('ADMIN_ACCESS_CONFIG');
    let started=false,stopped=false,pending=null;
    function report(reason){
      options.status?.setAttribute?.('aria-busy',String(reason==='checking'));
      const allowed=reason==='allowed';options.onState(allowed,reason);
      if(options.status)options.status.textContent={checking:'管理者権限を確認しています。',allowed:'管理者権限を確認しました。',
        denied:'管理機能は管理者専用です。',unavailable:'管理者権限を確認できません。管理機能は停止中です。画面を開き直してください。',
        closed:'管理機能は確認前のため停止中です。'}[reason];
    }
    function finish(reason){if(pending)clearTimeout(pending.timer);pending=null;report(reason);}
    report('closed');
    function start(){
      if(started||stopped)return;started=true;report('checking');
      try{
        if(global!==global.top||!crypto.subtle)throw Error('UNSAFE_CONTEXT');
        const idToken=options.liff&&options.liff.getIDToken();if(typeof idToken!=='string'||!idToken)throw Error('NO_PROOF');
        const random=size=>Array.from(crypto.getRandomValues(new Uint8Array(size)),b=>b.toString(16).padStart(2,'0')).join('');
        const request={nonce:random(16),responseKey:random(32)};pending=request;
        request.timer=setTimeout(()=>{if(pending===request)finish('unavailable');},30000);
        if(options.readTransport){options.readTransport.request({action:ACTION,idToken,nonce:request.nonce,responseKey:request.responseKey}).then(data=>receive(request,data)).catch(()=>{if(pending===request&&!stopped)finish('unavailable');});return;}
        const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhAdminAccessFrame';form.hidden=true;
        Object.entries({action:ACTION,idToken,nonce:request.nonce,responseKey:request.responseKey}).forEach(([name,value])=>{const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);});
        document.body.appendChild(form);try{if(global.TlhCurrentWorkplace)global.TlhCurrentWorkplace.submit(form);else form.submit();}finally{form.remove();}
      }catch(_e){finish('unavailable');}
    }
    global.addEventListener('message',async event=>{
      const request=pending;if(stopped||!request||!related(event.source,options.frame.contentWindow)||
        !(event.origin==='null'||event.origin==='https://script.google.com'||event.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin)))return;
      await receive(request,event.data);
    });
    async function receive(request,value){
      if(stopped||pending!==request)return;
      const source=value,data={type:source&&source.type,action:source&&source.action,nonce:source&&source.nonce,code:source&&source.code,mac:source&&source.mac};
      let valid=false;try{valid=await verify(data,request);}catch(_e){}if(!valid||pending!==request||stopped)return;
      finish(data.code==='STAFF_ADMIN_READY'?'allowed':data.code==='TLH_ADMIN_REQUIRED'?'denied':'unavailable');
    }
    global.addEventListener('pagehide',()=>{stopped=true;finish('closed');});
    return Object.freeze({start});
  }
  global.TlhAdminAccess=Object.freeze({init});
})(window);
