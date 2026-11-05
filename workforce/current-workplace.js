/**
 * 現役・今の店舗の目印と全業務POSTの店舗識別。HTML→この表示/送信helper→既存controller→GAS固定境界。
 * 削除影響：店舗名と明示scopeがなくなる。本人認可/保存先の固定はGASで継続し、履歴を消さない。
 * 一般化：deployment configuration / resource context。表示用店舗名と、変更しない店舗IDを分ける。
 * 魔改造：表示名はconfig、配置はdata-current-workplace/app.css。ID変更は移転ではなく別の移行設計が必要。
 * 境界：名簿/LINE/token/保存先IDは設定に入れない。店舗名は権限の代用ではなくGASで毎回一致検査する。
 * 検証：current-workplace.test.mjs・固定UI連結・全回帰。通信/タイマー/Storageを追加しない。
 * この版は1店舗専用。店舗を切り替えるUIや他社の権限継承は実装しない。
 */
(function(global){'use strict';
  // 公開してよい店舗情報のみ。実台帳ID・個人情報・秘密はサーバー設定へ。
  const config=Object.freeze({organizationId:'org_allrentacar',workplaceId:'wp_thetea_cocono_susukino',
    organizationName:'オールレンタカー株式会社',workplaceName:'The TEA ココノススキノ店',
    endpoint:'https://script.google.com/macros/s/AKfycbz12iRGRd1FSnmYLmfYR7ZhxNvt37LM7dXjKIqnVIaJ_Bw0B6N_YZIYIVxabp92E7PG7w/exec'});
  let stopped=false;
  /** URLの店舗指定は選択の意図だけ。未知/片方だけ/重複を既定店舗へすり替えない。 */
  function locationMatches(){
    const url=new URL(global.location.href),keys=['organizationId','workplaceId'];
    if(!keys.some(k=>url.searchParams.has(k)))return true;
    return keys.every(k=>url.searchParams.getAll(k).length===1&&url.searchParams.get(k)===config[k]);
  }
  function paint(){
    for(const banner of document.querySelectorAll('[data-current-workplace]')){
      banner.replaceChildren();
      const name=document.createElement('strong'),company=document.createElement('span');
      name.textContent=config.workplaceName;company.textContent=config.organizationName;
      banner.appendChild(name);banner.appendChild(company);
      if(!locationMatches()){
        const warning=document.createElement('p');warning.textContent='URLの店舗情報が一致しません。この店舗の正しい入口から開き直してください。';banner.appendChild(warning);banner.setAttribute('role','alert');
      }
    }
  }
  /**
   * @param {HTMLFormElement} form 既存controllerが用意した固定GAS向けPOST。
   * @throws {Error} 退場後/別店舗URL/別送信先/重複scope。送信せず既存controllerの失敗処理へ渡す。
   * token・nonce・操作ID・入力は変えない。結果不明でも自動再送せず、旧署名の検査は各controllerで維持。
   */
  function submit(form){
    // hidden input name="action"はform.actionをDOM要素として上書きする（named access）。
    // 送信先/方式は属性から読む。業務actionの値とURLを比較して送信を止めない。
    if(stopped||global!==global.top||!locationMatches()||String(form.getAttribute('method')).toUpperCase()!=='POST'||form.getAttribute('action')!==config.endpoint)throw Error('CURRENT_WORKPLACE_REQUEST_INVALID');
    if(Array.from(form.children).some(el=>['organizationId','workplaceId'].includes(el.name)))throw Error('CURRENT_WORKPLACE_SCOPE_DUPLICATE');
    for(const key of ['organizationId','workplaceId']){
      const input=document.createElement('input');input.type='hidden';input.name=key;input.value=config[key];form.appendChild(input);
    }
    form.submit();
  }
  global.addEventListener('pagehide',()=>{stopped=true;});
  global.TlhCurrentWorkplace=Object.freeze({config,submit,locationMatches});paint();
})(window);
