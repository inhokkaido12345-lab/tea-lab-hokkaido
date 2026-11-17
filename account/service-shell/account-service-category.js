/** Account composition adapter. Existing broker proof + verified self callback only.
 * Read-only category; no P0 controller is recreated or disposed on navigation. */
(function(g){'use strict';
 function init(o){
  const host=document.getElementById('account-service-content'),frame=document.getElementById('account-service-frame');if(!host||!frame)return null;
  let actor=null,proof=null,scopes=[],selected=false,view=null,reader=null,stopped=false,wantedScope=null;
  function clear(){view?.close();view=null;reader?.close?.();reader=null;host.replaceChildren();}
  function render(){clear();if(!selected||stopped)return;if(!actor||!proof){host.textContent='本人情報を確認してからサービスを表示します。';return;}
   reader=g.TlhSignedServiceReader.create({frame,getProof:o.getProof,getActor:()=>actor,post(request){if(!actor||o.getProof()!==proof)throw Error('IDENTITY_CHANGED');const form=document.createElement('form');form.method='POST';form.action=o.endpoint;form.target=frame.name;form.hidden=true;for(const[name,value]of Object.entries(request)){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);}document.body.appendChild(form);try{form.submit();}finally{form.remove();}}});
   view=g.TlhServiceManagement.mount({root:host,document,reader,getActor:()=>actor,scopes,launchers:o.launchers||[],canLeave:o.canLeave});if(wantedScope&&scopes.some(s=>s.kind===wantedScope.kind&&s.id===wantedScope.id))view.setScope(wantedScope.kind,wantedScope.id);else void view.load();wantedScope=null;
  }
  function stores(value){const target=document.getElementById('account-managed-stores');if(!target?.replaceChildren)return;target.replaceChildren();if(!value)return;const roles=value.operatingRoles||[],managed=scopes.filter(s=>s.kind==='STORE'&&(s.sources.includes('DELEGATION')||roles.some(r=>r.role==='ORGANIZATION_OPERATOR'&&r.effective&&r.organizationId===s.parent?.id)));for(const scope of managed){const row=document.createElement('p'),name=document.createElement('span'),button=document.createElement('button');name.textContent=scope.label;button.type='button';button.textContent='この店舗のサービス';button.addEventListener('click',()=>{if(stopped||o.canLeave?.()===false)return;wantedScope={kind:scope.kind,id:scope.id};document.getElementById('account-tab-services')?.click();});row.appendChild(name);row.appendChild(button);target.appendChild(row);}if(!managed.length)target.textContent='店舗の委任情報はありません。利用できる管理操作は個別に確認します。';}
  return Object.freeze({activate(key){const next=key==='services';if(next===selected)return;selected=next;render();},verified(value){actor=null;proof=null;scopes=[];clear();if(value){scopes=g.TlhVerifiedOverviewScopes.project(value,value.accountId);actor=value.accountId;proof=o.getProof();}stores(value);if(selected)render();},close(){stopped=true;actor=null;proof=null;scopes=[];clear();}});
 }
 g.TlhAccountServiceCategory=Object.freeze({init});
})(window);
