/** SELF reminder view. Caller must supply a verified SELF read, never a roster.
 * No network, storage, URL date transport, correction write or timing policy.
 * Selecting dates expresses navigation intent, NOT consent to submit a correction.
 * Caller owns same-person/store lifecycle and must clear this view on invalidation.
 * Removal affects only this notice, never existing punch controls. */
(function(global){'use strict';
 function dates(value){if(!Array.isArray(value)||value.length>1000)return null;const seen=new Set();for(const d of value){if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))return null;const n=Date.parse(d+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==d||seen.has(d))return null;seen.add(d);}return [...seen].sort();}
 function init({root,onSelect}){
  let allowed=[],selected=new Set(),stopped=false,expanded=false;
  const make=(tag,text,parent)=>{const n=document.createElement(tag);if(text)n.textContent=text;parent.appendChild(n);return n;};
  root.className='missing-punch-notice';root.hidden=true;
  const summary=make('button','',root);summary.type='button';summary.setAttribute('aria-expanded','false');
  const panel=make('div','',root);panel.hidden=true;
  const explanation=make('p','公開シフトがあり、打刻・申請を確認できない日です。勤務したかを確認してから、実際の時刻で訂正申請してください。選択だけでは申請しません。',panel);
  const choices=make('fieldset','',panel);make('legend','確認する日（複数選択可）',choices);
  const list=make('div','',choices),go=make('button','選んだ日の訂正へ',panel);go.type='button';
  function controls(){root.hidden=stopped||!allowed.length;panel.hidden=!expanded||root.hidden;summary.disabled=stopped;summary.textContent='打刻を確認する日が '+allowed.length+' 件あります';summary.setAttribute('aria-expanded',String(!panel.hidden));go.disabled=stopped||!selected.size;}
  function clear(){allowed=[];selected.clear();expanded=false;list.replaceChildren();controls();}
  summary.addEventListener('click',()=>{if(stopped||!allowed.length)return;if(allowed.length===1){onSelect(Object.freeze([...allowed]));return;}expanded=true;controls();});
  go.addEventListener('click',()=>{if(stopped||!selected.size)return;const chosen=allowed.filter(d=>selected.has(d));if(chosen.length)onSelect(Object.freeze(chosen));});
  global.addEventListener('pagehide',()=>{stopped=true;clear();});
  return Object.freeze({clear,setVerifiedDates(value){clear();if(stopped)return false;const checked=dates(value);if(!checked)return false;allowed=checked;for(const day of allowed){const label=make('label','',list),field=make('input','',label);field.type='checkbox';field.value=day;const text=make('span',day,label);field.addEventListener('change',()=>{if(stopped||!allowed.includes(day))return;if(field.checked)selected.add(day);else selected.delete(day);controls();});}controls();return true;}});
 }
 global.TlhMissingPunchNotice=Object.freeze({init});
})(window);
