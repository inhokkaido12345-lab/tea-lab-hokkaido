/** Independent in-app inbox/approval prototype UI. No public mount and no automatic writes.
 * Server supplies visible records/actions. Metadata supplies labels; shell knows no service names.
 * RECORDED/READY is not APPLIED. Unknown saves expose lookup only, never an automatic commit.
 */
(function(g){'use strict';
 function mount(o){const root=o.root,d=o.document,m=o.model;let stopped=false,generation=0,page=0;
  const create=(tag,text)=>{const n=d.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  async function run(fn){if(stopped)return;const promise=fn();render();try{await promise;}finally{if(!stopped)render();}}
  function render(){if(stopped)return;const current=++generation,v=m.view(),status=create('p',({IDLE:'受信・申請一覧を読み込めます。',LOADING:'読込中…',READY:'',EMPTY:'対象はありません。',DENIED:'この範囲を確認する権限はありません。',NOT_CONNECTED:'このサービスは未接続です。',ERROR:'確認できません。再読込してください。',PREVIEWING:'内容を確認しています…',REVIEW:'内容を確認して確定してください。',SAVING:'保存結果を確認しています。閉じないでください。',CHECKING_RESULT:'同じ操作の結果を確認しています。',UNKNOWN:'保存結果は不明です。別の操作をせず、同じ操作の結果を確認してください。',RECORDED:'申請・招待の状態を更新しました。サービス権限の適用完了ではありません。',APPLIED:'この操作の保存結果を確認しました。現在の利用権限は別途確認が必要です。',REJECTED:'この操作は保存されませんでした。'})[v.state]);status.setAttribute('role','status');status.setAttribute('aria-busy',String(['LOADING','PREVIEWING','SAVING','CHECKING_RESULT'].includes(v.state)));root.replaceChildren(status);
   const button=(label,fn,disabled=false)=>{const n=create('button',label);n.type='button';n.disabled=disabled;n.addEventListener('click',()=>{if(!stopped&&generation===current&&!n.disabled)void run(fn);});root.appendChild(n);return n;};
   button('一覧を再読込',()=>m.read(),m.busy()||v.state==='LOADING');
   if(v.state==='READY'){const rows=v.rows.slice(page*24,(page+1)*24);for(const row of rows){const heading=create('p',row.label);root.appendChild(heading);for(const actionId of row.actions){const meta=o.actions.find(x=>x.actionId===actionId);if(meta)button(meta.label,()=>m.preview(actionId,row.itemId,o.fieldsFor?.(actionId,row)||{}));}}if(page>0)button('前へ',()=>{page--;});if((page+1)*24<v.rows.length)button('次へ',()=>{page++;});}
   if(v.state==='REVIEW'){root.appendChild(create('p',v.review));button('確認した内容で確定',()=>m.commit());button('取り消す',()=>m.cancel());}
   if(v.state==='UNKNOWN')button('同じ操作の結果を確認',()=>m.lookup());
   if(v.state==='RECORDED')root.appendChild(create('p','状態：'+v.result.recordStatus));
  }
  render();return Object.freeze({render,close(){stopped=true;generation++;m.close();root.replaceChildren();}});
 }
 g.TlhServiceWorkflowView=Object.freeze({mount});
})(globalThis);
