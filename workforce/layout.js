/**
 * 【現役UI2】責務: 5画面の表示と管理タブの操作可否。認証/実際の認可/通信/保存は別担当。
 * 構成: index.htmlのinit→tab click/矢印キー→新設data-workforce-pane wrapperのhidden。
 * 削除影響: 管理者側のpaneが開けなくなる。既存controllerの認可/保存やGASの実データは消えない。
 * 概念: presentation controller / separation of concerns / accessible tabs。
 * 初歩: paneは表示のまとまり。管理者tabを選んでも管理者権限は得られない。
 * 改造: tab/pane追加はinitのnamesとHTMLのaria-controls、layoutテスト、READMEを同期。
 * 境界: disabledを変えるのは管理ナビだけ。既存の保存ボタン/section/draft/秘密は変更しない。通信なし。
 * 検証: tests/layout.test.mjs→既存全UIテスト→Pages→LINEの画面切替と読取のみ。実打刻は試さない。
 */
(function(global) {
  'use strict';
  /**
   * 任意onActivate通知を受け取り、対応tab/paneへ表示イベントを登録し、従業員側を初期選択する。
   * @return {{setAdminAllowed:Function}} 署名検査担当から管理UI表示の可否だけを受け取る。
   * @throws {Error} 必須tab/pane欠落。HTMLを同時更新せずに配布してはならない。
   * tab移動は表示通知のみ。呼出元の初回読取と保存retryは分け、固定retry情報と受付閉鎖を維持する。
   */
  function init(options = {}) {
    // 情報設計: 実装ファイルの分類ではなく「利用者が今したいこと」で移動先を分ける。
    // 配列の順がキーボード移動の順。HTMLの見た目の並び/aria-controlsも同時に合わせる。
    const names = ['employee', 'records', 'schedule', 'manager', 'more'];
    let adminAllowed=false,active='employee';
    // 管理は縦に全件並べず業務別に表示。保持するのは選択名だけで、入力や保存結果は触らない。
    const categories=['employees','attendance','schedule'];let category='attendance';
    const choices=categories.map(name=>document.getElementById('manager-'+name+'-choice'));
    const groups={employees:['manager-registration-panel','manager-maintenance-panel'],attendance:['manager-attendance-panel'],schedule:['manager-schedule-panel']};
    // wrapperは起動時に取得する。切替のたびに同じIDを引き直さず、入力要素には触れない。
    const groupPanels=Object.fromEntries(Object.entries(groups).map(([name,ids])=>[
      name,ids.map(id=>document.getElementById(id)),
    ]));
    const statusHost=document.getElementById('staff-status-host');
    const scheduleManagement=document.getElementById('schedule-admin-entry');
    const tabs = names.map(name => document.getElementById(name + '-tab'));
    const panes = Array.from(document.querySelectorAll('[data-workforce-pane]'));
    if (choices.some(button=>!button)||!statusHost||!scheduleManagement||Object.values(groupPanels).flat().some(panel=>!panel)||tabs.some(tab => !tab) || names.some(name => !panes.some(pane => pane.dataset.workforcePane === name)) ||
        panes.some(pane => !names.includes(pane.dataset.workforcePane))) throw Error('WORKFORCE_LAYOUT_MISSING');
    // 表示と操作許可の分離: wrapperだけを隠す。中の入力/再送draft/確認結果はそのまま。
    // 選択中は色だけで示さず、aria-selectedとtabIndexも合わせて読み上げ/キー操作へ伝える。
    function show(){
      panes.forEach(pane=>{pane.hidden=pane.dataset.workforcePane!==active;});
      for(const [name,panels]of Object.entries(groupPanels)){
        for(const panel of panels){
          panel.hidden=active!=='manager'||!adminAllowed||name!==category;
        }
      }
      // 従業員シフトと管理シフトを分離。管理者本人でも従業員側には管理操作を出さない。
      scheduleManagement.hidden=active!=='manager'||category!=='schedule'||!adminAllowed;
      choices.forEach((button,i)=>button.setAttribute('aria-pressed',String(categories[i]===category)));
      // 招待受取と発行の共通結果欄は保持し、管理中は従業員カテゴリでだけ見せる。
      statusHost.hidden=active==='manager'&&category!=='employees';
    }
    function activate(name) {
      if(name==='manager'&&!adminAllowed)return;
      active=name;
      tabs.forEach((tab, index) => {
        const selected = names[index] === name;
        tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
      });
      show();
      options.onActivate?.(name, name==='manager'?category:null); // 読取開始は呼出元へ通知するだけ。保存/再送はlayoutの責務外。
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activate(names[index]));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const available=names.map((name,i)=>i).filter(i=>names[i]!=='manager'||adminAllowed);
        const position=available.indexOf(index),step=event.key==='ArrowRight'?1:-1;
        const next=event.key==='Home'?available[0]:event.key==='End'?available.at(-1):available[(position+step+available.length)%available.length];
        activate(names[next]);tabs[next].focus();
      });
    });
    choices.forEach((button,i)=>button.addEventListener('click',()=>{
      if(!adminAllowed||active!=='manager')return;
      category=categories[i];show();
      options.onActivate?.('manager',category); // 選択した業務のREADだけを通知。保存・再送・入力は触らない。
    }));
    activate('employee');
    /** UIの初期値は拒否。権限確認の失敗/退場は管理paneを閉じるが入力の保存や再送はしない。 */
    function setAdminAllowed(allowed){
      adminAllowed=allowed===true;const tab=tabs[names.indexOf('manager')];
      tab.disabled=!adminAllowed;tab.setAttribute('aria-disabled',String(!adminAllowed));
      tab.setAttribute('title',adminAllowed?'管理者用の操作':'管理者権限の確認後に利用できます');
      choices.forEach(button=>{button.disabled=!adminAllowed;});
      if(!adminAllowed&&active==='manager')activate('employee');
      else show();
    }
    setAdminAllowed(false);
    return Object.freeze({setAdminAllowed,open(name,selectedCategory){if(name==='manager'&&adminAllowed&&categories.includes(selectedCategory))category=selectedCategory;if(names.includes(name))activate(name);}});
  }
  global.TlhWorkforceLayout = Object.freeze({ init });
})(window);
