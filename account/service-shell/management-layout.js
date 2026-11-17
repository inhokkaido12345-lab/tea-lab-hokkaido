/** Isolated Account category layout, not mounted by production Account.
 * Caller supplies verified self/category projection; visibility is never authority.
 * Category content owns current authorization and unknown-write navigation guard.
 * No Google assets, user data fixtures, persistent session or app-specific branch.
 */
(function(g){'use strict';
 const valid=x=>typeof x==='string'&&x.length>0&&x.length<=160&&!/[\x00-\x1f\x7f]/.test(x);
 function mount(o){
  if(!o.root||!o.document||!valid(o.identity?.label)||!Array.isArray(o.categories)||!o.categories.length)throw Error('INVALID_LAYOUT');
  const seen=new Set();for(const c of o.categories){if(!/^[a-z][a-z0-9-]{0,40}$/.test(c.id)||seen.has(c.id)||!valid(c.label)||typeof c.enabled!=='boolean'||typeof c.mount!=='function'||c.icon!==undefined&&(!valid(c.icon)||c.icon.length>8)||!c.enabled&&!valid(c.reason))throw Error('INVALID_CATEGORY');seen.add(c.id);}
  const d=o.document,root=o.root;let selected=null,current=null,stopped=false;
  const el=(tag,text='')=>{const n=d.createElement(tag);n.textContent=text;return n;};
  const shell=el('div'),aside=el('nav'),main=el('main'),identity=el('header'),heading=el('h1',o.identity.label),title=el('h2'),status=el('p'),panel=el('div'),mobile=el('select');
  shell.className='account-management-layout';aside.setAttribute('aria-label','アカウントの項目');identity.appendChild(heading);main.appendChild(identity);mobile.setAttribute('aria-label','表示する項目');mobile.className='management-mobile-category';main.appendChild(mobile);main.appendChild(title);status.setAttribute('role','status');main.appendChild(status);main.appendChild(panel);shell.appendChild(aside);shell.appendChild(main);root.replaceChildren(shell);
  const buttons=new Map();
  for(const c of o.categories){const row=el('div'),b=el('button'),option=el('option',c.label);if(c.icon){const icon=el('span',c.icon);icon.setAttribute('aria-hidden','true');icon.className='management-category-icon';b.appendChild(icon);}b.appendChild(el('span',c.label));b.type='button';b.disabled=!c.enabled;option.value=c.id;option.disabled=!c.enabled;mobile.appendChild(option);b.addEventListener('click',()=>select(c.id));row.appendChild(b);if(!c.enabled){const why=el('small',c.reason);row.appendChild(why);}aside.appendChild(row);buttons.set(c.id,b);}
  function select(id){if(stopped)return false;const c=o.categories.find(c=>c.id===id);if(!c?.enabled){mobile.value=selected||'';return false;}if(selected===id)return true;
   if(o.canLeave?.()===false||current?.canLeave?.()===false){status.textContent='処理結果を確認してから切り替えてください。';mobile.value=selected||'';return false;}
   current?.close?.();current=null;panel.replaceChildren();selected=id;mobile.value=id;title.textContent=c.label;status.textContent='';for(const[k,b]of buttons)b.setAttribute('aria-current',k===id?'page':'false');
   try{current=c.mount({root:panel,document:d})||null;}catch{panel.replaceChildren();status.textContent='この項目を表示できません。別の項目から戻って再確認してください。';}return true;
  }
  mobile.addEventListener('change',()=>select(mobile.value));select(o.initialCategory||o.categories.find(c=>c.enabled)?.id);
  return Object.freeze({select,selected:()=>selected,close(){stopped=true;current?.close?.();current=null;root.replaceChildren();}});
 }
 g.TlhAccountManagementLayout=Object.freeze({mount});
})(globalThis);
