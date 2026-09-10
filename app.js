const KEY='khonji_pwa_v1';
const BUILD_VERSION='1.7.4';
const BUILD='1.1.2';
const DEFAULT={
  trades:[],
  currencies:[],
  fx:{usdAed:3.67,eurUsd:1.150,usdQar:3.67,usdTry:48,omrAed:9.5},
  theme:'dark'
};
let state=load();
const brokenSettlementGroups=settlementIntegrityCheck();
if(brokenSettlementGroups.length)console.warn('Broken settlement groups detected; left untouched for safety:',brokenSettlementGroups);
let currentView='dashboard';
let entryType='GOLD', entryBuy=true, selectedCoin='تمام سکه', editId=null, ledgerFilter='ALL';

function load(){
  try{
    const x=JSON.parse(localStorage.getItem(KEY)||'null');
    return {...structuredClone(DEFAULT),...(x||{}),fx:{...DEFAULT.fx,...((x||{}).fx||{})}};
  }catch{return structuredClone(DEFAULT)}
}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function fmt(x,d=3){return new Intl.NumberFormat('fa-IR',{maximumFractionDigits:d}).format(Math.abs(x))}
function signed(x){return (x>0?'+':x<0?'−':'')+fmt(x)}
function coinActionMini(v,name){
  if(Math.abs(v)<1e-9)return 'بالانس';
  return `${fmt(v)} ${name} • ${v>0?'بفروش':'بخر'}`;
}
function liveStatusHtml(value, text){
  if(Math.abs(value)<1e-9){
    return `<span class="liveState balanced">${text}</span>`;
  }
  const cls=value>0?'sellState':'buyState';
  return `<span class="liveState ${cls}"><i class="statusDot"></i>${text}</span>`;
}

function formatMoneyInput(el){
  const raw=el.value.replace(/[^0-9]/g,'');
  if(!raw){el.value='';return}
  el.value=Number(raw).toLocaleString('en-US');
}
function todayStart(){const d=new Date();d.setHours(0,0,0,0);return d.getTime()}
function isToday(t){return t.ts>=todayStart()}
function sign(t){return t.side==='BUY'?1:-1}
function eq18(t){
  if(t.asset==='تمام سکه')return t.qty*9.756;
  if(t.asset==='نیم سکه')return t.qty*4.878;
  if(t.asset==='ربع سکه')return t.qty*2.439;
  if(t.asset==='آبشده'||t.asset==='طلای متفرقه')return t.qty;
  return 0;
}
function calcGoldBalance(){return state.trades.reduce((a,t)=>a+sign(t)*eq18(t),0)}
function rawGold(){return state.trades.reduce((a,t)=>a+(t.asset==='آبشده'||t.asset==='طلای متفرقه'?sign(t)*t.qty:0),0)}
function coinBal(name){return state.trades.reduce((a,t)=>a+(t.asset===name?sign(t)*t.qty:0),0)}
function curBal(name){return state.trades.reduce((a,t)=>a+(t.asset===name?sign(t)*t.qty:0),0)}

function coinEq18(name,qty){
  if(name==='تمام سکه')return qty*9.756;
  if(name==='نیم سکه')return qty*4.878;
  if(name==='ربع سکه')return qty*2.439;
  return 0;
}

const COVER_ASSETS=[
  {name:'آبشده', label:'طلای وزنی', unit:'گرم', eq:1, step:0.001, integer:false},
  {name:'تمام سکه', label:'تمام', unit:'عدد', eq:9.756, step:1, integer:true},
  {name:'نیم سکه', label:'نیم', unit:'عدد', eq:4.878, step:1, integer:true},
  {name:'ربع سکه', label:'ربع', unit:'عدد', eq:2.439, step:1, integer:true}
];

function assetDef(name){ return COVER_ASSETS.find(x=>x.name===name); }
function coverBalance(name){ return name==='آبشده' ? rawGold() : coinBal(name); }
function assetEq18(name,qty){ const d=assetDef(name); return d ? d.eq*qty : 0; }
function coverFmtQty(name,qty){ const d=assetDef(name); return fmt(qty,d?.integer?0:3); }
function coverLabel(name,qty){
  const d=assetDef(name);
  return `${coverFmtQty(name,qty)} ${d?.label||name}`;
}

function coinQtyFor18(name,grams){
  const u = name==='تمام سکه'?9.756:name==='نیم سکه'?4.878:name==='ربع سکه'?2.439:0;
  return u>0 ? grams/u : 0;
}
function settlementTrades(){
  return state.trades.filter(t=>t.kind==='SETTLEMENT');
}
function normalTrades(){
  return state.trades.filter(t=>t.kind!=='SETTLEMENT');
}

function usdRate(n){
  if(n==='دلار')return 1;
  if(n==='درهم')return 1/state.fx.usdAed;
  if(n==='یورو')return state.fx.eurUsd;
  if(n==='ریال قطر')return 1/state.fx.usdQar;
  if(n==='لیر'||n==='لیر ترکیه')return 1/state.fx.usdTry;
  if(n==='ریال عمان')return state.fx.omrAed/state.fx.usdAed;
  return NaN;
}
function usdBalance(){
  return state.trades.reduce((a,t)=>{
    const r=usdRate(t.asset);
    return a+(Number.isNaN(r)?0:sign(t)*t.qty*r);
  },0)
}
function action(balance,unit,name=''){
  if(Math.abs(balance)<1e-9)return 'بالانس';
  return `${fmt(balance)} ${unit}${name?' '+name:''} ${balance>0?'بفروش':'بخر'}`;
}
function settlementConfirm(message){
  return confirm(message + '\n\nاین ثبت به عنوان «تسویه داخلی» ذخیره می‌شود.');
}


function settlementGroupLegs(groupId, fallbackId=null){
  if(groupId){
    return state.trades.filter(t=>t.kind==='SETTLEMENT' && t.groupId===groupId);
  }
  return fallbackId==null ? [] : state.trades.filter(t=>t.kind==='SETTLEMENT' && t.id===fallbackId);
}

function settlementGroupDescriptor(legs){
  const target=legs.find(x=>x.leg==='TARGET');
  const sources=legs.filter(x=>x.leg==='SOURCE');
  if(!target || !sources.length){
    return {
      title:'پوشش داخلی',
      target,
      sources,
      text:legs.map(x=>`${x.side==='BUY'?'خرید':'فروش'} ${coverLabel(x.asset,x.qty)}`).join(' + ')
    };
  }
  return {
    title:`پوشش ${assetDef(target.asset)?.label||target.asset}`,
    target,
    sources,
    text:`${coverLabel(target.asset,target.qty)} با ${sources.map(s=>coverLabel(s.asset,s.qty)).join(' + ')}`
  };
}

function balanceWithoutSettlementGroup(asset, groupId, fallbackId=null){
  return state.trades.reduce((sum,t)=>{
    if(t.kind==='SETTLEMENT' && (
      (groupId && t.groupId===groupId) ||
      (!groupId && fallbackId!=null && t.id===fallbackId)
    )) return sum;

    if(asset==='آبشده'){
      return sum + ((t.asset==='آبشده'||t.asset==='طلای متفرقه') ? sign(t)*Number(t.qty||0) : 0);
    }
    return sum + (t.asset===asset ? sign(t)*Number(t.qty||0) : 0);
  },0);
}

function settlementUndoChanges(legs){
  const deltaByAsset={};

  for(const leg of legs){
    let asset=leg.asset;
    if(asset==='طلای متفرقه') asset='آبشده';

    // Current balance contains sign(leg)*qty.
    // Deleting the leg applies the exact inverse.
    const undoDelta = -sign(leg)*Number(leg.qty||0);
    deltaByAsset[asset]=(deltaByAsset[asset]||0)+undoDelta;
  }

  return Object.entries(deltaByAsset)
    .filter(([,delta])=>Math.abs(delta)>1e-9)
    .map(([asset,delta])=>({asset,delta}));
}

function settlementAssetReadable(asset){
  if(asset==='آبشده')return 'طلای وزنی';
  return asset;
}

function settlementUndoLine(change, groupId, fallbackId=null){
  const {asset,delta}=change;
  const after=balanceWithoutSettlementGroup(asset,groupId,fallbackId);
  const d=assetDef(asset);
  const qtyText = d?.integer
    ? `${formatGroupedNumber(Math.abs(Math.round(delta)),0)} عدد`
    : `${formatGroupedNumber(Math.abs(delta),3)} گرم`;

  let movement;
  if(delta>0){
    movement=`${qtyText} ${settlementAssetReadable(asset)} به بالانس اضافه می‌شود`;
  }else{
    movement=`${qtyText} ${settlementAssetReadable(asset)} از بالانس کم می‌شود`;
  }

  let resulting;
  if(Math.abs(after)<1e-9){
    resulting='بعد از حذف: بالانس';
  }else{
    const afterQty=d?.integer
      ? `${formatGroupedNumber(Math.abs(Math.round(after)),0)} عدد`
      : `${formatGroupedNumber(Math.abs(after),3)} گرم`;
    resulting=`بعد از حذف: ${afterQty} ${after>0?'بفروش':'بخر'}`;
  }

  return `• ${movement} — ${resulting}`;
}

function settlementUndoPreview(groupId, fallbackId=null){
  const legs=settlementGroupLegs(groupId,fallbackId);
  const desc=settlementGroupDescriptor(legs);
  const changes=settlementUndoChanges(legs);
  const lines=changes.map(c=>settlementUndoLine(c,groupId,fallbackId));

  return {
    legs,
    desc,
    changes,
    text:lines.join('\n')
  };
}

function deleteSettlementGroupWithDoubleConfirm(groupId, fallbackId=null, afterDelete=null){
  const preview=settlementUndoPreview(groupId,fallbackId);
  if(!preview.legs.length){
    alert('رکوردهای این پوشش پیدا نشدند؛ هیچ تغییری انجام نشد.');
    return false;
  }

  const first = confirm(
    `این پوشش داخلی حذف شود؟\n\n${preview.desc.text}\n\nاین کار تمام اجزای همین پوشش را با هم حذف می‌کند.`
  );
  if(!first)return false;

  const secondMessage =
    `تأیید نهایی حذف پوشش\n\n` +
    `با حذف این مورد، اثر پوشش کامل برگردانده می‌شود:\n\n` +
    `${preview.text || '• تغییر قابل محاسبه‌ای پیدا نشد.'}\n\n` +
    `مطمئنی کل این پوشش حذف و بالانس‌ها به حالت قبل برگردند؟`;

  const second = confirm(secondMessage);
  if(!second)return false;

  const ids=new Set(preview.legs.map(x=>x.id));
  const beforeCount=state.trades.length;
  state.trades=state.trades.filter(t=>!ids.has(t.id));

  if(state.trades.length===beforeCount){
    alert('حذف انجام نشد؛ هیچ رکوردی تغییر نکرد.');
    return false;
  }

  save();
  if(typeof afterDelete==='function')afterDelete();
  return true;
}

function settlementIntegrityCheck(){
  const groups=new Map();
  state.trades.filter(t=>t.kind==='SETTLEMENT').forEach(t=>{
    const key=t.groupId||`LEGACY-${t.id}`;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(t);
  });

  const broken=[];
  for(const [groupId,legs] of groups){
    const targets=legs.filter(x=>x.leg==='TARGET');
    const sources=legs.filter(x=>x.leg==='SOURCE');
    if(targets.length!==1 || sources.length<1){
      broken.push({groupId,targets:targets.length,sources:sources.length});
    }
  }
  return broken;
}

function addSmartSettlement({targetName,targetQty,sources}){
  const groupId='SET-'+Date.now();
  const ts=Date.now();

  sources.forEach((s,i)=>{
    state.trades.unshift({
      id:ts+10+i, groupId, kind:'SETTLEMENT', leg:'SOURCE',
      side:'SELL', asset:s.name, qty:s.qty,
      total:0, rate:0, party:'تسویه داخلی',
      note:`پوشش ${coverLabel(targetName,targetQty)}`,
      coinType:'BANK', autoQty:false, ts
    });
  });

  state.trades.unshift({
    id:ts+1, groupId, kind:'SETTLEMENT', leg:'TARGET',
    side:'BUY', asset:targetName, qty:targetQty,
    total:0, rate:0, party:'تسویه داخلی',
    note:`پوشش با ${sources.map(s=>coverLabel(s.name,s.qty)).join(' + ')}`,
    coinType:'BANK', autoQty:false, ts
  });
  save();
}

function closeSettlementPicker(){
  document.getElementById('settlementPickerOverlay')?.remove();
}

function availablePositiveSources(excludeName){
  return COVER_ASSETS
    .filter(a=>a.name!==excludeName)
    .map(a=>({...a,bal:coverBalance(a.name)}))
    .filter(a=>a.bal>0.000001);
}

function solveSourcesExact(targetName,targetQty){
  const need=assetEq18(targetName,targetQty);
  if(need<=0)return null;

  const src=availablePositiveSources(targetName);
  if(!src.length)return null;

  const gold=src.find(s=>s.name==='آبشده');
  const full=Math.floor((src.find(s=>s.name==='تمام سکه')?.bal||0)+1e-9);
  const half=Math.floor((src.find(s=>s.name==='نیم سکه')?.bal||0)+1e-9);
  const quarter=Math.floor((src.find(s=>s.name==='ربع سکه')?.bal||0)+1e-9);

  // Search coin combinations bounded by target equivalent, not by total inventory.
  const mf=Math.min(full,Math.floor((need+0.0005)/9.756));
  const mh=Math.min(half,Math.floor((need+0.0005)/4.878));
  const mq=Math.min(quarter,Math.floor((need+0.0005)/2.439));

  let best=null;
  for(let f=0;f<=mf;f++){
    for(let h=0;h<=mh;h++){
      for(let q=0;q<=mq;q++){
        const coinEq=f*9.756+h*4.878+q*2.439;
        if(coinEq>need+0.0005)continue;
        const rem=need-coinEq;
        if(rem>0.0005 && (!gold || gold.bal+0.0005<rem))continue;

        const arr=[];
        if(f)arr.push({name:'تمام سکه',qty:f});
        if(h)arr.push({name:'نیم سکه',qty:h});
        if(q)arr.push({name:'ربع سکه',qty:q});
        if(rem>0.0005)arr.push({name:'آبشده',qty:rem});
        if(!arr.length)continue;

        // Prefer less gold, then fewer source units.
        const goldUsed=rem>0.0005?rem:0;
        const itemCount=f+h+q+(goldUsed>0?1:0);
        const score=goldUsed*1000+itemCount;
        if(!best || score<best.score)best={sources:arr,score};
      }
    }
  }
  return best?.sources||null;
}

function bestFeasibleTarget(targetName){
  const bal=coverBalance(targetName);
  if(bal>=-0.000001)return null;
  const deficit=Math.abs(bal);
  const def=assetDef(targetName);

  if(def?.integer){
    const max=Math.floor(deficit+1e-9);
    for(let q=max;q>=1;q--){
      const sources=solveSourcesExact(targetName,q);
      if(sources)return {targetQty:q,sources,full:q===max};
    }
    return null;
  }

  // Gold target: source assets are coins, so choose the largest exact coin-equivalent
  // that does not exceed the gold deficit.
  const src=availablePositiveSources(targetName);
  const full=Math.floor((src.find(s=>s.name==='تمام سکه')?.bal||0)+1e-9);
  const half=Math.floor((src.find(s=>s.name==='نیم سکه')?.bal||0)+1e-9);
  const quarter=Math.floor((src.find(s=>s.name==='ربع سکه')?.bal||0)+1e-9);

  let best=null;
  const mf=Math.min(full,Math.floor(deficit/9.756)+1);
  const mh=Math.min(half,Math.floor(deficit/4.878)+1);
  const mq=Math.min(quarter,Math.floor(deficit/2.439)+1);

  for(let f=0;f<=mf;f++){
    for(let h=0;h<=mh;h++){
      for(let q=0;q<=mq;q++){
        const eq=f*9.756+h*4.878+q*2.439;
        if(eq<=0.0005 || eq>deficit+0.0005)continue;
        if(!best || eq>best.eq+0.0005 || (Math.abs(eq-best.eq)<0.0005 && f+h+q<best.count)){
          const arr=[];
          if(f)arr.push({name:'تمام سکه',qty:f});
          if(h)arr.push({name:'نیم سکه',qty:h});
          if(q)arr.push({name:'ربع سکه',qty:q});
          best={targetQty:eq,sources:arr,eq,count:f+h+q};
        }
      }
    }
  }
  if(!best)return null;
  best.full=Math.abs(best.targetQty-deficit)<0.0005;
  return best;
}

function openSmartCoverPicker(targetName){
  const targetBal=coverBalance(targetName);
  if(targetBal>=-0.000001){
    alert('این مورد در حال حاضر کسری ندارد.');
    return;
  }

  const deficit=Math.abs(targetBal);
  const proposal=bestFeasibleTarget(targetName);
  if(!proposal){
    alert('با موجودی فعلی، حتی پوشش جزئی معتبر هم برای این مورد ممکن نیست.');
    return;
  }

  const tdef=assetDef(targetName);
  let selectedTarget=proposal.targetQty;

  const sourceDefs=availablePositiveSources(targetName).map(s=>({...s,qty:0}));
  proposal.sources.forEach(p=>{
    const x=sourceDefs.find(s=>s.name===p.name);
    if(x)x.qty=p.qty;
  });

  const overlay=document.createElement('div');
  overlay.id='settlementPickerOverlay';
  overlay.className='settlementOverlay';
  overlay.innerHTML=`
    <div class="settlementModal" role="dialog" aria-modal="true">
      <div class="settlementModalHead">
        <div>
          <h3>پوشش ${tdef?.label||targetName}</h3>
          <small>کسری کل: ${coverLabel(targetName,deficit)}</small>
        </div>
        <button class="modalClose" aria-label="بستن">×</button>
      </div>

      <div class="targetPickerBox">
        <span>مقدار موردنظر برای پوشش</span>
        <div class="targetStepper">
          <button data-target-op="minus">−</button>
          <input id="targetQtyInput" type="text" inputmode="none" pattern="[0-9۰-۹.,]*" dir="ltr" data-custom-keypad="1">
          <button data-target-op="plus">+</button>
        </div>
        <small id="targetEqText"></small>
      </div>

      <div class="smartProposal">
        پیشنهاد فعلی:
        <b id="proposalText"></b>
      </div>

      <div class="settlementPickerRows"></div>

      <div class="settlementCalc">
        <div><span>معادل هدف</span><strong id="targetEqVal">۰ گرم</strong></div>
        <div><span>معادل منابع</span><strong id="sourceEqVal">۰ گرم</strong></div>
        <div><span>اختلاف</span><strong id="pickerDiff">—</strong></div>
        <p id="pickerWarning"></p>
      </div>

      <div class="settlementModalActions">
        <button class="cancelSettle">انصراف</button>
        <button class="confirmSettle">تأیید و ثبت</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const rows=overlay.querySelector('.settlementPickerRows');
  const targetInput=overlay.querySelector('#targetQtyInput');

  function normalizeTarget(v){
    v=Math.max(0,Math.min(deficit,Number(v)||0));
    if(tdef?.integer)v=Math.round(v);
    return v;
  }

  function resetSourcesToProposal(){
    sourceDefs.forEach(s=>s.qty=0);
    const p=solveSourcesExact(targetName,selectedTarget);
    if(p){
      p.forEach(x=>{
        const s=sourceDefs.find(y=>y.name===x.name);
        if(s)s.qty=x.qty;
      });
    }
  }

  function selectedSources(){
    return sourceDefs.filter(s=>s.qty>0.000001).map(s=>({name:s.name,qty:s.qty}));
  }

  function renderRows(){
    rows.innerHTML=sourceDefs.map((s,i)=>{
      const isGold=s.name==='آبشده';
      return `
      <div class="pickerCoinRow" data-i="${i}">
        <div class="pickerCoinName">
          <b>${s.label}</b>
          <small>در دسترس: ${coverFmtQty(s.name,s.bal)} ${s.unit}</small>
        </div>
        <div class="pickerStepper">
          <button data-op="minus">−</button>
          <input class="pickerQtyInput" type="text" inputmode="none" pattern="[0-9۰-۹.,]*" dir="ltr" data-custom-keypad="1"
                 value="${s.qty ? Number(s.qty.toFixed(isGold?3:0)) : 0}">
          <button data-op="plus">+</button>
        </div>
      </div>`;
    }).join('');

    rows.querySelectorAll('.pickerCoinRow').forEach(row=>{
      const i=Number(row.dataset.i);
      const s=sourceDefs[i];
      const input=row.querySelector('.pickerQtyInput');

      row.querySelector('[data-op="minus"]').onclick=()=>{
        const step=s.name==='آبشده'?0.001:1;
        s.qty=Math.max(0,s.qty-step);
        if(s.integer)s.qty=Math.round(s.qty);
        renderRows(); updateCalc();
      };
      row.querySelector('[data-op="plus"]').onclick=()=>{
        const step=s.name==='آبشده'?0.001:1;
        s.qty=Math.min(s.bal,s.qty+step);
        if(s.integer)s.qty=Math.round(s.qty);
        renderRows(); updateCalc();
      };
      input.oninput=()=>{
        let v=Number(input.value.replace(',','.'))||0;
        if(s.integer)v=Math.round(v);
        s.qty=Math.max(0,Math.min(s.bal,v));
        updateCalc();
      };
      input.onblur=()=>renderRows();
    });
  }

  function updateTargetDisplay(){
    targetInput.value=selectedTarget ? Number(selectedTarget.toFixed(tdef?.integer?0:3)) : 0;
    const eq=assetEq18(targetName,selectedTarget);
    overlay.querySelector('#targetEqText').textContent=`معادل ${fmt(eq)} گرم ۱۸`;
  }

  function updateCalc(){
    const targetEq=assetEq18(targetName,selectedTarget);
    const selected=selectedSources();
    const sourceEq=selected.reduce((a,s)=>a+assetEq18(s.name,s.qty),0);
    const diff=sourceEq-targetEq;

    overlay.querySelector('#targetEqVal').textContent=`${fmt(targetEq)} گرم`;
    overlay.querySelector('#sourceEqVal').textContent=`${fmt(sourceEq)} گرم`;
    overlay.querySelector('#pickerDiff').textContent=
      Math.abs(diff)<0.0005 ? 'دقیق' :
      diff>0 ? `${fmt(diff)} گرم اضافه` : `${fmt(Math.abs(diff))} گرم کم`;

    overlay.querySelector('#proposalText').textContent=
      selected.length ? selected.map(s=>coverLabel(s.name,s.qty)).join(' + ') : '—';

    const warning=overlay.querySelector('#pickerWarning');
    const confirmBtn=overlay.querySelector('.confirmSettle');

    if(selectedTarget>0 && selected.length && Math.abs(diff)<0.0005){
      warning.textContent=selectedTarget+0.0005>=deficit?'پوشش کامل است.':'پوشش جزئی معتبر است.';
      warning.className='pickerWarning ok';
      confirmBtn.disabled=false;
    }else{
      warning.textContent='معادل منابع باید دقیقاً با مقدار پوشش انتخاب‌شده برابر باشد.';
      warning.className='pickerWarning';
      confirmBtn.disabled=true;
    }
  }

  overlay.querySelector('[data-target-op="minus"]').onclick=()=>{
    const step=tdef?.integer?1:0.001;
    selectedTarget=normalizeTarget(selectedTarget-step);
    resetSourcesToProposal(); updateTargetDisplay(); renderRows(); updateCalc();
  };
  overlay.querySelector('[data-target-op="plus"]').onclick=()=>{
    const step=tdef?.integer?1:0.001;
    selectedTarget=normalizeTarget(selectedTarget+step);
    resetSourcesToProposal(); updateTargetDisplay(); renderRows(); updateCalc();
  };
  targetInput.onchange=()=>{
    selectedTarget=normalizeTarget(targetInput.value.replace(',','.'));
    resetSourcesToProposal(); updateTargetDisplay(); renderRows(); updateCalc();
  };

  updateTargetDisplay();
  renderRows();
  updateCalc();

  overlay.querySelector('.modalClose').onclick=closeSettlementPicker;
  overlay.querySelector('.cancelSettle').onclick=closeSettlementPicker;
  overlay.onclick=e=>{if(e.target===overlay)closeSettlementPicker()};

  overlay.querySelector('.confirmSettle').onclick=()=>{
    const sources=selectedSources();
    const targetEq=assetEq18(targetName,selectedTarget);
    const sourceEq=sources.reduce((a,s)=>a+assetEq18(s.name,s.qty),0);
    if(selectedTarget<=0 || Math.abs(sourceEq-targetEq)>=0.0005)return;

    const msg=`${coverLabel(targetName,selectedTarget)} با ${sources.map(s=>coverLabel(s.name,s.qty)).join(' + ')} پوشش داده شود؟`;
    if(settlementConfirm(msg)){
      addSmartSettlement({targetName,targetQty:selectedTarget,sources});
      closeSettlementPicker();
      renderDashboard();
    }
  };
}

function settlementSummaryGroups(){
  const groups={};
  settlementTrades().forEach(t=>{
    if(!groups[t.groupId]) groups[t.groupId]={groupId:t.groupId,ts:t.ts,legs:[]};
    groups[t.groupId].legs.push(t);
  });
  return Object.values(groups).sort((a,b)=>b.ts-a.ts);
}

function setTheme(){
  document.body.classList.toggle('dark',state.theme==='dark');
  document.querySelector('meta[name="theme-color"]').setAttribute('content',state.theme==='dark'?'#0f1115':'#f7f5ef');
}
function show(view){
  currentView=view; editId=null;
  document.querySelector('.stickySave')?.remove();
  if(view==='dashboard')renderDashboard();
  if(view==='entry')renderEntry();
  if(view==='ledger')renderLedger();
  if(view==='report')renderReport();
  if(view==='settings')renderSettings();

  requestAnimationFrame(applyBottomUiV171);
}
function cloneTpl(id){return document.getElementById(id).content.cloneNode(true)}
function setView(node){const v=document.getElementById('view');v.innerHTML='';v.append(node);window.scrollTo({top:0,behavior:'instant'})}


function applyDashboardPriorityLayout(){
  const dash=document.querySelector('.dashboardV164');
  const top=dash?.querySelector('.dashboardTopV164');
  const status=dash?.querySelector('.dashboardStatusColV164');
  const stats=dash?.querySelector('.dashboardStatsColV164');
  const quick=dash?.querySelector('.quickSectionV164');

  if(!dash || !top || !status || !stats || !quick)return;

  // HARD DOM GUARANTEE:
  // live status and KPI stats always live inside the top block,
  // and the quick-entry section always comes immediately after it.
  if(status.parentElement!==top)top.appendChild(status);
  if(stats.parentElement!==top)top.appendChild(stats);

  // Force exact visual order independent of older cached CSS.
  top.insertBefore(status, top.firstChild);
  top.appendChild(stats);

  if(top.nextElementSibling!==quick){
    dash.insertBefore(quick, top.nextSibling);
  }

  const w=window.innerWidth;
  const h=window.innerHeight;
  const portrait=h>=w;

  top.style.setProperty('display','grid','important');
  top.style.setProperty('direction','ltr','important');
  top.style.setProperty('align-items','start','important');
  top.style.setProperty('width','100%','important');
  top.style.setProperty('min-width','0','important');

  // iPad portrait: left status panel, right KPI block.
  if(portrait && w>=700){
    top.style.setProperty('grid-template-columns','minmax(0,0.44fr) minmax(0,0.56fr)','important');
    top.style.setProperty('gap','12px','important');
  }else if(w>=700){
    top.style.setProperty('grid-template-columns','minmax(300px,0.42fr) minmax(0,0.58fr)','important');
    top.style.setProperty('gap','16px','important');
  }else{
    top.style.setProperty('grid-template-columns','1fr','important');
    top.style.setProperty('gap','12px','important');
  }

  status.style.setProperty('grid-column','1','important');
  status.style.setProperty('grid-row','1','important');
  status.style.setProperty('direction','rtl','important');
  status.style.setProperty('min-width','0','important');
  status.style.setProperty('order','0','important');
  status.style.setProperty('margin-top','0','important');
  status.style.setProperty('align-self','start','important');

  stats.style.setProperty('grid-column',w>=700?'2':'1','important');
  stats.style.setProperty('grid-row',w>=700?'1':'2','important');
  stats.style.setProperty('direction','rtl','important');
  stats.style.setProperty('min-width','0','important');
  stats.style.setProperty('order','0','important');
  stats.style.setProperty('margin-top','0','important');
  stats.style.setProperty('align-self','start','important');

  // Pull the whole top dashboard block closer to the header, equally in both orientations.
  top.style.setProperty('margin-top', portrait ? '-10px' : '-8px','important');

  quick.style.setProperty('display','block','important');
  quick.style.setProperty('width','100%','important');
  quick.style.setProperty('margin-top','18px','important');

  const grid=stats.querySelector('.statsGridV164');
  if(grid){
    grid.style.setProperty('display','grid','important');
    grid.style.setProperty('grid-template-columns','repeat(2,minmax(0,1fr))','important');
    grid.style.setProperty('gap','10px','important');
  }

  const balance=stats.querySelector('.balanceWideV164');
  if(balance){
    balance.style.setProperty('grid-column','1 / -1','important');
  }
}


function roundWhole(n){
  return Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0;
}

function fxKnownCurrencies(){
  return [...new Set([
    'دلار','درهم','یورو','ریال قطر','لیر','ریال عمان',
    ...(state.currencies||[])
  ])];
}

function fxCurrencyCode(name){
  const n=String(name||'').trim();
  const map={
    'دلار':'USD',
    'درهم':'AED',
    'یورو':'EUR',
    'ریال قطر':'QAR',
    'لیر':'TRY',
    'لیر ترکیه':'TRY',
    'ریال عمان':'OMR'
  };
  return map[n] || n;
}

function fxCurrencyDisplay(name){
  const code=fxCurrencyCode(name);
  const map={
    'دلار':'دلار',
    'درهم':'درهم',
    'یورو':'یورو',
    'ریال قطر':'ریال قطر',
    'لیر':'لیر',
    'لیر ترکیه':'لیر',
    'ریال عمان':'ریال عمان'
  };
  return {name:map[name]||name, code};
}

function getFxBalanceSnapshot(){
  const rows=[];
  let usdEquivalent=0;
  let hasUnconverted=false;

  for(const name of fxKnownCurrencies()){
    const balance=curBal(name);
    if(Math.abs(balance)<1e-9)continue;

    const rate=usdRate(name);
    const converted=Number.isNaN(rate) ? NaN : balance*rate;

    if(Number.isNaN(converted)){
      hasUnconverted=true;
    }else{
      usdEquivalent+=converted;
    }

    rows.push({
      name,
      code:fxCurrencyCode(name),
      balance,
      usdEquivalent:converted
    });
  }

  return {rows,usdEquivalent,hasUnconverted};
}

function fxWholeAction(balance,name){
  const rounded=roundWhole(balance);
  if(rounded===0)return 'بالانس';
  return `${formatGroupedNumber(Math.abs(rounded),0)} ${name} ${rounded>0?'بفروش':'بخر'}`;
}

function renderFxBalanceStatus(){
  const el=document.getElementById('sideFx');
  if(!el)return;

  // Use the app's original usdBalance() engine.
  const exactUsd=usdBalance();
  const rounded=roundWhole(exactUsd);

  if(rounded===0){
    el.textContent='بالانس';
    el.className='';
  }else{
    el.textContent=`معادل ${formatGroupedNumber(Math.abs(rounded),0)} دلار ${rounded>0?'بفروش':'بخر'}`;
    el.className=rounded>0?'needSell':'needBuy';
  }

  const row=document.getElementById('fxBalanceRow');
  if(row)row.onclick=openFxBalanceModal;
}

function openFxBalanceModal(){
  const modal=document.getElementById('fxBalanceModal');
  const details=document.getElementById('fxBalanceDetails');
  const summary=document.getElementById('fxBalanceSummary');
  if(!modal||!details||!summary)return;

  const snap=getFxBalanceSnapshot();
  const exactUsd=usdBalance();
  const roundedUsd=roundWhole(exactUsd);

  summary.textContent = roundedUsd===0
    ? 'بالانس کل ارزها: بالانس'
    : `بالانس کل ارزها: معادل ${formatGroupedNumber(Math.abs(roundedUsd),0)} دلار ${roundedUsd>0?'بفروش':'بخر'}`;

  if(snap.rows.length===0){
    details.innerHTML='<div class="fxEmpty">هنوز معامله ارزی ثبت نشده است.</div>';
  }else{
    details.innerHTML=snap.rows.map(row=>{
      const rounded=roundWhole(row.balance);
      const cls=rounded>0?'sell':rounded<0?'buy':'balanced';
      const d=fxCurrencyDisplay(row.name);
      const action=rounded===0
        ? 'بالانس'
        : `${formatGroupedNumber(Math.abs(rounded),0)} ${d.name} ${rounded>0?'بفروش':'بخر'}`;

      const eq = Number.isNaN(row.usdEquivalent)
        ? '<small class="fxNoRate">ضریب تبدیل به دلار ندارد</small>'
        : `<small class="fxUsdEq">معادل ${formatGroupedNumber(Math.abs(roundWhole(row.usdEquivalent)),0)} دلار</small>`;

      return `<div class="fxDetailRow ${cls}">
        <div class="fxCode"><b>${d.name}</b><small>${d.code!==d.name?d.code:''}</small></div>
        <div class="fxAction">${action}${eq}</div>
      </div>`;
    }).join('');
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden','false');
}

function closeFxBalanceModal(){
  const modal=document.getElementById('fxBalanceModal');
  if(!modal)return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden','true');
}

document.addEventListener('click',e=>{
  if(e.target.closest('[data-fx-close="1"]'))closeFxBalanceModal();
});


function applyBottomUiV171(){
  const nav=document.querySelector('.bottomNav, .navProV171');
  if(nav)nav.classList.add('navProV171');

  // Mark active nav item based on current view text/data when possible.
  const buttons=nav ? [...nav.querySelectorAll('button')] : [];
  buttons.forEach(b=>b.classList.remove('navActiveV171'));

  const viewName=String(currentView||'').toLowerCase();
  for(const b of buttons){
    const txt=b.textContent||'';
    const hit =
      (viewName.includes('dashboard') && txt.includes('داشبورد')) ||
      (viewName.includes('report') && txt.includes('گزارش')) ||
      (viewName.includes('entry') && txt.includes('ثبت سریع')) ||
      (viewName.includes('ledger') && txt.includes('دفتر امروز')) ||
      (viewName.includes('settings') && txt.includes('بیشتر'));
    if(hit)b.classList.add('navActiveV171');
  }

  // Dashboard mini-actions
  document.querySelectorAll('[data-open-ledger]').forEach(btn=>{
    btn.onclick=()=>show('ledger');
  });
  document.querySelectorAll('[data-open-summary]').forEach(btn=>{
    btn.onclick=()=>show('report');
  });

  // Make recent list easier to scan: max 3 visible rows if more exist.
  const recent=document.getElementById('recentMini');
  if(recent){
    const children=[...recent.children];
    children.forEach((el,i)=>el.classList.toggle('recentHiddenV171',i>=3));
  }
}


function renderTotalGoldCoinAdvice(){
  const el=document.getElementById('mainAdvice');
  if(!el)return;

  const bal=Number(goldBalance18()||0);
  const abs=Math.abs(bal);

  el.classList.remove('adviceBuyV172','adviceSellV172','adviceBalancedV172');

  if(abs<0.0005){
    el.innerHTML='<span class="advicePrefixV172">طلا و سکه سر هم</span><strong class="adviceActionV172">بالانس است</strong>';
    el.classList.add('adviceBalancedV172');
    return;
  }

  const action = bal>0 ? 'بفروش' : 'بخر';
  const cls = bal>0 ? 'adviceSellV172' : 'adviceBuyV172';

  el.innerHTML=
    `<span class="advicePrefixV172">برای بالانس طلا و سکه سر هم</span>`+
    `<strong class="adviceActionV172">${formatGroupedNumber(abs,3)} گرم ${action}</strong>`;

  el.classList.add(cls);
}


function installMainAdviceGuardV173(){
  const el=document.getElementById('mainAdvice');
  if(!el || el.dataset.adviceGuard==='1')return;
  el.dataset.adviceGuard='1';

  let busy=false;
  const obs=new MutationObserver(()=>{
    if(busy)return;
    busy=true;
    requestAnimationFrame(()=>{
      renderTotalGoldCoinAdvice();
      busy=false;
    });
  });
  obs.observe(el,{childList:true,characterData:true,subtree:true});
}

function renderDashboard(){
  setView(cloneTpl('dashboardTpl'));
  const today=state.trades.filter(isToday);
  const buy=today.filter(t=>t.side==='BUY').reduce((a,t)=>a+eq18(t),0);
  const sell=today.filter(t=>t.side==='SELL').reduce((a,t)=>a+eq18(t),0);
  const bal=calcGoldBalance();
  document.getElementById('buyToday').textContent=fmt(buy);
  document.getElementById('sellToday').textContent=fmt(sell);
  const gb=document.getElementById('goldBalance');
  gb.textContent=signed(bal);
  gb.classList.remove('balancePositive','balanceNegative','balanceZero');
  gb.classList.add(Math.abs(bal)<1e-9?'balanceZero':bal>0?'balancePositive':'balanceNegative');
// v1.7.3 legacy mainAdvice writer disabled:   document.getElementById('mainAdvice').textContent=bal>0?`برای بالانس ${fmt(bal)} گرم بفروش`:bal<0?`برای بالانس ${fmt(bal)} گرم بخر`:'بالانس طلا صفر است';
  const unnamed=today.filter(t=>!t.party).length;
  document.getElementById('todaySummary').innerHTML=`تعداد معاملات امروز: <b>${fmt(today.length,0)}</b><br>ثبت‌های بدون طرف حساب: <b>${fmt(unnamed,0)}</b><br>طلای وزنی: <b>${signed(rawGold())} گرم</b>`;

  const rg=rawGold(),fc=coinBal('تمام سکه'),hc=coinBal('نیم سکه'),qc=coinBal('ربع سکه'),fxb=usdBalance();
  document.getElementById('sideRawGold').innerHTML = liveStatusHtml(
    rg,
    Math.abs(rg)<1e-9 ? 'بالانس' : `${fmt(Math.abs(rg))} گرم • ${rg>0?'بفروش':'بخر'}`
  );
  document.getElementById('sideFullCoin').innerHTML = liveStatusHtml(
    fc,
    Math.abs(fc)<1e-9 ? 'بالانس' : `${fmt(Math.abs(fc),0)} تمام • ${fc>0?'بفروش':'بخر'}`
  );
  document.getElementById('sideHalfCoin').innerHTML = liveStatusHtml(
    hc,
    Math.abs(hc)<1e-9 ? 'بالانس' : `${fmt(Math.abs(hc),0)} نیم • ${hc>0?'بفروش':'بخر'}`
  );
  document.getElementById('sideQuarterCoin').innerHTML = liveStatusHtml(
    qc,
    Math.abs(qc)<1e-9 ? 'بالانس' : `${fmt(Math.abs(qc),0)} ربع • ${qc>0?'بفروش':'بخر'}`
  );
  document.getElementById('sideFx').innerHTML = liveStatusHtml(
    fxb,
    Math.abs(fxb)<1e-9 ? 'بالانس' : `${fmt(Math.abs(fxb))} دلار • ${fxb>0?'بفروش':'بخر'}`
  );

  function clearSettlementActions(){
    ['actRawGold','actFullCoin','actHalfCoin','actQuarterCoin'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.innerHTML='';
    });
  }
  clearSettlementActions();

  const coverRows=[
    {name:'آبشده', actionId:'actRawGold'},
    {name:'تمام سکه', actionId:'actFullCoin'},
    {name:'نیم سکه', actionId:'actHalfCoin'},
    {name:'ربع سکه', actionId:'actQuarterCoin'}
  ];

  // Suggest when at least one non-zero valid cover (full OR partial) exists.
  coverRows.forEach(row=>{
    const bal=coverBalance(row.name);
    if(bal>=-0.000001)return;

    const p=bestFeasibleTarget(row.name);
    if(!p || p.targetQty<=0)return;

    const wrap=document.getElementById(row.actionId);
    if(!wrap)return;

    const kind=p.full?'پوشش کامل':'پوشش جزئی';
    const srcText=p.sources.map(s=>coverLabel(s.name,s.qty)).join(' + ');
    wrap.innerHTML=`
      <div class="coverageHint">${kind}: ${coverLabel(row.name,p.targetQty)} ← ${srcText}</div>
      <button class="settleBtn">پوشش بده</button>`;
    wrap.querySelector('button').onclick=()=>openSmartCoverPicker(row.name);
  });

  const recent=[...today].sort((a,b)=>b.ts-a.ts).slice(0,4);
  document.getElementById('recentMini').innerHTML = recent.length ? recent.map(t=>`
    <div class="recentMiniItem">
      <div><b>${t.side==='BUY'?'خرید':'فروش'} ${t.asset}</b><br><small>${t.party||'بدون طرف حساب'}</small></div>
      <strong>${fmt(t.qty)}</strong>
    </div>`).join('') : '<span style="color:var(--muted)">امروز معامله‌ای ثبت نشده</span>';

  document.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>{entryType=b.dataset.quick;show('entry')});
  document.querySelector('[data-action="open-buy"]').onclick=()=>{ledgerFilter='BUY';show('ledger')};
  document.querySelector('[data-action="open-sell"]').onclick=()=>{ledgerFilter='SELL';show('ledger')};
  document.querySelector('[data-action="open-balance"]').onclick=()=>show('report');

  requestAnimationFrame(applyDashboardPriorityLayout);

  requestAnimationFrame(renderFxBalanceStatus);

  requestAnimationFrame(applyBottomUiV171);

  renderTotalGoldCoinAdvice();
  requestAnimationFrame(renderTotalGoldCoinAdvice);

  installMainAdviceGuardV173();
}




let customKeypadTarget=null;
let customKeypadRaw='';
let customKeypadReplaceOnNextKey=false;
let customKeypadEditingFieldId=null;

function closeCustomKeypad(){
  const kp=document.getElementById('customNumericKeypad');
  if(kp){
    kp.classList.remove('show');
    const label=kp.querySelector('#ckFieldLabel');
    if(label)label.textContent='';
  }
  customKeypadTarget=null;
  customKeypadRaw='';
  customKeypadReplaceOnNextKey=false;
  customKeypadEditingFieldId=null;
  document.body.classList.remove('customKeypadOpen');
}

function appendKeypadDigit(raw,key,allowsDecimal){
  raw=String(raw??'');
  if(key==='back')return raw.slice(0,-1);

  if(key==='.'){
    if(allowsDecimal && !raw.includes('.')){
      return raw ? raw+'.' : '0.';
    }
    return raw;
  }

  if(/^[0-9]$/.test(key)){
    if(raw==='0' && key!=='0' && !raw.includes('.'))return key;
    return raw+key;
  }
  return raw;
}

function ensureCustomKeypad(){
  let kp=document.getElementById('customNumericKeypad');
  if(kp)return kp;

  kp=document.createElement('div');
  kp.id='customNumericKeypad';
  kp.className='customNumericKeypad';
  kp.innerHTML=`
    <div class="ckTop">
      <div class="ckTitleWrap">
        <strong>ورود عدد</strong>
        <span id="ckFieldLabel"></span>
      </div>
      <div class="ckTopActions">
        <button type="button" data-k="clear" class="ckClear">پاک</button>
        <button type="button" data-k="done" class="ckDone">تمام</button>
      </div>
    </div>
    <div class="ckGrid">
      <button type="button" data-k="1">1</button>
      <button type="button" data-k="2">2</button>
      <button type="button" data-k="3">3</button>
      <button type="button" data-k="4">4</button>
      <button type="button" data-k="5">5</button>
      <button type="button" data-k="6">6</button>
      <button type="button" data-k="7">7</button>
      <button type="button" data-k="8">8</button>
      <button type="button" data-k="9">9</button>
      <button type="button" data-k=".">.</button>
      <button type="button" data-k="0">0</button>
      <button type="button" data-k="back" class="ckBack">⌫</button>
    </div>
  `;
  document.body.appendChild(kp);

  kp.addEventListener('pointerdown',e=>e.preventDefault());

  kp.addEventListener('click',e=>{
    const b=e.target.closest('button[data-k]');
    if(!b || !customKeypadTarget)return;
    const k=b.dataset.k;

    if(k==='done'){
      customKeypadReplaceOnNextKey=false;
      customKeypadTarget.dispatchEvent(new Event('change',{bubbles:true}));
      closeCustomKeypad();
      return;
    }

    if(k==='clear'){
      customKeypadRaw='';
      customKeypadReplaceOnNextKey=false;
      customKeypadTarget.value='';
      customKeypadTarget.dataset.editingBlank='1';
      customKeypadTarget.dispatchEvent(new CustomEvent('input',{
        bubbles:true,
        detail:{fromCustomKeypad:true,cleared:true}
      }));
      return;
    }

    const allowsDecimal = customKeypadTarget.id==='qty'
      || customKeypadTarget.id==='targetQtyInput'
      || customKeypadTarget.classList.contains('pickerQtyInput');

    // Existing value is treated as selected when keypad opens.
    // First digit/decimal replaces it. First backspace clears it completely.
    if(customKeypadReplaceOnNextKey){
      if(k==='back'){
        customKeypadRaw='';
      }else if(k==='.'){
        customKeypadRaw=allowsDecimal?'0.':'';
      }else if(/^[0-9]$/.test(k)){
        customKeypadRaw=k;
      }
      customKeypadReplaceOnNextKey=false;
    }else{
      customKeypadRaw=appendKeypadDigit(customKeypadRaw,k,allowsDecimal);
    }

    let display=customKeypadRaw;
    if(customKeypadTarget.id==='total' || customKeypadTarget.id==='unitRate'){
      display=formatGroupedInputValue(customKeypadRaw,false,0);
    }else if(customKeypadTarget.id==='qty'){
      display=formatGroupedInputValue(customKeypadRaw,true,3);
    }else if(customKeypadTarget.id==='targetQtyInput' || customKeypadTarget.classList.contains('pickerQtyInput')){
      display=formatGroupedInputValue(customKeypadRaw,true,3);
    }

    customKeypadTarget.value=display;

    if(display===''){
      customKeypadTarget.dataset.editingBlank='1';
    }else{
      delete customKeypadTarget.dataset.editingBlank;
    }

    customKeypadTarget.dispatchEvent(new CustomEvent('input',{
      bubbles:true,
      detail:{fromCustomKeypad:true,cleared:display===''}
    }));
  });

  return kp;
}

function openCustomKeypad(el){
  customKeypadTarget=el;
  customKeypadEditingFieldId=el.id||null;
  customKeypadRaw=normalizeDigits(el.value||'');
  customKeypadReplaceOnNextKey=customKeypadRaw.length>0;
  // Keep a canonical raw number: no grouping separators, no spaces.
  if(el.id==='total' || el.id==='unitRate'){
    customKeypadRaw=customKeypadRaw.replace(/\./g,'');
  }
  const kp=ensureCustomKeypad();
  const decimalBtn=kp.querySelector('button[data-k="."]');
  const allowsDecimal = el.id==='qty' || el.id==='targetQtyInput' || el.classList.contains('pickerQtyInput');
  if(decimalBtn){
    decimalBtn.disabled=!allowsDecimal;
    decimalBtn.classList.toggle('ckDisabled',!allowsDecimal);
  }
  const label=kp.querySelector('#ckFieldLabel');
  if(label){
    const panel=el.closest('.panel');
    const txt=panel?.querySelector('label, .fieldLabel, .stepLabel')?.textContent?.trim()
      || el.getAttribute('aria-label')
      || '';
    label.textContent=txt;
  }
  kp.classList.add('show');
  document.body.classList.add('customKeypadOpen');

  try{el.focus({preventScroll:true})}catch(_){el.focus()}
  setTimeout(()=>{
    const r=el.closest('.panel')?.getBoundingClientRect() || el.getBoundingClientRect();
    const kpRect=kp.getBoundingClientRect();
    const safeBottom=kpRect.top-18;
    if(r.bottom>safeBottom){
      window.scrollBy({top:r.bottom-safeBottom+22,behavior:'smooth'});
    }else if(r.top<70){
      window.scrollBy({top:r.top-70,behavior:'smooth'});
    }
  },80);
}


function normalizeDigits(s){
  return String(s??'')
    .replace(/[۰-۹]/g,d=>'0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
    .replace(/[٬،,\s]/g,'')
    .replace(/٫/g,'.');
}

function parseLooseNumber(v){
  const n=Number(normalizeDigits(v));
  return Number.isFinite(n)?n:NaN;
}

function formatGroupedNumber(v, maxDecimals=3){
  if(v===null || v===undefined || v==='')return '';
  const n=typeof v==='number'?v:parseLooseNumber(v);
  if(!Number.isFinite(n))return '';

  // IMPORTANT:
  // Never trim zeros from the integer part.
  // 2430 must stay 2,430 and 24350000 must stay 24,350,000.
  let fixed;
  if(maxDecimals<=0){
    fixed=Math.round(n).toString();
  }else{
    fixed=n.toFixed(maxDecimals);
    if(fixed.includes('.')){
      fixed=fixed.replace(/0+$/,'').replace(/\.$/,'');
    }
  }

  const [intPart,decPart]=fixed.split('.');
  const grouped=intPart.replace(/\B(?=(\d{3})+(?!\d))/g,',');
  return decPart!==undefined ? `${grouped}.${decPart}` : grouped;
}

function formatGroupedInputValue(raw, allowDecimal=true, maxDecimals=3){
  let s=normalizeDigits(raw);
  if(!allowDecimal)s=s.replace(/\./g,'');
  const parts=s.split('.');
  let intPart=(parts[0]||'').replace(/\D/g,'');
  let decPart=allowDecimal ? (parts.slice(1).join('').replace(/\D/g,'').slice(0,maxDecimals)) : '';
  intPart=intPart.replace(/^0+(?=\d)/,'');
  if(intPart)intPart=intPart.replace(/\B(?=(\d{3})+(?!\d))/g,',');
  if(allowDecimal && s.includes('.'))return `${intPart||'0'}.${decPart}`;
  return intPart;
}

function installCustomNumericKeypad(scope=document){
  scope.querySelectorAll('input[data-custom-keypad="1"], .pickerQtyInput').forEach(el=>{
    if(el.dataset.ckReady==='1')return;
    el.dataset.ckReady='1';
    el.setAttribute('inputmode','none');
    el.setAttribute('readonly','readonly');

    const activate=(ev)=>{
      ev.preventDefault();
      el.setAttribute('readonly','readonly');
      openCustomKeypad(el);
    };

    let lastPointerActivate=0;
    el.addEventListener('pointerup',ev=>{
      lastPointerActivate=Date.now();
      activate(ev);
    });
    el.addEventListener('click',ev=>{
      if(Date.now()-lastPointerActivate<500){
        ev.preventDefault();
        return;
      }
      activate(ev);
    });
  });
}

document.addEventListener('pointerdown',e=>{
  const kp=e.target.closest('#customNumericKeypad');
  const numeric=e.target.closest('input[data-custom-keypad="1"], .pickerQtyInput');
  if(!kp && !numeric && customKeypadTarget){
    closeCustomKeypad();
  }
});

function applyKeyboardHints(scope=document){
  scope.querySelectorAll('input,textarea').forEach(el=>{
    const id=el.id||'';
    const numericIds=['qty','total','unitRate','usdAed','eurUsd','usdQar','usdTry','omrAed','targetQtyInput'];

    if(numericIds.includes(id) || el.classList.contains('pickerQtyInput')){
      el.setAttribute('inputmode','none');
      el.setAttribute('data-custom-keypad','1');
      el.setAttribute('pattern','[0-9۰-۹.,]*');
      el.setAttribute('dir','ltr');
    }else if(id==='party' || id==='note' || id==='customCurrencyName'){
      el.setAttribute('inputmode','text');
      el.setAttribute('lang','fa');
      el.setAttribute('dir','rtl');
      el.setAttribute('autocapitalize','none');
      el.setAttribute('spellcheck','false');
    }
  });
}

function installEditableFocusFix(scope=document){
  const editableSelector='input:not([type="checkbox"]):not([type="file"]):not([disabled]), textarea:not([disabled])';

  scope.querySelectorAll(editableSelector).forEach(el=>{
    // Custom numeric keypad fields intentionally stay readonly so iPadOS
    // does not summon its own keyboard.
    if(el.dataset.customKeypad!=='1' && !el.classList.contains('pickerQtyInput')){
      el.removeAttribute('readonly');
    }
    el.style.pointerEvents='auto';

    if(el.dataset.nativeFocusReady==='1') return;
    el.dataset.nativeFocusReady='1';

    const revealFocusedField=()=>{
      const run=()=>{
        if(document.activeElement!==el)return;
        const panel=el.closest('.panel') || el;
        const rect=panel.getBoundingClientRect();
        const vv=window.visualViewport;
        const viewportTop=vv ? vv.offsetTop : 0;
        const viewportBottom=viewportTop + (vv ? vv.height : window.innerHeight);
        const safeTop=viewportTop+70;
        const safeBottom=viewportBottom-24;

        if(rect.bottom>safeBottom){
          window.scrollBy({top:rect.bottom-safeBottom+24,behavior:'smooth'});
        }else if(rect.top<safeTop){
          window.scrollBy({top:rect.top-safeTop-16,behavior:'smooth'});
        }
      };
      requestAnimationFrame(run);
      setTimeout(run,180);
      setTimeout(run,420);
    };

    el.addEventListener('focus',revealFocusedField,{passive:true});
  });
}

if(window.visualViewport){
  window.visualViewport.addEventListener('resize',()=>{
    const el=document.activeElement;
    if(el && (el.matches('input') || el.matches('textarea'))){
      setTimeout(()=>el.scrollIntoView({block:'center',behavior:'smooth'}),100);
    }
  });
}


let goldCalcLock=false;
let goldCalcAuthorities=[]; // two most recently USER-edited distinct fields

function setGoldCalcStatus(message,type=''){
  const el=document.getElementById('goldCalcStatus');
  if(!el)return;
  el.textContent=message||'';
  el.className='goldCalcStatus'+(type?` ${type}`:'');
}

function setFieldNumericValue(id,value,decimals=3){
  const el=document.getElementById(id);
  if(!el)return;
  if(!Number.isFinite(value)){
    el.value='';
    return;
  }
  el.value=formatGroupedNumber(value,decimals);
}

function goldValues(){
  const q=parseLooseNumber(document.getElementById('qty')?.value);
  const t=parseLooseNumber(document.getElementById('total')?.value);
  const r=parseLooseNumber(document.getElementById('unitRate')?.value);
  return {
    q,t,r,
    hasQ:Number.isFinite(q)&&q>0,
    hasT:Number.isFinite(t)&&t>0,
    hasR:Number.isFinite(r)&&r>0
  };
}

function fieldHasValidGoldValue(id,vals=goldValues()){
  if(id==='qty')return vals.hasQ;
  if(id==='total')return vals.hasT;
  if(id==='unitRate')return vals.hasR;
  return false;
}

function defaultCompanionFor(changedId,vals){
  // When all fields already contain values but the user has only just started
  // editing, use a stable, intuitive default anchor.
  if(changedId==='qty'){
    if(vals.hasR)return 'unitRate';   // changing weight keeps rate => total changes
    if(vals.hasT)return 'total';
  }
  if(changedId==='total'){
    if(vals.hasR)return 'unitRate';   // changing total keeps rate => weight changes
    if(vals.hasQ)return 'qty';
  }
  if(changedId==='unitRate'){
    if(vals.hasQ)return 'qty';        // changing rate keeps weight => total changes
    if(vals.hasT)return 'total';
  }
  return null;
}

function noteUserGoldEdit(changedId){
  const vals=goldValues();

  // Remove invalid authorities first.
  goldCalcAuthorities=goldCalcAuthorities.filter(id=>fieldHasValidGoldValue(id,vals));

  // The edited field becomes the newest authority.
  goldCalcAuthorities=goldCalcAuthorities.filter(id=>id!==changedId);
  if(fieldHasValidGoldValue(changedId,vals))goldCalcAuthorities.push(changedId);

  // If this is the first authority and another populated field exists,
  // choose one deterministic companion so the result is never ambiguous.
  if(goldCalcAuthorities.length===1){
    const companion=defaultCompanionFor(changedId,vals);
    if(companion && companion!==changedId && !goldCalcAuthorities.includes(companion)){
      goldCalcAuthorities.unshift(companion);
    }
  }

  // Keep only two most-recent distinct authorities.
  if(goldCalcAuthorities.length>2){
    goldCalcAuthorities=goldCalcAuthorities.slice(-2);
  }
}

function authorityLabel(id){
  return id==='qty'?'وزن':id==='total'?'مبلغ کل':'نرخ واحد';
}

function recalcGoldFromAuthorities(){
  if(goldCalcLock || entryType!=='GOLD')return;

  const vals=goldValues();
  goldCalcAuthorities=goldCalcAuthorities.filter(id=>fieldHasValidGoldValue(id,vals));

  if(goldCalcAuthorities.length<2){
    setGoldCalcStatus(
      goldCalcAuthorities.length===1
        ? `«${authorityLabel(goldCalcAuthorities[0])}» ثبت شد؛ یک مقدار دیگر وارد کن.`
        : '',
      ''
    );
    return;
  }

  const pair=new Set(goldCalcAuthorities);
  let computedId=null;
  let computedValue=NaN;
  let decimals=0;

  if(pair.has('qty') && pair.has('unitRate')){
    computedId='total';
    computedValue=vals.q*vals.r;
    decimals=0;
  }else if(pair.has('qty') && pair.has('total')){
    computedId='unitRate';
    computedValue=vals.t/vals.q;
    decimals=0;
  }else if(pair.has('total') && pair.has('unitRate')){
    computedId='qty';
    computedValue=vals.t/vals.r;
    decimals=3;
  }else{
    return;
  }

  if(!Number.isFinite(computedValue) || computedValue<=0){
    setGoldCalcStatus('محاسبه ممکن نیست؛ دو مقدار مبنا باید بیشتر از صفر باشند.','warn');
    return;
  }

  goldCalcLock=true;
  try{
    setFieldNumericValue(computedId,computedValue,decimals);

    // Normalize display of the two authoritative fields without changing values.
    const v2=goldValues();
    if(v2.hasQ)document.getElementById('qty').value=formatGroupedNumber(v2.q,3);
    if(v2.hasT)document.getElementById('total').value=formatGroupedNumber(v2.t,0);
    if(v2.hasR)document.getElementById('unitRate').value=formatGroupedNumber(v2.r,0);

    const a=authorityLabel(goldCalcAuthorities[0]);
    const b=authorityLabel(goldCalcAuthorities[1]);
    const c=authorityLabel(computedId);
    setGoldCalcStatus(`${a} + ${b} مبنا • ${c} خودکار محاسبه شد`,'ok');
  }finally{
    goldCalcLock=false;
  }
}

function recalcGoldLinkedFields(changedId,userInitiated=true){
  if(goldCalcLock || entryType!=='GOLD')return;

  if(userInitiated)noteUserGoldEdit(changedId);
  recalcGoldFromAuthorities();
}

function resetGoldCalcAuthorities(){
  goldCalcAuthorities=[];
}

function installGoldLinkedFields(){
  const ids=['qty','total','unitRate'];

  ids.forEach(id=>{
    const el=document.getElementById(id);
    if(!el || el.dataset.goldLinkedReady==='1')return;
    el.dataset.goldLinkedReady='1';

    el.addEventListener('input',(ev)=>{
      if(goldCalcLock)return;

      if(id==='total' || id==='unitRate'){
        el.value=formatGroupedInputValue(el.value,false,0);
      }else{
        el.value=formatGroupedInputValue(el.value,true,3);
      }

      try{el.setSelectionRange(el.value.length,el.value.length)}catch(_){}

      const blank=el.value.trim()==='';
      if(blank){
        // User is deliberately clearing this field to enter a replacement.
        // Remove it from authorities and DO NOT regenerate it from the other two.
        goldCalcAuthorities=goldCalcAuthorities.filter(x=>x!==id);
        el.dataset.editingBlank='1';
        setGoldCalcStatus(`«${authorityLabel(id)}» پاک شد؛ عدد جدید را وارد کن.`,'');
        return;
      }

      delete el.dataset.editingBlank;
      recalcGoldLinkedFields(id,true);
    });

    // "change" must NOT count as a second independent edit.
    // It only re-runs the current two-authority equation.
    el.addEventListener('change',()=>{
      if(goldCalcLock)return;
      if(el.value.trim()==='' || el.dataset.editingBlank==='1')return;
      recalcGoldFromAuthorities();
    });
  });
}

function renderEntry(){
  resetGoldCalcAuthorities();
  setView(cloneTpl('entryTpl'));
  let type=entryType;
  const assets= type==='GOLD'?['آبشده','طلای متفرقه']:
                type==='USD'?['دلار']:
                type==='AED'?['درهم']:
                type==='EUR'?['یورو']:
                type==='CUSTOM'?[...state.currencies]:[];
  let selectedAsset=assets[0]||'دلار';

  entryTitle.textContent= type==='GOLD'?'طلای آبشده و متفرقه':type==='COIN'?'سکه': type==='CUSTOM'?'ارز سفارشی':selectedAsset;
  entrySub.textContent=type==='COIN'?'تمام / نیم / ربع — پیش‌فرض بانکی':'ثبت سریع خرید و فروش';

  if(type==='COIN'){
    coinChooser.classList.remove('hidden');normalCoinWrap.classList.remove('hidden');
    qtyLabel.textContent='تعداد سکه';
  }else if(type==='GOLD') qtyLabel.textContent='وزن (گرم)';
  else qtyLabel.textContent='مقدار ارز';

  if(assets.length>1||type==='CUSTOM'){
    assetChooser.classList.remove('hidden');
    assetChooser.innerHTML='<div class="segRow">'+assets.map((a,i)=>`<button data-asset="${a}" class="${i===0?'active':''}">${a}</button>`).join('')+'</div>';
    assetChooser.querySelectorAll('button').forEach(b=>b.onclick=()=>{
      selectedAsset=b.dataset.asset;
      assetChooser.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
    });
  }
  if(type==='CUSTOM'&&!assets.length){
    assetChooser.classList.remove('hidden');
    assetChooser.innerHTML='<p>هنوز ارز سفارشی تعریف نشده. از بخش «بیشتر» یک ارز اضافه کن.</p>';
  }

  function refreshMode(){
    buyBtn.classList.toggle('active',entryBuy);sellBtn.classList.toggle('active',!entryBuy);
    saveTrade.textContent=editId?'ذخیره تغییرات':(entryBuy?'ثبت خرید':'ثبت فروش');
    saveTrade.style.background=entryBuy?'var(--green)':'var(--red)';
  }
  refreshMode();
  buyBtn.onclick=()=>{entryBuy=true;refreshMode()};sellBtn.onclick=()=>{entryBuy=false;refreshMode()};

  document.querySelectorAll('[data-coin]').forEach(b=>b.onclick=()=>{
    selectedCoin=b.dataset.coin;document.querySelectorAll('[data-coin]').forEach(x=>x.classList.toggle('active',x===b));
  });

  const step=type==='COIN'?1:type==='GOLD'?1:100;
  minusBtn.onclick=()=>{qty.value=Math.max(0,(parseLooseNumber(qty.value)||0)-step);qty.dispatchEvent(new Event('input',{bubbles:true}))};
  plusBtn.onclick=()=>{qty.value=(parseLooseNumber(qty.value)||0)+step;qty.dispatchEvent(new Event('input',{bubbles:true}))};

  const chipVals=type==='COIN'?[1,2,5]:type==='GOLD'?[100,250,500]:[1000,5000,10000];
  chips.innerHTML=chipVals.map(x=>`<button data-chip="${x}">${new Intl.NumberFormat('fa-IR').format(x)}${type==='COIN'?' عدد':type==='GOLD'?' گرم':''}</button>`).join('');
  chips.querySelectorAll('button').forEach(b=>b.onclick=()=>{qty.value=b.dataset.chip;qty.dispatchEvent(new Event('input',{bubbles:true}))});



  [qty,total,unitRate,party,note].forEach(el=>{
    const reveal=()=>{
      const run=()=>{
        if(document.activeElement!==el)return;
        const saveRect=saveTrade.getBoundingClientRect();
        const r=el.closest('.panel')?.getBoundingClientRect()||el.getBoundingClientRect();
        const safeBottom=Math.min(window.innerHeight,saveRect.top)-18;
        const safeTop=88;
        if(r.bottom>safeBottom) window.scrollBy({top:r.bottom-safeBottom+18,behavior:'smooth'});
        else if(r.top<safeTop) window.scrollBy({top:r.top-safeTop-16,behavior:'smooth'});
      };
      setTimeout(run,80);setTimeout(run,240);setTimeout(run,480);
    };
    el.addEventListener('focus',reveal);
    el.addEventListener('click',reveal);
  });

  [total,unitRate].forEach(el=>{
    el.addEventListener('blur',()=>formatMoneyInput(el));
  });

  if(editId){
    const t=state.trades.find(x=>x.id===editId);
    if(t){
      entryBuy=t.side==='BUY'; selectedCoin=t.asset; selectedAsset=t.asset;
      qty.value=formatGroupedNumber(t.qty,3); total.value=t.total?formatGroupedNumber(t.total,0):''; unitRate.value=t.rate?formatGroupedNumber(t.rate,0):'';party.value=t.party||'';note.value=t.note||'';
      normalCoin.checked=t.coinType==='NORMAL';refreshMode();
      if(type==='GOLD')setGoldCalcStatus('برای اصلاح، هر فیلدی را تغییر بده؛ سیستم مقدار سوم را خودکار هماهنگ می‌کند.','');
    }
  }

  installEditableFocusFix(document);
  autoWeight?.classList.add('hidden');
  installGoldLinkedFields();

  saveTrade.onclick=()=>{
    const asset=type==='COIN'?selectedCoin:selectedAsset;
    let q=parseLooseNumber(qty.value)||0,auto=false;
    if(!q&&type==='GOLD'){
      const t=parseLooseNumber(total.value)||0,r=parseLooseNumber(unitRate.value)||0;
      if(t>0&&r>0){q=t/r;auto=true}
    }
    if(!(q>0)){alert('وزن / تعداد / مقدار را وارد کن');return}
    const trade={
      id:editId||Date.now(),
      side:entryBuy?'BUY':'SELL',
      asset,qty:q,total:parseLooseNumber(total.value)||0,rate:parseLooseNumber(unitRate.value)||0,
      party:party.value.trim(),note:note.value.trim(),coinType:normalCoin.checked?'NORMAL':'BANK',autoQty:auto,ts:editId?(state.trades.find(x=>x.id===editId)?.ts||Date.now()):Date.now()
    };
    if(editId) state.trades=state.trades.map(x=>x.id===editId?trade:x); else state.trades.unshift(trade);
    save();show('dashboard');
  }
}

function renderLedger(){
  setView(cloneTpl('ledgerTpl'));
  document.querySelectorAll('[data-filter]').forEach(b=>{
    b.classList.toggle('active',b.dataset.filter===ledgerFilter);
    b.onclick=()=>{ledgerFilter=b.dataset.filter;renderLedger()}
  });
  let data=state.trades.filter(isToday);
  if(ledgerFilter==='BUY')data=data.filter(t=>t.side==='BUY');
  if(ledgerFilter==='SELL')data=data.filter(t=>t.side==='SELL');
  if(ledgerFilter==='UNNAMED')data=data.filter(t=>!t.party);

  // One visible card per settlement group. Never expose individual synthetic legs
  // as independently deletable accounting entries.
  const seenSettlementGroups=new Set();
  data=data.filter(t=>{
    if(t.kind!=='SETTLEMENT')return true;
    const key=t.groupId||`LEGACY-${t.id}`;
    if(seenSettlementGroups.has(key))return false;
    seenSettlementGroups.add(key);
    return true;
  });

  ledgerList.innerHTML=data.length?'':'<div class="panel">ثبت امروز پیدا نشد.</div>';
  data.forEach(t=>{
    const el=document.createElement('article');el.className='tradeCard';
    const settlementBadge=t.kind==='SETTLEMENT' ? '<span class="settlementBadge">تسویه داخلی</span>' : '';
    const isSettlement=t.kind==='SETTLEMENT';
    const settlementDesc=isSettlement
      ? settlementGroupDescriptor(settlementGroupLegs(t.groupId,t.id))
      : null;

    el.innerHTML=`<div class="top"><b>${isSettlement ? settlementDesc.title : `${t.asset} • ${fmt(t.qty)}`} ${settlementBadge}</b><span class="pill ${t.side==='BUY'?'buy':'sell'}">${isSettlement?'پوشش':(t.side==='BUY'?'خرید':'فروش')}</span></div>
      <div class="meta">${isSettlement
        ? `${settlementDesc.text}<br><small>برای حذف، کل پوشش با تمام اجزایش با هم برگردانده می‌شود.</small>`
        : `${t.party?`طرف حساب: ${t.party}`:'بدون طرف حساب'}${t.total?`<br>مبلغ: ${new Intl.NumberFormat('fa-IR').format(t.total)} تومان`:''}${t.rate?`<br>نرخ: ${new Intl.NumberFormat('fa-IR').format(t.rate)}`:''}${t.note?`<br>${t.note}`:''}`
      }</div>
      <div class="actions">${isSettlement?'':`<button data-edit>ویرایش</button>`}<button data-del>${isSettlement?'حذف پوشش':'حذف'}</button></div>`;

    const editBtn=el.querySelector('[data-edit]');
    if(editBtn){
      editBtn.onclick=()=>{
        editId=t.id;
        entryType=t.asset.includes('سکه')?'COIN':(t.asset==='آبشده'||t.asset==='طلای متفرقه')?'GOLD':t.asset==='دلار'?'USD':t.asset==='درهم'?'AED':t.asset==='یورو'?'EUR':'CUSTOM';
        show('entry');
      };
    }

    el.querySelector('[data-del]').onclick=()=>{
      if(isSettlement){
        deleteSettlementGroupWithDoubleConfirm(t.groupId,t.id,renderLedger);
      }else if(confirm('این ثبت حذف شود؟')){
        state.trades=state.trades.filter(x=>x.id!==t.id);
        save();
        renderLedger();
      }
    };
    ledgerList.append(el);
  });
}

function renderReport(){
  setView(cloneTpl('reportTpl'));
  const cards=[];
  const g=calcGoldBalance(),raw=rawGold(),usd=usdBalance();
  cards.push(['بالانس کل ۱۸ عیار',`${signed(g)} گرم`,action(g,'گرم')]);
  cards.push(['طلای وزنی',`${signed(raw)} گرم`,action(raw,'گرم')]);
  ['تمام سکه','نیم سکه','ربع سکه'].forEach(c=>{const b=coinBal(c);if(Math.abs(b)>1e-9)cards.push([c,`${signed(b)} عدد`,action(b,'عدد',c)])});
  const curs=[...new Set(['دلار','درهم','یورو','ریال قطر','لیر','ریال عمان',...state.currencies])];
  curs.forEach(c=>{const b=curBal(c);if(Math.abs(b)>1e-9)cards.push([c,signed(b),action(b,c)])});
  cards.push(['بالانس کلی ارز — معادل دلار',`${signed(usd)} دلار`,action(usd,'دلار')]);
  document.getElementById('reportCards').innerHTML=cards.map(([t,v,a])=>`<article class="reportCard"><h3>${t}</h3><strong>${v}</strong><div class="action">${a}</div></article>`).join('');

  const groups=settlementSummaryGroups();
  document.getElementById('settlementHistory').innerHTML = groups.length ? groups.map(g=>{
    const target=g.legs.find(x=>x.leg==='TARGET');
    const sources=g.legs.filter(x=>x.leg==='SOURCE');
    if(!target||!sources.length)return '';
    const srcText=sources.map(x=>coverLabel(x.asset,x.qty)).join(' + ');
    return `<article class="reportCard settlementCard" data-settlement-group="${g.groupId||''}">
      <h3>پوشش داخلی</h3>
      <strong>${coverLabel(target.asset,target.qty)}</strong>
      <div class="action">با ${srcText}</div>
      <small>${new Date(g.ts).toLocaleString('fa-IR')}</small>
      <button class="settlementDeleteBtn" data-delete-settlement="${g.groupId||''}">حذف پوشش</button>
    </article>`;
  }).join('') : '<div class="panel mutedBox">هنوز تسویه داخلی ثبت نشده</div>';

  document.querySelectorAll('[data-delete-settlement]').forEach(btn=>{
    btn.onclick=()=>{
      const groupId=btn.dataset.deleteSettlement;
      if(groupId)deleteSettlementGroupWithDoubleConfirm(groupId,null,renderReport);
    };
  });
}

function renderSettings(){
  setView(cloneTpl('settingsTpl'));
  usdAed.value=state.fx.usdAed;eurUsd.value=state.fx.eurUsd;usdQar.value=state.fx.usdQar;usdTry.value=state.fx.usdTry;omrAed.value=state.fx.omrAed;
  saveFx.onclick=()=>{state.fx={usdAed:+usdAed.value||3.67,eurUsd:+eurUsd.value||1.15,usdQar:+usdQar.value||3.67,usdTry:+usdTry.value||48,omrAed:+omrAed.value||9.5};save();alert('ضرایب ذخیره شد')};
  function tags(){currencyList.innerHTML=state.currencies.map(c=>`<span class="tag">${c}</span>`).join('')}
  tags();
  addCurrencyBtn.onclick=()=>{const n=customCurrencyName.value.trim();if(n&&!state.currencies.includes(n)){state.currencies.push(n);save();customCurrencyName.value='';tags()}};
  exportBtn.onclick=()=>{
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`khonji-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)
  };
  importFile.onchange=async()=>{
    const f=importFile.files[0];if(!f)return;
    try{const x=JSON.parse(await f.text());if(!x.trades)throw 0;if(confirm('اطلاعات فعلی با بکاپ جایگزین شود؟')){state=x;save();location.reload()}}catch{alert('فایل بکاپ معتبر نیست')}
  }
}

document.querySelectorAll('.bottomNav button').forEach(b=>b.onclick=()=>show(b.dataset.view));
themeBtn.onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';save();setTheme()};
setTheme();show('dashboard');

if('serviceWorker' in navigator){
// v1.7.4 old SW registration disabled:   window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}


const editableFocusObserver=new MutationObserver(()=>installEditableFocusFix(document));
const observedView=document.getElementById('view');
if(observedView) editableFocusObserver.observe(observedView,{childList:true,subtree:true});


document.addEventListener('DOMContentLoaded',()=>{
  const b=document.getElementById('appVersionBadge');
  if(b)b.textContent=`v${BUILD_VERSION}`;
});

document.addEventListener('DOMContentLoaded',()=>applyKeyboardHints(document));
const keyboardHintObserver=new MutationObserver(()=>applyKeyboardHints(document));
const keyboardHintView=document.getElementById('view');
if(keyboardHintView)keyboardHintObserver.observe(keyboardHintView,{childList:true,subtree:true});

document.addEventListener('DOMContentLoaded',()=>installCustomNumericKeypad(document));
const customKeypadObserver=new MutationObserver(()=>installCustomNumericKeypad(document));
const customKeypadView=document.getElementById('view');
if(customKeypadView)customKeypadObserver.observe(customKeypadView,{childList:true,subtree:true});

const goldLinkedObserver=new MutationObserver(()=>installGoldLinkedFields());
const goldLinkedView=document.getElementById('view');
if(goldLinkedView)goldLinkedObserver.observe(goldLinkedView,{childList:true,subtree:true});

window.addEventListener('resize',()=>requestAnimationFrame(applyDashboardPriorityLayout));
window.addEventListener('orientationchange',()=>{
  setTimeout(applyDashboardPriorityLayout,80);
  setTimeout(applyDashboardPriorityLayout,350);
});


const PWA_SHELL_VERSION='1.7.4';

async function installPwaUpdateManagerV174(){
  if(!('serviceWorker' in navigator))return;

  try{
    const reg=await navigator.serviceWorker.register('./sw.js?v=174',{
      scope:'./',
      updateViaCache:'none'
    });

    // Force a fresh SW check every app launch.
    try{ await reg.update(); }catch(_){}

    const requestActivation=worker=>{
      if(worker)worker.postMessage({type:'SKIP_WAITING'});
    };

    if(reg.waiting)requestActivation(reg.waiting);

    reg.addEventListener('updatefound',()=>{
      const worker=reg.installing;
      if(!worker)return;
      worker.addEventListener('statechange',()=>{
        if(worker.state==='installed' && navigator.serviceWorker.controller){
          requestActivation(worker);
        }
      });
    });

    navigator.serviceWorker.addEventListener('message',event=>{
      if(event.data?.type==='KHONJI_SW_ACTIVATED'){
        const target=event.data.version;
        const seen=sessionStorage.getItem('khonji_sw_seen');
        if(target && target!==seen){
          sessionStorage.setItem('khonji_sw_seen',target);
          // One controlled reload only, avoiding loops.
          location.replace('./index.html?v=174');
        }
      }
    });

    let reloading=false;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(reloading)return;
      reloading=true;
      setTimeout(()=>location.replace('./index.html?v=174'),50);
    });

  }catch(err){
    console.warn('PWA update manager:',err);
  }
}
installPwaUpdateManagerV174();


function markStandaloneVersionV174(){
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone===true;
  const badge=[...document.querySelectorAll('*')].find(el=>el.textContent?.trim()==='v1.7.4');
  if(badge && standalone){
    badge.title='PWA standalone • shell 1.7.4';
  }
}
document.addEventListener('DOMContentLoaded',markStandaloneVersionV174);
