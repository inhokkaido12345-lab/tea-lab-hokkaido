/**
 * 責務: 管理者の署名検証済み保存結果だけを共有表/既存PNG描画へ渡す。通信はしない。
 * 呼出元: schedule-management.jsのmanagerConfirmed成功分岐。先: ScheduleReport build/renderMatrix/drawPng。
 * 削除影響: 保存直後の表/PNGだけ停止。保存・本人申請・既存出力は独立。
 * 一般化: authoritative response reuse / allowlist projection / generation fencing。
 * 改造: 公開欄追加はbackend共有DTO/validate/PNG漏えい試験と同期。下書き・申請・私的メモは禁止。
 * 境界: 新要求/退場/店舗変更で失効。結果不明や古い月を成功にしない。Storage/外部送信なし。
 * 検証: schedule-saved-output.test.mjs、実Canvasのローカル計測。実GAS待機は別計測。
 */
(function(global){'use strict';
 function project(value,month){
  if(!global.TlhScheduleManagementContract.validate(value,month)||!['FIRST','SECOND'].every(k=>value.halves[k].phase==='PUBLISHED'&&value.halves[k].publishedAt))throw Error('SAVED_PUBLICATION_REQUIRED');
  const halves=['FIRST','SECOND'].map(k=>value.halves[k]);
  return {month,period:'MONTH',phase:'PUBLISHED',publishedAt:halves.map(s=>s.publishedAt).sort().at(-1),
   plans:halves.flatMap(s=>s.plans.map(p=>({employeeCode:p.employeeCode,employeeName:p.employeeName,day:p.day,revision:p.revision,
    periods:p.periods.map(q=>({start:q.start,end:q.end,endNextDay:q.endNextDay,breakMinutes:q.breakMinutes})),
    workIntervals:p.workIntervals.map(q=>({startAtUtc:q.startAtUtc,endAtUtc:q.endAtUtc})),plannedMinutes:p.plannedMinutes,leaveType:p.leaveType,publicNote:p.publicNote||''}))),
   events:halves.flatMap(s=>s.events.map(e=>({day:e.day,title:e.title,note:e.note||''})))};
 }
 function init(options={}){
  const ids=['saved-output','saved-table','saved-png','saved-status'];
  const n=Object.fromEntries(ids.map(k=>[k,document.getElementById('schedule-management-'+k)]));
  const scope=()=>JSON.stringify([global.TlhCurrentWorkplace?.config?.organizationId||'',global.TlhCurrentWorkplace?.config?.workplaceId||'']);
  let report=null,generation=0,busy=false,stopped=false,url=null,store=null;const samples=[];
  const now=()=>performance.now();
  function metric(phase,ms){if(samples.length===90)samples.shift();samples.push({phase,ms});options.onTiming?.({phase,ms});}
  function clear(){generation++;report=null;store=null;busy=false;if(url){URL.revokeObjectURL(url);url=null;}n['saved-png'].disabled=true;n['saved-output'].hidden=true;n['saved-table'].replaceChildren();n['saved-status'].replaceChildren();n['saved-status'].textContent='';}
  function valid(){if(stopped||!report||store!==scope()){clear();return false;}return true;}
  function accept(value,month,applyMs,receivedAt){
   clear();if(stopped)return false;const start=Number.isFinite(receivedAt)?receivedAt:now();
   try{report=global.TlhScheduleReport.build(project(value,month));}catch(_e){return false;}
   store=scope();const current=generation;global.TlhScheduleReport.renderMatrix(n['saved-table'],report.matrix);
   n['saved-output'].hidden=false;n['saved-png'].disabled=false;n['saved-status'].textContent=month+'／公開更新 '+report.publishedAt+'／前半版 '+value.halves.FIRST.monthRevision+'・後半版 '+value.halves.SECOND.monthRevision+'。保存確認済みの内容からPNGを作成します。';
   if(Number.isFinite(applyMs))metric('apply-confirm',applyMs);
   // 二回のrAFは少なくとも次の描画機会をまたぐ。Node模擬値を実画面描画と呼ばない。
   global.requestAnimationFrame(()=>global.requestAnimationFrame(()=>{if(current===generation&&valid())metric('confirm-paint',now()-start);}));return true;
  }
  n['saved-png'].addEventListener('click',async()=>{
   if(!valid()||busy)return;busy=true;n['saved-png'].disabled=true;const current=generation,data=report,start=now();let canvas;
   n['saved-status'].textContent='PNGを作成しています…';
   try{
    if(document.fonts?.ready)await document.fonts.ready;
    if(current!==generation||!valid())return;
    canvas=document.createElement('canvas');global.TlhScheduleReport.drawPng(canvas,data);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG_UNAVAILABLE')),'image/png'));
    if(current!==generation||!valid())return;
    if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);metric('png-ready',now()-start);
    n['saved-status'].replaceChildren();const a=document.createElement('a');a.href=url;a.download='shift_'+data.month+'.png';a.textContent='PNGを保存';a.className='button';n['saved-status'].appendChild(a);a.click();
   }catch(_e){if(current===generation)n['saved-status'].textContent='PNGを作成できませんでした。もう一度お試しください。';}
   finally{if(canvas){canvas.width=0;canvas.height=0;}if(current===generation){busy=false;n['saved-png'].disabled=!valid();}}
  });
  global.addEventListener('pagehide',()=>{stopped=true;clear();});clear();
  return Object.freeze({clear,accept,measurements:()=>samples.map(s=>({...s}))});
 }
 global.TlhScheduleSavedOutput=Object.freeze({project,init});
})(window);
