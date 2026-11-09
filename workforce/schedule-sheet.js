/**
 * 入力専用Sheetと既存batchPlanの間の純粋なCSV変換。Google権限・通信・台帳直書きは持たない。
 * 責務: 店舗/月/日付/社員コードの照合→全件検査→変更案。空欄は削除でなく読み飛ばす。
 * 削除影響: CSVの出入のみ停止し、月型の手入力・打刻・半月公開は残る。
 * 一般化: staging file → validate → diff → explicit commit。ファイルを認可の根拠にしない。
 * 魔改造: V1は勤務1行、V2は勤務/公開備考/非公開備考の3行。旧版も読み、versionと試験を同期。
 * 備考の空欄は保持、「【空にする】」だけ削除。変更前後は管理者専用DOMへtextContentで表示する。
 * 初歩: Mapは社員コードから現在の候補を探す索引。CSVの行番号や氏名を保存キーにしない。
 * 保存時の認可/期待版/固定ID/読戻しは既存GASが担当。個人情報はページ内だけで扱う。
 */
(function(global){'use strict';
 const VERSION='TLH_SHIFT_INPUT_V2',MAX_BYTES=2000000;
 const PUBLIC='【公開備考】',PRIVATE='【非公開備考】',CLEAR='【空にする】';
 function csv(rows){return '\ufeff'+rows.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');}
 /** RFC4180の引用符/セル内改行を処理。Shift-JIS推測・壊れた引用符・巨大な表の黙認はしない。 */
 function read(text){
  if(typeof text!=='string'||text.length>MAX_BYTES||text.includes('\ufffd')||text.includes('\0'))throw Error('UTF-8のCSV（2MB以内）を選んでください。');
  text=text.replace(/^\ufeff/,'');const rows=[];let row=[],cell='',quoted=false,closed=false;
  function field(){if(cell.length>2000)throw Error('セルの入力が長すぎます。');row.push(cell);cell='';closed=false;if(row.length>40)throw Error('CSVの列数が多すぎます。');}
  function line(){field();rows.push(row);row=[];if(rows.length>3003)throw Error('CSVの行数が多すぎます。');}
  for(let i=0;i<text.length;i++){
   const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
   else if(c==='"'){if(cell||closed)throw Error('CSVの引用符を確認してください。');quoted=true;}
   else if(c===',')field();else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;line();}
   else{if(closed)throw Error('CSVの引用符の後に文字があります。');cell+=c;}
   if(cell.length>2000)throw Error('セルの入力が長すぎます。');
  }
  if(quoted)throw Error('CSVの引用符が閉じていません。');if(cell||row.length||closed)line();
  while(rows.length&&rows[rows.length-1].every(v=>!v.trim()))rows.pop();return rows;
 }
 const weekdays=days=>days.map(day=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',weekday:'short'}).format(new Date(day+'T00:00:00+09:00')));
 /** 未入力の表を出力。既存予定や非公開メモを外部ファイルへ自動で複製しない。 */
 function template(snapshot,scope){
  const days=global.TlhScheduleBulkModel.days(snapshot.month);
  // 表計算で式になる識別子/氏名は書き出さない。公開台帳の値でもCSV式として実行しない。
  const literal=value=>{if(/^[\s]*[=+@-]/.test(value))throw Error('表計算用の社員番号・氏名を確認してください。');return value;};
  return csv([[VERSION,snapshot.month,scope.organizationId,scope.workplaceId],['社員番号','氏名',...days],['曜日','',...weekdays(days)],...snapshot.halves.FIRST.employees.flatMap(p=>[
   [literal(p.employeeCode),literal(p.employeeName),...days.map(()=>'')],
   [literal(p.employeeCode),PUBLIC,...days.map(()=>'')],
   [literal(p.employeeCode),PRIVATE,...days.map(()=>'')]
  ])]);
 }
 function preview(text,snapshot,scope,options={}){
  // 正本切替用の純粋な差分計算。既存画面は指定しないので旧取込み規則を維持する。
  // 有効化にはGAS側の固定モード・正本の再読取・旧書込経路拒否・既存値の移行が別途必須。
  if(Object.keys(options).some(k=>k!=='mode')||options.mode!==undefined&&options.mode!=='authoritative')throw Error('取込み方式を確認してください。');
  const authoritative=options.mode==='authoritative';
  const model=global.TlhScheduleBulkModel,rows=read(text),days=model.days(snapshot.month),width=days.length+2;
  const exact=(row,expected)=>row&&expected.every((v,i)=>row[i]===v)&&row.slice(expected.length).every(v=>!v.trim());
  const version=rows[0]?.[0],withNotes=version===VERSION;
  if(authoritative&&!withNotes)throw Error('正本取込みには勤務・公開備考・非公開備考の3行形式が必要です。');
  if(![VERSION,'TLH_SHIFT_INPUT_V1'].includes(version)||!exact(rows[0],[version,snapshot.month,scope.organizationId,scope.workplaceId]))throw Error('CSVの形式・対象月・会社・店舗が一致しません。この店舗のひな形を使ってください。');
  if(!exact(rows[1],['社員番号','氏名',...days])||!exact(rows[2],['曜日','',...weekdays(days)]))throw Error('日付・曜日の見出しを変更せず、対象月のひな形を使ってください。');
  const people=new Map(snapshot.halves.FIRST.employees.map(p=>[p.employeeCode,p])),seen=new Set(),changes=[];let blanks=0,unchanged=0;
  // V2は勤務/公開/非公開の3行を一組で検査。旧V1は1行のまま互換読取し、備考は保持する。
  // ラベル違いを通常勤務へ推測しない。公開と非公開の取り違えは全件停止する。
  for(let r=3;r<rows.length;r+=withNotes?3:1){
   const row=rows[r];if(row.every(v=>!v.trim())){
    if(withNotes&&rows.slice(r+1,r+3).some(line=>line.some(v=>v.trim())))throw Error((r+1)+'行目：備考だけの行にも勤務行の社員番号・氏名が必要です。');
    continue;
   }
   const code=row[0],person=people.get(code);
   if(!person||seen.has(code))throw Error((r+1)+'行目：社員番号が未登録・停止済み・重複しています。最新ひな形を確認してください。');seen.add(code);
   const group=withNotes?rows.slice(r,r+3):[row];
   if(withNotes&&(group.length!==3||group[1][0]!==code||group[1][1]!==PUBLIC||group[2][0]!==code||group[2][1]!==PRIVATE))throw Error((r+1)+'行目：勤務・公開備考・非公開備考の3行を一組で保持してください。');
   if(group.some(line=>line.slice(width).some(v=>v.trim())))throw Error((r+1)+'行目：月末より右に入力があります。');
   // 氏名は目視補助のみ。照合は完全な社員コード。行の並べ替え/姓名の空白で別人にしない。
   for(let i=0;i<days.length;i++){
    const value=row[i+2]||'',day=days[i],base=model.oldPlan(snapshot,code,day)?.plan;
    const publicText=withNotes?(group[1][i+2]||''):'',privateText=withNotes?(group[2][i+2]||''):'';
    if(!value.trim()&&!publicText.trim()&&!privateText.trim()){blanks++;if(!authoritative)continue;}
    try{
     if(authoritative&&(base?.appointments?.length||base?.leave?.type!=='NONE'&&base?.leave?.unit&&base.leave.unit!=='DAY'||base?.leave?.note))throw Error('用事・時間休・休暇メモを正本シートへ移すまで切り替えられません。');
     const workChanged=value.trim()&&value.trim()!==model.format(base);
     if(workChanged&&base?.leave&&base.leave.type!=='NONE'&&base.leave.unit!=='DAY')throw Error('時間休・半日休がある日の変更は、既存の個別編集画面で確認してください。');
     const plan=authoritative?(value.trim()?model.parse(value):model.input()):workChanged?model.parse(value,base):model.input(base);
     for(const [field,text]of [['publicNote',publicText],['note',privateText]]){
      if(!text.trim()&&!authoritative)continue;
      if(text.length>1000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))throw Error('備考は1000文字以内で入力してください。');
      const note=authoritative?(text.trim()?text:''):text===CLEAR?'':text;if(field==='publicNote'&&!note)delete plan.publicNote;else plan[field]=note;
     }
     if(JSON.stringify(model.input(base))===JSON.stringify(model.input(plan))){unchanged++;continue;}
     const description=p=>(model.format(p)||'未入力')+'\n公開備考：'+(p?.publicNote||'（なし）')+'\n非公開備考：'+(p?.note||'（なし）');
     changes.push({employeeCode:code,employeeName:person.employeeName,day,before:description(base),after:description(plan),workText:model.format(plan),plan,published:snapshot.halves[model.half(day)].phase==='PUBLISHED'});
    }catch(e){throw Error((r+1)+'行目 / '+code+' / '+day+'：'+e.message);}
   }
  }
  if(authoritative&&seen.size!==people.size)throw Error('正本シートから従業員の行が欠けています。行を削除せず全員分を保持してください。');
  if(changes.length>500)throw Error('変更は1回500日分までです。空欄で読み飛ばす範囲を分けてください。');
  return {month:snapshot.month,changes,blanks,unchanged};
 }
 global.TlhScheduleSheet=Object.freeze({MAX_BYTES,read,csv,template,preview});
})(window);
