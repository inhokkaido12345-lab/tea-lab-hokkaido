/** Explicit operation permissions. Legacy receive retains its historical union.
 * Narrow receiving cannot complete an order without an explicit order grant.
 * This checks operations only: current identity/store/scope checks remain mandatory. */
const inventoryOperationPermission = Object.freeze({
 READ:'inventory.read',RECEIVE:'inventory.receive-only',COUNT_STOCK:'inventory.stocktake',
 SAVE_ITEM:'inventory.catalog',SYNC_CATALOG:'inventory.catalog',SET_FORECAST:'inventory.forecast',
 OPEN_PACK:'inventory.consumption',FINISH_PACK:'inventory.consumption',NEXT_PACK:'inventory.consumption',
 START_SAMPLE:'inventory.consumption',FINISH_SAMPLE:'inventory.consumption',CANCEL_SAMPLE:'inventory.consumption',
 START_MEASUREMENT:'inventory.consumption',RECORD_MEASUREMENT:'inventory.consumption',UPDATE_MEASUREMENT:'inventory.consumption',CANCEL_MEASUREMENT:'inventory.consumption',
 LINK_RECEIPT_TO_ORDER:'inventory.order',MARK_ORDERED:'inventory.order',CANCEL_ORDERED:'inventory.order'
});
const inventoryKnownPermissions=Object.freeze([...new Set([...Object.values(inventoryOperationPermission),'inventory.receive','inventory.manage'])]);
function inventoryCanOperate(permissions,type,request={},access={}){
 if(!Array.isArray(permissions)||!Object.hasOwn(inventoryOperationPermission,type))return false;
 const needed=inventoryOperationPermission[type];
 if(access.accessModel==='COMMON_AFFILIATION_V1'&&access.receivingEnabled===true&&permissions.includes('inventory.read')&&['RECEIVE','LINK_RECEIPT_TO_ORDER'].includes(type))return true;
 if(type==='LINK_RECEIPT_TO_ORDER'&&!permissions.includes('inventory.read'))return false;
 const broad=permissions.includes('inventory.receive')&&!['inventory.read','inventory.order'].includes(needed);
 if(!broad&&!permissions.includes(needed))return false;
 if(!broad&&needed!=='inventory.order'&&needed!=='inventory.read'&&!permissions.includes('inventory.read'))return false;
 if(type==='RECEIVE'&&request.completeCaseId!=null&&request.completeCaseId!==''&&!broad&&!permissions.includes('inventory.order'))return false;
 return true;
}

function canOperate(type,request={}){return inventoryCanOperate(view?.permissions,type,request,{accessModel:'COMMON_AFFILIATION_V1',receivingEnabled:view?.receivingEnabled===true});}
/**
 * 連結画面：APIへ送信し、サーバーが保存後に検証した画面DTOを表示。旧APIだけ別READ。
 * 状態はサーバーが正本。DOMの数量を直接加算しない。
 * 概念：DTO/再送ID/通信結果不明。改造：行フォームはaddLine、描画はrender。
 * 入力やエラーにはtextContentを使う。認証は生成先のtransportが担当し、tokenを永続保存しない。
 * 削除すると連結画面の操作が停止。検証はHTTP試験とREADMEのブラウザ操作手順。
 */
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
let view=null,catalogSelection='new',catalogFilter='CURRENT',renderedStoreId=null,filter='all',pending=null,busy=false,activeTab='stock',historyDirty=true,catalogDirty=true;
// 作業切替は取得済みDTOとDOMだけを使う。切替の度に通信・保存しない。
let stockAction='overview',stockCategory='all',stockSearch='',catalogCategory='all',catalogSearch='';
/** 食品の種類を1品目1カテゴリで選ぶ共通語彙。保管温度・メーカーは別の軸。
 * 既存の自由入力値は書き換えず、既知の別名だけ表示時に対応付ける。
 * 新しい標準カテゴリを追加する時は、この配列と説明・検索テストを更新する。
 */
const productCategories=[
 '茶・コーヒー','乳・乳代替品','果実・果実加工品','野菜・きのこ','穀類・粉類','パン・麺類',
 'いも・でん粉','豆・ナッツ・種実','肉・肉加工品','魚介・水産加工品','卵・卵加工品','海藻',
 '糖類・甘味料','シロップ・ソース','調味料・だし','油脂','香辛料・ハーブ','カカオ・チョコレート',
 '製菓・デザート材料','酒類','飲料・水','加工食品・惣菜','食品添加物','包材・容器・消耗品','その他'
];
const categoryAliases={'乳製品':'乳・乳代替品','果実':'果実・果実加工品','糖類':'糖類・甘味料',
 'でん粉・澱粉加工品':'いも・でん粉','カカオ':'カカオ・チョコレート','提供消耗品':'包材・容器・消耗品',
 '調味料':'調味料・だし'};
const rawCategory=item=>(item.catalog?.category||'').trim();
const canonicalCategory=value=>Object.hasOwn(categoryAliases,value)?categoryAliases[value]:value;
const categoryOf=item=>canonicalCategory(rawCategory(item))||'未分類';
const searchText=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('ja-JP');
const matchesItem=(item,category,query)=>
 (category==='all'||categoryOf(item)===category)&&searchText([item.name,item.catalog?.alias,item.catalog?.productCode].join(' ')).includes(searchText(query).trim());
/** 一覧用の件数は表示対象だけから計算。0件の標準カテゴリも選べ、未分類を取り残さない。 */
function categoryOptions(select,items,selected){
 const counts=new Map();for(const item of items){const c=categoryOf(item);counts.set(c,(counts.get(c)||0)+1);}
 select.replaceChildren(new Option('すべてのカテゴリ（'+items.length+'件）','all'));
 const names=[...productCategories,...[...counts.keys()].filter(c=>!productCategories.includes(c)&&c!=='未分類').sort(), '未分類'];
 // 状態の切替で旧分類が0件になっても、選択表示と適用中の条件を一致させる。
 if(selected!=='all'&&!names.includes(selected))names.splice(names.length-1,0,selected);
 for(const c of names)select.append(new Option(c+'（'+(counts.get(c)||0)+'件）',c));
 select.value=names.includes(selected)?selected:'all';
}
function createItemFilters(host,items,category,query,onChange){
 const bar=el('div','','item-filters'),label=el('label','カテゴリで絞り込む'),select=el('select','');
 select.setAttribute('aria-label','カテゴリで絞り込む');categoryOptions(select,items,category);label.append(select);
 const searchLabel=el('label','品名・店内通称・商品コードで検索'),search=el('input','');search.type='search';search.value=query;
 search.placeholder='例：ピーチ';search.setAttribute('aria-label','品名・店内通称・商品コードで検索');searchLabel.append(search);bar.append(label,searchLabel);host.append(bar);
 select.onchange=()=>onChange(select.value,search.value);search.oninput=()=>onChange(select.value,search.value);
 return select;
}
function renderStockFilters(){
 const host=$('stock-item-filters');if(!host)return;host.replaceChildren();
 createItemFilters(host,view.items.filter(i=>i.active!==false),stockCategory,stockSearch,(category,query)=>{
  stockCategory=category;stockSearch=query;renderStockCards();lock(busy);
 });
}
const stockWorkspaces=new Map();
const stockCards=new Map();
// 1回の描画中の品目検索を索引にする。サーバーの在庫の代わりには使わない。
let itemsById = new Map();
// Transport clears cached private data when access is lost or a context changes.
// Keep an uncertain operation ID for explicit result checking, never as authority.
globalThis.TlhInventoryView=Object.freeze({confirmPending(){if(!pending)return false;if(!busy)void send();return true;},recoveryResolved(){
 pending=null;view=null;$('recovery').hidden=true;lock(busy);
},invalidate({transient=false}={}){
 view=null;renderedStoreId=null;itemsById.clear();stockWorkspaces.clear();stockCards.clear();
 historyDirty=true;catalogDirty=true;catalogSelection='new';
 for(const id of ['cards','logs','lines','catalog-content','stock-workspaces','overview','stock-item-filters'])$(id)?.replaceChildren();
 if(!transient){
  // A disabled select still shows its selected order label. Drop prior-store labels, not the entered date or recovery receipt.
  const complete=$('complete');if(complete){complete.replaceChildren();complete.value='';}
  const association=$('receiving-association');if(association)association.hidden=true;
  const confirm=$('receiving-association-confirm');if(confirm)confirm.checked=false;
  const asOf=$('as-of');if(asOf)asOf.textContent='';
 }
 lock(busy);
}});
// Intlの設定解析を毎回繰り返さず、表示専用フォーマッターを再利用する。
const quantityFormatter = new Intl.NumberFormat('ja-JP', {maximumFractionDigits: 3});
const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const quantities = (value,base='g') => base==='g'?quantityFormatter.format(value/1000)+' kg':base==='mL'&&value>=1000?quantityFormatter.format(value/1000)+' L':quantityFormatter.format(value)+' '+base;
const measurementQuantity = (value,base='g') => base==='g'&&value<1000?quantityFormatter.format(value)+' g':quantities(value,base);
const formatRecordedAt = value => value ? dateFormatter.format(new Date(value)) : '算出前';
const calendarFormatter = new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo',month:'numeric',day:'numeric'});
const calendarDate = value => value ? calendarFormatter.format(new Date(value)) : '算出前';
/** WorkTimeと同じ褐色の要確認表示。業務結果は変更せず、固定コードと次の操作を補う。
 * 例外全文・token・入力値を診断欄へ出さない。保存結果不明では再送IDを維持する。
 */
const statusGuides={
 AUTH_REQUIRED:['本人確認情報が受け付けられませんでした。LINEでログインし直してください。','login'],
 AUTH_SERVICE_ERROR:['認証サービスの処理に問題があります。再ログインを繰り返さず、管理者へ確認コードを伝えてください。'],
 AUTH_RESPONSE_INVALID:['認証サービスの応答を確認できません。管理者へ確認コードを伝えてください。'],
 ACCOUNT_NOT_REGISTERED:['アカウントを作成して続けてください。勤怠登録は不要です。','signup'],
 ACCOUNT_INACTIVE:['TLHアカウントが停止されています。管理者に確認してください。別アカウント作成や勤怠登録では解決しません。'],
 LOGIN_POPUP_BLOCKED:['このサイトのポップアップを許可し、「LINEでログイン」を押してください。','login'],
 LOGIN_UNAVAILABLE:['通信状態を確認してLINEログインをやり直してください。','login'],
 STORE_SELECTION_REQUIRED:['会社の在庫が表示されない場合は、利用開始コードをアカウント画面で受け取ってください。受取済みなら管理者へ確認してください。'],
 COMMON_MEMBERSHIP_REQUIRED:['会社・店舗への所属が確認できません。管理者の利用開始コードをアカウント画面で受け取ってください。勤怠登録は不要です。'],
 COMMON_SERVICE_PERMISSION_REQUIRED:['所属は在庫権限とは別です。管理者に在庫権限（閲覧を含む）の付与を確認してください。個人在庫の作成では会社在庫を利用できません。'],
 COMMON_ACCOUNT_INACTIVE:['TLHアカウントが停止されています。管理者に確認してください。勤怠登録や別アカウント作成は不要です。'],
 FORBIDDEN:['利用するアカウントと店舗を確認し、店舗管理者へ所属・権限の確認を依頼してください。'],
 OWNER_AUTHORIZATION_REQUIRED:['サービス管理者がGoogle連携の認可を確認する必要があります。'],
 RECOVERY_SAVED:['保存済みを確認しました。操作は再送せず、最新の記録を読み直してください。','refresh'],
 RECOVERY_UNKNOWN:['保存済みか未確認です。復旧欄で結果だけ確認し、新しい同じ操作をしないでください。'],
 RECOVERY_LOCK_UNAVAILABLE:['保存の重複を防止できないブラウザです。対応ブラウザで開いてください。ログイン・読取はできます。'],
 RECOVERY_STORAGE_UNAVAILABLE:['復旧情報を安全に保存できないため、保存を停止しています。ブラウザの保存設定を確認してください。'],
 SAVE_UNKNOWN:['登録結果未確認です。進捗はまだ更新しません。新しい保存を重ねず、「同じ操作を再確認」で保存済みか確認してください。','retry'],
 TENANT_SAVE_UNKNOWN:['店舗の作成や参加を繰り返さず、画面の「同じ店舗操作の結果を確認」を押してください。'],
 SAVE_VIEW_FAILED:['保存は完了しています。再登録せず、最新の記録を読み直してください。','refresh'],
 CATALOG_SYNC_REQUIRED:['アプリの保存は完了しています。商品を再登録せず、一覧シートだけ再同期してください。','sync'],
 CATALOG_CHANGED:['別の端末で更新されています。最新の情報を読み、変更内容を確認してから保存してください。','refresh'],
 CONVERSION_CHANGED:['包装規格が変わっています。最新の情報を読み直してください。','refresh'],
 BUSY:['他の処理が終わるのを待ち、最新状態を確認してください。','refresh'],
 INPUT_REQUIRED:['入力欄の値・単位・必須項目を確認してから、もう一度保存してください。'],
 LEDGER_REVIEW_REQUIRED:['原簿を手で変更・削除せず、サービス管理者へ確認コードを伝えてください。'],
 LEDGER_LIMIT:['保存先の上限です。履歴を削除せず、管理者へ保存先の移行を依頼してください。'],
 NOT_CONFIGURED:['サービスの接続設定を管理者へ確認してください。'],
 SCHEMA_MISMATCH:['保存先の固定見出しや構成を管理者へ確認してください。'],
 UNAVAILABLE:['通信状態を確認し、最新の記録を読み直してください。続く場合は確認コードを管理者へ伝えてください。','refresh'],
};
for(const code of ['OFFLINE','RPC_TIMEOUT','RPC_FAILED','AUTH_UNAVAILABLE','UI_ERROR','JS_SYNTAX','JS_REFERENCE','JS_TYPE','JS_START_FAILED'])statusGuides[code]=statusGuides.UNAVAILABLE;
function message(text,code=''){
 const node=$('status');node.textContent=text;
 // 文言だけの既存入力エラーも補足する。成功・待機・通常のログイン案内はエラーにしない。
 if(!code&&/保存結果.*不明|店舗操作の結果を確認できません/.test(text))code='SAVE_UNKNOWN';
 if(!code&&/入力してください|確認してください|保存できません|無効・使用済み|までです/.test(text))code='INPUT_REQUIRED';
 const safe=Object.hasOwn(statusGuides,code)?code:code?'INPUT_REQUIRED':'';
 const unresolved=Boolean(pending&&safe),guide=unresolved?statusGuides.SAVE_UNKNOWN:statusGuides[safe];
 node.className=guide?'status-needs-action':'';
 const details=$('status-detail');if(!details)return;details.replaceChildren();details.hidden=!guide;
 if(!guide)return;
 details.append(el('p',guide[0]),el('p','確認コード：'+(unresolved?'SAVE_UNKNOWN':safe),'diagnostic-code'));
 const action=guide[1],labels={login:'LINEでログイン',retry:'同じ操作を再確認',refresh:'最新の記録を読む',sync:'一覧シートへ再同期'};
 if(action==='signup'){
  const link=el('a','アカウントを作成して続ける');link.href='/account/';details.append(link);
  const help=el('details');help.append(el('summary','次の手順'),el('p','同じLINEで作成します。会社で使う方は利用開始コードを受け取り、在庫へ戻ってください。個人利用はコード不要です。'));details.append(help);return;
 }
 if(action){const button=el('button',labels[action]);button.type='button';button.dataset.recovery=action;
  button.onclick=()=>{if(busy)return;if(action==='login')$('line-login')?.onclick?.();else if(action==='retry')send();else if(action==='sync')send({type:'SYNC_CATALOG'});else refresh();};details.append(button);
 }
}
globalThis.TlhInventoryStatus=Object.freeze({show:message});
// Common navigation receives a boolean only, never receipt, payload or identity.
globalThis.TlhInventoryNavigation=Object.freeze({canLeave:()=>!busy&&!pending&&globalThis.TlhInventory?.hasPendingReceipt?.()!==true});
/** 通信中・読込未完了・結果不明を分ける。失敗後の再読取は必ず押せるようにする。 */
function lock(value){busy=value;const receiptPending=globalThis.TlhInventory?.hasPendingReceipt?.()===true;$('status').setAttribute('aria-busy',String(value));for(const b of document.querySelectorAll('button,input,select,textarea')){
 const recovery=['retry','refresh','line-login'].includes(b.id)||['login','retry','refresh','command-status'].includes(b.dataset.recovery);
 b.disabled=value||(!view&&!recovery&&!b.dataset.tab&&!b.dataset.tenant)||(Boolean(pending)&&!recovery)||(receiptPending&&!recovery&&!b.dataset.tab);
}}
function tab(name){
 activeTab=name;
 const task=['counting','sampling'].includes(name),section=task?'stock':name,selected=name==='history'?'stock':name;
 if(name==='catalog'&&view)renderCatalog();
 for(const s of document.querySelectorAll('main section'))if(s.id!=='operation-recovery')s.hidden=s.id!==section;
 for(const b of document.querySelectorAll('nav button')){if(b.dataset.tab===selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
 if(section==='stock')showStockAction(task?name:'overview');
 if(name==='history'&&view&&historyDirty)renderHistory();
 lock(busy);
}
/** 取得できるまで古い残量からの新規更新を禁止する。結果不明の操作IDは保持する。 */
async function load(_preferredStoreId){
 view=null;
 const result = await TlhInventory.readView(_preferredStoreId);
 if (!result.ok) throw Error(result.code || 'UNAVAILABLE');view=result.value;render();
}
// 閉じた標本計測と、基準日からの在庫推定の状態を分けて表示する。
const forecastMessages = {
  NEEDS_BASELINE: '入荷を登録するか、今ある総在庫を入力してください',
  LEARNING: '消費速度の計測待ちです。1回終了すると推定を開始します',
  OUT_OF_STOCK: '推定では在庫切れです。実際の残量を確認してください',
  NEEDS_DELIVERY_HISTORY: '納期は未計測です。発注と受取完了の実績から自動計算します',
  ORDER_NOW: '発注期限に達しています',
  OK: '発注期限まで余裕があります',
  NO_USAGE_OBSERVED: '観測した投入量は0です。在庫切れ日時はまだ算出しません',
};

function predictionHeld(item){return item.guidance?.evaluation?.state==='HELD';}
function inventoryQuantityLabel(item) {
  const forecast = item.forecast;
  if (!forecast) return quantities(item.quantity,item.baseUnit);
  if (forecast.quantity === null) return '在庫基準未登録';
  if (forecast.rate === null) return quantities(forecast.quantity,item.baseUnit)+'（記録上）';
  return '約 '+quantities(forecast.quantity,item.baseUnit);
}

function needsOrder(item) {
  if(item.active===false)return false;
  const forecast = item.forecast;
  if (!forecast) return item.quantity <= item.threshold;
  return ['ORDER_NOW','OUT_OF_STOCK'].includes(forecast.status) ||
    forecast.rate !== null && forecast.quantity !== null && forecast.quantity <= item.threshold;
}

/** 数字入力の共通部品。値の最終検証は保存時にサーバー側でも行う。 */
function appendNumberField(container, label, value) {
  const wrapper = el('label', label);
  const input = el('input', '');
  input.type = 'number';input.min = '0';input.step = 'any';input.value = value;
  input.setAttribute('aria-label', label);wrapper.append(input);container.append(wrapper);
  return input;
}

/** 棚卸は総量の実測だけ。消費速度や納期の設定と混ぜない。 */
function renderStockCount(container, item) {
  if(item.forecast?.countedAt)container.append(el('p','前回の棚卸 '+formatRecordedAt(item.forecast.countedAt),'muted'));
  const unitId=view?.stocktakePackageCount===true?item.stocktakeUnitId:null;
  const unit=item.units?.find(u=>u.id===unitId);
  const renderTotal=parent=>{
   const quantity=appendNumberField(parent,'今ある量（'+(item.baseUnit||'g')+'、使いかけも含む）','');
   quantity.step='1';
   const save=el('button','数えた量を保存','primary');
   save.onclick=()=>{
    if(quantity.value===''||!Number.isSafeInteger(Number(quantity.value))||Number(quantity.value)<0){message('総在庫を0以上の整数で入力してください。');return;}
    send({type:'COUNT_STOCK',itemId:item.id,quantity:Number(quantity.value)});
   };
   parent.append(save);
  };
  if(!unit){renderTotal(container);return;}
  const quantity=appendNumberField(container,'満タンの数（'+unit.label+'）','');quantity.step='1';
  const label=el('label','使いかけの残り'),remainder=el('select','');
  remainder.setAttribute('aria-label','使いかけの残り');
  remainder.append(new Option('選択してください',''),new Option('残りなし','none'),new Option('残りあり（量は未計測）','present'));
  remainder.value='';label.append(remainder);container.append(label);
  const description=el('p','残りありの場合は満タンの数だけを記録し、在庫の総量は補正しません。','muted');
  const save=el('button','棚卸を保存','primary');
  save.onclick=()=>{
   if(quantity.value===''||!Number.isSafeInteger(Number(quantity.value))||Number(quantity.value)<0||!Number.isSafeInteger(Number(quantity.value)*unit.baseQuantity)){message('満タンの数を入力できる範囲の整数で指定してください。');return;}
   if(!['none','present'].includes(remainder.value)){message('使いかけの残りがあるか選んでください。');remainder.focus();return;}
   send({type:'COUNT_STOCK',itemId:item.id,packCount:{unitId:unit.id,conversionVersion:unit.version,fullUnits:Number(quantity.value),hasOpenedRemainder:remainder.value==='present'}});
  };
  container.append(description,save);
  const detail=el('details','');detail.append(el('summary','総残量を量っている場合'));renderTotal(detail);container.append(detail);
}

/** 基準単位/日へ統一した予測と根拠を表示する。g・mL・本数を混ぜない。 */
/** Explicit historical association only. Receipt selection never adds stock. */
function renderReceiptLink(card,item,order){
 if(!canOperate('LINK_RECEIPT_TO_ORDER')||!order.orderOperationId)return;
 const details=el('details','');details.append(el('summary','登録済みの入荷と照合（在庫は増やさない）'));
 let mounted=false;card.append(details);
 details.ontoggle=()=>{if(!details.open||mounted)return;mounted=true;
 const candidates=(view.history||[]).filter(h=>h.type==='RECEIVE'&&h.receiptOperationId&&h.lines.some(l=>l.itemId===item.id));
 if(!order.plannedLine||!candidates.length){details.append(el('p','予定量がある注文と、表示中の入荷履歴1件だけを照合できます。分納・合算は未対応です。','muted'));return;}
 const choose=el('select','');choose.setAttribute('aria-label','照合する登録済み入荷');choose.append(new Option('入荷記録を選ぶ',''));
 for(const h of candidates){const line=h.lines.find(l=>l.itemId===item.id);choose.append(new Option((h.receivedOn||'日付不明')+' ／ '+item.name+' ／ '+quantities(line.amount,item.baseUnit)+' ／ 登録日時 '+conditionTime(h.at),h.receiptOperationId));}
 const preview=el('p',''),label=el('label',''),checked=el('input','');checked.type='checkbox';label.append(checked,el('span','この入荷が、この注文の全量であると確認した'));
 choose.onchange=()=>{checked.checked=false;validation.textContent='';const h=candidates.find(h=>h.receiptOperationId===choose.value);preview.textContent=h?'注文：'+formatRecordedAt(order.at)+' ／ '+item.name+' ／ '+quantities(order.plannedLine.amount,item.baseUnit)+'。入荷：'+h.receivedOn+'（実到着日は日付のみ） ／ 登録日時 '+conditionTime(h.at)+' ／ '+quantities(h.lines.find(l=>l.itemId===item.id).amount,item.baseUnit):'';};
 const validation=el('p','','muted');validation.setAttribute('role','status');
 const save=el('button','照合して注文を完了');save.onclick=()=>{if(busy||pending)return;if(!choose.value){validation.textContent='入荷記録を選んでください。';return;}if(!checked.checked){validation.textContent='注文の全量であることを確認し、チェックしてください。';return;}validation.textContent='';send({type:'LINK_RECEIPT_TO_ORDER',caseId:order.id,orderOperationId:order.orderOperationId,receiptOperationId:choose.value,confirmAssociation:true});};
 details.append(choose,preview,el('p','数量一致だけでは同じ注文と断定できません。伝票等で確認してください。分納・合算は未対応。入荷の再登録は不要です。','muted'),label,save,validation);lock(busy);
 };
}
function renderConsumption(card, item) {
  const forecast = item.forecast;
  const held=predictionHeld(item);
  const dates=el('div','','forecast-dates');
  for(const [label,date,cls] of [['在庫切れ予測',forecast.stockoutAt,''],['発注目安',forecast.orderBy,'deadline']]){
    const cell=el('div','',cls);cell.append(el('span',label),el('strong',date?conditionTime(date):label==='発注目安'&&!item.delivery?'納期未計測':'未算出'));if(held)cell.append(el('small','参考・要確認'));dates.append(cell);
  }
  if(dates.children.length)card.append(dates);

}

/** 日時入力は日本時間。記録した日時と実際に測った日時を区別する。 */
function measurementTimeField(container,label,required=false){
  const wrapper=el('label',label),input=el('input','');input.type='datetime-local';input.step='60';
  input.setAttribute('aria-label',label);wrapper.append(input);container.append(wrapper);
  return {read(){
    if(!input.value){if(required)throw Error('開始と終了の日時を入力してください');return null;}
    const time=Date.parse(input.value+'+09:00');
    if(!Number.isFinite(time))throw Error('日時を確認してください');return new Date(time).toISOString();
  }};
}
function sendMeasurement(makeCommand){try{send(makeCommand());}catch(error){message(error.message);}}

/** 1包装の開始・全量の使い切り・取消。旧計測を閉じる読取互換もここで扱う。 */
function renderSampleActions(card,item){
  const forecast=item.forecast;
  if(forecast.lastMeasuredAt)card.append(el('p','最後に使用量を確認した日時：'+formatRecordedAt(forecast.lastMeasuredAt),'muted'));
  if (forecast.open) {
    card.append(el('p', '計測中：'+quantities(forecast.open.amount,item.baseUnit)+' ／開始 '+formatRecordedAt(forecast.open.openedAt)));
    const finish = el('button', '使い切った：計測を終了', 'primary');
    finish.onclick = () => send({type:'FINISH_SAMPLE',itemId:item.id,openOperationId:forecast.open.operationId});
    const cancel = el('button', 'この計測を取り消す');
    cancel.onclick = () => send({type:'CANCEL_SAMPLE',itemId:item.id,openOperationId:forecast.open.operationId});
    card.append(finish, cancel);
    return; // 以前から継続中の1袋計測を閉じてから、新方式へ進む。
  }
  card.append(el("p","毎回の開封記録は不要です。測るときだけ、未使用の1袋・1ケースの使用開始と、全量を使い切った日時を記録します。","muted"));
  card.append(el("p","おすすめ：平日と土日の両方を含み、使い切るまで約1週間かかる1袋・1ケースなどの単位を選んで測定してください。平日だけ・土日だけの短い計測に偏るのを避け、普段の1週間に近い消費速度を捉えやすくします。約1週間は目安です。大袋など時間がかかるものは、途中で区切らず全量を使い切るまで測定してください。","muted"));
  card.append(el("p","※土日の方が多く消費する品目を平日だけで計測すると、普段の1週間より消費速度を低く見積もり、在庫切れ予測や発注の判断が遅れるおそれがあります。反対に、土日だけでは速く見積もる場合があります。平日と土日の両方を含めて測定してください。","muted"));
  card.append(el("p","注意：計測対象から順に使い、途中で継ぎ足したり、別の袋・ケースと混ぜたりしないでください。同じ原料を複数の包装から同時に使うと、この計測は店全体の消費速度を表しません。ケースは開封時ではなく、中身を最初に使い始めた時点で開始します。","muted"));
  const measurement=forecast.measurement;
  if(measurement){
    card.append(el("p","使用開始："+formatRecordedAt(measurement.startedAt)));
    const known=measurement.initialAmount!==null&&measurement.initialAmount>0;
    if(known)card.append(el("p","計測対象：1包装（"+measurementQuantity(measurement.initialAmount,item.baseUnit)+"）"));
    const end=measurementTimeField(card,"全量を使い切った日時（日本時間・空欄＝今）");
    if(known){
      const finish=el("button","全量を使い切った：計測を終了","primary");
      finish.onclick=()=>sendMeasurement(()=>{const endedAt=end.read();return {type:"UPDATE_MEASUREMENT",itemId:item.id,measurementId:measurement.id,expectedRevision:measurement.revision,used:{value:measurement.initialAmount,unit:item.baseUnit||"g"},finished:true,...(endedAt?{endedAt}:{})};});
      card.append(finish);
    }else card.append(el("p","以前の方式で開始した計測で、対象の全量が未登録です。この計測を取り消し、未使用の1袋・1ケースで開始し直してください。","muted"));
    const cancel=el("button","この計測を取り消す");cancel.onclick=()=>{if(confirm("この計測を取り消しますか？途中確認がある場合は、その結果も速度の計算から外れます。"))send({type:"CANCEL_MEASUREMENT",itemId:item.id,measurementId:measurement.id,expectedRevision:measurement.revision});};card.append(cancel);
  }else{
    const units=item.units.filter(u=>Number.isFinite(u.baseQuantity)&&u.baseQuantity>0);
    if(!units.length){card.append(el("p","袋・ケースの内容量が未設定のため計測できません。先に品目の包装設定を確認してください。","muted"));return;}
    const label=el("label","使い切りを測る単位"),unit=el("select","");unit.setAttribute("aria-label","使い切りを測る単位");
    for(const u of units)unit.append(new Option("1"+u.label+"（"+measurementQuantity(u.baseQuantity,item.baseUnit)+"）",u.id));label.append(unit);card.append(label);
    card.append(el("p","少量なら1袋、大量に使う原料なら1ケースなど、無理なく使い切りを確認できる単位を選んでください。表示の内容量が実商品と合っていることを確認してください。","muted"));
    const begin=measurementTimeField(card,"この1袋・1ケースを使い始めた日時（日本時間・空欄＝今）");
    const start=el("button","この1袋・1ケースの使用開始を記録","primary");
    start.onclick=()=>sendMeasurement(()=>{const u=units.find(u=>u.id===unit.value),startedAt=begin.read();if(!u)throw Error("INVALID_LINE");return {type:"START_MEASUREMENT",itemId:item.id,initial:{value:1,unit:"pack",unitId:u.id,conversionVersion:u.version},...(startedAt?{startedAt}:{})};});card.append(start);
  }
  if(forecast.observations?.length){
    const history=el('details','');history.append(el('summary','最近の計測結果'));
    for(const observation of forecast.observations.slice().reverse()){
      const days=(Date.parse(observation.endedAt)-Date.parse(observation.startedAt))/86400000;
      history.append(el('p',formatRecordedAt(observation.startedAt)+'〜'+formatRecordedAt(observation.endedAt)+' ／'+measurementQuantity(observation.amount,item.baseUnit)+' ／'+days.toFixed(1)+'日間'+(observation.partial?'（途中確認）':''),'muted'));
      if(observation.revision){
        const cancel=el('button','この計測結果を取り消す');
        cancel.onclick=()=>{if(confirm('この計測結果を速度の計算から外しますか？'))send({type:'CANCEL_MEASUREMENT',itemId:item.id,measurementId:observation.id,expectedRevision:observation.revision});};
        history.append(cancel);
      }
    }
    card.append(history);
  }
}

/** 作業ごと・品目ごとに入力DOMを保ち、切替で未保存入力を消さない。最新読取時は破棄する。 */
function showStockAction(name){
  if(!['overview','sampling','counting'].includes(name))return;
  stockAction=name;
  for(const button of document.querySelectorAll('[data-stock-action]'))button.setAttribute('aria-pressed',String(button.dataset.stockAction===name));
  const overview=$('stock-overview'),host=$('stock-workspaces');
  if(!overview||!host)return;
  overview.hidden=name!=='overview';host.hidden=name==='overview';
  if($('stock-summary'))$('stock-summary').hidden=name!=='overview';
  for(const [key,node] of stockWorkspaces)node.hidden=key!==name;
  if(name==='overview'||!view||stockWorkspaces.has(name))return;
  const titles={sampling:'消費計測',counting:'棚卸'};
  const help={sampling:'1袋・1ケースなど、選んだ1単位の使用開始と使い切りを記録します。途中の残量入力は不要です。在庫全体の数え直しは「在庫を数える」で行います。',counting:'品目の棚卸単位で満タンの数を記録します。使いかけが残る場合は、総残量を補正しません。単位未設定の品目は総量を実測します。'};
  const workspace=el('div','','stock-workspace');workspace.append(el('h3',titles[name]),el('p',help[name],'muted'));
  stockWorkspaces.set(name,workspace);host.append(workspace);
  const back=el('button','一覧へ戻る（入力を保持）');back.onclick=()=>tab('stock');const cancel=el('button','入力をやめて一覧へ');cancel.onclick=()=>{if(busy||pending)return;workspace.remove();stockWorkspaces.delete(name);tab('stock');};workspace.append(back,cancel);
  if(!canOperate(name==='counting'?'COUNT_STOCK':'START_MEASUREMENT')){workspace.append(el('p','この作業を保存する権限がありません。','muted'));return;}
  const label=el('label','対象の品目'),select=el('select','');select.setAttribute('aria-label',titles[name]+'：対象の品目');
  const choices=view.items.filter(i=>i.active!==false&&i.forecast);
  const measuring=i=>Boolean(i.forecast.open||i.forecast.measurement);
  if(name==='sampling'){
   choices.sort((a,b)=>Number(measuring(b))-Number(measuring(a)));
   if(choices.some(measuring))workspace.append(el('p','計測中の品目が先頭です。終わった包装は対象を選んで計測を終了してください。','muted'));
  }
  for(const item of choices)select.append(new Option(item.name+(name==='sampling'&&measuring(item)?'（計測中）':''),item.id));
  label.append(select);workspace.append(label);
  const cards=new Map();
  const choose=()=>{
    for(const [id,card] of cards)card.hidden=id!==select.value;
    if(!cards.has(select.value)){
      const item=itemsById.get(select.value);if(!item)return;
      const card=el('article','','card action-card');card.append(el('h4',item.name));
      if(name==='sampling')renderSampleActions(card,item);
      if(name==='counting')renderStockCount(card,item);
      cards.set(item.id,card);workspace.append(card);
    }
    lock(busy);
  };
  select.onchange=choose;choose();
}

function render(){
 const finishRender=globalThis.TlhInventoryTiming?.start('render');
 if(renderedStoreId!==view.storeId){renderedStoreId=view.storeId;catalogSelection='new';catalogFilter='CURRENT';stockAction=['counting','sampling'].includes(activeTab)?activeTab:'overview';stockCategory=catalogCategory='all';stockSearch=catalogSearch='';$('lines').replaceChildren();}
 itemsById = new Map(view.items.map(item => [item.id, item]));
 stockWorkspaces.clear();
 stockCards.clear();
 if($('stock-workspaces'))$('stock-workspaces').replaceChildren();
 const asOf=$('as-of');
 if(asOf)asOf.textContent=view.asOf?'推定時点：'+formatRecordedAt(view.asOf)+' ／最新の記録を読むと更新':'推定時点を確認するには最新の記録を読んでください';
 historyDirty=true;catalogDirty=true;
 const overview=$('overview');
 if(overview){
  overview.replaceChildren();
  const tasks=view.items.filter(i=>i.active!==false).reduce((n,i)=>n+(i.guidance?.tasks.length||0),0);
  overview.append(el('p',tasks?'確認が必要な記録 '+tasks+'件。':'期限と在庫を確認してください。'));
 }
 renderStockFilters();renderStockCards();
 $('complete').replaceChildren(new Option('選択しない',''));
 // 受取完了は注文ごと。一件を完了しても他の未入荷注文を残す。
 for(const i of (canOperate('RECEIVE',{completeCaseId:'selection'})?view.items:[]).filter(i=>i.active!==false))for(const o of (i.orders||(i.order?[i.order]:[])).filter(o=>o.status==='ORDERED'))$('complete').append(new Option(i.name+' ／ '+(o.at?formatRecordedAt(o.at):'発注')+' ／ '+(o.plannedLine?o.plannedLine.quantity+' '+(i.units.find(u=>u.id===o.plannedLine.unitId)?.label||o.plannedLine.unitId):'数量未記入')+' ／ 到着 '+(o.expectedOn||'不明')+' ／ '+o.id,o.id));
 if($('receiving-association')){$('receiving-association').hidden=view.receivingEnabled!==true;$('receiving-association-confirm').checked=false;}
 if(activeTab==='history')renderHistory();
 if(activeTab==='catalog')renderCatalog();
 showStockAction(stockAction);finishRender?.();
}
/** 絞り込みではカードだけを描画し、棚卸・計測・仕入情報の未保存入力を作り直さない。 */
/** Coverage is a hint to the next existing workspace, never a save or accuracy score. */
function openInformationTask(kind,itemId){
 if(busy||pending||!view||globalThis.TlhInventory?.hasPendingReceipt?.()===true)return;
 const item=view.items.find(i=>i.id===itemId&&i.active!==false);
 if(!item||!canOperate(kind==='count'?'COUNT_STOCK':kind==='receipt'?'RECEIVE':'START_MEASUREMENT'))return;
 if(kind==='receipt'){tab('receiving');const h=document.querySelector('#receiving h2');if(h){h.setAttribute('tabindex','-1');h.focus();}return;}
 if(!['count','measurement'].includes(kind))return;
 const name=kind==='count'?'counting':'sampling';tab(name);
 const workspace=stockWorkspaces.get(name),select=workspace?.querySelector('select');
 if(select&&[...select.options].some(o=>o.value===itemId)){select.value=itemId;select.onchange?.();select.focus();}
}
const stockCountReviewDays=7; // Restored provisional default from 55974c0, elapsed 24-hour days.
/** Display-only review intervals. No ledger write, accuracy claim or inferred seasonality. */
function informationSignal(category,days){
 if(!category?.count||!Number.isFinite(category.ageDays)||category.ageDays<0)return {state:'unknown',symbol:'?',label:'まだ判断できません',remaining:null};
 if(!Number.isInteger(days)||days<1||days>365)return {state:'unknown',symbol:'?',label:'目安を確認',remaining:null};
 const remaining=Math.max(0,days-category.ageDays);
 if(category.ageDays>=days)return {state:'due',symbol:'!',label:'見直し目安を超過',remaining:0};
 if(category.ageDays>=Math.ceil(days*0.8))return {state:'soon',symbol:'△',label:'見直しが近い',remaining};
 return {state:'recent',symbol:'✓',label:'記録は目安内',remaining};
}
const reliabilityConditionLabels=Object.freeze({specification:'規格と単位を実物で確認',stocktake:'棚卸',consumption:'消費速度',handover:'仕入れ情報の登録',delivery:'実績納期',agreement:'予測と実物の一致',replenishment:'欠品を防ぐ補充'});
/** Validate a server assessment envelope, never infer MET from dates, counters or form fields. */
function reliabilityReason(condition){
 const messages={OPENED_REMAINDER_UNMEASURED:'満タンの数は記録済みです。使いかけを含む総残量は未計測です。',STOCKTAKE_UNIT_UNSET:'管理者が品目の棚卸単位を設定してください。',STOCKTAKE_DENOMINATION_UNVERIFIED:'直近の棚卸は、現行の棚卸単位で数えた記録ではありません。',EXACT_COMPARISON_UNVERIFIED:'直近の棚卸と、その補正前の予測の両方を確認できていません。',EXACT_PRECOUNT_DIFFERENCE:'棚卸の入力単位に揃えた予測と実数が一致していません。',APP_NONZERO_STREAK_ACCUMULATING:'確認できた欠品なしの連続記録が6か月未満です。',APP_NONZERO_HISTORY_CAPACITY:'記録が多く、欠品なしの継続期間を確定できませんでした。',APP_NONZERO_HISTORY_UNVERIFIED:'連続期間を判定できる在庫・実測の記録が揃っていません。',APP_COUNT_ZERO:'評価期間内に、棚卸数量が0の記録があります。',APP_ESTIMATE_ZERO:'評価期間内に、アプリの推定在庫が0に達しました。',PHYSICAL_SPECIFICATION_ENTRY_REQUIRED:'現物を見て、仕入品情報と規格を登録してください。',POLICY_NOT_DEFINED:'評価期間・許容差などの基準が未確定です。',NO_RECORD:'棚卸が未登録です。この品目を実際に数えて保存してください。',NO_COMPLETED_MEASUREMENT:'完了した消費実測がありません。実際の使用量と期間を計測してください。',INTERVAL_NOT_SET:'更新間隔が未設定です。管理者がこの品目の間隔を設定してください。',INVALID_OBSERVATION_TIME:'実測日時を確認できません。記録を確認してください。',VERIFIED_RECORD_CURRENT:'正規の操作による記録と、更新期限内であることを確認しました。',EXPIRED:'更新期限を過ぎています。新しい実測を登録してください。',LEGACY_OR_DEPENDENCY_UNVERIFIED:'以前の記録または単位の由来を確認できません。現在の実測を登録してください。',INVALID_QUANTITY:'棚卸数量を評価できません。記録を確認してください。',INVALID_MEASUREMENT:'消費量または計測期間を評価できません。記録を確認してください。',VERIFIED_ORDER_RECEIPT_PAIR:'正規の発注と全量入荷の対応を確認しました。到着は日付単位の記録です。',PAIR_NOT_VERIFIED:'発注と全量入荷の対応または由来が未確認です。受取の対応を確認してください。',NO_ORDER_RECEIPT_PAIR:'対応する発注・全量入荷がありません。実際の発注と到着時に記録してください。',PHYSICAL_SPECIFICATION_NOT_VERIFIED:'実物との照合を証明する記録方式が未対応です。設定だけでは加点しません。',SUPPLIER_CATALOG_UNAVAILABLE:'保存済みの仕入先情報を確認できません。',SUPPLIER_NOT_REGISTERED:'この品目の仕入先名を登録してください。',OTHER_STAFF_REORDER_NOT_VERIFIED:'この評価は旧方式です。最新の評価が必要です。'};
 return messages[condition?.reason]||'評価理由を確認できません。管理者に確認してください。';
}
function confirmedReliability(item){
 const r=item?.reliability;if(!r||r.version!==1||r.state!=='ASSESSED'||!Array.isArray(r.conditions))return null;
 const ids=r.conditions.map(c=>c?.id);
 if(ids.length!==Object.keys(reliabilityConditionLabels).length||new Set(ids).size!==ids.length||ids.some(id=>!Object.hasOwn(reliabilityConditionLabels,id))||r.conditions.some(c=>!['MET','UNMET','UNKNOWN'].includes(c.state)))return null;
 const level=r.conditions.filter(c=>c.state==='MET').length;
 if(r.level!==level||r.total!==r.conditions.length)return null;
 return {...r,level,total:r.conditions.length};
}
function reliabilityChange(before,after){
 const previous=confirmedReliability(before),current=confirmedReliability(after);
 if(!before?.id||before.id!==after?.id||!previous||!current)return '保存後の評価を表示しています。前回との差は確認できません。';
 const names={...reliabilityConditionLabels,stocktake:'棚卸の更新',consumption:'消費速度の計測・更新'};
 const prior=new Map(previous.conditions.map(c=>[c.id,c.state]));
 const gained=current.conditions.filter(c=>c.state==='MET'&&prior.has(c.id)&&prior.get(c.id)!=='MET').map(c=>names[c.id]);
 const achievement=gained.length?gained.join('・')+'を達成。':'新たに達成した条件はありません。';
 const movement=current.level>previous.level?'LEVEL '+previous.level+'から'+current.level+'に上がりました。':current.level===previous.level?'LEVEL '+current.level+'を維持しています。':'LEVEL '+previous.level+'から'+current.level+'に変わりました。未達・未評価の理由を確認してください。';
 return achievement+movement;
}
function reliabilityHeading(item){const r=confirmedReliability(item);return r?renderStockReliability({state:'ASSESSED',value:r.level,maximum:r.conditions.length,policy:'SERVER_RELIABILITY_V1',label:'確認済み条件。未評価は点灯しません。'}):renderStockReliability({state:item?.reliability?'UNAVAILABLE':'MISSING'});}
/** Presentation only. Only a validated server assessment supplies the lit count. */
function renderStockReliability(assessment=null){
 const node=el('div','','level-heading');node.append(el('span','在庫管理の信頼度'));
 const valid=assessment?.state==='ASSESSED'&&Number.isInteger(assessment.value)&&Number.isInteger(assessment.maximum)&&assessment.maximum>0&&assessment.maximum<=10&&assessment.value>=0&&assessment.value<=assessment.maximum&&typeof assessment.policy==='string'&&assessment.policy.length>0;
 if(!valid){node.append(el('strong',assessment?.state==='UNAVAILABLE'?'評価取得不可':assessment?.state==='MISSING'?'評価データ未提供':'未判定','level-state'));return node;}
 const stars=el('span','','reliability-stars');stars.setAttribute('role','img');stars.setAttribute('aria-label','在庫管理の信頼度：'+assessment.maximum+'条件中'+assessment.value+'条件達成。'+assessment.label);
 for(let i=0;i<assessment.maximum;i++){const star=el('span','★',i<assessment.value?'lit':'unlit');star.setAttribute('aria-hidden','true');stars.append(star);}
 node.append(stars);return node;
}
function renderItemAlert(card,item){
 const alerts=el('div','','stock-alerts');card.append(alerts);
 const status=item.forecast?.status;
 if(!['ORDER_NOW','OUT_OF_STOCK'].includes(status))return;
 card.className='card attention';
 const alert=el('div','','item-alert');alert.setAttribute('role','note');
 alert.append(el('span',predictionHeld(item)?'予測は要確認です。発注前に、詳細の棚卸と未入荷注文を確認':status==='OUT_OF_STOCK'?'在庫切れの予測です。未入荷注文と補充を確認':'発注目安に達しています。未入荷注文を確認して発注'));
 alerts.append(alert);
}
const conditionDateFormatter=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'numeric',day:'numeric'});
function conditionDate(value){return typeof value==='string'&&Number.isFinite(Date.parse(value))?conditionDateFormatter.format(new Date(value)):'未提供';}
/** Display only: use supplied DTO timestamps, never infer an actual execution time from registration. */
function conditionTime(value){return typeof value==='string'&&Number.isFinite(Date.parse(value))?formatRecordedAt(value)+' JST':'未提供';}
function layoutReliabilityRows(rows){
 const titles={'棚卸':'棚卸を間隔内で更新','消費速度':'消費速度を計測・更新','実績納期':'実発注と入荷で納期を確認'};
 const actions={'この品目の規格を確認':'規格を確認','この品目を数える':'在庫を数える','この品目の消費を確認':'消費を測る','この品目の仕入情報を編集':'仕入れ情報を確認','未入荷注文・受取の対応を確認':'未入荷の注文を見る'};
 for(const row of rows.children){
  const title=row.querySelector('h4'),state=row.querySelector('.condition-state'),body=el('div','','condition-body');
  title.textContent=titles[title.textContent]||title.textContent;
  state.textContent=row.className.split(' ').includes('met')?'✓ 達成':row.className.split(' ').includes('unmet')?'未達成':'未評価';
  const buttons=[...row.children].filter(child=>child.tagName.toLowerCase()==='button');
  const content=[...row.children].filter(child=>child!==title&&child!==state&&!buttons.includes(child));
  const rules=content.filter(child=>/^(設定間隔：|次期限：|更新条件：)/.test(child.textContent));
  if(rules.length){
   const benefit=content.find(child=>child.className==='condition-benefit');
   const facts=content.filter(child=>/^(実績：|評価に使用した入荷日：|確認済みの発注・入荷記録に基づく納期目安：|評価対象の実測：|実施日時：|登録日時：|実測終了日時：|実測開始日時：|棚卸総量：|使用量：|記録ベースの参考：|参考記録の到着日：|発注・入荷の登録日時：)/.test(child.textContent));
   if(benefit)body.append(benefit);
   if(facts.length)body.append(el('p',facts.map(child=>child.textContent).join(' ／ ')));
   body.append(el('p','条件：'+rules.map(child=>child.textContent).join('。'),'muted'));
   for(const child of content)if(child!==benefit&&!facts.includes(child)&&!rules.includes(child))body.append(child);
  }else for(const child of content)body.append(child);
  for(const button of buttons)button.textContent=actions[button.textContent]||button.textContent;
  row.replaceChildren(title,state,body,...buttons);
 }
}
function renderDailyTasks(card,item){
 const g=item.guidance||{},f=item.forecast||{},rating=confirmedReliability(item);
 const box=el('details','','daily-tasks level-journey');box.append(el('summary','レベルを上げるには？'));box.setAttribute('aria-label','レベルを上げるには？');
 if(rating)box.append(el('p','LEVEL'+rating.level+' ／ '+rating.total+'条件中'+rating.level+'達成','level-current'));
 const feedback=el('div','','quest-feedback');feedback.hidden=true;feedback.setAttribute('role','status');card.append(feedback);
 box.append(el('p',rating?'点灯＝達成、黒星＝未達・未評価。条件と同じ数の星です。':item.reliability?'評価を確認できません。LEVEL 0とは扱いません。':'評価データが未提供です。旧バックエンドでは星を判定できません。','row-legend'));
 const rows=el('div','','level-rows');
 const benefit=label=>el('p',{'規格と単位を実物で確認':'「1袋」を実際の重さに正しく換算できているか？','仕入れ情報の登録':'この品目の取引先が分かるか？','棚卸':'いま店にある量を、数字で確かめられるか？','消費速度':'このペースで使うと、あと何日持つか？','実績納期':'切らさないために、何日前に発注すればいいか？','予測と実物の一致':'本当に消費速度が合っていたのか？','欠品を防ぐ補充':'一定期間、在庫切れなく仕入れられたか？'}[label],'condition-benefit');
 const validTime=x=>conditionTime(x)!=='未提供';
 const makeRow=(label,schedule)=>{
  const x=schedule||{},hasTime=validTime(x.lastAt),configured=Number.isInteger(x.days)&&x.days>0;
  const row=el('div','','condition-box unknown');row.append(el('h4',label),benefit(label),el('strong','未評価：確認済みの評価結果が必要','condition-state'));
  row.append(el('p','設定間隔：'+(configured?x.days+'日'+(x.defaulted?'（既定）':'（品目設定）'):'未設定')));
  row.append(el('p','次期限：'+(configured&&hasTime&&validTime(x.dueAt)?conditionTime(x.dueAt):'算出不可（'+(!configured?'間隔未設定':!hasTime?'基準日時が未提供':'期限日時が未提供')+'）')));
  rows.append(row);return row;
 };
 const settings=row=>{
  if(view.permissions.includes('inventory.manage')&&canOperate('SAVE_ITEM')){const b=el('button','この品目の間隔を設定');b.onclick=()=>{catalogSelection=item.id;catalogDirty=true;tab('catalog');const d=document.querySelector('.review-settings');if(d)d.open=true;d?.querySelector('input')?.focus();};row.append(b);}else row.append(el('p','間隔の設定・変更は管理者が担当します。','muted'));
 };
 const specification=el('div','','condition-box unknown');specification.append(el('h4',reliabilityConditionLabels.specification),benefit(reliabilityConditionLabels.specification),el('strong','未評価：実物との照合根拠が必要','condition-state'));
 specification.append(el('p',(item.units||[]).map(u=>'1'+u.label+'＝'+(Number.isFinite(u.baseQuantity)&&item.baseUnit?measurementQuantity(u.baseQuantity,item.baseUnit):'換算未確認')).join(' ／ ')||'規格・単位換算が未提供です。'),el('p','設定が埋まっているだけでは達成と判定しません。実物の包装・内容量と照合してください。'));
 if(canOperate('SAVE_ITEM')){const b=el('button','この品目の規格を確認');b.onclick=()=>{catalogSelection=item.id;catalogDirty=true;tab('catalog');document.querySelector('[aria-label="在庫の基準単位"]')?.focus();};specification.append(b);}else specification.append(el('p','品目編集権限のある担当者に規格の確認を依頼してください。'));
 rows.append(specification);
 const count=makeRow('棚卸',g.stocktake);
 count.append(el('p','実施日時：未提供（独立した実施時刻は保持されていません）'),el('p','登録日時：'+conditionTime(g.stocktake?.lastAt)));
 if(!g.stocktake?.lastAt)count.append(el('p','不足：評価に使える棚卸記録がありません。'));
 if(canOperate('COUNT_STOCK')){const b=el('button','この品目を数える','row-action');b.onclick=()=>openInformationTask('count',item.id);count.append(b);}else count.append(el('p','棚卸は担当権限のある従業員が更新します。'));
 settings(count);
 const consumption=makeRow('消費速度',g.consumption);
 consumption.append(el('p','実績：'+(Number.isFinite(f.rate)&&item.baseUnit?measurementQuantity(f.rate,item.baseUnit)+'/日':f.rate==null?'未計測':'単位未提供のため表示不可')),el('p','実測終了日時：'+conditionTime(f.lastMeasuredAt)),el('p','登録日時：未提供'));
 if(f.rate==null)consumption.append(el('p','不足：使い始めから全量を使い切るまでの実測が必要です。'));
 if(!item.baseUnit||!item.units?.some(u=>Number.isFinite(u.baseQuantity)&&u.baseQuantity>0))consumption.append(el('p','不足：基準単位・包装の換算を管理者に確認してください。'));
 if(canOperate('START_MEASUREMENT')){const b=el('button','この品目の消費を確認','row-action');b.onclick=()=>openInformationTask('measurement',item.id);consumption.append(b);}else consumption.append(el('p','消費計測は担当権限のある従業員が更新します。'));
 settings(consumption);
 const handover=el('div','','condition-box unknown');
 handover.append(el('h4',reliabilityConditionLabels.handover),benefit(reliabilityConditionLabels.handover),el('strong','未評価：確認済みの評価結果が必要','condition-state'));
 handover.append(el('p','達成条件：取引先が分かる仕入先名を1件登録。連絡先・URLは任意です。'));
 if(item.catalog?.suppliersSourceItemId&&!item.catalogResolved)handover.append(el('p','仕入先の参照先情報は未提供です。参照を確認してください。'));
 if(canOperate('SAVE_ITEM')){const b=el('button','この品目の仕入情報を編集');b.onclick=()=>{catalogSelection=item.id;catalogDirty=true;tab('catalog');const d=document.querySelector('.catalog-suppliers');if(d)d.open=true;d?.querySelector('input')?.focus();};handover.append(b);}else handover.append(el('p','仕入情報の更新は品目編集権限のある担当者へ依頼してください。'));
 rows.append(handover);
 const delivery=el('div','','condition-box unknown');delivery.append(el('h4','実績納期'),benefit('実績納期'),el('strong','未評価：確認済みの評価結果が必要','condition-state'));
 delivery.append(el('p','記録ベースの参考：'+(Number.isFinite(item.delivery?.leadDays)?item.delivery.leadDays.toFixed(1)+'日':'未計測')),el('p','更新条件：実際の発注と単一全量入荷の対応を確認。定期間隔・次期限は非適用。'),el('p','参考記録の到着日：'+(item.delivery?.receivedOn||'未提供')+' ／ 実到着時刻：未提供'),el('p','発注・入荷の登録日時：標本DTOに未提供'));
 if(!item.delivery)delivery.append(el('p','不足：予定量のある発注と全量入荷の有効な対応。架空入力で埋めません。'));
 const hasOrder=(item.orders||(item.order?[item.order]:[])).some(o=>o.status==='ORDERED');
 if(hasOrder){const b=el('button','未入荷注文・受取の対応を確認');b.onclick=()=>{const d=card.querySelector('.pending-orders');if(d){d.open=true;d.querySelector('summary')?.focus();d.scrollIntoView?.({block:'nearest'});}};delivery.append(b);}else delivery.append(el('p','実際の注文時に上の「発注を記録」。到着時に「入荷を登録」で対象注文を選びます。'));
 rows.append(delivery);
 for(const [label,reason] of [['予測と実物の一致','棚卸で在庫を補正する直前の予測と、数えた実数を比べます。使いかけの残りがない棚卸を対象に、補正前の予測を品目の棚卸単位（袋・本など）の最寄りの整数に揃え、満タンの実数との差が0なら達成です。'],['欠品を防ぐ補充','棚卸数量とアプリの推定在庫が0以下になっていない連続記録が、日本時間で6暦月に達したら達成です。判定できない期間は連続記録に含めません。']]){const condition=el('div','','condition-box unknown');condition.append(el('h4',label),benefit(label),el('strong','未評価：判定条件の確定待ち','condition-state'),el('p',reason));rows.append(condition);}
 if(rating){const byLabel=new Map([...rows.children].map(row=>[row.querySelector('h4')?.textContent,row]));rows.replaceChildren();for(const c of rating.conditions){const row=byLabel.get(reliabilityConditionLabels[c.id]);row.className='condition-box '+({MET:'met',UNMET:'unmet',UNKNOWN:'unknown'}[c.state]);const state=row.querySelector('.condition-state');state.textContent={MET:'✓ 達成：根拠確認済み',UNMET:'未達成',UNKNOWN:'未評価'}[c.state];const evidence=c.evidence;
 if(c.id==='handover'&&c.state==='MET'&&c.reason==='SUPPLIER_REGISTERED'&&Array.isArray(evidence?.supplierNames)){
  state.textContent='✓ 達成：仕入先を登録済み';
  row.append(el('p','仕入先：'+evidence.supplierNames.join(' ／ ')+(evidence.source==='INHERITED_CATALOG'?'（参照元から）':'')));
 }
 if(evidence&&['stocktake','consumption'].includes(c.id)){
  if(c.id==='stocktake'&&Number.isSafeInteger(evidence.fullUnits)&&typeof evidence.packageLabel==='string')row.append(el('p','満タン：'+evidence.fullUnits+' '+evidence.packageLabel+' ／ 総残量は未計測'));
  if(c.id==='stocktake'&&Number.isFinite(evidence.quantity)&&evidence.baseUnit)row.append(el('p','棚卸総量：'+measurementQuantity(evidence.quantity,evidence.baseUnit)));
  if(c.id==='consumption'){if(Number.isFinite(evidence.amount)&&evidence.baseUnit)row.append(el('p','使用量：'+measurementQuantity(evidence.amount,evidence.baseUnit)));row.append(el('p','実測開始日時：'+conditionTime(evidence.startedAt)));}
  for(const p of row.querySelectorAll('p')){
   if(p.textContent.startsWith('登録日時：'))p.textContent='登録日時：'+conditionTime(evidence.recordedAt);
   if(p.textContent.startsWith('実測終了日時：'))p.textContent='実測終了日時：'+conditionTime(evidence.observedAt);
   if(p.textContent.startsWith('次期限：')&&evidence.dueAt)p.textContent='次期限：'+conditionTime(evidence.dueAt);
   if(c.id==='consumption'&&p.textContent.startsWith('実績：')&&Number.isFinite(evidence.rate))p.textContent='評価対象の実測：'+measurementQuantity(evidence.rate,evidence.baseUnit)+'/日（最新の実測1区間）';
  }
 }
 if(c.id==='delivery'&&c.state==='MET'&&c.reason==='VERIFIED_ORDER_RECEIPT_PAIR'&&evidence?.observedPrecision==='DATE'&&evidence.leadTimeBasis==='ORDER_REGISTRATION_TO_REPORTED_RECEIPT_DATE'){
  const day=evidence.receivedOn,midnight=typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)?Date.parse(day+'T00:00:00.000Z'):NaN;
  if(Number.isFinite(midnight)&&new Date(midnight).toISOString().slice(0,10)===day)row.append(el('p','評価に使用した入荷日：'+day+'（日付のみ）'));
  if(Number.isFinite(evidence.registeredLeadDays)&&evidence.registeredLeadDays>=0)row.append(el('p','確認済みの発注・入荷記録に基づく納期目安：'+evidence.registeredLeadDays.toFixed(1)+'日'));
 }
 if(c.id==='agreement'&&evidence?.kind==='EXACT_PRECOUNT'&&typeof evidence.packageLabel==='string'&&evidence.resolution===1&&[evidence.predicted,evidence.actual,evidence.difference].every(Number.isFinite)){
  const quantity=v=>String(v)+' '+evidence.packageLabel;
  row.append(el('p','比較日時：'+conditionTime(evidence.at)),
   el('p','判定用の補正前予測（1 '+evidence.packageLabel+' 単位）：'+quantity(evidence.predicted)+' ／ 満タンの実数：'+quantity(evidence.actual)+' ／ 差（実数−判定用予測）：'+quantity(evidence.difference)));
 }
 if(c.id==='replenishment'&&evidence?.kind==='APP_NONZERO_STREAK'){
  const start=conditionDate(evidence.start),end=conditionDate(evidence.end);
  if(start!=='未提供'&&Number.isSafeInteger(evidence.elapsedMonths)&&evidence.elapsedMonths>=0&&Number.isSafeInteger(evidence.remainingDays)&&evidence.remainingDays>=0){
   const years=Math.floor(evidence.elapsedMonths/12),months=evidence.elapsedMonths%12,days=evidence.remainingDays;
   const duration=(years?years+'年':'')+(months?months+'か月':'')+(days?days+'日':'');
   if(c.reason==='APP_NONZERO_STREAK_ACCUMULATING')state.textContent='記録を蓄積中';
   row.append(el('p','対象期間：'+start+'〜'+end+' ／ '+(duration?duration+'連続':'本日から記録')));
   if(c.reason==='APP_NONZERO_STREAK_ACCUMULATING'&&conditionDate(evidence.eligibilityAt)!=='未提供')row.append(el('p','6か月に達する日：'+conditionDate(evidence.eligibilityAt)));
  }else row.append(el('p','対象期間：開始日を確認できません（判定日：'+end+'）'));
  if(evidence.at)row.append(el('p','0を確認した日時：'+conditionTime(evidence.at)));
 }
 if(c.reason&&c.state!=='MET')row.append(el('p','理由：'+reliabilityReason(c),'condition-reason'));rows.append(row);}}
 layoutReliabilityRows(rows);
 box.append(rows);
 const detail=el('details','','level-conditions');
 if(rating){/* Reasons are already adjacent to each condition. */}
 else{detail.append(el('summary','未判定の理由'),el('p',g.evaluation?.reason==='FLAGGED_INPUT_HISTORY'?'試験・初期化・転記由来の履歴があります。':'在庫基準・入荷・消費・単位の由来と、実数との継続照合は未評価です。'),el('p','評価データを確認できるまで星は表示しません。'));}if(!rating)box.append(detail);
 if(item.forecast)renderConsumption(box,item);card.append(box);
}
function renderAttributeLevel(node,item){
 const data=item?.guidance?.attributes;if(!data)return;
 const box=el('details','','attribute-level');box.append(el('summary','登録項目 '+data.filled+' / '+data.total+'：不足を確認'));
 box.append(el('p','適用される属性のうち、有効な値がある項目数です。各項目1つ、回数では増えません。予測精度の点数ではありません。登録済みでも実物との一致を保証しません。','muted'));
 const states={FILLED:'登録済み',MISSING:'未入力',UNMEASURED:'未計測',REVIEW:'要確認',NOT_APPLICABLE:'非適用'};
 for(const a of data.items){
  const row=el('div','','attribute-row');row.append(el('strong',a.label),el('span',states[a.state]));
  if(a.state!=='FILLED'&&a.state!=='NOT_APPLICABLE'){
   if(a.action==='catalog'){const b=el('button','入力欄へ');b.onclick=()=>{const labels={units:'在庫の基準単位',productCode:'商品コード・型番',manufacturer:'メーカー名',suppliers:'仕入先名'};const input=node.querySelector('[aria-label="'+labels[a.key]+'"]');if(input){const d=input.closest('details');if(d)d.open=true;input.focus();}else{const details=node.querySelector('.catalog-suppliers');if(details)details.open=true;const add=[...node.querySelectorAll('button')].find(b=>b.textContent==='仕入先を追加');add?.focus();message('仕入先を追加して入力してください。');}};row.append(b);}
   else if(a.action==='delivery')row.append(el('small','実際に注文→入荷→受取完了。予定量がある単一全量入荷のみ。架空の注文は不要です。'));
   else{const b=el('button',a.action==='count'?'棚卸へ':'消費計測へ');b.onclick=()=>openInformationTask(a.action,item.id);b.disabled=!canOperate(a.action==='count'?'COUNT_STOCK':'START_MEASUREMENT');row.append(b);}
  }
  box.append(row);
 }
 node.append(box);
}

function renderStockCards(){
 $('cards').replaceChildren();
 if(!view.items.some(i=>i.active!==false))$('cards').append(el('p','現行の品目がありません。「仕入品情報」タブから登録するか、使用終了の品目を現行に戻してください。'));
 const shown=view.items.filter(i=>i.active!==false&&matchesItem(i,stockCategory,stockSearch)).filter(i=>filter==='all'||filter==='low'&&needsOrder(i)||filter==='ordered'&&(i.orders||[i.order]).some(o=>o?.status==='ORDERED'));
 shown.sort((a,b)=>(a.guidance?.tasks[0]?.priority??99)-(b.guidance?.tasks[0]?.priority??99));
 for(const item of shown){
 if(stockCards.has(item.id)){$('cards').append(stockCards.get(item.id));continue;}
 const held=predictionHeld(item);const c=el('article','','card');c.append(el('p',categoryOf(item),'eyebrow'),el('h3',item.name));
 const hero=el('div','','stock-hero'),amount=el('div','','stock-amount'),level=reliabilityHeading(item);
 amount.append(el('p',inventoryQuantityLabel(item),'qty'),el('small','推定在庫'));
 if(confirmedReliability(item)?.conditions.some(c=>c.id==='stocktake'&&c.reason==='OPENED_REMAINDER_UNMEASURED'))amount.append(el('small','総残量は未計測','muted'));
 hero.append(amount,level);c.append(hero);renderItemAlert(c,item);

 renderDailyTasks(c,item);
 const operations=el('div','','stock-operations');c.append(operations);
 const orders=item.orders||(item.order?[item.order]:[]);
 const pendingOrders=orders.filter(o=>o.status==='ORDERED');
 const orderDetails=el('details','','pending-orders');
 if(pendingOrders.length){operations.append(el('p','発注済み・入荷待ち（'+pendingOrders.length+'件）','pending-order-notice'));orderDetails.append(el('summary','注文の明細・入荷との照合'));}
 for(const order of pendingOrders){
 orderDetails.append(el('p',order.actor+'が発注済み'+(order.at?' ／登録日時 '+conditionTime(order.at) :'')));
 if(!order.plannedLine)orderDetails.append(el('p','発注数量：未記入'));
 orderDetails.append(el('p','到着予定日：'+(order.expectedOn||'不明')));
 renderReceiptLink(orderDetails,item,order);
 if(order.plannedLine)orderDetails.append(el('p','発注数量 '+order.plannedLine.quantity+' '+(item.units.find(u=>u.id===order.plannedLine.unitId)?.label||order.plannedLine.unitId)+'（'+quantities(order.plannedLine.amount,item.baseUnit)+'）'));
 }
 if(view.permissions.includes('inventory.order')){
 const b=el('button','発注を記録','primary');
 b.onclick=()=>{
  // 確認を先に済ませてから入力欄を作る。拒否した場合は画面も保存状態も変更しない。
  const notLow=!needsOrder(item);
  if((notLow||pendingOrders.length)&&!confirm((pendingOrders.length?'未入荷の発注が'+pendingOrders.length+'件あります。同じ発注の重複登録でないことを確認してください。\n':'')+item.name+(predictionHeld(item)?'：予測は参考・要確認です。現物と未入荷注文を確認したうえで、実際の発注を記録しますか？':notLow?'：要発注ではありませんが、発注しますか？':'：別の発注を記録しますか？')))return;
  b.disabled=true;
  const box=el('div','','line'),row=addLine(item.id,box,true);
  const dateLabel=el('label','到着予定日（任意）'),date=el('input','');
  date.type='date';date.setAttribute('aria-label','到着予定日（任意）');dateLabel.append(date);box.append(dateLabel);
  const save=el('button','発注済みにする','primary');
  save.onclick=()=>{
   const line=row.requestLine();
   if(line&&(!Number.isSafeInteger(line.quantity)||line.quantity<1)){message('発注数量を確認してください。');return;}
   if(date.value&&!/^\d{4}-\d{2}-\d{2}$/.test(date.value)){message('到着予定日を確認してください。');return;}
   send({type:'MARK_ORDERED',itemId:item.id,...(line?{line}:{}),...(date.value?{expectedOn:date.value}:{}),...(notLow?{confirmNotLow:true}:{})});
  };
  box.append(save);operations.append(box);
 };operations.append(b);}
 const b=el('button','入荷を登録');b.hidden=!canOperate('RECEIVE');b.onclick=()=>{$('lines').replaceChildren();addLine(item.id);tab('receiving');};operations.append(b);if(pendingOrders.length)operations.append(orderDetails);const detail=c.querySelector?.('.level-journey')||c.querySelector?.('.forecast-explanation');const feedback=c.querySelector?.('.quest-feedback');if(feedback)c.append(feedback);if(detail)c.append(detail);stockCards.set(item.id,c);$('cards').append(c);
 }
 if(view.items.some(i=>i.active!==false)&&!shown.length)$('cards').append(el('p','条件に合う品目がありません。カテゴリ・検索・発注状態の条件を変更してください。','muted'));
}
/** 隠れている履歴100件を毎回DOM化しない。タブを初めて開いた時に最新DTOを描く。 */
function appendCatalogHistory(row,change){
 const details=el("details","");details.append(el("summary","仕入品情報の変更前後"));
 details.append(el("p",change.inherited?"参照元の変更に連動した記録です。履歴時点の情報を固定して保存しています。":"履歴時点の情報です。後で仕入先を変更しても、この記録は変わりません。","muted"));
 for(const [label,c]of [["変更前",change.before],["変更後",change.after]]){
  details.append(el("h4",label));if(!c){details.append(el("p","未登録"));continue;}
  details.append(el("p","品名："+c.name),el("p","状態："+(c.status==="RETIRED"?"使用終了":"現行")));
  if(c.manufacturer)details.append(el("p","製造元："+[c.manufacturer.name,c.manufacturer.contact,c.manufacturer.url,c.manufacturer.notes].filter(Boolean).join(" ／ ")));
  details.append(el("p","仕入先："+(c.suppliers||[]).map(p=>[p.name,p.contact,p.url,p.notes].filter(Boolean).join(" ／ ")).join("、")));
  if(c.units)details.append(el("p","規格："+c.units.map(u=>"1"+u.label+"＝"+u.quantity+" "+(c.units.find(x=>x.id===u.childUnitId)?.label||u.childUnitId)).join(" ／ ")));
  if(c.storage)details.append(el("p","保管方法："+c.storage));if(c.specNotes)details.append(el("p","規格補足："+c.specNotes));
 }
 row.append(details);
}
function renderHistory(){
 historyDirty=false;
 $('logs').replaceChildren();
 for(const log of view.history){const names={CATALOG_REFERENCE_CHANGED:'参照元に連動した仕入情報の変更',SAVE_ITEM:'仕入品情報・規格の更新',START_MEASUREMENT:'消費の計測開始',RECORD_MEASUREMENT:'期間の消費記録',UPDATE_MEASUREMENT:'消費の確認・完了',CANCEL_MEASUREMENT:'消費計測の取消',START_SAMPLE:'消費速度の計測開始',FINISH_SAMPLE:'消費速度の計測完了',CANCEL_SAMPLE:'計測取消',COUNT_STOCK:'在庫基準の補正',COUNT_PACKAGES_OBSERVED:'満タンの数の記録（総残量は未計測）',SET_FORECAST:'発注期限の設定',RECEIVE:'入荷',MARK_ORDERED:'発注済み記録',CANCEL_ORDERED:'発注済みの取消し',COMPLETE_CASE:'受取完了'};const row=el('article','','line');row.append(el('p',names[log.type]||'記録'),el('p',formatRecordedAt(log.at),'muted'));if(log.catalogChange)appendCatalogHistory(row,log.catalogChange);if(log.stocktakePackages)row.append(el('p','満タン：'+log.stocktakePackages.fullUnits+' '+log.stocktakePackages.label));if(log.measurement){const m=log.measurement;if(m.usedAmount!==null)row.append(el('p','累計投入 '+measurementQuantity(m.usedAmount,itemsById.get(log.itemId)?.baseUnit)));if(m.endedAt)row.append(el('p','計測期間 '+formatRecordedAt(m.startedAt)+'〜'+formatRecordedAt(m.endedAt),'muted'));}for(const l of log.lines){const i=itemsById.get(l.itemId);row.append(el('p',(i?.name||'品目')+' '+quantities(l.amount,i?.baseUnit)));}$('logs').append(row);}
 if(!view.history.length)$('logs').append(el('p','まだ記録はありません。','muted'));
}
/** 一品目一行。単位/換算版を読み取った値で送り、サーバー側で再検証する。 */
function addLine(itemId,container=$('lines'),ordering=false){
 if(!view.items.some(i=>i.active!==false)){message('先に「仕入品情報」タブで品目と包装規格を登録してください。');return null;}
 const row=el('div','','line');const item=el('select','');item.setAttribute('aria-label','入荷品目');
 for(const i of view.items.filter(i=>i.active!==false&&(!ordering||i.id===itemId)))item.append(new Option(i.name,i.id));
 if(itemId)item.value=itemId;
 const count=el('input','');count.type='number';count.min='1';count.max='1000';count.step='1';count.value=ordering?'':'1';count.required=!ordering;count.placeholder=ordering?'未記入でも可':'';count.setAttribute('aria-label',ordering?'発注数量（任意）':'入荷数量');
 const unit=el('select','');unit.setAttribute('aria-label','入荷単位');const hint=el('p','','muted');
 const orderNotice=el('p','','muted');orderNotice.setAttribute('role','status');
 const updateHint=()=>{const i=itemsById.get(item.value),u=i.units.find(x=>x.id===unit.value);orderNotice.textContent=!ordering&&canOperate('RECEIVE')&&!canOperate('RECEIVE',{completeCaseId:'selection'})&&i.orders?.length?'入荷のみ記録し、注文は未完了のままです。注文との照合は発注権限のある担当者へ。入荷を重ねて登録しないでください。':'';if(ordering&&count.value===''){hint.textContent='発注数量：未記入';return;}hint.textContent='1'+u.label+' '+quantities(u.baseQuantity,i.baseUnit)+(ordering?' ／発注量 ':' ／加算 ')+quantities(Number(count.value)*u.baseQuantity,i.baseUnit);};
 const updateUnit=()=>{const i=itemsById.get(item.value);unit.replaceChildren();for(const u of i.units)unit.append(new Option(u.label,u.id));updateHint();};
 item.onchange=updateUnit;unit.onchange=updateHint;count.oninput=updateHint;updateUnit();
 const remove=el('button','この行を削除');remove.type='button';remove.onclick=()=>row.remove();
 row.append(item,count,unit,hint,orderNotice);if(!ordering)row.append(remove);row.requestLine=()=>{if(ordering&&count.value.trim()==='')return null;const i=itemsById.get(item.value),u=i.units.find(x=>x.id===unit.value);return {itemId:i.id,quantity:Number(count.value),unitId:u.id,conversionVersion:u.version};};container.append(row);return row;
}
const errors={RECOVERY_NEW_ACTION_REQUIRED:'今回の入力は送信していません。前の保存結果を確認し、必要なら改めて操作してください。',LINK_QUANTITY_UNSUPPORTED:'分納・数量違い・予定量未記入の注文は、この照合では完了できません。入荷を重ねて登録しないでください。',RECEIPT_NOT_LINKABLE:'この入荷と注文の記録を照合できません。最新の記録を確認してください。',RECEIPT_ALREADY_LINKED:'この入荷は別の注文と照合済みです。再入荷登録しないでください。',INVALID_CATALOG_REFERENCE:'参照元は同じ店舗の商品を選んでください。自身への参照や循環参照は保存できません。',BASE_UNIT_CHANGED:'在庫の履歴がある品目の基準単位は変更できません。別品目として登録してください。',INVALID_CATALOG:'品名・URL・文字数など、仕入品情報の入力を確認してください。',INVALID_UNIT_GRAPH:'包装の数量・単位名・つながりを確認してください。循環や基準単位の整数に換算できない設定は保存できません。',CATALOG_CHANGED:'別の端末で規格が更新されました。最新の記録を読み直してください。',INVALID_MEASUREMENT:'量と単位を確認してください。袋数0では使いかけ分を計れません。',FUTURE_MEASUREMENT:'未来の日時は記録できません。',MEASUREMENT_OVERLAP:'同じ品目の計測期間が重複しています。現在の計測を更新するか、期間を確認してください。',MEASUREMENT_NOT_FOUND:'対象の計測が見つかりません。最新の記録を読んでください。',MEASUREMENT_CHANGED:'他の操作で計測が更新されています。最新の記録を読んでください。',MEASUREMENT_CLOSED:'この計測は既に終了・取消されています。',ACTION_REMOVED:'画面を再読み込みして新しい標本計測を使ってください。',PACK_ALREADY_OPEN:'この品目は既に計測中です。',PACK_CHANGED:'計測状態が変わりました。最新の画面を確認してください。',INVALID_DURATION:'開始と終了の時刻を確認してください。',ORDER_CONFIRMATION_REQUIRED:'在庫が更新され要発注ではなくなりました。再度確認して記録してください。',ORDER_CHANGED:'発注内容が更新されました。最新の記録を確認してください。',NOT_ORDERED:'この記録は既に取り消されています。',CASE_CLOSED:'この発注は受取完了しています。',ALREADY_ORDERED:'他の発注済み記録があります。最新状態を確認してください。',CONVERSION_CHANGED:'単位換算が更新されています。再読取してください。',INVALID_COMPLETION:'受取完了の発注と入荷品目が一致しません。',FORBIDDEN:'操作権限を確認できません。',INVALID_LINE:'品目の重複や数量を確認してください。',FUTURE_RECEIPT:'届いた日には今日以前を指定してください。'};
/** 通信失敗なら操作IDを保持。成功後は原簿読戻し済みDTOを使用し、旧APIだけ別READする。 */
async function send(command){
 if(busy||(!view&&!pending))return;
 if(pending&&command)return;
 if(command&&globalThis.TlhInventory?.hasPendingReceipt?.()===true){message('未確認の保存があります。先に保存済みか確認してください。','RECOVERY_NEW_ACTION_REQUIRED');return;}
 // Only gate new input locally. Unknown pending recovery retains its ID and uses current server authorization.
 if(command&&!canOperate(command.type,command)){message('この操作を保存する権限がありません。');return;}
 if(command)pending={...command,operationId:crypto.randomUUID(),storeId:view.storeId};
 if(!pending)return;
 lock(true);$('recovery').hidden=true;message('保存結果を確認しています…');
 const receiptLeavesOrders=pending.type==='RECEIVE'&&!pending.completeCaseId&&view?.items?.some(i=>i.orders?.length&&pending.lines.some(l=>l.itemId===i.id))&&(view?.receivingEnabled===true||!canOperate('RECEIVE',{completeCaseId:'selection'}));
 const receiptCanLink=receiptLeavesOrders&&canOperate('LINK_RECEIPT_TO_ORDER');
 let saved=false;
 // The recovery module clears pending before returning a confirmed status.
 const retryContext=command?null:{type:pending.type,itemId:pending.itemId,storeId:pending.storeId,operationId:pending.operationId};
 try {
 const result = command ? await TlhInventory.request('COMMAND', pending) : await TlhInventory.confirmPending();
 const data = result.ok ? {result: result.value, view: result.value.view} : {code: result.code, recovered: result.recovered};
 const res = {ok: result.ok, status: ['UNAVAILABLE','SAVE_UNKNOWN','BUSY','AUTH_UNAVAILABLE','RECOVERY_UNKNOWN','RECOVERY_ACTOR_MISMATCH','RECOVERY_STORAGE_UNAVAILABLE','RECOVERY_LOCK_UNAVAILABLE','RECOVERY_IDENTITY_UNAVAILABLE','RECOVERY_UNAVAILABLE'].includes(data.code) ? 503 : 403};
 if(!res.ok){
  if(res.status>=500)throw Error('UNKNOWN');
  // Recovery transport confirms historical saving; it does not execute another COMMAND.
  if(data.code==='RECOVERY_SAVED'){
   const matched=retryContext&&data.recovered?.operationId===retryContext.operationId
     &&data.recovered.storeId===retryContext.storeId;
   saved=true;pending=null;await load(matched?retryContext.storeId:undefined);
   const restored=matched&&view?.storeId===retryContext.storeId&&['SAVE_ITEM','SYNC_CATALOG'].includes(retryContext.type);
   if(restored&&retryContext.type==='SAVE_ITEM'){
    const item=view.items.find(item=>item.id===retryContext.itemId);
    if(item){catalogSelection=item.id;catalogFilter=item.active===false?'RETIRED':'CURRENT';catalogDirty=true;}
   }
   $('lines').replaceChildren();addLine();tab(restored?'catalog':'stock');
   message('保存済みを確認しました。再送せず、最新の記録を表示しました。');return;
  }
  if(data.code==='CSRF_REJECTED'){message('サーバーが再起動しています。操作IDを保ったまま最新状態を取得して再確認してください。');await load();$('recovery').hidden=false;return;}
  // サーバーが明示的に拒否した保存は未確定ではない。続くREADの失敗と混同しない。
  const packItem=pending.type==='COUNT_STOCK'&&pending.packCount?pending.itemId:null;
  pending=null;try{await load();}catch{view=null;}
  const oldPackServer=packItem&&data.code==='INVALID_LINE'&&view&&!itemsById.get(packItem)?.stocktakeUnitId;
  message(oldPackServer?'包装単位の棚卸を保存できませんでした。最新の画面で棚卸単位を確認してください。':errors[data.code]||'保存できませんでした。',data.code||'UNAVAILABLE');return;
 }
 saved=true;
 if(pending.type==='SAVE_ITEM'){catalogSelection=pending.itemId;catalogFilter=pending.catalog.status==='RETIRED'?'RETIRED':'CURRENT';}
 const requestedCountUnit=pending.type==='SAVE_ITEM'?pending.stocktakeUnitId:undefined;
 const packagesOnly=data.result?.stocktakeBasis==='PACKAGES_ONLY',packageMessage='満タンの数を記録しました。総残量は未計測のため、在庫の基準量は補正していません。';
 const savedType=pending.type,savedItemId=pending.itemId,previousRating=pending.itemId?itemsById.get(pending.itemId):null;
 const savedTab=['SAVE_ITEM','SYNC_CATALOG'].includes(pending.type)?'catalog':'stock';
 if(['RECEIVE','MARK_ORDERED','COUNT_STOCK','START_MEASUREMENT','UPDATE_MEASUREMENT','RECORD_MEASUREMENT','CANCEL_MEASUREMENT'].includes(pending.type))stockAction='overview';
 pending=null;
 // 署名検証済みの保存応答に、原簿読戻し後の画面があれば再通信を省く。旧APIはREADへ戻る。
 if(data.view){view=data.view;render();}else await load();
 let inlineFeedback=null;
 if(['COUNT_STOCK','START_MEASUREMENT','UPDATE_MEASUREMENT','RECORD_MEASUREMENT','SAVE_ITEM'].includes(savedType)){
 const feedbackItem=itemsById.get(savedItemId),feedbackNode=stockCards.get(savedItemId)?.querySelector('.quest-feedback');
 if(feedbackItem&&feedbackNode){
  inlineFeedback=feedbackNode;feedbackNode.hidden=false;const savedMessage=savedType==='SAVE_ITEM'?'品目情報を更新しました':savedType==='COUNT_STOCK'?(packagesOnly?packageMessage:'棚卸を登録しました'):savedType==='START_MEASUREMENT'?'計測を開始しました（実測は継続中）':'消費の計測を更新しました';feedbackNode.replaceChildren(el('div',savedMessage));
 const current=confirmedReliability(feedbackItem);if(current)feedbackNode.append(el('p',reliabilityChange(previousRating,feedbackItem),'reliability-feedback'));
 }}
 $('lines').replaceChildren();addLine();tab(savedTab);
 // A successful action can cause a filtered item to disappear. Announce success in exactly one place.
 const countUnitMissing=requestedCountUnit!==undefined&&(!view||view.stocktakePackageCount!==true||(itemsById.get(savedItemId)?.stocktakeUnitId||null)!==requestedCountUnit);
 const useInline=inlineFeedback?.isConnected&&!inlineFeedback.closest('[hidden]')&&['COUNT_STOCK','START_MEASUREMENT','UPDATE_MEASUREMENT','RECORD_MEASUREMENT'].includes(savedType);
 if(useInline)message('');else message(data.result?.catalogSync?.ok===false?'アプリへの保存は完了しましたが、一覧シートの同期を確認できません。「一覧シートへ再同期」を押してください。':packagesOnly?packageMessage:'保存しました。最新記録を確認しました。',data.result?.catalogSync?.ok===false?'CATALOG_SYNC_REQUIRED':'');
 if(countUnitMissing)message('品目情報は保存されましたが、棚卸単位の変更を確認できません。最新の画面で設定を確認してください。','STOCKTAKE_UNIT_UNCONFIRMED');
 if(receiptLeavesOrders)message(receiptCanLink?'入荷は保存しました。注文は未完了です。発注済み注文の「登録済みの入荷と照合」で確認してください。再入荷登録は不要です。':'入荷は保存しました。注文は未完了です。発注権限のある担当者に登録済み入荷との照合を依頼してください。再入荷登録は不要です。');
 }catch{
  if(saved){message('保存は成功しましたが表示の更新に失敗しました。「最新の記録を読む」を押してください。','SAVE_VIEW_FAILED');}
  else{message('保存結果が不明です。同じ操作を再確認してください。','SAVE_UNKNOWN');$('recovery').hidden=false;}
 }finally{lock(false);}
}
/** 仕入品フォームはタブを開くまで構築しない。DOMのみ保持し、端末保存はしない。 */
function renderCatalog(){
 const host=$('catalog-content');if(!host||!view||!catalogDirty)return;catalogDirty=false;host.replaceChildren();
 const filterLabel=el("label","表示する品目"),scope=el("select","");scope.append(new Option("現行のみ","CURRENT"),new Option("使用終了のみ","RETIRED"),new Option("すべて","ALL"));scope.value=catalogFilter;filterLabel.append(scope);host.append(filterLabel);
 const categoryHost=el("div","");host.append(categoryHost);
 const choiceLabel=el("label","登録・編集する仕入品"),choice=el("select","");
 const fillChoices=()=>{choice.replaceChildren(new Option("新しい仕入品を登録","new"));
  for(const item of view.items.filter(i=>matchesItem(i,catalogCategory,catalogSearch)).filter(i=>scope.value==="ALL"||(i.active===false?scope.value==="RETIRED":scope.value==="CURRENT")))choice.append(new Option(item.name+(item.active===false?"（使用終了）":item.catalog?"":"（仕入情報未登録）"),item.id));
  choice.value=[...choice.children].some(o=>o.value===catalogSelection)?catalogSelection:"new";
 };fillChoices();choiceLabel.append(choice);host.append(choiceLabel);
 const editor=el('div','','card');host.append(editor);
 const drafts=new Map();
 function edit(){
  for(const [id,node]of drafts)node.hidden=id!==choice.value;
  if(drafts.has(choice.value))return;
  const item=itemsById.get(choice.value),c=item?.catalogResolved||item?.catalog||{},node=el('div','','catalog-edit-form');drafts.set(choice.value,node);editor.append(node);
  if(!canOperate('SAVE_ITEM')){node.append(el('p','この情報を変更する権限がありません。'));return;}
  const field=(parent,label,value='',multiline=false)=>{
   const box=el('label',label),input=el(multiline?'textarea':'input','');input.value=value;input.setAttribute('aria-label',label);input.maxLength=multiline?2000:1500;if(!multiline)input.type='text';box.append(input);parent.append(box);return input;
  };
  node.append(el('h3',item?'仕入品の情報を編集':'新しい仕入品'));
  renderAttributeLevel(node,item);
  const statusGroup=el('div','','catalog-edit-panel catalog-status-panel');node.append(statusGroup);
  const statusLabel=el('label','品目の状態'),status=el('select','');status.append(new Option('現行（在庫管理・アラートの対象）','CURRENT'),new Option('使用終了（履歴として保存）','RETIRED'));status.value=item?.active===false?'RETIRED':'CURRENT';statusLabel.append(status);statusGroup.append(statusLabel,el('p','使用終了の品目は在庫一覧・消費計測・発注アラートに出しません。在庫数と履歴は残ります。現行に戻して再開する時は、棚卸で残量を確認してください。','muted'));
  const manage=view.permissions.includes('inventory.manage'),canSetStocktakeUnit=manage&&view.stocktakePackageCount===true;
  let stocktakeDays,consumptionDays,stocktakeUnitSelection=item?.stocktakeUnitId||'';const naChecks=[];
  if(manage){
   const settings=el('details','','review-settings catalog-edit-panel');settings.append(el('summary','管理者：実施間隔・適用項目'));node.append(settings);
   settings.append(el('p','棚卸と消費速度の再確認だけを設定します。入荷・発注は発生時に記録します。空欄で棚卸は既定7日、消費の再確認は設定なし。','muted'));
   stocktakeDays=appendNumberField(settings,'棚卸間隔（日・空欄は既定7日）',c.reviewPolicy?.stocktakeDays??'');
   consumptionDays=appendNumberField(settings,'消費速度の再確認間隔（日・空欄は設定なし）',c.reviewPolicy?.consumptionDays??'');
   for(const input of [stocktakeDays,consumptionDays]){input.min='1';input.max='365';input.step='1';}
   settings.append(el('p','実際に該当しない属性だけ非適用にしてください。不明・未入力を隠すためには使いません。','muted'));
   for(const [key,label] of [['productCode','商品コード'],['manufacturer','メーカー'],['suppliers','仕入先']]){const wrap=el('label',''),input=el('input','');input.type='checkbox';input.checked=(c.notApplicable||[]).includes(key);wrap.append(input,el('span',label+'は非適用'));settings.append(wrap);naChecks.push({key,input});}
  }
  const identity=el('div','','catalog-edit-panel');identity.append(el('h4','基本情報'));node.append(identity);
  const name=field(identity,'品名（必須）',item?.name||'');
  const categoryLabel=el('label','カテゴリ'),category=el('select','');category.setAttribute('aria-label','カテゴリ');
  category.append(new Option('未分類（あとで設定）',''));for(const label of productCategories)category.append(new Option(label,label));
  const previousCategory=canonicalCategory(c.category||'');
  if(previousCategory&&!productCategories.includes(previousCategory))category.append(new Option(previousCategory+'（以前の分類）',previousCategory));
  category.value=previousCategory;categoryLabel.append(category);identity.append(categoryLabel,el('p','主な種類・用途を1つ選びます。冷凍・常温は「保管方法」に記入してください。','muted'));
  const alias=field(identity,'店内での呼び名',c.alias||''),code=field(identity,'商品コード・型番',c.productCode||'');
  const manufacturer=el('details','','catalog-edit-panel');manufacturer.append(el('summary','製造元・メーカー'));node.append(manufacturer);
  const m=c.manufacturer||{},mName=field(manufacturer,'メーカー名',m.name||''),mContact=field(manufacturer,'メーカー連絡先・担当',m.contact||''),mUrl=field(manufacturer,'メーカーURL',m.url||''),mNotes=field(manufacturer,'メーカー備考',m.notes||'',true);
  const partyReference=(parent,label,value,part)=>{
   const box=el("label",label),select=el("select","");select.setAttribute("aria-label",label);select.append(new Option("この商品で直接入力",""));
   for(const candidate of view.items)if(candidate.id!==item?.id&&candidate.catalog)select.append(new Option(candidate.name+(candidate.active===false?"（使用終了）":"")+"と同じ",candidate.id));select.value=value||"";box.append(select);parent.append(box);
   parent.append(el("p","参照元の情報を変更すると、この商品にも連動します。連動を外す場合は「この商品で直接入力」に戻してください。","muted"));
   return select;
  };
  const manufacturerSource=partyReference(manufacturer,"製造元を別の商品と同じにする",c.manufacturerSourceItemId,"manufacturer");
  const updateManufacturer=()=>{
   const source=itemsById.get(manufacturerSource.value),party=source?(source.catalogResolved||source.catalog).manufacturer:null;
   if(party){mName.value=party.name;mContact.value=party.contact;mUrl.value=party.url;mNotes.value=party.notes;}
   for(const input of [mName,mContact,mUrl,mNotes])input.readOnly=Boolean(manufacturerSource.value);
  };
  manufacturerSource.onchange=updateManufacturer;updateManufacturer();
  const supplierBox=el('details','','catalog-suppliers catalog-edit-panel');supplierBox.append(el('summary','仕入先・注文先（複数登録可）'));node.append(supplierBox);const suppliers=[];
  const addSupplier=p=>{
   if(suppliers.length>=5){message('仕入先は1品目につき5件までです。');return;}
   const row=el('div','','catalog-party');supplierBox.append(row);
   const entry={row,name:field(row,'仕入先名',p?.name||''),contact:field(row,'仕入先連絡先・担当',p?.contact||''),url:field(row,'注文先URL',p?.url||''),notes:field(row,'仕入先備考',p?.notes||'',true)};
   suppliers.push(entry);const remove=el('button','この仕入先を外す');remove.type='button';entry.remove=remove;remove.onclick=()=>{if(supplierSource.value)return;suppliers.splice(suppliers.indexOf(entry),1);row.remove();};row.append(remove);
  };
  for(const p of c.suppliers||[])addSupplier(p);
  const addParty=el('button','仕入先を追加');addParty.type='button';addParty.onclick=()=>{if(supplierSource.value)return;addSupplier();lock(busy);};supplierBox.append(addParty);
  const supplierSource=partyReference(supplierBox,"仕入先を別の商品と同じにする",c.suppliersSourceItemId,"suppliers");
  const updateSuppliers=()=>{
   const source=itemsById.get(supplierSource.value),parties=source?(source.catalogResolved||source.catalog).suppliers:null;
   if(parties){for(const p of suppliers)p.row.hidden=true;suppliers.length=0;for(const p of parties)addSupplier(p);}
   for(const p of suppliers){for(const key of ["name","contact","url","notes"])p[key].readOnly=Boolean(supplierSource.value);p.remove.hidden=Boolean(supplierSource.value);}
   addParty.hidden=Boolean(supplierSource.value);
  };
  supplierSource.onchange=updateSuppliers;updateSuppliers();
  const packaging=el('div','','catalog-edit-panel catalog-packaging');packaging.append(el('h4','包装・内容量のつながり'));node.append(packaging);
  const baseLabel=el('label','在庫の基準単位'),base=el('select','');base.setAttribute('aria-label','在庫の基準単位');
  for(const u of ['g','mL','個','本','枚','杯'])base.append(new Option(u,u));base.value=item?.baseUnit||c.baseUnit||'g';baseLabel.append(base);packaging.append(baseLabel);
  packaging.append(el('p','「1ケースには20袋」「1袋には20束」「1束には10g」のように登録します。小さい単位から追加すると選びやすくなります。この例の数字を実商品へ流用せず、規格表示を確認してください。','muted'));
  packaging.append(el('p','重量はg、液体はmL、ストローなどは本数を基準に選びます。gとmLを同じものとして換算しません。在庫操作後は基準単位を変更できません。1包装の換算量は基準単位の正の整数になる設定が必要です。','muted'));
  const rowsHost=el('div','','catalog-units');packaging.append(rowsHost);const unitRows=[];
  let missingUnit,clearMissing;
  if(canSetStocktakeUnit){
   const hint=el('p','棚卸に使う包装単位は1つ選べます。チェックを外すと、棚卸では実測の総量を入力します。','muted');
   packaging.insertBefore(hint,rowsHost);
   missingUnit=el('div','','catalog-count-unit-missing');missingUnit.hidden=true;
   const warning=el('p','棚卸に使う単位が削除されています。別の単位を選ぶか、棚卸単位の指定を解除してください。','muted');warning.setAttribute('role','status');
   clearMissing=el('button','棚卸単位の指定を解除');clearMissing.type='button';clearMissing.onclick=()=>{
    stocktakeUnitSelection='';updateCountUnits();(unitRows[0]?.stocktake||add).focus();
   };
   missingUnit.append(warning,clearMissing);packaging.append(missingUnit);
  }
  const roots=()=>base.value==='g'?[['g',1],['kg',1000]]:base.value==='mL'?[['mL',1],['L',1000]]:[[base.value,1]];
  const updateCountUnits=()=>{
   if(!canSetStocktakeUnit)return;
   for(const r of unitRows){
    r.stocktake.checked=r.id===stocktakeUnitSelection;
    r.stocktake.setAttribute('aria-label','この単位を棚卸に使用する：'+(r.label.value.trim()||'単位名未入力'));
   }
   missingUnit.hidden=!stocktakeUnitSelection||unitRows.some(r=>r.id===stocktakeUnitSelection);
  };
  const updateChoices=()=>{
   updateCountUnits();
   for(const row of unitRows){
    const selected=row.child.value||row.childId;row.child.replaceChildren();for(const [id]of roots())row.child.append(new Option(id,id));
    for(const other of unitRows)if(other!==row)row.child.append(new Option(other.label.value||'名前未入力の単位',other.id));
    row.child.value=selected;row.childId=selected;
   }
   preview();
  };
  const previewBox=el('p','','muted');
  function preview(){
   const amounts=new Map(roots()),visiting=new Set();
   const resolve=id=>{if(amounts.has(id))return amounts.get(id);const r=unitRows.find(u=>u.id===id);if(!r||visiting.has(id))throw Error();visiting.add(id);const n=Number(r.quantity.value)*resolve(r.child.value);visiting.delete(id);if(!Number.isSafeInteger(n)||n<=0)throw Error();amounts.set(id,n);return n;};
   try{previewBox.textContent=unitRows.map(r=>'1'+(r.label.value||'未入力')+'＝'+measurementQuantity(resolve(r.id),base.value)).join(' ／ ');}catch{previewBox.textContent='数量・下位単位を確認してください。循環するつながりや、基準単位まで換算できない設定は保存できません。';}
  }
  const addUnit=u=>{
   if(unitRows.length>=12){message('包装単位は12件までです。');return;}
   const row=el('div','','catalog-unit'),label=field(row,'単位名（袋・ケース・束など）',u?.label||''),quantity=field(row,'1単位に含む数量',u?.quantity??''),childLabel=el('label','その数量の単位'),child=el('select','');quantity.type='number';quantity.min='0';quantity.step='any';childLabel.append(child);row.append(childLabel);
   const entry={id:u?.id||'unit-'+crypto.randomUUID(),label,quantity,child,childId:u?.childUnitId||base.value};unitRows.push(entry);rowsHost.append(row);
   label.oninput=updateChoices;quantity.oninput=preview;child.onchange=()=>{entry.childId=child.value;preview();};
   if(canSetStocktakeUnit){
    const wrap=el('label','','catalog-count-unit-choice'),input=el('input','');
    input.type='checkbox';entry.stocktake=input;wrap.append(input,el('span','この単位を棚卸に使用する'));row.append(wrap);
    input.onchange=()=>{
     if(input.checked)stocktakeUnitSelection=entry.id;
     else if(stocktakeUnitSelection===entry.id)stocktakeUnitSelection='';
     updateCountUnits();
    };
   }
   const remove=el('button','この単位を外す');remove.type='button';remove.onclick=()=>{
    const removedSelected=canSetStocktakeUnit&&stocktakeUnitSelection===entry.id;
    unitRows.splice(unitRows.indexOf(entry),1);row.remove();updateChoices();
    if(removedSelected)clearMissing.focus();
   };row.append(remove);updateChoices();
  };
  base.onchange=()=>updateChoices();
  const original=c.units||item?.units?.map(u=>({id:u.id,label:u.label,quantity:u.quantity??u.baseQuantity,childUnitId:u.childUnitId||'g'}))||[];
  for(const u of original)addUnit(u);
  if(!original.length)addUnit();
  const add=el('button','包装単位を追加');add.type='button';add.onclick=()=>{addUnit();lock(busy);};packaging.append(add,previewBox);
  const info=el('details','','catalog-edit-panel');info.append(el('summary','保管・原材料の補足'));node.append(info);
  const storage=field(info,'保管方法・保管上の注意',c.storage||'',true),allergens=field(info,'アレルゲン表示（商品表示を確認）',c.allergens||''),specNotes=field(info,'規格の補足',c.specNotes||'',true),specUrl=field(info,'規格資料URL',c.specUrl||''),notes=field(info,'その他の備考',c.notes||'',true);
  node.append(el('p','規格を変更しても過去の入荷量・計測開始時の量は変えません。別端末で先に変更された場合は再読込が必要です。','muted'));
  let physicalEntry;
  if(view.physicalSpecEnabled===true&&view.permissions.includes('inventory.catalog')&&view.permissions.includes('inventory.read')){
   const entry=el('label','','physical-spec-entry');physicalEntry=el('input','');physicalEntry.type='checkbox';
   physicalEntry.setAttribute('aria-label','現物を見て登録');entry.append(physicalEntry,el('span','現物を見て登録'));node.append(entry);
  }
  const save=el('button',item?'仕入品情報と規格を更新':'仕入品を登録','primary');
  save.onclick=()=>{
   if(item&&item.active!==false&&status.value==='RETIRED'&&!confirm('この品目を在庫一覧・消費計測・発注アラートの対象から外します。在庫数と履歴は残ります。使用終了にしますか？'))return;
   if(!name.value.trim()){message('品名を入力してください。');return;}
   for(const input of [stocktakeDays,consumptionDays].filter(Boolean))if(input.value!==''&&(!Number.isInteger(Number(input.value))||Number(input.value)<1||Number(input.value)>365)){message('間隔は1〜365の整数か空欄にしてください。');input.focus();return;}
   if(canSetStocktakeUnit&&stocktakeUnitSelection&&!unitRows.some(u=>u.id===stocktakeUnitSelection)){message('棚卸に使う単位を選び直すか、指定を解除してください。');clearMissing.focus();return;}
   const party=p=>({name:p.name.value,contact:p.contact.value,url:p.url.value,notes:p.notes.value});
   send({type:'SAVE_ITEM',...(physicalEntry?.checked===true&&status.value!=='RETIRED'?{physicalSpecObserved:true}:{}),...(canSetStocktakeUnit?{stocktakeUnitId:stocktakeUnitSelection||null}:{}),itemId:item?.id||'item-'+crypto.randomUUID(),expectedRevision:item?.catalogRevision||null,catalog:{...(manage?{reviewPolicy:{stocktakeDays:stocktakeDays.value===''?null:Number(stocktakeDays.value),consumptionDays:consumptionDays.value===''?null:Number(consumptionDays.value)},notApplicable:naChecks.filter(x=>x.input.checked).map(x=>x.key)}:{}),status:status.value,baseUnit:base.value,name:name.value,category:category.value,alias:alias.value,productCode:code.value,
    manufacturerSourceItemId:manufacturerSource.value||undefined,suppliersSourceItemId:supplierSource.value||undefined,manufacturer:{name:mName.value,contact:mContact.value,url:mUrl.value,notes:mNotes.value},suppliers:suppliers.map(party),storage:storage.value,allergens:allergens.value,specNotes:specNotes.value,specUrl:specUrl.value,notes:notes.value,
    units:unitRows.map(r=>({id:r.id,label:r.label.value,quantity:Number(r.quantity.value),childUnitId:r.child.value}))}});
  };node.append(save);
 }
 const refreshCategoryFilter=()=>{
  categoryHost.replaceChildren();const items=view.items.filter(i=>scope.value==='ALL'||(i.active===false?scope.value==='RETIRED':scope.value==='CURRENT'));
  createItemFilters(categoryHost,items,catalogCategory,catalogSearch,(category,query)=>{catalogCategory=category;catalogSearch=query;fillChoices();edit();lock(busy);});
 };
 refreshCategoryFilter();
 scope.onchange=()=>{catalogFilter=scope.value;refreshCategoryFilter();fillChoices();edit();lock(busy);};
 choice.onchange=()=>{catalogSelection=choice.value;edit();lock(busy);};edit();
 const sync=el('button','一覧シートへ再同期');sync.onclick=()=>send({type:'SYNC_CATALOG'});host.append(sync);
 host.append(el('p','一覧シートはアプリの保存内容から作られます。シートを直接編集してもアプリには反映されません。同期に失敗した場合は、ここから再同期できます。','muted'));lock(busy);
}

$('receipt').onsubmit=e=>{e.preventDefault();const lines=[...$('lines').children].map(r=>r.requestLine());if(!lines.length){message('先に仕入品を登録して、入荷する品目を追加してください。');return;}const completeCaseId=$('complete').value||null,derived=completeCaseId&&view?.receivingEnabled===true&&!inventoryCanOperate(view.permissions,'RECEIVE',{completeCaseId});let extra={};if(derived){const order=view.items.flatMap(i=>i.orders||[]).find(o=>o.id===completeCaseId);if(!order?.orderOperationId||!order.plannedLine){message('予定量のある注文を選択してください。');return;}if(!$('receiving-association-confirm')?.checked){message('注文の全量であることを確認し、チェックしてください。');return;}extra={orderOperationId:order.orderOperationId,confirmAssociation:true};}send({type:'RECEIVE',receivedOn:$('day').value,lines,completeCaseId,...extra});};
$('retry').onclick=()=>send();
const readErrors={STORE_SELECTION_REQUIRED:'店舗を選択するか、新しい店舗を作成・招待コードで参加してください。',OWNER_AUTHORIZATION_REQUIRED:'サービス所有者のGoogle連携認可が必要です。',AUTH_REQUIRED:'本人確認情報を確認できません。LINEでログインし直してください。',ACCOUNT_NOT_REGISTERED:'TLHアカウントの登録が確認できません。',ACCOUNT_INACTIVE:'TLHアカウントが停止されています。',AUTH_SERVICE_ERROR:'認証サービスで問題が発生しています。',AUTH_RESPONSE_INVALID:'認証サービスの応答を確認できません。',AUTH_UNAVAILABLE:'TLHアカウントの照合に接続できません。',LOGIN_UNAVAILABLE:'LINEログインの準備に失敗しました。',OFFLINE:'オンライン接続が必要です。',NOT_CONFIGURED:'在庫サービスの接続設定が未完了です。管理者に連絡してください。',FORBIDDEN:'TLHアカウントと店舗への参加権限を確認してください。',SCHEMA_MISMATCH:'在庫データを読み取れません。管理者に連絡してください。',LEDGER_REVIEW_REQUIRED:'保存原簿の整合性を確認する必要があります。',RPC_TIMEOUT:'Googleから応答がありません。もう一度読み込んでください。',RPC_FAILED:'Googleへの接続に失敗しました。もう一度読み込んでください。'};
const readFailure=e=>e?.message==='AUTH_REQUIRED'?message('本人確認情報が受け付けられませんでした。LINEでログインし直してください。','AUTH_REQUIRED'):message('在庫を読み込めません。'+(readErrors[e?.message]||'通信状態を確認し、もう一度読み込んでください。'),Object.hasOwn(readErrors,e?.message)||Object.hasOwn(statusGuides,e?.message)?e.message:'UNAVAILABLE');
/** 初回失敗からの復旧時も入力行を用意する。読取の度に入力中の行を増やさない。 */
async function refresh(){
 if(busy)return;if(TlhInventory.requiresLogin()){globalThis.TlhInventoryView.invalidate();message('LINEでログインして在庫を開いてください。');lock(false);return;}lock(true);message('在庫を読み込んでいます…');
 try{await load();if(!$('lines').children.length)addLine();message('最新の記録を読みました。');}
 catch(e){
  view=null;
  // Last-known quantities stay visible, but a failed refresh must not present the old LEVEL as current.
  for(const card of stockCards.values()){
   card.querySelector('.level-heading')?.replaceWith(renderStockReliability({state:'UNAVAILABLE'}));
   const details=card.querySelector('.level-journey');if(details)details.hidden=true;
   const change=card.querySelector('.reliability-feedback');if(change)change.hidden=true;
  }
  const asOf=$('as-of');if(asOf&&stockCards.size)asOf.textContent='前回取得時点の参考です。'+asOf.textContent.replace(/^前回取得時点の参考です。/,'');
  readFailure(e);
 }
 finally{lock(false);}
}
$('refresh').onclick=refresh;
$('add').onclick=()=>{if(view)addLine();};
/** Help only opens an existing workspace. Never saves, refreshes, clears input or changes permissions.
 * The same pending/unknown lock as normal controls applies; static help stays readable. */
function openInventoryHelpTask(name){
 if(busy||pending||!view)return;
 if(!['receiving','counting','sampling','ordering'].includes(name))return;
 const target=name==='ordering'?'stock':name;
 tab(target);
 const help=$('inventory-help');if(help)help.open=false;
 const heading=['counting','sampling'].includes(target)?document.querySelector('#stock-workspaces .stock-workspace:not([hidden]) h3'):document.querySelector('#'+target+' h2');
 if(heading){heading.setAttribute('tabindex','-1');heading.focus();}
}
for(const b of document.querySelectorAll('[data-help-task]'))b.onclick=()=>openInventoryHelpTask(b.dataset.helpTask);
if($('open-history'))$('open-history').onclick=()=>{if(!view||busy||pending)return;tab('history');const h=document.querySelector('#history h2');if(h){h.setAttribute('tabindex','-1');h.focus();}};
if($('back-from-history'))$('back-from-history').onclick=()=>{tab('stock');$('open-history')?.focus();};
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>tab(b.dataset.tab);
for(const b of document.querySelectorAll('[data-stock-action]'))b.onclick=()=>{if(view&&!busy&&!pending)showStockAction(b.dataset.stockAction);};
for(const b of document.querySelectorAll('[data-filter]'))b.onclick=()=>{filter=b.dataset.filter;for(const x of document.querySelectorAll('[data-filter]'))x.setAttribute('aria-pressed',String(x===b));if(view)renderStockCards();};
// 端末が海外時刻でも、サーバーと同じJSTの日付を入荷の初期値にする。
$('day').value=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
refresh();



$('complete').onchange=()=>{if($('receiving-association-confirm'))$('receiving-association-confirm').checked=false;};

window.addEventListener('pagehide', () => {view = null; pending = null; itemsById.clear();stockWorkspaces.clear();stockCards.clear();document.getElementById('stock-workspaces').replaceChildren();});
