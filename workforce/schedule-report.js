/**
 * 確定シフト専用の印刷/PDF・CSV。schedule.jsの署名/DTO検査後→共有欄だけの表→明示出力。
 * 削除影響: シフトの出力だけ停止。予定/打刻/公開版は保存先に残る。
 * 概念: allowlist projection / presentation model。管理者の下書きや本人の秘密を渡さない。
 * 魔改造: 列はheaders/buildとHTMLのthead/print CSS、連結テストを同時更新する。
 * 境界: 通信/自動送信/外部PDFサービス/Storageなし。取得済みの共有版を出力する。
 * 検証: 実DTO→出力、非公開欄の除外、未公開/再読取/退場で無効、数式CSVの無害化。
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
  const plansByDay=global.TlhScheduleView.groupByDay(s.plans);
  const eventsByDay=global.TlhScheduleView.groupByDay(s.events);
  for(let i=first;i<=count;i++){
   const day=s.month+'-'+String(i).padStart(2,'0');
   const label=day+'（'+'日月火水木金土'[new Date(day+'T00:00:00Z').getUTCDay()]+'）';
   const event=(eventsByDay.get(day)||[])
    .map(e=>e.title+(e.note?'：'+e.note:''))
    .join('\n');
   const plans=(plansByDay.get(day)||[]).slice().sort((a,b)=>a.employeeCode.localeCompare(b.employeeCode));
   if(!plans.length)rows.push([label,'','','予定未設定','','','','',event]);
   // headersと同じ9列。共有DTOの許可項目だけを列挙し、private planは参照しない。
   for(const p of plans){
    rows.push([
     label,
     p.employeeCode,
     p.employeeName,
     global.TlhScheduleView.workText(p.workIntervals,day,'\n')||'勤務区間なし',
     String(p.periods.reduce((sum,q)=>sum+q.breakMinutes,0)),
     String(p.plannedMinutes),
     {NONE:'',PUBLIC_OFF:'公休',LEAVE:'休暇'}[p.leaveType],
     p.publicNote||'',
     event,
    ]);
   }
  }
  return{month:s.month,period:s.period||'MONTH',rangeStart:range.start,rangeEnd:range.end,publishedAt:s.publishedAt,rows};
 }
 // CSVは引用符だけでは数式実行を防げない。氏名/公開メモにも式の開始文字が入り得る。
 function cell(v){let s=String(v);if(/^[\s\uFEFF]*[=+\-@]/u.test(s))s="'"+s;return'"'+s.replaceAll('"','""')+'"';}
 function csv(r){const scope=r.workplace,prefix=scope?[scope.organizationName,scope.workplaceName]:[];return'\uFEFF'+[[...(scope?['会社','店舗']:[]),'対象月','対象期間','確定シフト最終更新（日本時間）',...headers],...r.rows.map(row=>[...prefix,r.month,r.rangeStart+'〜'+r.rangeEnd,stamp(r.publishedAt),...row])].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';}
 function init(){
  // build（純粋な列変換）とinit（ブラウザの保存/印刷）を分離し、Googleやプリンターなしで計算を検査する。
  // URLはCSVの一時メモリ参照。clear時に解放し、再読取/退場後に旧社員情報を持ち越さない。
  const n=Object.fromEntries(['print','csv','report','report-title','report-meta','report-rows','export-status'].map(k=>[k,document.getElementById('schedule-'+k)]));let report=null,url=null,stopped=false,enabled=false,tableReady=false;
  // 通常閲覧では数千行の印刷DOMを作らない。データモデルと印刷時の表を分離する。
  function clearTable(){tableReady=false;n.report.hidden=true;n['report-rows'].replaceChildren();}
  function setEnabled(yes){enabled=yes===true&&!stopped&&!!report;n.print.disabled=!enabled;n.csv.disabled=!enabled;if(!enabled)clearTable();}
  function clear(){report=null;setEnabled(false);clearTable();n['report-title'].textContent='';n['report-meta'].textContent='';if(url){URL.revokeObjectURL(url);url=null;}n['export-status'].textContent='確定シフトの取得後に出力できます。';}
  function setShared(s){clear();if(stopped||s.phase!=='PUBLISHED'||!s.publishedAt)return;report=build(s);report.workplace=global.TlhTenantSession?.displayScope()||null;n['report-title'].textContent=(report.workplace?report.workplace.organizationName+' ／ '+report.workplace.workplaceName+' ／ ':'')+'TLH 確定シフト '+report.month+' '+({FIRST:'前半',SECOND:'後半',MONTH:'月全体'}[report.period]);n['report-meta'].textContent='対象期間：'+report.rangeStart+'〜'+report.rangeEnd+'／最終更新：'+stamp(report.publishedAt)+'（日本時間）／勤務予定。実際の出退勤記録ではありません。';
   setEnabled(true);n['export-status'].textContent='確定公開済みの共有情報だけを出力します。PDF・CSVを保存してLINEやメールへ添付できます。';
  }
  function preparePrint(){
   if(!enabled||tableReady)return;
   for(const row of report.rows){
    const tr=document.createElement('tr');
    for(const value of row){const td=document.createElement('td');td.textContent=value;tr.appendChild(td);}
    n['report-rows'].appendChild(tr);
   }
   tableReady=true;n.report.hidden=false;
  }
  // ボタンとブラウザの印刷メニューの両方に対応。二重beforeprintでも表を増殖させない。
  global.addEventListener('beforeprint',preparePrint);
  global.addEventListener('afterprint',clearTable);
  n.print.addEventListener('click',()=>{if(!enabled)return;try{if(typeof global.print!=='function')throw Error('PRINT_UNAVAILABLE');preparePrint();global.print();}catch(_e){clearTable();n['export-status'].textContent='印刷を開けません。CSV保存、または印刷できるブラウザで開き直してPDF保存してください。';}});
  n.csv.addEventListener('click',()=>{if(!enabled)return;try{if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(new Blob([csv(report)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='shift_'+report.month+(report.period==='MONTH'?'':'_'+report.period)+'.csv';document.body.appendChild(a);a.click();a.remove();n['export-status'].textContent='CSVの保存を開始しました。保存先と内容を確認してください。';}catch(_e){n['export-status'].textContent='CSVを保存できません。印刷・PDF保存を試してください。';}});
  global.addEventListener('pagehide',()=>{stopped=true;clear();});clear();return Object.freeze({clear,setShared,setEnabled});
 }
 global.TlhScheduleReport=Object.freeze({init,build,csv});
})(window);
