(()=>{
'use strict';
let running=false;
const status=document.getElementById('status');
const login=document.getElementById('line-login');
document.getElementById('refresh').onclick=async()=>{
 if(running)return;running=true;
 try{
  status.textContent='ログイン結果を読み取りで確認しています…';
  const result=await window.TlhInventory.check();
  status.textContent=result.ok?(result.view?'LINEログインと在庫の読み取りを確認できました。保存はしていません。':'LINEログインは確認できました。この試験で表示する在庫はありません。'):result.code==='AUTH_REQUIRED'?'認証を確認できませんでした。LINEで再ログインしてください。':'在庫への接続を確認できませんでした。通常版は変更していません。';
 }catch{status.textContent='読み取りを確認できませんでした。';}
 finally{running=false;}
};
if(window.TlhInventoryLogin?.sameTabVersion!==1||window.TlhInventory?.sameTabVersion!==1){
 login.hidden=true;login.onclick=null;const notice=document.getElementById('inventory-auth-status')||status;
 notice.textContent='試験の準備ができていません。通常の在庫画面へ戻ってください。';
}
})();
