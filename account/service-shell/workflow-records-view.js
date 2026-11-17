/** Selected, signed INBOX/QUEUE/TARGETS projection. No authority is inferred
 * from a label or status. Actions call an explicit coordinator and require a
 * fresh signed preview there. This module never submits a write itself. */
(function(g){'use strict';
 const statuses={REQUESTED:'承認待ち',INVITED:'招待が届いています',READY:'承認済み・反映待ち',APPLYING:'反映結果の確認が必要です',APPLIED:'保存結果を確認済み',CANCELLED:'取り消し済み',EXPIRED:'受付期限切れ'};
 function mount(o){const d=o.document,root=o.root;let stopped=false,epoch=0,state='IDLE',rows=[],page=0,cursor='',revision='',next='',history=[];
  const el=(tag,text='')=>{const n=d.createElement(tag);n.textContent=text;return n;};
  function render(){if(stopped)return;const ticket=epoch;const status=el('p',({IDLE:'',LOADING:'確認しています…',EMPTY:o.phase==='TARGETS'?'選択できる利用者はいません。':'申請・招待はありません。',READY:'',AUTH_REQUIRED:'本人確認をやり直してください。',FORBIDDEN:'この対象は確認できません。',STALE_SNAPSHOT:'一覧が更新されました。',ERROR:'確認できませんでした。'})[state]);status.setAttribute('role','status');status.setAttribute('aria-busy',String(state==='LOADING'));root.replaceChildren(el('h3',o.displayName),status);
   const button=(text,fn,disabled=false)=>{const b=el('button',text);b.type='button';b.disabled=disabled;b.addEventListener('click',()=>{if(stopped||ticket!==epoch||b.disabled||o.busy?.())return;fn();});return b;};
   if(['ERROR','STALE_SNAPSHOT'].includes(state))root.appendChild(button('再確認',()=>{cursor='';revision='';history=[];void load();}));
   if(state!=='READY')return;
   const list=el('ul');for(const r of rows.slice(page*10,page*10+10)){const li=el('li');if(o.phase==='TARGETS'){li.appendChild(el('p',r.label||'表示名未登録'));li.appendChild(el('small','Account ID: '+r.accountId));if(o.onTarget)li.appendChild(button('この利用者を選択',()=>o.onTarget({...r})));}else{li.appendChild(el('p',statuses[r.status]));if(o.phase==='QUEUE'){li.appendChild(el('p',r.subjectLabel?'LINE表示名（本人設定）: '+r.subjectLabel.label:'表示名未登録'));li.appendChild(el('small','Account ID: '+r.subjectAccountId));}li.appendChild(el('p','申請・招待の受付期限: '+r.expiresAtUtc));if(r.status==='APPLIED')li.appendChild(el('p','現在の利用状態はアプリで確認してください。'));
     const command=o.phase==='INBOX'&&r.status==='INVITED'?'ACCEPT':o.phase==='QUEUE'&&r.status==='REQUESTED'?'APPROVE':null;
     if(command&&typeof o.onDecision==='function')li.appendChild(button(command==='ACCEPT'?'招待を確認':'申請を確認',()=>o.onDecision(command,JSON.parse(JSON.stringify(r)))));
    if(o.phase==='INBOX'&&['REQUESTED','INVITED','READY'].includes(r.status)&&typeof o.onDecision==='function')li.appendChild(button('取り消しを確認',()=>o.onDecision('CANCEL',JSON.parse(JSON.stringify(r))))); }list.appendChild(li);}root.appendChild(list);
   if(page||history.length||next||rows.length>10){const nav=el('nav');nav.appendChild(button('前へ',()=>{if(page){page--;render();}else{cursor=history.pop();void load(4);}},!page&&!history.length));nav.appendChild(el('span',String(page*10+1)+'–'+Math.min(rows.length,(page+1)*10)+'件目'));nav.appendChild(button('次へ',()=>{if((page+1)*10<rows.length){page++;render();}else{history.push(cursor);cursor=next;void load();}},(page+1)*10>=rows.length&&!next));root.appendChild(nav);}
  }
  async function load(start=0){if(stopped||o.busy?.())return false;const ticket=++epoch;rows=[];state='LOADING';o.reader.cancel?.();render();try{const value=await o.reader.read({phase:o.phase,serviceId:o.serviceId,scopeKind:o.scope.kind,scopeId:o.scope.id,cursor,snapshotRevision:revision});if(stopped||ticket!==epoch)return false;rows=value.items;revision=value.snapshotRevision;next=value.nextCursor;page=Math.min(start,Math.max(0,Math.floor((rows.length-1)/10)));state=rows.length?'READY':'EMPTY';render();return true;}catch(e){if(!stopped&&ticket===epoch){rows=[];state=['AUTH_REQUIRED','FORBIDDEN','STALE_SNAPSHOT'].includes(e.message)?e.message:'ERROR';render();}return false;}}
  render();return Object.freeze({load,close(){stopped=true;epoch++;o.reader.cancel?.();root.replaceChildren();}});
 }
 g.TlhWorkflowRecordsView=Object.freeze({mount});
})(globalThis);
