/**
 * 通信表示: aria-busyを実pendingに同期し、CSSだけで回す。成功/失敗/timeout後は停止。認可/送信条件は不変。
 * 現役・管理者の労務設定要対応一覧。起動gate後の明示読取→署名/DTO検査→至急確定と解消条件を表示。
 * 削除影響: 管理の点検表示だけ停止。打刻/登録/賃金/会社設定を変更しない。
 * 概念: actionable unknown / authenticated admin read。閲覧/既読を解消として保存しない。
 * 改造: parse/renderの項目はprivate LaborPolicyService/Bridge/両repoテストと同期。
 * 境界: 会社の回答は公開ソースへ埋め込まず、POST返信のメモリ/表示だけ。URL/Storage/ログなし。
 * 検証: labor-policy.test.mjs→全UI/実GAS連結。表示は適法性の認証や時間外労働の許可ではない。
 */
(function(global){'use strict';
  const ACTION='bridgeGetLaborPolicyReview',TYPE='TLH_BRIDGE_LABOR_POLICY';
  const codes=['LABOR_POLICY_READY','LABOR_POLICY_INVALID','LABOR_POLICY_ADMIN_REQUIRED','LABOR_POLICY_BUSY','LABOR_POLICY_REVIEW_REQUIRED','LABOR_POLICY_UNAVAILABLE'];
  const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.slice().sort().join(',');
  function parse(text){
    if(typeof text!=='string'||text.length>16000)return null;let value;try{value=JSON.parse(text);}catch(_e){return null;}
    if(!exact(value,['version','asOf','source','reviewStatus','urgentCount','statutoryCalculationReady','timeRecordingMustRemainAvailable','issues'])||value.version!==1||
      typeof value.asOf!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.asOf)||!Number.isFinite(Date.parse(value.asOf+'T00:00:00Z'))||new Date(value.asOf+'T00:00:00Z').toISOString().slice(0,10)!==value.asOf||
      value.source!=='OWNER_STATEMENT_UNVERIFIED'||value.statutoryCalculationReady!==false||value.timeRecordingMustRemainAvailable!==true||
      !Array.isArray(value.issues)||value.issues.length>12||value.urgentCount!==value.issues.length||value.reviewStatus!==(value.issues.length?'URGENT_ACTION_REQUIRED':'NO_UNRESOLVED_SETTINGS_REPORTED'))return null;
    const seen=new Set();for(const item of value.issues){
      if(!exact(item,['id','priority','state','title','action','completionEvidence'])||typeof item.id!=='string'||!/^[A-Z][A-Z0-9_]{0,63}$/.test(item.id)||seen.has(item.id)||item.priority!=='URGENT'||
        !['UNCONFIRMED','REPORTED_ABSENT'].includes(item.state)||['title','action','completionEvidence'].some(k=>typeof item[k]!=='string'||!item[k]||item[k].length>600))return null;seen.add(item.id);
    }return value;
  }
  function related(source,frame){try{for(let i=0;source&&i<8;i++){if(source===frame)return true;const parent=source.parent;if(!parent||parent===source)return false;source=parent;}}catch(_e){}return false;}
  async function verify(d,r){
    if(!exact(d,['type','action','nonce','code','review','mac'])||d.type!==TYPE||d.action!==ACTION||d.nonce!==r.nonce||!codes.includes(d.code)||typeof d.review!=='string'||d.review.length>16000||
      d.code!=='LABOR_POLICY_READY'&&d.review!==''||typeof d.mac!=='string'||!/^[a-f0-9]{64}$/.test(d.mac))return false;
    const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(r.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),b=>parseInt(b,16)),enc.encode([TYPE,d.nonce,ACTION,d.code,d.review].join('\n')));
  }
  function init(options){
    const n=Object.fromEntries(['section','check','status','list','source','frame'].map(k=>[k,document.getElementById('labor-policy-'+k)]));let allowed=false,pending=null,stopped=false;
    const clear=()=>{n.list.replaceChildren();n.source.textContent='';};
    const controls=()=>{n.status.setAttribute?.('aria-busy',String(!!pending));n.check.disabled=!allowed||!!pending||stopped;n.section.hidden=!allowed;};
    function finish(){if(pending)clearTimeout(pending.timer);pending=null;controls();}
    function setAllowed(value){allowed=value===true;if(!allowed){clear();finish();}controls();}
    n.check.addEventListener('click',()=>{
      if(!allowed||pending||stopped)return;clear();
      if(global!==global.top||!crypto.subtle){n.status.textContent='状態未確認：至急確認してください。安全な通信を開始できません。';return;}
      let proof;try{proof=options.liff.getIDToken();}catch(_e){}if(!proof){n.status.textContent='状態未確認：LINEでログインし直してください。';return;}
      const random=size=>Array.from(crypto.getRandomValues(new Uint8Array(size)),b=>b.toString(16).padStart(2,'0')).join('');
      const r={nonce:random(16),responseKey:random(32)};pending=r;controls();n.status.textContent='至急確認事項を読み込んでいます。';
      r.timer=setTimeout(()=>{if(pending!==r)return;clear();n.status.textContent='状態未確認：応答がありません。至急確認事項がないとは判断できません。';finish();},30000);
      const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhLaborPolicyFrame';form.hidden=true;
      Object.entries({action:ACTION,idToken:proof,nonce:r.nonce,responseKey:r.responseKey}).forEach(([name,value])=>{const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);});document.body.appendChild(form);
      try{form.submit();}catch(_e){clear();n.status.textContent='状態未確認：取得できません。至急確認してください。';finish();}finally{form.remove();}
    });
    global.addEventListener('message',async event=>{
      const r=pending;if(!r||!allowed||stopped||!related(event.source,n.frame.contentWindow)||!(event.origin==='null'||event.origin==='https://script.google.com'||event.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin)))return;
      let valid=false;try{valid=await verify(event.data,r);}catch(_e){}if(!valid||pending!==r||!allowed||stopped)return;
      const d=event.data;if(d.code==='LABOR_POLICY_READY'){
        const review=parse(d.review);if(!review)return;
        n.source.textContent='所有者回答 '+review.asOf+' 時点・書面未照合。会社の適法性を認証する一覧ではありません。';
        for(const item of review.issues){const card=document.createElement('section');card.className='extra-session';
          for(const [tag,text]of [['h3',item.title],['p',item.state==='UNCONFIRMED'?'未確認：至急確定してください。':'未対応の申告あり：至急対応してください。'],['p',item.action],['p','解消に必要な確認：'+item.completionEvidence]]){const node=document.createElement(tag);node.textContent=text;card.appendChild(node);}n.list.appendChild(card);}
        n.status.textContent=review.urgentCount?'至急対応 '+review.urgentCount+'件。閲覧しただけでは解消しません。':'この一覧の未確定項目はありません。労務上の適法性を保証する表示ではありません。';
      }else{clear();n.status.textContent=d.code==='LABOR_POLICY_ADMIN_REQUIRED'?'管理者権限を確認できません。状態は未確認です。':'状態未確認：取得できません。至急確認事項がないとは判断できません。';}finish();
    });
    global.addEventListener('pagehide',()=>{stopped=true;allowed=false;clear();finish();});clear();controls();return Object.freeze({setAllowed});
  }
  global.TlhLaborPolicy=Object.freeze({init,parse,verify});
})(window);
