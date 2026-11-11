/**
 * 確定シフト専用の印刷/PDF・PNG・CSV。schedule.jsの署名/DTO検査後→共有欄だけの表→明示出力。
 * 削除影響: シフトの出力だけ停止。予定/打刻/公開版は保存先に残る。
 * 概念: allowlist projection / presentation model。管理者の下書きや本人の秘密を渡さない。
 * 魔改造: CSV列はheaders/build、表はrenderMatrix、PNGはdrawPng、配色はschedule.cssと連動。
 * 境界: 通信/自動送信/外部PDFサービス/Storageなし。取得済みの共有版を出力する。
 * 検証: schedule-report.test.mjsと固定UI連結。計測はscripts/measure-shift-png.mjs（架空データのみ）。
 */
(function(global){'use strict';
 const headers=['日付・曜日','社員番号','氏名','勤務予定（日本時間）','予定休憩（分）','予定実働（分）','休暇','公開特記事項','共有イベント'];
 const stamp=v=>new Date(v).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
 /** 検証済み共有DTOを列の許可リストでコピー。元DTOのspreadやprivate planの出力は禁止。 */
 function build(s){
  // periodsは予定休憩、workIntervalsは用事を含めて重複を除いた予定区間。両者を足して二重加算しない。
  // 空の日を推測で休日にしない。社員ごとの未設定日も、空欄から勤務なしと断定してはならない。
  if(!s||s.phase!=='PUBLISHED'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(s.month)||!s.publishedAt||!Number.isFinite(Date.parse(s.publishedAt))||!Array.isArray(s.plans)||!Array.isArray(s.events))throw Error('SCHEDULE_REPORT_INVALID');
  const range=global.TlhScheduleView.periodRange(s.month,s.period),first=Number(range.start.slice(8)),count=Number(range.end.slice(8)),rows=[];
  // 月全体の共有出力では、未公開の日を「予定未設定」と混同しない。秘密の下書きは渡さない。
  if(s.unpublishedDays!==undefined&&!Array.isArray(s.unpublishedDays))throw Error('SCHEDULE_REPORT_INVALID');
  const unpublished=new Set(s.unpublishedDays||[]);if([...unpublished].some(day=>typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||day<range.start||day>range.end)||s.plans.some(p=>unpublished.has(p.day))||s.events.some(e=>unpublished.has(e.day)))throw Error('SCHEDULE_REPORT_INVALID');
  const plansByDay=global.TlhScheduleView.groupByDay(s.plans);
  const eventsByDay=global.TlhScheduleView.groupByDay(s.events);
  for(let i=first;i<=count;i++){
   const day=s.month+'-'+String(i).padStart(2,'0');
   const label=day+'（'+'日月火水木金土'[new Date(day+'T00:00:00Z').getUTCDay()]+'）';
   const event=(eventsByDay.get(day)||[])
    .map(e=>e.title+(e.note?'：'+e.note:''))
    .join('\n');
   const plans=(plansByDay.get(day)||[]).slice().sort((a,b)=>a.employeeCode.localeCompare(b.employeeCode));
   if(!plans.length)rows.push([label,'','',unpublished.has(day)?'未公開':'予定未設定','','','','',event]);
   // headersと同じ9列。共有DTOの許可項目だけを列挙し、private planは参照しない。
   for(const p of plans){
    rows.push([
     label,
     p.employeeCode,
     p.employeeName,
     p.plannedMinutes===null?'予定未設定':global.TlhScheduleView.workText(p.workIntervals,day,'\n')||'勤務区間なし',
     p.plannedMinutes===null?'':String(p.periods.reduce((sum,q)=>sum+q.breakMinutes,0)),
     p.plannedMinutes===null?'':String(p.plannedMinutes),
     {NONE:'',PUBLIC_OFF:'公休',LEAVE:'休暇'}[p.leaveType],
     p.publicNote||'',
     event,
    ]);
   }
  }
  return{month:s.month,period:s.period||'MONTH',rangeStart:range.start,rangeEnd:range.end,publishedAt:s.publishedAt,rows,matrix:global.TlhScheduleView.matrix(s)};
 }
 /** 公休の装飾線だけを作る。背景印刷OFFでも残るSVGを使用する。
  * 読み上げ文字と備考は呼出元renderMatrixが残す。線の座標変更はPNGのpaintも確認。 */
 function appendOffLine(parent){
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg'),line=document.createElementNS(ns,'line');
  svg.setAttribute('viewBox','0 0 100 100');
  svg.setAttribute('preserveAspectRatio','none');
  svg.setAttribute('aria-hidden','true');
  svg.classList.add('matrix-off-line');
  const attributes={x1:'0',y1:'100',x2:'100',y2:'0',stroke:'currentColor','stroke-width':'1','vector-effect':'non-scaling-stroke'};
  for(const [key,value] of Object.entries(attributes))line.setAttribute(key,value);
  svg.appendChild(line);parent.appendChild(svg);
 }
 /** アプリとPDFが同じ表を使う表示部品。全てtextContentで入れ、共有欄以外を渡さない。
  * 削除影響: 社員×日付の表示だけ停止。CSVの列/通信/正本シート/打刻は不変。
  * 魔改造: 列幅/週線/印刷サイズはschedule.css。表の順序変更は両半月/スクリーンリーダー試験も確認。 */
 function renderMatrix(container,model,ownCode=''){
  container.replaceChildren();const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;parent?.appendChild(n);return n;};
  for(const block of model.blocks){
   const wrap=el('div',undefined,container);wrap.className='schedule-matrix-scroll';wrap.setAttribute('tabindex','0');wrap.setAttribute('aria-label',block.title+'のシフト表。横にスクロールできます');
   const table=el('table',undefined,wrap);table.className='schedule-matrix';el('caption',block.title,table);
   const head=el('thead',undefined,table),dates=el('tr',undefined,head),weekdays=el('tr',undefined,head),eventRow=el('tr',undefined,head);
   const name=el('th','氏名',dates);name.setAttribute('rowspan','3');name.setAttribute('scope','col');name.className='matrix-person';
   const count=el('th','勤務\n日数',dates);count.setAttribute('rowspan','3');count.setAttribute('scope','col');count.className='matrix-count';
   for(const d of block.days){for(const [row,label] of [[dates,String(d.number)],[weekdays,'日月火水木金土'[d.weekday]],[eventRow,d.event]]){const th=el('th',label,row);th.dataset.weekday=String(d.weekday);if(d.holiday){th.dataset.holiday='true';th.title=d.holiday;}th.setAttribute('scope','col');if(row===dates)th.dataset.day=d.day;if(row===eventRow)th.className='matrix-event';}}
   const body=el('tbody',undefined,table);
   for(const person of block.employees){const tr=el('tr',undefined,body);if(person.employeeCode===ownCode)tr.className='matrix-own';
    const label=el('th',undefined,tr);label.className='matrix-person';label.setAttribute('scope','row');el('strong',person.employeeName,label);el('small',person.employeeCode+(person.employeeCode===ownCode?' / 自分':''),label);
    el('td',String(person.workDays),tr).className='matrix-count';
    person.cells.forEach((cell,i)=>{const td=el('td',undefined,tr);td.dataset.weekday=String(block.days[i].weekday);td.dataset.state=cell.state;
      // 斜線は表示記号だけ。公休の文字は読み上げ用に残し、備考/保存区分を消さない。
      if(cell.state==='off')appendOffLine(td);
      el('span',cell.text,td).className=cell.state==='off'?'matrix-off-label':'matrix-time';if(cell.rest)el('small',cell.rest,td).className='matrix-rest';if(cell.note)el('small',cell.note,td).className='matrix-public-note';
    });
   }
   if(!block.employees.length){const td=el('td',block.unpublished?'この期間は未公開です。':'この期間に表示できる確定従業員情報はありません。予定未設定です。',el('tr',undefined,body));td.setAttribute('colspan',String(block.days.length+2));}
  }
 }
 /** PDFと同じ共有matrixからPNGを描く。DOMの画面撮影ではなく標準Canvasだけで完結。
  * 入力: build済み共有帳票。非公開DTO/DOM全体を渡さない。通信/外部描画ライブラリなし。
  * 改造: 幅・文字・色はここ。行高は折返し後の最大値で決め、備考を切り捨てない。
  * 制限: 端末のメモリを守る面積上限。超過時は縮小で読めなくせずPDFへ案内する。
  * 削除影響: PNGだけ停止。PDF/CSV/原簿/保存の処理は独立して残る。 */
 function drawPng(canvas,r){
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('PNG_UNAVAILABLE');
  const width=1200,pad=20,person=144,count=36,font='"IBM Plex Sans JP", sans-serif';
  // 1枚を作る間だけ、同じ文字/幅/サイズの折返しを再利用する。
  // 9–18・休60分などを人数×日数ぶん測り直さない。別の出力や本人へ持ち越さない。
  const wrapCache=new Map();
  function lines(value,w,size){
   const label=String(value),key=JSON.stringify([label,w,size]);
   if(wrapCache.has(key))return wrapCache.get(key);
   ctx.font=size+'px '+font;
   const out=[];
   for(const part of label.split('\n')){
    let line='';
    for(const character of part){
     if(line&&ctx.measureText(line+character).width>w){out.push(line);line='';}
     line+=character;
    }
    out.push(line);
   }
   wrapCache.set(key,out);
   return out;
  }
  const text=(value,size,bold=false,color='#252829')=>({value:String(value),size,bold,color});
  function row(cells,widths,backgrounds){
   const prepared=cells.map((parts,i)=>parts.map(p=>({...p,lines:lines(p.value,widths[i]-10,p.size)})));
   const height=Math.max(25,...prepared.map(parts=>parts.reduce((h,p)=>h+p.lines.length*(p.size+3),0)+10));
   return{prepared,widths,backgrounds,height};
  }
  const sections=r.matrix.blocks.map(b=>{
   const dayWidth=(width-pad*2-person-count)/b.days.length,widths=[person,count,...b.days.map(()=>dayWidth)],holiday=d=>d.holiday||d.weekday===0?'#8E3F35':d.weekday===6?'#285E94':'#252829';
   const headers=row([[text('氏名',12,true)],[text('勤務\n日数',10,true)],...b.days.map(d=>[text(d.number,13,true,holiday(d)),text('日月火水木金土'[d.weekday],11,false,holiday(d))])],widths,widths.map((_,i)=>i<2?'#F3EFE7':'#E5EBE9'));
   // アプリの見出し/イベント/勤務/公休/未設定色をschedule.cssと揃える。個人の強調色は共有帳票へ持ち込まない。
   const eventRow=row([[text('',9)],[text('',9)],...b.days.map(d=>[text(d.event,9,false,holiday(d))])],widths,widths.map((_,i)=>i<2?'#F3EFE7':'#FFF7DF'));
   const rows=b.employees.map(p=>Object.assign(row([[text(p.employeeName,12,true),text(p.employeeCode,9)],[text(p.workDays,11)],...p.cells.map(c=>[text(c.state==='off'?'':c.text,12,true),...(c.rest?[text(c.rest,9)]:[]),...(c.note?[text(c.note,9)]:[])])],widths,widths.map((_,i)=>i<2?'#F3EFE7':p.cells[i-2].state==='off'?'#EFF1EF':['unset','unpublished'].includes(p.cells[i-2].state)?'#F3EFE7':'#FFFDFA')),{offColumns:p.cells.map(c=>c.state==='off')}));
   if(!rows.length)rows.push(row([[text(b.unpublished?'この期間は未公開です。':'表示できる確定従業員情報はありません。',12)]],[width-pad*2],['#FFFFFF']));
   return{title:b.title,headers,eventRow,rows,height:32+headers.height+eventRow.height+rows.reduce((h,r)=>h+r.height,0)+24};
  });
  const meta=lines('対象期間：'+r.rangeStart+'〜'+r.rangeEnd+'／最終更新：'+stamp(r.publishedAt)+'（日本時間）',width-pad*2,12);
  const height=100+meta.length*16+sections.reduce((h,s)=>h+s.height,0)+40,scale=2;
  if(height*scale>16000||width*height*scale*scale>32000000)throw Error('PNG_TOO_LARGE');
  canvas.width=width*scale;canvas.height=height*scale;ctx.scale(scale,scale);ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,width,height);ctx.textBaseline='top';
  function put(p,x,y){ctx.fillStyle=p.color;ctx.font=(p.bold?'600 ':'')+p.size+'px '+font;ctx.fillText(p.value,x,y);}
  put(text('TLH Work Time｜確定シフト '+r.month,22,true),pad,18);let y=52;
  for(const line of meta){put(text(line,12),pad,y);y+=16;}
  put(text('勤務予定（日本時間）。斜線は公休。休は予定休憩。勤務日数は各表内の予定日数。実際の打刻とは別です。',11),pad,y+4);y+=36;
  function paint(row){let x=pad;row.prepared.forEach((parts,i)=>{ctx.fillStyle=row.backgrounds[i];ctx.fillRect(x,y,row.widths[i],row.height);ctx.strokeStyle='#7C908E';ctx.lineWidth=.7;ctx.strokeRect(x,y,row.widths[i],row.height);if(row.offColumns?.[i-2]){ctx.beginPath();ctx.moveTo(x,y+row.height);ctx.lineTo(x+row.widths[i],y);ctx.strokeStyle='#495C63';ctx.lineWidth=1;ctx.stroke();}let ty=y+5;for(const p of parts)for(const line of p.lines){if(row.offColumns?.[i-2]&&line){ctx.fillStyle=row.backgrounds[i];ctx.fillRect(x+3,ty-1,row.widths[i]-6,p.size+4);}put({...p,value:line},x+5,ty);ty+=p.size+3;}x+=row.widths[i];});y+=row.height;}
  for(const section of sections){put(text(section.title,14,true),pad,y);y+=32;paint(section.headers);paint(section.eventRow);section.rows.forEach(paint);y+=24;}
  return canvas;
 }
 // CSVは引用符だけでは数式実行を防げない。氏名/公開メモにも式の開始文字が入り得る。
 function cell(v){let s=String(v);if(/^[\s\uFEFF]*[=+\-@]/u.test(s))s="'"+s;return'"'+s.replaceAll('"','""')+'"';}
 function csv(r){return'\uFEFF'+[['対象月','対象期間','確定シフト最終更新（日本時間）',...headers],...r.rows.map(row=>[r.month,r.rangeStart+'〜'+r.rangeEnd,stamp(r.publishedAt),...row])].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';}
 function init(){
  // build（純粋な列変換）とinit（ブラウザの保存/印刷）を分離し、Googleやプリンターなしで計算を検査する。
  // URLはCSVの一時メモリ参照。clear時に解放し、再読取/退場後に旧社員情報を持ち越さない。
  const n=Object.fromEntries(['print','csv','png','report','report-title','report-meta','report-rows','export-status'].map(k=>[k,document.getElementById('schedule-'+k)]));let report=null,url=null,stopped=false,enabled=false,tableReady=false,pngBusy=false,pngGeneration=0,pngUrl=null;
  // 通常閲覧では数千行の印刷DOMを作らない。データモデルと印刷時の表を分離する。
  function clearTable(){tableReady=false;n.report.hidden=true;n['report-rows'].replaceChildren();}
  function setEnabled(yes){enabled=yes===true&&!stopped&&!!report;n.print.disabled=!enabled;n.csv.disabled=!enabled;if(n.png)n.png.disabled=!enabled||pngBusy;if(!enabled)clearTable();}
  function clear(){pngGeneration++;pngBusy=false;if(pngUrl){URL.revokeObjectURL(pngUrl);pngUrl=null;}report=null;setEnabled(false);clearTable();n['report-title'].textContent='';n['report-meta'].textContent='';if(url){URL.revokeObjectURL(url);url=null;}n['export-status'].textContent='確定シフトの取得後に出力できます。';}
  function setShared(s){clear();if(stopped||s.phase!=='PUBLISHED'||!s.publishedAt)return;report=build(s);n['report-title'].textContent='TLH Work Time｜確定シフト '+report.month+' '+({FIRST:'前半',SECOND:'後半',MONTH:'月全体'}[report.period]);n['report-meta'].textContent='対象期間：'+report.rangeStart+'〜'+report.rangeEnd+'／最終更新：'+stamp(report.publishedAt)+'（日本時間）／勤務予定。実際の出退勤記録ではありません。';
   setEnabled(true);n['export-status'].textContent='確定公開済みの共有情報だけを出力します。PDF・PNG・CSVを保存してLINEやメールへ添付できます。';
  }
  function preparePrint(){
   if(!enabled||tableReady)return;
   renderMatrix(n['report-rows'],report.matrix);
   tableReady=true;n.report.hidden=false;
  }
  // ボタンとブラウザの印刷メニューの両方に対応。二重beforeprintでも表を増殖させない。
  global.addEventListener('beforeprint',preparePrint);
  global.addEventListener('afterprint',clearTable);
  n.print.addEventListener('click',()=>{if(!enabled)return;try{if(typeof global.print!=='function')throw Error('PRINT_UNAVAILABLE');preparePrint();global.print();}catch(_e){clearTable();n['export-status'].textContent='印刷を開けません。CSV保存、または印刷できるブラウザで開き直してPDF保存してください。';}});
  n.csv.addEventListener('click',()=>{if(!enabled)return;try{if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(new Blob([csv(report)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='shift_'+report.month+(report.period==='MONTH'?'':'_'+report.period)+'.csv';document.body.appendChild(a);a.click();a.remove();n['export-status'].textContent='CSVの保存を開始しました。保存先と内容を確認してください。';}catch(_e){n['export-status'].textContent='CSVを保存できません。印刷・PDF保存を試してください。';}});
  // font待ち/画像変換中に再読取や退場があれば古い帳票を保存しない。連打は画像1枚にまとめる。
  if(n.png)n.png.addEventListener('click',async()=>{
   if(!enabled||pngBusy)return;const current=report,generation=pngGeneration;pngBusy=true;setEnabled(true);n['export-status'].textContent='PNG画像を作成しています…';let canvas;
   try{
    if(document.fonts?.ready)await document.fonts.ready;
    if(!enabled||generation!==pngGeneration||report!==current)return;
    canvas=drawPng(document.createElement('canvas'),current);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG_UNAVAILABLE')),'image/png'));
    if(!enabled||generation!==pngGeneration||report!==current)return;
    if(pngUrl)URL.revokeObjectURL(pngUrl);pngUrl=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=pngUrl;a.download='shift_'+current.month+(current.period==='MONTH'?'':'_'+current.period)+'.png';document.body.appendChild(a);a.click();a.remove();
    n['export-status'].textContent='PNGの保存を開始しました。保存できない場合は「画像を開く」から長押しで保存してください。';
    const open=document.createElement('a');open.href=pngUrl;open.target='_blank';open.rel='noopener';open.textContent='画像を開く';open.className='button';n['export-status'].appendChild(open);
   }catch(e){if(generation===pngGeneration&&report===current)n['export-status'].textContent=e.message==='PNG_TOO_LARGE'?'画像が大きすぎます。印刷・PDF保存を使ってください。':'PNGを保存できません。ChromeやSafariで開き直すか、印刷・PDF保存を使ってください。';}
   finally{if(canvas){canvas.width=0;canvas.height=0;}if(generation===pngGeneration){pngBusy=false;setEnabled(enabled);}}
  });
  global.addEventListener('pagehide',()=>{stopped=true;clear();});clear();return Object.freeze({clear,setShared,setEnabled});
 }
 global.TlhScheduleReport=Object.freeze({init,build,csv,renderMatrix,drawPng});
})(window);
