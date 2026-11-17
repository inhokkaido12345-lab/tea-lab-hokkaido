/** Shared launcher only: no login, data reads, role parsing, writes or persistent storage.
 * Host mounts into an empty slot; native dialog supplies modal focus/inert behavior.
 * Removing this file only removes navigation. Each destination still verifies latest access.
 * Concepts: progressive disclosure, defensive UI hints, lifecycle cleanup and composition.
 * Edit catalog.js to add apps; keep each app's different auth/DTO contract in that app.
 * beforeNavigate must be synchronous and explicitly return true to allow navigation when provided.
 * A host with unsaved/unknown saves must provide this guard; errors and Promises fail closed.
 * Tests: app-menu.test.mjs (contracts) and app-menu-browser.cjs (real DOM/keyboard/touch widths).
 */
(function(global){'use strict';let sequence=0;
 const hintLabels=Object.freeze({unknown:'移動先で確認',available:'確認済み',unavailable:'利用権限なし'});
 function mount(slot,options={}){
  if(!slot||typeof slot.replaceChildren!=='function')throw Error('APP_MENU_SLOT_REQUIRED');
  const doc=slot.ownerDocument,apps=global.TlhAppCatalog.validate(options.catalog||global.TlhAppCatalog.entries);
  if(typeof doc.createElement('dialog').showModal!=='function')throw Error('APP_MENU_DIALOG_UNSUPPORTED');
  if(options.beforeNavigate!==undefined&&typeof options.beforeNavigate!=='function')throw Error('APP_MENU_GUARD_INVALID');
  const id='tlh-app-menu-'+(++sequence),hints=new Map();let destroyed=false;
  const el=(tag,className,text)=>{const n=doc.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
  const root=el('span','tlh-app-menu'),trigger=el('button','tlh-app-menu__trigger');trigger.type='button';
  trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls',id);trigger.setAttribute('aria-expanded','false');
  const dots=el('span','tlh-app-menu__dots');dots.setAttribute('aria-hidden','true');for(let i=0;i<9;i++)dots.append(el('i'));
  trigger.append(dots,el('span','','アプリ'));root.append(trigger);slot.replaceChildren(root);
  const dialog=el('dialog','tlh-app-dialog');dialog.id=id;dialog.setAttribute('aria-labelledby',id+'-title');dialog.setAttribute('aria-describedby',id+'-help');
  const head=el('div','tlh-app-dialog__head'),heading=el('h2','','TLHアプリ');heading.id=id+'-title';
  const closeButton=el('button','tlh-app-dialog__close','閉じる');closeButton.type='button';closeButton.setAttribute('aria-label','アプリ一覧を閉じる');
  head.append(heading,closeButton);const help=el('p','tlh-app-dialog__help','別の画面で開きます。利用可否は移動先で確認します。');help.id=id+'-help';
  const nav=el('nav');nav.setAttribute('aria-label','TLHアプリ一覧');const list=el('ul','tlh-app-dialog__list');nav.append(list);
  const status=el('p','tlh-app-dialog__status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  dialog.append(head,help,nav,status);doc.body.append(dialog);
  function close(restore=true){if(dialog.open)dialog.close();trigger.setAttribute('aria-expanded','false');if(restore&&!destroyed&&trigger.isConnected)trigger.focus({preventScroll:true});}
  function render(){
   const focused=doc.activeElement&&list.contains(doc.activeElement)?doc.activeElement.dataset.appId:null;
   list.replaceChildren();
   for(const app of apps){
    const hint=hints.get(app.id)||'unknown',current=app.id===options.currentApp;
    const disabled=current||!app.path||hint==='unavailable',item=el('li'),card=el(disabled?'div':'a','tlh-app-dialog__card');card.dataset.appId=app.id;
    if(current){card.setAttribute('aria-current','page');card.dataset.current='true';}
    else if(disabled)card.setAttribute('aria-disabled','true');
    if(!disabled){
     card.href=app.path;card.target='_blank';card.rel='noopener noreferrer';card.referrerPolicy='no-referrer';
     const onNavigate=event=>{
      if(event.type==='auxclick'&&event.button!==1)return;
      if(destroyed){event.preventDefault();return;}
      // No query from the source page, auth proof or store selection is copied into this URL.
      if(options.beforeNavigate){
       let decision;try{decision=options.beforeNavigate(app);}catch{decision=false;}
       if(decision!==true){event.preventDefault();status.textContent=options.blockedMessage||'保存中または保存結果が未確認です。元の画面で確認してから移動してください。';return;}
      }
      close(false);
     };card.addEventListener('click',onNavigate);card.addEventListener('auxclick',onNavigate);
    }
    const mark=el('span','tlh-app-dialog__mark',app.mark);mark.setAttribute('aria-hidden','true');
    const text=el('span','tlh-app-dialog__text'),title=el('strong','',app.title),description=el('span','tlh-app-dialog__description',app.description);
    const label=current?'現在のアプリ':!app.path?'準備中':app.id==='account'?'共通の入口':hintLabels[hint];
    text.append(title,description,el('span','tlh-app-dialog__badge',label));card.append(mark,text);
    if(!disabled)card.append(el('span','tlh-app-menu__sr','（別の画面で開く）'));
    item.append(card);list.append(item);
   }
   if(focused&&dialog.open){const replacement=list.querySelector('[data-app-id="'+focused+'"]');(replacement&&replacement.tagName==='A'?replacement:closeButton).focus({preventScroll:true});}
  }
  function resetHints(){hints.clear();status.textContent='';render();}
  function show(){if(destroyed||dialog.open)return;status.textContent='';render();dialog.showModal();trigger.setAttribute('aria-expanded','true');closeButton.focus({preventScroll:true});}
  function onTrigger(){if(dialog.open)close();else show();}
  function onCancel(event){event.preventDefault();close();}
  function onKeyDown(event){
   if(event.key!=='Tab')return;
   const focusable=Array.from(dialog.querySelectorAll('a[href],button:not([disabled])')),first=focusable[0],last=focusable[focusable.length-1];
   // Some engines send the end-of-dialog Tab to browser chrome; keep this short chooser cyclic.
   if(event.shiftKey&&(doc.activeElement===first||!dialog.contains(doc.activeElement))){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&(doc.activeElement===last||!dialog.contains(doc.activeElement))){event.preventDefault();first.focus();}
  }
  function onBackdrop(event){if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}
  function onClose(){trigger.setAttribute('aria-expanded','false');if(!destroyed&&trigger.isConnected)trigger.focus({preventScroll:true});}
  function onPageHide(){close(false);resetHints();}
  function onPageShow(event){if(event.persisted)onPageHide();}
  function onVisibility(){if(doc.visibilityState==='hidden')onPageHide();}
  trigger.addEventListener('click',onTrigger);closeButton.addEventListener('click',()=>close());dialog.addEventListener('cancel',onCancel);dialog.addEventListener('keydown',onKeyDown);dialog.addEventListener('click',onBackdrop);dialog.addEventListener('close',onClose);
  global.addEventListener('pagehide',onPageHide);global.addEventListener('pageshow',onPageShow);doc.addEventListener('visibilitychange',onVisibility);
  render();
  return Object.freeze({close:()=>close(),
   /** Cosmetic hints from this app's existing verified read only. Never permission to execute. */
   setAccessHints(values={}){if(destroyed)return;hints.clear();for(const app of apps)if(app.id!=='account'&&Object.hasOwn(hintLabels,values[app.id]))hints.set(app.id,values[app.id]);render();},
   destroy(){if(destroyed)return;destroyed=true;close(false);global.removeEventListener('pagehide',onPageHide);global.removeEventListener('pageshow',onPageShow);doc.removeEventListener('visibilitychange',onVisibility);dialog.remove();root.remove();hints.clear();}
  });
 }
 global.TlhAppMenu=Object.freeze({mount});
})(window);
