/** Bounded generic selector; signed transport and approved service UI adapters are supplied separately.
 * No service URLs, names, role hierarchy or grants are encoded here. textContent only.
 * Not mounted in current Account: compatibility screens remain until verified wire integration.
 */
(function(g){'use strict';
 function mount(o){const d=o.document,root=o.root,m=o.model;let stopped=false,query='',offset=0,scope=null;
  const el=(tag,text)=>{const n=d.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const search=el('input'),list=el('div'),next=el('button','次へ'),previous=el('button','前へ'),status=el('p'),operations=el('div');search.setAttribute('aria-label','サービスを検索');status.setAttribute('role','status');
  function render(){const page=m.page('services',query,offset);list.replaceChildren();for(const service of page.items){const button=el('button',service.name);button.type='button';button.disabled=!scope;button.addEventListener('click',()=>{if(stopped||!scope)return;const ticket=m.select(service.serviceId,scope);if(!ticket)return;show();o.onSelect(ticket);});list.appendChild(button);}previous.disabled=offset===0;next.disabled=offset+page.items.length>=page.total;}
  function show(){const v=m.view();status.textContent=({IDLE:'サービスを選択してください。',LOADING:'読込中…',VERIFIED:'確認しました。',DENIED:'この範囲では利用できません。',NOT_CONNECTED:'未接続です。',UNAVAILABLE:'確認できません。',ERROR:'再確認が必要です。'})[v.state];status.setAttribute('aria-busy',String(v.state==='LOADING'));operations.replaceChildren();for(const action of v.operations){const button=el('button',action.label);button.disabled=!action.enabled;button.type='button';button.addEventListener('click',()=>{if(!stopped&&m.view().selection===v.selection&&m.canInvoke(action.capabilityId))o.onInvoke(v.selection,action.capabilityId);});operations.appendChild(button);}}
  search.addEventListener('input',()=>{if(stopped)return;query=search.value;offset=0;render();});next.addEventListener('click',()=>{if(!stopped&&!next.disabled){offset+=24;render();}});previous.addEventListener('click',()=>{if(!stopped&&!previous.disabled){offset=Math.max(0,offset-24);render();}});
  root.replaceChildren(search,list,previous,next,status,operations);render();show();
  return Object.freeze({setScope(scopeId){if(stopped||!m.scopes.some(s=>s.scopeId===scopeId))return false;m.clear();scope=scopeId;render();show();return true;},update:show,close(){stopped=true;m.stop();root.replaceChildren();}});
 }
 g.TlhServiceShellView=Object.freeze({mount});
})(globalThis);
