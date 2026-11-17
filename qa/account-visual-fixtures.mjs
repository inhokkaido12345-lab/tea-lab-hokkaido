// Synthetic contract fixtures only. No employee, secret, live request or API write.
import {createHmac} from 'node:crypto';
import {data as overviewData} from '../tests/helpers/account-access-overview-harness.mjs';
export const scenarios=['unregistered','existing','checking','error','unknown','success'];
export function fixtureReply(p,scenario){
 let r,parts;
 if(p.action==='bridgeAccountAccessOverviewV1'){
  if(scenario==='checking')return null;
  const code=scenario==='unregistered'?'COMMON_ACCOUNT_NOT_REGISTERED':scenario==='error'?'COMMON_AUTH_UNAVAILABLE':'ACCOUNT_ACCESS_OVERVIEW_READY';
  r={type:'TLH_ACCOUNT_ACCESS_OVERVIEW_V1',phase:'READ_SELF',nonce:p.nonce,code,data:code==='ACCOUNT_ACCESS_OVERVIEW_READY'?JSON.stringify(overviewData()):''};parts=[r.type,r.phase,r.nonce,r.code,r.data];
 }else if(p.action==='bridgeCommonServiceActivationV1'){
  if(p.phase==='COMMIT'&&scenario==='unknown')return null;
  const summary={organizationId:'fixture_org',organizationName:'合成試験会社',storeId:'fixture_store',storeName:'合成試験店舗',serviceId:'INVENTORY',permissions:['inventory.read','inventory.receive'],employmentCreated:false,validityMinutes:30,addedPermissions:['inventory.read','inventory.receive'],unchangedPermissions:[]};
  const code=p.phase==='PREVIEW'?'COMMON_ACTIVATION_PREVIEW_READY':'COMMON_ACTIVATION_SAVED';
  const d=p.phase==='PREVIEW'?{code,revision:'d'.repeat(64),summary}:{code,savedRevision:2,invitationId:'fixture_invitation',status:'CLAIMED',expiresAtUtc:'2026-11-17T12:30:00.000Z',summary};
  r={type:'TLH_COMMON_SERVICE_ACTIVATION_V2',phase:p.phase,command:p.command,nonce:p.nonce,code,data:JSON.stringify(d)};parts=[r.type,r.phase,r.command,r.nonce,r.code,r.data];
 }else throw Error('UNEXPECTED_FIXTURE_ACTION:'+p.action);
 r.mac=createHmac('sha256',p.responseKey).update(parts.join('\n')).digest('hex');return r;
}
export function replyHTML(reply,origin){return reply?'<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+JSON.stringify(reply).replaceAll('<','\\u003c')+','+JSON.stringify(origin)+')</script>':'<!doctype html><meta charset="utf-8"><title>synthetic withheld response</title>';}

/** Browser-evaluated QA metric: rendered buttons intersecting the current viewport.
 * Closed details descendants are excluded, except its first summary subtree.
 * This is geometric visibility, not a claim that overlays cannot occlude a button.
 */
export function collectViewportButtons() {
  return [...document.querySelectorAll('button')].filter(e => {
    for (let p = e.parentElement; p; p = p.parentElement) {
      if (p.tagName === 'DETAILS' && !p.open) {
        const summary = [...p.children].find(c => c.tagName === 'SUMMARY');
        if (!summary || !summary.contains(e)) return false;
      }
    }
    if (!e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true})) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  }).map(e => { const r = e.getBoundingClientRect(); return {id:e.id,label:e.textContent.trim(),disabled:e.disabled,width:r.width,height:r.height}; });
}
