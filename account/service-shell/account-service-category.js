/** Account composition adapter. Existing broker proof + verified self callback only.
 * Read-only category; no P0 controller is recreated or disposed on navigation. */
(function(g){'use strict';
 function init(o){
  const host=document.getElementById('account-service-content'),frame=document.getElementById('account-service-frame');if(!host||!frame)return null;
  let actor=null,proof=null,scopes=[],selected=false,view=null,reader=null,stopped=false;
  function clear(){view?.close();view=null;reader?.close?.();reader=null;host.replaceChildren();}
  function render(){clear();if(!selected||stopped)return;if(!actor||!proof){host.textContent='本人情報を確認してからサービスを表示します。';return;}
   reader=g.TlhSignedServiceReader.create({frame,getProof:o.getProof,getActor:()=>actor,post(request){if(!actor||o.getProof()!==proof)throw Error('IDENTITY_CHANGED');const form=document.createElement('form');form.method='POST';form.action=o.endpoint;form.target=frame.name;form.hidden=true;for(const[name,value]of Object.entries(request)){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);}document.body.appendChild(form);try{form.submit();}finally{form.remove();}}});
   view=g.TlhServiceManagement.mount({root:host,document,reader,getActor:()=>actor,scopes,launchers:o.launchers||[],canLeave:o.canLeave});void view.load();
  }
  return Object.freeze({activate(key){const next=key==='services';if(next===selected)return;selected=next;render();},verified(value){actor=null;proof=null;scopes=[];clear();if(value){scopes=g.TlhVerifiedOverviewScopes.project(value,value.accountId);actor=value.accountId;proof=o.getProof();}if(selected)render();},close(){stopped=true;actor=null;proof=null;scopes=[];clear();}});
 }
 g.TlhAccountServiceCategory=Object.freeze({init});
})(window);
