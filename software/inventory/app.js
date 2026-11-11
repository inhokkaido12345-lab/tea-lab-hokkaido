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
 AUTH_REQUIRED:['LINEでログインし直し、元の在庫画面へ戻ってください。','login'],
 LOGIN_POPUP_BLOCKED:['このサイトのポップアップを許可し、「LINEでログイン」を押してください。','login'],
 LOGIN_UNAVAILABLE:['通信状態を確認してLINEログインをやり直してください。','login'],
 STORE_SELECTION_REQUIRED:['上部で店舗を選ぶか、作成・招待コードで参加してください。'],
 FORBIDDEN:['利用するアカウントと店舗を確認し、店舗管理者へ所属・権限の確認を依頼してください。'],
 OWNER_AUTHORIZATION_REQUIRED:['サービス管理者がGoogle連携の認可を確認する必要があります。'],
 SAVE_UNKNOWN:['新しい保存を重ねず、「同じ操作を再確認」で保存済みか確認してください。','retry'],
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
 if(action){const button=el('button',labels[action]);button.type='button';
  button.onclick=()=>{if(busy)return;if(action==='login')$('line-login')?.onclick?.();else if(action==='retry')send();else if(action==='sync')send({type:'SYNC_CATALOG'});else refresh();};details.append(button);
 }
}
globalThis.TlhInventoryStatus=Object.freeze({show:message});
/** 通信中・読込未完了・結果不明を分ける。失敗後の再読取は必ず押せるようにする。 */
function lock(value){busy=value;$('status').setAttribute('aria-busy',String(value));for(const b of document.querySelectorAll('button,input,select,textarea')){
 const recovery=['retry','refresh','line-login'].includes(b.id);
 b.disabled=value||(!view&&!recovery&&!b.dataset.tab&&!b.dataset.tenant)||(Boolean(pending)&&!recovery);
}}
function tab(name){activeTab=name;if(name==='catalog'&&view)renderCatalog();for(const s of document.querySelectorAll('main section'))s.hidden=s.id!==name;for(const b of document.querySelectorAll('nav button')){if(b.dataset.tab===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}if(name==='history'&&view&&historyDirty)renderHistory();}
/** 取得できるまで古い残量からの新規更新を禁止する。結果不明の操作IDは保持する。 */
async function load(){
 view=null;
 const result = await TlhInventory.readView();
 if (!result.ok) throw Error(result.code || 'UNAVAILABLE');view=result.value;render();
}
// 閉じた標本計測と、基準日からの在庫推定の状態を分けて表示する。
const forecastMessages = {
  NEEDS_BASELINE: '入荷を登録するか、今ある総在庫を入力してください',
  LEARNING: '消費速度の計測待ちです。1回終了すると推定を開始します',
  OUT_OF_STOCK: '推定では在庫切れです。実際の残量を確認してください',
  NEEDS_DELIVERY_HISTORY: '納期は未学習です。発注と受取完了の実績から自動計算します',
  ORDER_NOW: '発注期限に達しています',
  OK: '発注期限まで余裕があります',
  NO_USAGE_OBSERVED: '観測した投入量は0です。在庫切れ日時はまだ算出しません',
};

function inventoryQuantityLabel(item) {
  const forecast = item.forecast;
  if (!forecast) return quantities(item.quantity,item.baseUnit);
  if (forecast.quantity === null) return '在庫基準未登録';
  if (forecast.rate === null) return '消費速度の計測待ち';
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
  const quantity = appendNumberField(container, '今ある量（'+(item.baseUnit||'g')+'、使いかけも含む）', '');
  quantity.step='1';
  const count = el('button', '数えた量を保存', 'primary');
  count.onclick = () => {
    if (quantity.value === '') {message('総在庫を入力してください');return;}
    send({type: 'COUNT_STOCK', itemId: item.id, quantity: Number(quantity.value)});
  };
  container.append(count);
}

/** 納期は読取専用の実績。調整できるのは安全余裕だけ。 */
function renderOrderBuffer(container, item) {
  const forecast=item.forecast;
  if (item.delivery) {
    container.append(el('p','発注→受取完了：直近 '+item.delivery.lastDays.toFixed(1)+'日 ／平均 '+item.delivery.averageDays.toFixed(1)+'日（'+item.delivery.count+'件）'));
    container.append(el('p','予測に使用する納期 '+item.delivery.leadDays.toFixed(1)+'日（平均と直近の長い側）','muted'));
    if(item.delivery.precision==='DATE')container.append(el('p','この受取は後日登録のため、日付単位の概算です。','muted'));
  }else{
    container.append(el('p','納期は未学習です。入荷時に対応する注文を受取完了にすると、自動で計算されます。','muted'));
  }
  const safety = appendNumberField(container, '安全余裕（日）', forecast.safetyDays ?? forecast.config?.safetyDays ?? '1');
  const save = el('button', '安全余裕を保存');
  save.onclick = () => {
    if (safety.value === '') {message('安全余裕を入力してください');return;}
    send({type: 'SET_FORECAST', itemId: item.id, safetyDays: Number(safety.value)});
  };
  container.append(save);
}

/** 基準単位/日へ統一した予測と根拠を表示する。g・mL・本数を混ぜない。 */
function renderConsumption(card, item) {
  const forecast = item.forecast;
  card.append(el('p', forecastMessages[forecast.status] || forecast.status,
      forecast.status === 'ORDER_NOW' ? 'badge low' : 'muted'));
  const dates=el('div','','forecast-dates');
  for(const [label,date,cls] of [['在庫切れ予測',forecast.stockoutAt,''],['発注レッドライン',forecast.orderBy,'deadline']]){
    const cell=el('div','',cls);cell.append(el('span',label),el('strong',calendarDate(date)));dates.append(cell);
  }
  card.append(dates);
  if(forecast.redlineQuantity!=null)card.append(el('p','安全側の発注目安 '+quantities(forecast.redlineQuantity,item.baseUnit)+
    ' ／実績納期 '+forecast.config.leadDays.toFixed(1)+'日＋余裕 '+forecast.config.safetyDays+'日','redline'));
  const explanation=el('details','');explanation.append(el('summary','予測の根拠・消費速度を見る'));
  if (forecast.baselineAt) {
    explanation.append(el('p', '在庫の基準 '+formatRecordedAt(forecast.baselineAt)+
      (forecast.baselineSource === 'RECEIPT' ? ' ／初回入荷前の在庫を0として推定' : ' ／棚卸実数から推定'), 'muted'));
  }
  if (forecast.rate) {
    explanation.append(el('p', '計測 '+forecast.sampleCount+'件 ／平均 '+measurementQuantity(forecast.averageRate,item.baseUnit)+
      '/日 ／7日換算 '+measurementQuantity(forecast.averageRate*7,item.baseUnit)));
    explanation.append(el('p', '直近/平均の速度 '+forecast.relativeSpeed.toFixed(2)+'倍。残量は平均、発注警告は速い側で推定します。'));
    explanation.append(el('p', '最後に使用量を確認した日時：'+formatRecordedAt(forecast.lastMeasuredAt), 'muted'));
  }
  explanation.append(el('p', '推定在庫切れ '+formatRecordedAt(forecast.stockoutAt)),
    el('p', '発注期限（安全側） '+formatRecordedAt(forecast.orderBy)));
  if(item.delivery)explanation.append(el('p','発注から受取まで：直近 '+item.delivery.lastDays.toFixed(1)+'日 ／平均 '+item.delivery.averageDays.toFixed(1)+'日（'+item.delivery.count+'件）','muted'));
  card.append(explanation);
  if(view.permissions.includes('inventory.receive')){
    const adjustment=el('details','');adjustment.append(el('summary','発注の余裕を調整'));
    let mounted=false;
    adjustment.ontoggle=()=>{if(!adjustment.open||mounted)return;mounted=true;renderOrderBuffer(adjustment,item);lock(busy);};
    card.append(adjustment);
  }
  if ((item.orders || []).length) card.append(el('p', '発注済みあり。未入荷は在庫に含めません。', 'muted'));
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
  for(const [key,node] of stockWorkspaces)node.hidden=key!==name;
  if(name==='overview'||!view||stockWorkspaces.has(name))return;
  const titles={sampling:'消費を測る',counting:'在庫を数える'};
  const help={sampling:'1袋・1ケースなど、選んだ1単位の使用開始と使い切りを記録します。途中の残量入力は不要です。在庫全体の数え直しは「在庫を数える」で行います。',counting:'未開封・開封中を含む総量を品目の基準単位で入力します。この実数を起点に消費推定をやり直します。'};
  const workspace=el('div','','stock-workspace');workspace.append(el('h3',titles[name]),el('p',help[name],'muted'));
  stockWorkspaces.set(name,workspace);host.append(workspace);
  if(!view.permissions.includes('inventory.receive')){workspace.append(el('p','この作業を保存する権限がありません。','muted'));return;}
  const label=el('label','対象の品目'),select=el('select','');select.setAttribute('aria-label',titles[name]+'：対象の品目');
  for(const item of view.items.filter(i=>i.active!==false&&i.forecast))select.append(new Option(item.name+(name==='sampling'&&(item.forecast.open||item.forecast.measurement)?'（計測中）':''),item.id));
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
 if(renderedStoreId!==view.storeId){renderedStoreId=view.storeId;catalogSelection='new';catalogFilter='CURRENT';stockAction='overview';stockCategory=catalogCategory='all';stockSearch=catalogSearch='';$('lines').replaceChildren();}
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
  for(const [label,count] of [['管理品目',view.items.filter(i=>i.active!==false).length],['要発注・確認',view.items.filter(needsOrder).length],['未入荷の注文',view.items.filter(i=>i.active!==false).reduce((n,i)=>n+(i.orders||[]).length,0)]]){
   const metric=el('div','');metric.append(el('strong',String(count)),el('span',label));overview.append(metric);
  }
 }
 renderStockFilters();renderStockCards();
 $('complete').replaceChildren(new Option('選択しない',''));
 // 受取完了は注文ごと。一件を完了しても他の未入荷注文を残す。
 for(const i of view.items.filter(i=>i.active!==false))for(const o of (i.orders||(i.order?[i.order]:[])).filter(o=>o.status==='ORDERED'))$('complete').append(new Option(i.name+' ／ '+(o.at?formatRecordedAt(o.at):'発注')+' ／ '+(o.plannedLine?o.plannedLine.quantity+' '+(i.units.find(u=>u.id===o.plannedLine.unitId)?.label||o.plannedLine.unitId):'数量未記入')+' ／ 到着 '+(o.expectedOn||'不明')+' ／ '+o.id,o.id));
 if(activeTab==='history')renderHistory();
 if(activeTab==='catalog')renderCatalog();
 showStockAction(stockAction);
}
/** 絞り込みではカードだけを描画し、棚卸・計測・仕入情報の未保存入力を作り直さない。 */
function renderStockCards(){
 $('cards').replaceChildren();
 if(!view.items.some(i=>i.active!==false))$('cards').append(el('p','現行の品目がありません。「仕入品情報」タブから登録するか、使用終了の品目を現行に戻してください。'));
 const shown=view.items.filter(i=>i.active!==false&&matchesItem(i,stockCategory,stockSearch)).filter(i=>filter==='all'||filter==='low'&&needsOrder(i)||filter==='ordered'&&(i.orders||[i.order]).some(o=>o?.status==='ORDERED'));
 for(const item of shown){
 if(stockCards.has(item.id)){$('cards').append(stockCards.get(item.id));continue;}
 const c=el('article','',needsOrder(item)?'card attention':'card');c.append(el('p',categoryOf(item),'eyebrow'),el('h3',item.name),el('span',needsOrder(item)?'要確認・発注':'推定在庫',needsOrder(item)?'badge low':'badge'),el('p',inventoryQuantityLabel(item),'qty'),el('p','固定の最低在庫目安 '+quantities(item.threshold,item.baseUnit),'muted'));
 if(item.forecast)renderConsumption(c,item);
 const orders=item.orders||(item.order?[item.order]:[]);
 for(const order of orders.filter(o=>o.status==='ORDERED')){
 c.append(el('p',order.actor+'が発注済み'+(order.at?' '+formatRecordedAt(order.at) :'')));
 if(!order.plannedLine)c.append(el('p','発注数量：未記入'));
 c.append(el('p','到着予定日：'+(order.expectedOn||'不明')));
 if(order.plannedLine)c.append(el('p','発注数量 '+order.plannedLine.quantity+' '+(item.units.find(u=>u.id===order.plannedLine.unitId)?.label||order.plannedLine.unitId)+'（'+quantities(order.plannedLine.amount,item.baseUnit)+'）'));
 }
 if(view.permissions.includes('inventory.order')){
 const b=el('button','発注を記録','primary');
 b.onclick=()=>{
  // 確認を先に済ませてから入力欄を作る。拒否した場合は画面も保存状態も変更しない。
  const notLow=!needsOrder(item);
  if(notLow&&!confirm(item.name+'：要発注ではありませんが、発注しますか？'))return;
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
  box.append(save);c.append(box);
 };c.append(b);}
 const b=el('button','入荷を登録');b.onclick=()=>{$('lines').replaceChildren();addLine(item.id);tab('receiving');};c.append(b);stockCards.set(item.id,c);$('cards').append(c);
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
 for(const log of view.history){const names={CATALOG_REFERENCE_CHANGED:'参照元に連動した仕入情報の変更',SAVE_ITEM:'仕入品情報・規格の更新',START_MEASUREMENT:'消費の計測開始',RECORD_MEASUREMENT:'期間の消費記録',UPDATE_MEASUREMENT:'消費の確認・完了',CANCEL_MEASUREMENT:'消費計測の取消',START_SAMPLE:'消費速度の計測開始',FINISH_SAMPLE:'消費速度の計測完了',CANCEL_SAMPLE:'計測取消',COUNT_STOCK:'在庫基準の補正',SET_FORECAST:'発注期限の設定',RECEIVE:'入荷',MARK_ORDERED:'発注済み記録',CANCEL_ORDERED:'発注済みの取消し',COMPLETE_CASE:'受取完了'};const row=el('article','','line');row.append(el('p',names[log.type]||'記録'),el('p',formatRecordedAt(log.at),'muted'));if(log.catalogChange)appendCatalogHistory(row,log.catalogChange);if(log.measurement){const m=log.measurement;if(m.usedAmount!==null)row.append(el('p','累計投入 '+measurementQuantity(m.usedAmount,itemsById.get(log.itemId)?.baseUnit)));if(m.endedAt)row.append(el('p','計測期間 '+formatRecordedAt(m.startedAt)+'〜'+formatRecordedAt(m.endedAt),'muted'));}for(const l of log.lines){const i=itemsById.get(l.itemId);row.append(el('p',(i?.name||'品目')+' '+quantities(l.amount,i?.baseUnit)));}$('logs').append(row);}
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
 const updateHint=()=>{const i=itemsById.get(item.value),u=i.units.find(x=>x.id===unit.value);if(ordering&&count.value===''){hint.textContent='発注数量：未記入';return;}hint.textContent='1'+u.label+' '+quantities(u.baseQuantity,i.baseUnit)+(ordering?' ／発注量 ':' ／加算 ')+quantities(Number(count.value)*u.baseQuantity,i.baseUnit);};
 const updateUnit=()=>{const i=itemsById.get(item.value);unit.replaceChildren();for(const u of i.units)unit.append(new Option(u.label,u.id));updateHint();};
 item.onchange=updateUnit;unit.onchange=updateHint;count.oninput=updateHint;updateUnit();
 const remove=el('button','この行を削除');remove.type='button';remove.onclick=()=>row.remove();
 row.append(item,count,unit,hint);if(!ordering)row.append(remove);row.requestLine=()=>{if(ordering&&count.value.trim()==='')return null;const i=itemsById.get(item.value),u=i.units.find(x=>x.id===unit.value);return {itemId:i.id,quantity:Number(count.value),unitId:u.id,conversionVersion:u.version};};container.append(row);return row;
}
const errors={INVALID_CATALOG_REFERENCE:'参照元は同じ店舗の商品を選んでください。自身への参照や循環参照は保存できません。',BASE_UNIT_CHANGED:'在庫の履歴がある品目の基準単位は変更できません。別品目として登録してください。',INVALID_CATALOG:'品名・URL・文字数など、仕入品情報の入力を確認してください。',INVALID_UNIT_GRAPH:'包装の数量・単位名・つながりを確認してください。循環や基準単位の整数に換算できない設定は保存できません。',CATALOG_CHANGED:'別の端末で規格が更新されました。最新の記録を読み直してください。',INVALID_MEASUREMENT:'量と単位を確認してください。袋数0では使いかけ分を計れません。',FUTURE_MEASUREMENT:'未来の日時は記録できません。',MEASUREMENT_OVERLAP:'同じ品目の計測期間が重複しています。現在の計測を更新するか、期間を確認してください。',MEASUREMENT_NOT_FOUND:'対象の計測が見つかりません。最新の記録を読んでください。',MEASUREMENT_CHANGED:'他の操作で計測が更新されています。最新の記録を読んでください。',MEASUREMENT_CLOSED:'この計測は既に終了・取消されています。',ACTION_REMOVED:'画面を再読み込みして新しい標本計測を使ってください。',PACK_ALREADY_OPEN:'この品目は既に計測中です。',PACK_CHANGED:'計測状態が変わりました。最新の画面を確認してください。',INVALID_DURATION:'開始と終了の時刻を確認してください。',ORDER_CONFIRMATION_REQUIRED:'在庫が更新され要発注ではなくなりました。再度確認して記録してください。',ORDER_CHANGED:'発注内容が更新されました。最新の記録を確認してください。',NOT_ORDERED:'この記録は既に取り消されています。',CASE_CLOSED:'この発注は受取完了しています。',ALREADY_ORDERED:'他の発注済み記録があります。最新状態を確認してください。',CONVERSION_CHANGED:'単位換算が更新されています。再読取してください。',INVALID_COMPLETION:'受取完了の発注と入荷品目が一致しません。',FORBIDDEN:'操作権限を確認できません。',INVALID_LINE:'品目の重複や数量を確認してください。',FUTURE_RECEIPT:'届いた日には今日以前を指定してください。'};
/** 通信失敗なら操作IDを保持。成功後は原簿読戻し済みDTOを使用し、旧APIだけ別READする。 */
async function send(command){
 if(busy||(!view&&!pending))return;
 if(pending&&command)return;
 if(command)pending={...command,operationId:crypto.randomUUID(),storeId:view.storeId};
 if(!pending)return;
 lock(true);$('recovery').hidden=true;message('保存結果を確認しています…');
 let saved=false;
 try {
 const result = await TlhInventory.request('COMMAND', pending);
 const data = result.ok ? {result: result.value, view: result.value.view} : {code: result.code};
 const res = {ok: result.ok, status: ['UNAVAILABLE','SAVE_UNKNOWN','BUSY','AUTH_UNAVAILABLE'].includes(data.code) ? 503 : 403};
 if(!res.ok){
  if(res.status>=500)throw Error('UNKNOWN');
  if(data.code==='CSRF_REJECTED'){message('サーバーが再起動しています。操作IDを保ったまま最新状態を取得して再確認してください。');await load();$('recovery').hidden=false;return;}
  // サーバーが明示的に拒否した保存は未確定ではない。続くREADの失敗と混同しない。
  pending=null;try{await load();}catch{view=null;}message(errors[data.code]||'保存できませんでした。',data.code||'UNAVAILABLE');return;
 }
 saved=true;
 if(pending.type==='SAVE_ITEM'){catalogSelection=pending.itemId;catalogFilter=pending.catalog.status==='RETIRED'?'RETIRED':'CURRENT';}
 const savedTab=['SAVE_ITEM','SYNC_CATALOG'].includes(pending.type)?'catalog':'stock';
 if(['RECEIVE','MARK_ORDERED'].includes(pending.type))stockAction='overview';
 pending=null;
 // 署名検証済みの保存応答に、原簿読戻し後の画面があれば再通信を省く。旧APIはREADへ戻る。
 if(data.view){view=data.view;render();}else await load();
 $('lines').replaceChildren();addLine();tab(savedTab);message(data.result?.catalogSync?.ok===false?'アプリへの保存は完了しましたが、一覧シートの同期を確認できません。「一覧シートへ再同期」を押してください。':'保存しました。最新記録を確認しました。',data.result?.catalogSync?.ok===false?'CATALOG_SYNC_REQUIRED':'');
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
  const item=itemsById.get(choice.value),c=item?.catalogResolved||item?.catalog||{},node=el('div','');drafts.set(choice.value,node);editor.append(node);
  if(!view.permissions.includes('inventory.receive')){node.append(el('p','この情報を変更する権限がありません。'));return;}
  const field=(parent,label,value='',multiline=false)=>{
   const box=el('label',label),input=el(multiline?'textarea':'input','');input.value=value;input.setAttribute('aria-label',label);input.maxLength=multiline?2000:1500;if(!multiline)input.type='text';box.append(input);parent.append(box);return input;
  };
  node.append(el('h3',item?'仕入品の情報を編集':'新しい仕入品'));
  const statusLabel=el('label','品目の状態'),status=el('select','');status.append(new Option('現行（在庫管理・アラートの対象）','CURRENT'),new Option('使用終了（履歴として保存）','RETIRED'));status.value=item?.active===false?'RETIRED':'CURRENT';statusLabel.append(status);node.append(statusLabel,el('p','使用終了の品目は在庫一覧・消費計測・発注アラートに出しません。在庫数と履歴は残ります。現行に戻して再開する時は、棚卸で残量を確認してください。','muted'));
  const name=field(node,'品名（必須）',item?.name||'');
  const categoryLabel=el('label','カテゴリ'),category=el('select','');category.setAttribute('aria-label','カテゴリ');
  category.append(new Option('未分類（あとで設定）',''));for(const label of productCategories)category.append(new Option(label,label));
  const previousCategory=canonicalCategory(c.category||'');
  if(previousCategory&&!productCategories.includes(previousCategory))category.append(new Option(previousCategory+'（以前の分類）',previousCategory));
  category.value=previousCategory;categoryLabel.append(category);node.append(categoryLabel,el('p','主な種類・用途を1つ選びます。冷凍・常温は「保管方法」に記入してください。','muted'));
  const alias=field(node,'店内での呼び名',c.alias||''),code=field(node,'商品コード・型番',c.productCode||'');
  const manufacturer=el('details','');manufacturer.append(el('summary','製造元・メーカー'));node.append(manufacturer);
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
  const supplierBox=el('details','');supplierBox.append(el('summary','仕入先・注文先（複数登録可）'));node.append(supplierBox);const suppliers=[];
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
  node.append(el('h4','包装・内容量のつながり'));
  const baseLabel=el('label','在庫の基準単位'),base=el('select','');base.setAttribute('aria-label','在庫の基準単位');
  for(const u of ['g','mL','個','本','枚','杯'])base.append(new Option(u,u));base.value=item?.baseUnit||c.baseUnit||'g';baseLabel.append(base);node.append(baseLabel);
  node.append(el('p','「1ケースには20袋」「1袋には20束」「1束には10g」のように登録します。小さい単位から追加すると選びやすくなります。この例の数字を実商品へ流用せず、規格表示を確認してください。','muted'));
  node.append(el('p','重量はg、液体はmL、ストローなどは本数を基準に選びます。gとmLを同じものとして換算しません。在庫操作後は基準単位を変更できません。1包装の換算量は基準単位の正の整数になる設定が必要です。','muted'));
  const rowsHost=el('div','','catalog-units');node.append(rowsHost);const unitRows=[];
  const roots=()=>base.value==='g'?[['g',1],['kg',1000]]:base.value==='mL'?[['mL',1],['L',1000]]:[[base.value,1]];
  const updateChoices=()=>{
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
   const remove=el('button','この単位を外す');remove.type='button';remove.onclick=()=>{unitRows.splice(unitRows.indexOf(entry),1);row.remove();updateChoices();};row.append(remove);updateChoices();
  };
  base.onchange=()=>updateChoices();
  const original=c.units||item?.units?.map(u=>({id:u.id,label:u.label,quantity:u.quantity??u.baseQuantity,childUnitId:u.childUnitId||'g'}))||[];
  for(const u of original)addUnit(u);
  if(!original.length)addUnit();
  const add=el('button','包装単位を追加');add.type='button';add.onclick=()=>{addUnit();lock(busy);};node.append(add,previewBox);
  const info=el('details','');info.append(el('summary','保管・原材料の補足'));node.append(info);
  const storage=field(info,'保管方法・保管上の注意',c.storage||'',true),allergens=field(info,'アレルゲン表示（商品表示を確認）',c.allergens||''),specNotes=field(info,'規格の補足',c.specNotes||'',true),specUrl=field(info,'規格資料URL',c.specUrl||''),notes=field(info,'その他の備考',c.notes||'',true);
  node.append(el('p','規格を変更しても過去の入荷量・計測開始時の量は変えません。別端末で先に変更された場合は再読込が必要です。','muted'));
  const save=el('button',item?'仕入品情報と規格を更新':'仕入品を登録','primary');
  save.onclick=()=>{
   if(item&&item.active!==false&&status.value==='RETIRED'&&!confirm('この品目を在庫一覧・消費計測・発注アラートの対象から外します。在庫数と履歴は残ります。使用終了にしますか？'))return;
   if(!name.value.trim()){message('品名を入力してください。');return;}
   const party=p=>({name:p.name.value,contact:p.contact.value,url:p.url.value,notes:p.notes.value});
   send({type:'SAVE_ITEM',itemId:item?.id||'item-'+crypto.randomUUID(),expectedRevision:item?.catalogRevision||null,catalog:{status:status.value,baseUnit:base.value,name:name.value,category:category.value,alias:alias.value,productCode:code.value,
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

$('receipt').onsubmit=e=>{e.preventDefault();const lines=[...$('lines').children].map(r=>r.requestLine());if(!lines.length){message('先に仕入品を登録して、入荷する品目を追加してください。');return;}send({type:'RECEIVE',receivedOn:$('day').value,lines,completeCaseId:$('complete').value||null});};
$('retry').onclick=()=>send();
const readErrors={STORE_SELECTION_REQUIRED:'店舗を選択するか、新しい店舗を作成・招待コードで参加してください。',OWNER_AUTHORIZATION_REQUIRED:'サービス所有者のGoogle連携認可が必要です。',AUTH_REQUIRED:'LINEでログインしてください。',AUTH_UNAVAILABLE:'TLHアカウントの照合に接続できません。',LOGIN_UNAVAILABLE:'LINEログインの準備に失敗しました。',OFFLINE:'オンライン接続が必要です。',NOT_CONFIGURED:'在庫サービスの接続設定が未完了です。管理者に連絡してください。',FORBIDDEN:'TLHアカウントと店舗への参加権限を確認してください。',SCHEMA_MISMATCH:'在庫データを読み取れません。管理者に連絡してください。',LEDGER_REVIEW_REQUIRED:'保存原簿の整合性を確認する必要があります。',RPC_TIMEOUT:'Googleから応答がありません。もう一度読み込んでください。',RPC_FAILED:'Googleへの接続に失敗しました。もう一度読み込んでください。'};
const readFailure=e=>e?.message==='AUTH_REQUIRED'?message('認証の有効期限が切れました。LINEでログインし直してください。','AUTH_REQUIRED'):message('在庫を読み込めません。'+(readErrors[e?.message]||'通信状態を確認し、もう一度読み込んでください。'),Object.hasOwn(readErrors,e?.message)||Object.hasOwn(statusGuides,e?.message)?e.message:'UNAVAILABLE');
/** 初回失敗からの復旧時も入力行を用意する。読取の度に入力中の行を増やさない。 */
async function refresh(){
 if(busy)return;if(TlhInventory.requiresLogin()){view=null;message('LINEでログインして在庫を開いてください。');lock(false);return;}lock(true);message('在庫を読み込んでいます…');
 try{await load();if(!$('lines').children.length)addLine();message('最新の記録を読みました。');}
 catch(e){view=null;readFailure(e);}
 finally{lock(false);}
}
$('refresh').onclick=refresh;
$('add').onclick=()=>{if(view)addLine();};
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>tab(b.dataset.tab);
for(const b of document.querySelectorAll('[data-stock-action]'))b.onclick=()=>{if(view&&!busy&&!pending)showStockAction(b.dataset.stockAction);};
for(const b of document.querySelectorAll('[data-filter]'))b.onclick=()=>{filter=b.dataset.filter;for(const x of document.querySelectorAll('[data-filter]'))x.setAttribute('aria-pressed',String(x===b));if(view)renderStockCards();};
// 端末が海外時刻でも、サーバーと同じJSTの日付を入荷の初期値にする。
$('day').value=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
refresh();



window.addEventListener('pagehide', () => {view = null; pending = null; itemsById.clear();stockWorkspaces.clear();stockCards.clear();document.getElementById('stock-workspaces').replaceChildren();});
