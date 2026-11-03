/**
 * 現役・本社提出用の社員別/暦月レポート。検証済みV3→区間別表→明示CSV保存/印刷。
 * 削除影響: 月次出力だけ停止。打刻原簿/訂正/給与データは変更しない。
 * 概念: immutable read snapshot / presentation export。氏名と番号もGASの同じ署名付き結果から取る。
 * 初歩: CSVは全セルを引用符で囲む。セル内の引用符は2つにし、数式として開かれ得る文字列を保護する。
 * 魔改造: buildの列順と見出し、print CSSを同期。丸め/法定残業/給与計算をここに足さない。
 * 境界: 印刷/ダウンロードだけ。HQへの送信、Storage/外部送信/認証情報出力はない。対象変更/失権/退場で破棄。
 * 検証: monthly-report.test.mjs→実GAS連結→全UI。未退勤/未打刻/夜勤/複数勤務/CSV数式対策を確認。
 */
(function(global){'use strict';
  const headers=['対象月','社員番号','氏名','勤務開始日','勤務区間','出勤日時（日本時間）','退勤日時（日本時間）','休憩開始・終了（日本時間）','休憩時間（時:分:秒.ミリ秒）','実働時間（時:分:秒.ミリ秒）','状態','取得日時（日本時間）'];
  /** タイムゾーンを日本時間に固定。元のUTC値/ミリ秒は書き換えない。 */
  function stamp(iso){return iso?new Date(Date.parse(iso)+9*3600000).toISOString().replace('T',' ').replace('Z',''):'';}
  function duration(ms){if(ms===null)return'未確定';return Math.floor(ms/3600000)+':'+String(Math.floor(ms/60000)%60).padStart(2,'0')+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0');}
  /**
   * @param {Object} value controllerが署名・対象を検証したV3 DTO。ここでも型と集計の整合を検査する。
   * @return {Object} 元データのコピー＋区間別の表示行/完了区間だけの合計。中抜けは足さない。
   * @throws {Error} REPORT_INVALID。不正を空の正常レポートに変えない。
   * 変更時は月全体の欠落日/未退勤/夜勤と、画面・CSVの両方を確認する。
   */
  function build(value){
    const r=global.TlhAttendanceJournal.parseReport(JSON.stringify(value),value?.month,value?.employeeCode);if(!r)throw Error('REPORT_INVALID');
    const rows=[];let workedMs=0,breakMs=0,completed=0,open=0;
    for(const day of r.days){
      if(!day.sessions.length){rows.push([day.day,'','','','','','','記録なし（休日判定なし）']);continue;}
      day.sessions.forEach((s,index)=>{const closed=!!s.clockOut;if(closed){workedMs+=s.workedMs;breakMs+=s.breakMs;completed++;}else open++;
        const breaks=s.breaks.map(b=>stamp(b.start)+' ～ '+(b.end?stamp(b.end):'未終了')).join('\n');
        rows.push([day.day,String(index+1),stamp(s.clockIn),stamp(s.clockOut),breaks,closed?duration(s.breakMs):'未確定',duration(s.workedMs),closed?'退勤済み':day.state==='BREAK'?'休憩中・未退勤':'勤務中・未退勤']);
      });
    }
    return{...r,rows,workedMs,breakMs,completed,open};
  }
  /** Excel等の数式開始文字は空白の後ろも検査。引用符だけでは数式実行を防げない。 */
  function cell(value){let text=String(value);if(/^[\s\uFEFF]*[=+\-@]/u.test(text))text="'"+text;return'"'+text.replaceAll('"','""')+'"';}
  /** buildの表示モデルをBOM付きCSV文字列へ。保存先/送信先を決めず、給与計算もしない。 */
  function csv(report){return'\uFEFF'+[headers,...report.rows.map(row=>[report.month,report.employeeCode,report.employeeName,...row,stamp(report.generatedAt)])].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';}
  /** initは無通信。setReportでのみ出力を開き、clearは既存ObjectURLと人物情報を破棄する。 */
  function init(){
    const n=Object.fromEntries(['csv','print','status','title','meta','summary','rows'].map(k=>[k,document.getElementById('report-'+k)])),section=document.getElementById('monthly-report');let report=null,url=null,stopped=false;
    function clear(){report=null;section.hidden=true;n.rows.replaceChildren();for(const key of ['title','meta','summary'])n[key].textContent='';n.csv.disabled=true;n.print.disabled=true;if(url){URL.revokeObjectURL(url);url=null;}n.status.textContent='記録の取得後に出力できます。';}
    function setReport(value){if(stopped)return;clear();report=build(value);n.title.textContent=report.month+' ／ '+report.employeeCode+'（'+report.employeeName+'）';n.meta.textContent='取得日時（日本時間）：'+stamp(report.generatedAt)+(report.employeeStatus==='INACTIVE'?' ／ 従業員の利用停止済み':'');
      n.summary.textContent='退勤済み '+report.completed+'区間 ／ 実働合計 '+duration(report.workedMs)+' ／ 休憩合計 '+duration(report.breakMs)+' ／ 未退勤 '+report.open+'区間（合計は退勤済み区間のみ）';
      for(const row of report.rows){const tr=document.createElement('tr');for(const value of row){const td=document.createElement('td');td.textContent=value;tr.appendChild(td);}n.rows.appendChild(tr);}section.hidden=false;n.csv.disabled=false;n.print.disabled=false;n.status.textContent=report.open?'未退勤の区間があります。未確定部分を確認してから提出してください。':'取得時点の記録を出力できます。内容を確認してから提出してください。';
    }
    n.csv.addEventListener('click',()=>{if(!report||stopped)return;try{if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(new Blob([csv(report)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='timecard_'+report.employeeCode+'_'+report.month+'.csv';document.body.appendChild(a);a.click();a.remove();n.status.textContent='CSVの保存を開始しました。保存先と内容を確認してください。';}catch(_e){n.status.textContent='CSVを保存できません。印刷・PDF保存か、もう一度CSV保存を選んでください。';}});
    n.print.addEventListener('click',()=>{if(!report||stopped)return;try{if(typeof global.print!=='function')throw Error('PRINT_UNAVAILABLE');global.print();}catch(_e){n.status.textContent='印刷画面を開けません。CSV保存、または印刷できるブラウザで開き直してください。';}});
    global.addEventListener('pagehide',()=>{stopped=true;clear();});clear();return Object.freeze({clear,setReport});
  }
  global.TlhMonthlyReport=Object.freeze({init,build,csv,stamp,duration});
})(window);
