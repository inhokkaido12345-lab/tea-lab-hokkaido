/** 通知の見分け方と次の操作だけを補う共通表示。通信/認可/再送/保存を実行しない。
 * 呼出元: app.cssを使うWork Timeの各HTML。先: role=statusと状態文の表示。
 * 概念: progressive enhancement。既存の原文は残し、色だけでなく記号/見出しを付ける。
 * 魔改造: guidesへ原文の意味に対応する案内を追加。成功文をエラーへ言換えない。
 * 削除影響: 補足と褐色表示だけ消える。保存後照合/重複防止/ログインは各controllerが維持。
 * 秘密: 原文/氏名/時刻は外部送信・console・Storageへ保存しない。Observerは表示変化だけを見る。
 * 検証: status-guidance.test.mjs。data属性は認可・結果判定に使わない。
 */
(function(global){'use strict';
 const guides=[
  [/保存結果.*(でき|不明)|応答を確認できません|結果が不明|同じ操作で.*(確認|再)/, '送信ボタンを押し直さず、「同じ操作で再確認」を使って保存済みか確認してください。画面を閉じず、確認できなければ管理者へ連絡してください。'],
  [/招待.*(期限|無効|一致しません)|コード.*(期限|無効|一致しません)/, '招待を発行した管理者に有効なコードを確認してください。コードや認証情報をチャットや公開画面へ送らないでください。'],
  [/有効な従業員.*ありません|従業員.*未登録|従業員の登録状態を確認/, '店舗管理者へ従業員登録と、このLINEアカウントとの紐付け状態の確認を依頼してください。'],
  [/社員番号.*(重複|使用|一致しません)|氏名.*一致しません/, '管理者画面の従業員一覧で社員番号と氏名を確認してください。氏名で検索する場合は空白の種類も含めて登録内容に合わせてください。'],
  [/他の処理|他の操作.*処理中|通信.*混み合/, '別の操作が終わるまで待ち、最新状態を読み直してください。保存結果が不明な操作は同じ操作で確認してください。'],
  [/ログインし直|LINEログインが必要|認証.*期限/, '表示された「LINEログイン」からログインし直し、元の画面へ戻ってください。'],
  [/権限.*(確認でき|ありません)|管理者.*確認でき/, '利用するLINEアカウントと店舗を確認してください。正しい場合は、店舗管理者に権限の確認を依頼してください。'],
  [/シート.*編集され|内容が変わ|状態が変わ/, '他の編集が終わってから最新状態を読み込み、差分を確認し直してください。古い確認内容のまま送信しないでください。'],
  [/入力シート.*修正が必要/, '「入力シートを開く」から表示されたセルを修正してください。入力値の修正後に公開の確認をやり直します。'],
  [/入力シートの形式|店舗識別|接続設定|保存先の構成|整合性確認/, 'シートの固定見出し・店舗識別欄・内部IDは変更せず、設定担当者へこの表示を伝えてください。'],
  [/該当月の入力シートを作成/, '管理する月を確認し、「該当月の入力シートを作成」を実行してください。既存月の入力は保持されます。'],
  [/入力内容を確認|日付・時刻|月を確認|開始日・終了日|変更理由を入力/, 'この画面の説明に沿って、日付・時刻・必須項目を確認してください。入力値を直してから、もう一度内容を確認してください。'],
  [/打刻受付.*停止|受付は停止/, '現在は打刻を保存できません。店舗管理者へ受付状態の確認を依頼してください。'],
  [/未処理の申請|承認.*必要|同意.*必要/, '申請・承認待ちの一覧を開き、対象の状態を確認してください。同じ申請を重ねて送らないでください。'],
  [/取得できません|取得できず|取得できな|通信を開始できません|読み込めません/, '通信状況を確認し、「再読み込み／更新」から読み直してください。保存結果が不明な操作がある場合は、先に同じ操作で結果を確認してください。'],
  [/休暇と勤務|勤務対象から外せ|勤務算入/, '入力シートで勤務・休暇・用事の算入区分を確認し、矛盾を直してから公開を確認し直してください。'],
  [/上限|容量.*達し/, '範囲を分けて取得できる画面では対象期間を短くしてください。保存先の容量の場合は、記録を削除せず設定担当者へ連絡してください。']
 ];
 function guidance(text){return guides.find(([pattern])=>pattern.test(text))?.[1]||'';}
 function init(document){
  const notes=new WeakMap();let queued=false;
  function scan(){queued=false;for(const node of document.querySelectorAll('[role="status"], [id$="-status"]')){
   const text=node.textContent.trim(),help=node.getAttribute('aria-busy')==='true'?'':guidance(text);
   node.classList.toggle('status-needs-action',!!help);let note=notes.get(node);
   if(help){if(!note){note=document.createElement('p');note.className='status-resolution';node.after(note);notes.set(node,note);}if(note.textContent!==help)note.textContent=help;note.hidden=false;}else if(note)note.hidden=true;
  }}
  const observer=new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(scan);}});
  // class/hiddenなど自分の装飾変更は監視しない。無限再描画/追加通信を避ける。
  observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-busy']});scan();
 }
 global.TlhStatusGuidance=Object.freeze({guidance,init});
 if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init(document),{once:true});else init(document);}
})(window);
