/**
 * 連結画面：APIへ送信し、サーバーが保存後に検証した画面DTOを表示。旧APIだけ別READ。
 * 状態はサーバーが正本。DOMの数量を直接加算しない。
 * 概念：DTO/再送ID/通信結果不明。改造：行フォームはaddLine、描画はrender。
 * tokenはメモリだけ。入力やエラーにinnerHTMLを使わない。ローカル専用で本番認証はない。
 * 削除すると連結画面の操作が停止。検証はHTTP試験とREADMEのブラウザ操作手順。
 */
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
let view=null,filter='all',pending=null,busy=false,activeTab='stock',historyDirty=true;
// 作業切替は取得済みDTOとDOMだけを使う。切替の度に通信・保存しない。
let stockAction='overview';
const stockWorkspaces=new Map();
// 1回の描画中の品目検索を索引にする。サーバーの在庫の代わりには使わない。
let itemsById = new Map();
// Intlの設定解析を毎回繰り返さず、表示専用フォーマッターを再利用する。
const quantityFormatter = new Intl.NumberFormat('ja-JP', {maximumFractionDigits: 3});
const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const quantities = grams => quantityFormatter.format(grams / 1000) + ' kg';
const measurementQuantity = grams => grams<1000?quantityFormatter.format(grams)+' g':quantities(grams);
const formatRecordedAt = value => value ? dateFormatter.format(new Date(value)) : '算出前';
const calendarFormatter = new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo',month:'numeric',day:'numeric'});
const calendarDate = value => value ? calendarFormatter.format(new Date(value)) : '算出前';
const message=t=>{$('status').textContent=t;};
/** 通信中・読込未完了・結果不明を分ける。失敗後の再読取は必ず押せるようにする。 */
function lock(value){busy=value;$('status').setAttribute('aria-busy',String(value));for(const b of document.querySelectorAll('button,input,select')){
 const recovery=['retry','refresh','line-login'].includes(b.id);
 b.disabled=value||(!view&&!recovery&&!b.dataset.tab)||(Boolean(pending)&&!recovery);
}}
function tab(name){activeTab=name;for(const s of document.querySelectorAll('main section'))s.hidden=s.id!==name;for(const b of document.querySelectorAll('nav button')){if(b.dataset.tab===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}if(name==='history'&&view&&historyDirty)renderHistory();}
/** 取得できるまで古い残量からの新規更新を禁止する。結果不明の操作IDは保持する。 */
async function load(){
 view=null;
 const result = await TlhInventory.request('READ');
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
  if (!forecast) return quantities(item.quantity);
  if (forecast.quantity === null) return '在庫基準未登録';
  if (forecast.rate === null) return '消費速度の計測待ち';
  return '約 '+quantities(forecast.quantity);
}

function needsOrder(item) {
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
  const quantity = appendNumberField(container, '今ある量（g、使いかけも含む）', '');
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

/** 計測方式にかかわらず、投入量/日へ統一した予測と根拠を表示する。 */
function renderConsumption(card, item) {
  const forecast = item.forecast;
  card.append(el('p', forecastMessages[forecast.status] || forecast.status,
      forecast.status === 'ORDER_NOW' ? 'badge low' : 'muted'));
  const dates=el('div','','forecast-dates');
  for(const [label,date,cls] of [['在庫切れ予測',forecast.stockoutAt,''],['発注レッドライン',forecast.orderBy,'deadline']]){
    const cell=el('div','',cls);cell.append(el('span',label),el('strong',calendarDate(date)));dates.append(cell);
  }
  card.append(dates);
  if(forecast.redlineQuantity!=null)card.append(el('p','安全側の発注目安 '+quantities(forecast.redlineQuantity)+
    ' ／実績納期 '+forecast.config.leadDays.toFixed(1)+'日＋余裕 '+forecast.config.safetyDays+'日','redline'));
  const explanation=el('details','');explanation.append(el('summary','予測の根拠・消費速度を見る'));
  if (forecast.baselineAt) {
    explanation.append(el('p', '在庫の基準 '+formatRecordedAt(forecast.baselineAt)+
      (forecast.baselineSource === 'RECEIPT' ? ' ／初回入荷前の在庫を0として推定' : ' ／棚卸実数から推定'), 'muted'));
  }
  if (forecast.rate) {
    explanation.append(el('p', '計測 '+forecast.sampleCount+'件 ／平均 '+measurementQuantity(forecast.averageRate)+
      '/日 ／7日換算 '+measurementQuantity(forecast.averageRate*7)));
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

/** 共通数量入力。袋・個は換算版付きで送り、g/kgを含めサーバーが最終換算する。 */
function measurementAmountField(container,item,label){
  const input=appendNumberField(container,label,'');
  const select=el('select','');select.setAttribute('aria-label',label+'：単位');
  select.append(new Option('g','g'),new Option('kg','kg'));
  for(const unit of item.units)select.append(new Option(unit.label+'（'+measurementQuantity(unit.baseQuantity)+'）','pack:'+unit.id));
  container.append(select);
  return {read(optional=false){
    if(String(input.value).trim()===''){if(optional)return null;throw Error('量を入力してください');}
    const value=Number(input.value);if(!Number.isFinite(value)||value<0)throw Error('量を確認してください');
    if(select.value.startsWith('pack:')){
      const unit=item.units.find(u=>u.id===select.value.slice(5));
      if(!unit)throw Error('単位を選び直してください');
      return {value,unit:'pack',unitId:unit.id,conversionVersion:unit.version};
    }
    return {value,unit:select.value};
  }};
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

/** 1つの計測を途中確認→使い切りへ更新する。棚卸の実在庫とは別の観測。 */
function renderSampleActions(card,item){
  const forecast=item.forecast;
  if(forecast.lastMeasuredAt)card.append(el('p','最後に使用量を確認した日時：'+formatRecordedAt(forecast.lastMeasuredAt),'muted'));
  if (forecast.open) {
    card.append(el('p', '計測中：'+quantities(forecast.open.amount)+' ／開始 '+formatRecordedAt(forecast.open.openedAt)));
    const finish = el('button', '使い切った：計測を終了', 'primary');
    finish.onclick = () => send({type:'FINISH_SAMPLE',itemId:item.id,openOperationId:forecast.open.operationId});
    const cancel = el('button', 'この計測を取り消す');
    cancel.onclick = () => send({type:'CANCEL_SAMPLE',itemId:item.id,openOperationId:forecast.open.operationId});
    card.append(finish, cancel);
    return; // 以前から継続中の1袋計測を閉じてから、新方式へ進む。
  }
  card.append(el("p","毎回の開封記録は不要です。測るときだけ、未使用の1袋・1ケースの使用開始と、全量を使い切った日時を記録します。","muted"));
  card.append(el("p","注意：計測対象から順に使い、途中で継ぎ足したり、別の袋・ケースと混ぜたりしないでください。同じ原料を複数の包装から同時に使うと、この計測は店全体の消費速度を表しません。ケースは開封時ではなく、中身を最初に使い始めた時点で開始します。","muted"));
  const measurement=forecast.measurement;
  if(measurement){
    card.append(el("p","使用開始："+formatRecordedAt(measurement.startedAt)));
    const known=measurement.initialAmount!==null&&measurement.initialAmount>0;
    if(known)card.append(el("p","計測対象：1包装（"+measurementQuantity(measurement.initialAmount)+"）"));
    const end=measurementTimeField(card,"全量を使い切った日時（日本時間・空欄＝今）");
    if(known){
      const finish=el("button","全量を使い切った：計測を終了","primary");
      finish.onclick=()=>sendMeasurement(()=>{const endedAt=end.read();return {type:"UPDATE_MEASUREMENT",itemId:item.id,measurementId:measurement.id,expectedRevision:measurement.revision,used:{value:measurement.initialAmount,unit:"g"},finished:true,...(endedAt?{endedAt}:{})};});
      card.append(finish);
    }else card.append(el("p","以前の方式で開始した計測で、対象の全量が未登録です。この計測を取り消し、未使用の1袋・1ケースで開始し直してください。","muted"));
    const cancel=el("button","この計測を取り消す");cancel.onclick=()=>{if(confirm("この計測を取り消しますか？途中確認がある場合は、その結果も速度の計算から外れます。"))send({type:"CANCEL_MEASUREMENT",itemId:item.id,measurementId:measurement.id,expectedRevision:measurement.revision});};card.append(cancel);
  }else{
    const units=item.units.filter(u=>Number.isFinite(u.baseQuantity)&&u.baseQuantity>0);
    if(!units.length){card.append(el("p","袋・ケースの内容量が未設定のため計測できません。先に品目の包装設定を確認してください。","muted"));return;}
    const label=el("label","使い切りを測る単位"),unit=el("select","");unit.setAttribute("aria-label","使い切りを測る単位");
    for(const u of units)unit.append(new Option("1"+u.label+"（"+measurementQuantity(u.baseQuantity)+"）",u.id));label.append(unit);card.append(label);
    card.append(el("p","少量なら1袋、大量に使う原料なら1ケースなど、無理なく使い切りを確認できる単位を選んでください。表示の内容量が実商品と合っていることを確認してください。","muted"));
    const begin=measurementTimeField(card,"この1袋・1ケースを使い始めた日時（日本時間・空欄＝今）");
    const start=el("button","この1袋・1ケースの使用開始を記録","primary");
    start.onclick=()=>sendMeasurement(()=>{const u=units.find(u=>u.id===unit.value),startedAt=begin.read();if(!u)throw Error("INVALID_LINE");return {type:"START_MEASUREMENT",itemId:item.id,initial:{value:1,unit:"pack",unitId:u.id,conversionVersion:u.version},...(startedAt?{startedAt}:{})};});card.append(start);
  }
  if(forecast.observations?.length){
    const history=el('details','');history.append(el('summary','最近の計測結果'));
    for(const observation of forecast.observations.slice().reverse()){
      const days=(Date.parse(observation.endedAt)-Date.parse(observation.startedAt))/86400000;
      history.append(el('p',formatRecordedAt(observation.startedAt)+'〜'+formatRecordedAt(observation.endedAt)+' ／'+measurementQuantity(observation.amount)+' ／'+days.toFixed(1)+'日間'+(observation.partial?'（途中確認）':''),'muted'));
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
  const help={sampling:'1袋・1ケースなど、選んだ1単位の使用開始と使い切りを記録します。途中の残量入力は不要です。在庫全体の数え直しは「在庫を数える」で行います。',counting:'未開封・開封中を含む総量をgで入力します。この実数を起点に消費推定をやり直します。'};
  const workspace=el('div','','stock-workspace');workspace.append(el('h3',titles[name]),el('p',help[name],'muted'));
  stockWorkspaces.set(name,workspace);host.append(workspace);
  if(!view.permissions.includes('inventory.receive')){workspace.append(el('p','この作業を保存する権限がありません。','muted'));return;}
  const label=el('label','対象の品目'),select=el('select','');select.setAttribute('aria-label',titles[name]+'：対象の品目');
  for(const item of view.items.filter(i=>i.forecast))select.append(new Option(item.name+(name==='sampling'&&(item.forecast.open||item.forecast.measurement)?'（計測中）':''),item.id));
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
 itemsById = new Map(view.items.map(item => [item.id, item]));
 stockWorkspaces.clear();
 if($('stock-workspaces'))$('stock-workspaces').replaceChildren();
 const asOf=$('as-of');
 if(asOf)asOf.textContent=view.asOf?'推定時点：'+formatRecordedAt(view.asOf)+' ／最新の記録を読むと更新':'推定時点を確認するには最新の記録を読んでください';
 historyDirty=true;
 const overview=$('overview');
 if(overview){
  overview.replaceChildren();
  for(const [label,count] of [['管理品目',view.items.length],['要発注・確認',view.items.filter(needsOrder).length],['未入荷の注文',view.items.reduce((n,i)=>n+(i.orders||[]).length,0)]]){
   const metric=el('div','');metric.append(el('strong',String(count)),el('span',label));overview.append(metric);
  }
 }
 $('cards').replaceChildren();
 for(const item of view.items.filter(i=>filter==='all'||filter==='low'&&needsOrder(i)||filter==='ordered'&&(i.orders||[i.order]).some(o=>o?.status==='ORDERED'))){
 const c=el('article','',needsOrder(item)?'card attention':'card');c.append(el('h3',item.name),el('span',needsOrder(item)?'要確認・発注':'推定在庫',needsOrder(item)?'badge low':'badge'),el('p',inventoryQuantityLabel(item),'qty'),el('p','固定の最低在庫目安 '+quantities(item.threshold),'muted'));
 if(item.forecast)renderConsumption(c,item);
 const orders=item.orders||(item.order?[item.order]:[]);
 for(const order of orders.filter(o=>o.status==='ORDERED')){
 c.append(el('p',order.actor+'が発注済み'+(order.at?' '+formatRecordedAt(order.at) :'')));
 if(!order.plannedLine)c.append(el('p','発注数量：未記入'));
 c.append(el('p','到着予定日：'+(order.expectedOn||'不明')));
 if(order.plannedLine)c.append(el('p','発注数量 '+order.plannedLine.quantity+' '+(item.units.find(u=>u.id===order.plannedLine.unitId)?.label||order.plannedLine.unitId)+'（'+quantities(order.plannedLine.amount)+'）'));
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
 const b=el('button','入荷を登録');b.onclick=()=>{$('lines').replaceChildren();addLine(item.id);tab('receiving');};c.append(b);$('cards').append(c);
 }
 $('complete').replaceChildren(new Option('選択しない',''));
 // 受取完了は注文ごと。一件を完了しても他の未入荷注文を残す。
 for(const i of view.items)for(const o of (i.orders||(i.order?[i.order]:[])).filter(o=>o.status==='ORDERED'))$('complete').append(new Option(i.name+' ／ '+(o.at?formatRecordedAt(o.at):'発注')+' ／ '+(o.plannedLine?o.plannedLine.quantity+' '+(i.units.find(u=>u.id===o.plannedLine.unitId)?.label||o.plannedLine.unitId):'数量未記入')+' ／ 到着 '+(o.expectedOn||'不明')+' ／ '+o.id,o.id));
 if(activeTab==='history')renderHistory();
 showStockAction(stockAction);
}
/** 隠れている履歴100件を毎回DOM化しない。タブを初めて開いた時に最新DTOを描く。 */
function renderHistory(){
 historyDirty=false;
 $('logs').replaceChildren();
 for(const log of view.history){const names={START_MEASUREMENT:'消費の計測開始',RECORD_MEASUREMENT:'期間の消費記録',UPDATE_MEASUREMENT:'消費の確認・完了',CANCEL_MEASUREMENT:'消費計測の取消',START_SAMPLE:'消費速度の計測開始',FINISH_SAMPLE:'消費速度の計測完了',CANCEL_SAMPLE:'計測取消',COUNT_STOCK:'在庫基準の補正',SET_FORECAST:'発注期限の設定',RECEIVE:'入荷',MARK_ORDERED:'発注済み記録',CANCEL_ORDERED:'発注済みの取消し',COMPLETE_CASE:'受取完了'};const row=el('article','','line');row.append(el('p',names[log.type]||'記録'),el('p',formatRecordedAt(log.at),'muted'));if(log.measurement){const m=log.measurement;if(m.usedAmount!==null)row.append(el('p','累計投入 '+measurementQuantity(m.usedAmount)));if(m.endedAt)row.append(el('p','計測期間 '+formatRecordedAt(m.startedAt)+'〜'+formatRecordedAt(m.endedAt),'muted'));}for(const l of log.lines){const i=itemsById.get(l.itemId);row.append(el('p',(i?.name||'品目')+' '+quantities(l.amount)));}$('logs').append(row);}
 if(!view.history.length)$('logs').append(el('p','まだ記録はありません。','muted'));
}
/** 一品目一行。単位/換算版を読み取った値で送り、サーバー側で再検証する。 */
function addLine(itemId,container=$('lines'),ordering=false){
 const row=el('div','','line');const item=el('select','');item.setAttribute('aria-label','入荷品目');
 for(const i of view.items.filter(i=>!ordering||i.id===itemId))item.append(new Option(i.name,i.id));
 if(itemId)item.value=itemId;
 const count=el('input','');count.type='number';count.min='1';count.max='1000';count.step='1';count.value=ordering?'':'1';count.required=!ordering;count.placeholder=ordering?'未記入でも可':'';count.setAttribute('aria-label',ordering?'発注数量（任意）':'入荷数量');
 const unit=el('select','');unit.setAttribute('aria-label','入荷単位');const hint=el('p','','muted');
 const updateHint=()=>{const i=itemsById.get(item.value),u=i.units.find(x=>x.id===unit.value);if(ordering&&count.value===''){hint.textContent='発注数量：未記入';return;}hint.textContent='見本：1'+u.label+' '+quantities(u.baseQuantity)+(ordering?' ／発注量 ':' ／加算 ')+quantities(Number(count.value)*u.baseQuantity);};
 const updateUnit=()=>{const i=itemsById.get(item.value);unit.replaceChildren();for(const u of i.units)unit.append(new Option(u.label,u.id));updateHint();};
 item.onchange=updateUnit;unit.onchange=updateHint;count.oninput=updateHint;updateUnit();
 const remove=el('button','この行を削除');remove.type='button';remove.onclick=()=>row.remove();
 row.append(item,count,unit,hint);if(!ordering)row.append(remove);row.requestLine=()=>{if(ordering&&count.value.trim()==='')return null;const i=itemsById.get(item.value),u=i.units.find(x=>x.id===unit.value);return {itemId:i.id,quantity:Number(count.value),unitId:u.id,conversionVersion:u.version};};container.append(row);return row;
}
const errors={INVALID_MEASUREMENT:'量と単位を確認してください。袋数0では使いかけ分を計れません。',FUTURE_MEASUREMENT:'未来の日時は記録できません。',MEASUREMENT_OVERLAP:'同じ品目の計測期間が重複しています。現在の計測を更新するか、期間を確認してください。',MEASUREMENT_NOT_FOUND:'対象の計測が見つかりません。最新の記録を読んでください。',MEASUREMENT_CHANGED:'他の操作で計測が更新されています。最新の記録を読んでください。',MEASUREMENT_CLOSED:'この計測は既に終了・取消されています。',ACTION_REMOVED:'画面を再読み込みして新しい標本計測を使ってください。',PACK_ALREADY_OPEN:'この品目は既に計測中です。',PACK_CHANGED:'計測状態が変わりました。最新の画面を確認してください。',INVALID_DURATION:'開始と終了の時刻を確認してください。',ORDER_CONFIRMATION_REQUIRED:'在庫が更新され要発注ではなくなりました。再度確認して記録してください。',ORDER_CHANGED:'発注内容が更新されました。最新の記録を確認してください。',NOT_ORDERED:'この記録は既に取り消されています。',CASE_CLOSED:'この発注は受取完了しています。',ALREADY_ORDERED:'他の発注済み記録があります。最新状態を確認してください。',CONVERSION_CHANGED:'単位換算が更新されています。再読取してください。',INVALID_COMPLETION:'受取完了の発注と入荷品目が一致しません。',FORBIDDEN:'操作権限を確認できません。',INVALID_LINE:'品目の重複や数量を確認してください。',FUTURE_RECEIPT:'届いた日には今日以前を指定してください。'};
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
  pending=null;await load();message(errors[data.code]||'保存できませんでした：'+data.code);return;
 }
 saved=true;
 if(['RECEIVE','MARK_ORDERED'].includes(pending.type))stockAction='overview';
 pending=null;
 // 署名検証済みの保存応答に、原簿読戻し後の画面があれば再通信を省く。旧APIはREADへ戻る。
 if(data.view){view=data.view;render();}else await load();
 $('lines').replaceChildren();addLine();tab('stock');message('保存しました。最新記録を確認しました。');
 }catch{
  if(saved){message('保存は成功しましたが表示の更新に失敗しました。「最新の記録を読む」を押してください。');}
  else{message('保存結果が不明です。同じ操作を再確認してください。');$('recovery').hidden=false;}
 }finally{lock(false);}
}
$('receipt').onsubmit=e=>{e.preventDefault();const lines=[...$('lines').children].map(r=>r.requestLine());send({type:'RECEIVE',receivedOn:$('day').value,lines,completeCaseId:$('complete').value||null});};
$('retry').onclick=()=>send();
const readErrors={OWNER_AUTHORIZATION_REQUIRED:'サービス所有者のGoogle連携認可が必要です。',AUTH_REQUIRED:'LINEでログインしてください。',AUTH_UNAVAILABLE:'TLHアカウントの照合に接続できません。',LOGIN_UNAVAILABLE:'LINEログインの準備に失敗しました。',OFFLINE:'オンライン接続が必要です。',NOT_CONFIGURED:'在庫サービスの接続設定が未完了です。管理者に連絡してください。',FORBIDDEN:'TLHアカウントと有効な従業員登録を確認してください。',SCHEMA_MISMATCH:'在庫データを読み取れません。管理者に連絡してください。',LEDGER_REVIEW_REQUIRED:'保存原簿の整合性を確認する必要があります。',RPC_TIMEOUT:'Googleから応答がありません。もう一度読み込んでください。',RPC_FAILED:'Googleへの接続に失敗しました。もう一度読み込んでください。'};
const readFailure=e=>message('在庫を読み込めません。'+(readErrors[e?.message]||'Googleの認可・試験用Sheetへのアクセスを確認し、もう一度読み込んでください。'));
/** 初回失敗からの復旧時も入力行を用意する。読取の度に入力中の行を増やさない。 */
async function refresh(){
 if(busy)return;lock(true);message('在庫を読み込んでいます…');
 try{await load();if(!$('lines').children.length)addLine();message('最新の記録を読みました。');}
 catch(e){view=null;readFailure(e);}
 finally{lock(false);}
}
$('refresh').onclick=refresh;
$('add').onclick=()=>{if(view)addLine();};
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>tab(b.dataset.tab);
for(const b of document.querySelectorAll('[data-stock-action]'))b.onclick=()=>{if(view&&!busy&&!pending)showStockAction(b.dataset.stockAction);};
for(const b of document.querySelectorAll('[data-filter]'))b.onclick=()=>{filter=b.dataset.filter;for(const x of document.querySelectorAll('[data-filter]'))x.setAttribute('aria-pressed',String(x===b));if(view)render();};
// 端末が海外時刻でも、サーバーと同じJSTの日付を入荷の初期値にする。
$('day').value=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
refresh();



window.addEventListener('pagehide', () => {view = null; pending = null; itemsById.clear();stockWorkspaces.clear();document.getElementById('stock-workspaces').replaceChildren();});
