const KEY='khonji_pwa_v1';
const BUILD='1.1.2';
const DEFAULT={
  trades:[],
  currencies:[],
  fx:{usdAed:3.67,eurUsd:1.150,usdQar:3.67,usdTry:48,omrAed:9.5},
  theme:'dark'
};
let state=load();
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

function smartExactCover(targetName,targetQty){
  const needEq=assetEq18(targetName,targetQty);
  const sources=availablePositiveSources(targetName);
  if(needEq<=0 || !sources.length) return null;

  const gold=sources.find(s=>s.name==='آبشده');
  const coins=sources.filter(s=>s.integer);

  const maxFull=Math.floor((coins.find(c=>c.name==='تمام سکه')?.bal||0)+1e-9);
  const maxHalf=Math.floor((coins.find(c=>c.name==='نیم سکه')?.bal||0)+1e-9);
  const maxQuarter=Math.floor((coins.find(c=>c.name==='ربع سکه')?.bal||0)+1e-9);

  let best=null;
  const targetUnits=Math.round(needEq/2.439);

  if(Math.abs(targetUnits*2.439-needEq)<0.0005){
    for(let f=0; f<=Math.min(maxFull,Math.floor(targetUnits/4)); f++){
      for(let h=0; h<=Math.min(maxHalf,Math.floor((targetUnits-4*f)/2)); h++){
        const remain=targetUnits-4*f-2*h;
        if(remain<0) continue;
        const q=remain;
        if(q<=maxQuarter){
          const count=f+h+q;
          const candidate=[];
          if(f)candidate.push({name:'تمام سکه',qty:f});
          if(h)candidate.push({name:'نیم سکه',qty:h});
          if(q)candidate.push({name:'ربع سکه',qty:q});
          if(!best || count<best.count){
            best={sources:candidate,count};
          }
        }
      }
    }
  }
  if(best) return best.sources;

  if(gold && gold.bal+0.000001>=needEq){
    return [{name:'آبشده',qty:needEq}];
  }

  if(gold){
    let mixedBest=null;
    for(let f=0; f<=maxFull; f++){
      for(let h=0; h<=maxHalf; h++){
        for(let q=0; q<=maxQuarter; q++){
          const eq=f*9.756+h*4.878+q*2.439;
          if(eq>needEq+0.0005) continue;
          const rem=needEq-eq;
          if(rem< -0.0005 || rem>gold.bal+0.0005) continue;
          const score=rem;
          if(!mixedBest || score<mixedBest.score){
            const arr=[];
            if(f)arr.push({name:'تمام سکه',qty:f});
            if(h)arr.push({name:'نیم سکه',qty:h});
            if(q)arr.push({name:'ربع سکه',qty:q});
            if(rem>0.0005)arr.push({name:'آبشده',qty:rem});
            mixedBest={sources:arr,score};
          }
        }
      }
    }
    if(mixedBest) return mixedBest.sources;
  }

  return null;
}

function openSmartCoverPicker(targetName){
  const targetBal=coverBalance(targetName);
  if(targetBal>=-0.000001){
    alert('این مورد در حال حاضر کسری ندارد.');
    return;
  }

  const targetQty=Math.abs(targetBal);
  const targetEq=assetEq18(targetName,targetQty);
  const proposal=smartExactCover(targetName,targetQty);

  if(!proposal){
    alert('برای این کسری، پوشش کامل با موجودی فعلی ممکن نیست.');
    return;
  }

  const sourceDefs=availablePositiveSources(targetName).map(s=>({...s,qty:0}));
  proposal.forEach(p=>{
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
          <h3>پوشش ${assetDef(targetName)?.label||targetName}</h3>
          <small>کسری: ${coverLabel(targetName,targetQty)} • معادل ${fmt(targetEq)} گرم ۱۸</small>
        </div>
        <button class="modalClose" aria-label="بستن">×</button>
      </div>

      <div class="smartProposal">
        پیشنهاد هوشمند:
        <b>${proposal.map(p=>coverLabel(p.name,p.qty)).join(' + ')}</b>
      </div>

      <div class="settlementPickerRows"></div>

      <div class="settlementCalc">
        <div><span>معادل انتخاب‌شده</span><strong id="pickerGoldEq">۰ گرم</strong></div>
        <div><span>کسری هدف</span><strong>${fmt(targetEq)} گرم</strong></div>
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
          <input class="pickerQtyInput" data-q="${i}" inputmode="decimal"
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
        if(s.name!=='آبشده')s.qty=Math.round(s.qty);
        renderRows();updateCalc();
      };
      row.querySelector('[data-op="plus"]').onclick=()=>{
        const step=s.name==='آبشده'?0.001:1;
        s.qty=Math.min(s.bal,s.qty+step);
        if(s.name!=='آبشده')s.qty=Math.round(s.qty);
        renderRows();updateCalc();
      };
      input.oninput=()=>{
        let v=Number(input.value.replace(',','.'))||0;
        if(s.name!=='آبشده')v=Math.round(v);
        s.qty=Math.max(0,Math.min(s.bal,v));
        updateCalc();
      };
      input.onblur=()=>renderRows();
    });
  }

  function selectedSources(){
    return sourceDefs.filter(s=>s.qty>0.000001).map(s=>({name:s.name,qty:s.qty}));
  }

  function updateCalc(){
    const selected=selectedSources();
    const eq=selected.reduce((a,s)=>a+assetEq18(s.name,s.qty),0);
    const diff=eq-targetEq;

    overlay.querySelector('#pickerGoldEq').textContent=`${fmt(eq)} گرم`;
    overlay.querySelector('#pickerDiff').textContent=
      Math.abs(diff)<0.0005 ? 'دقیق' :
      diff>0 ? `${fmt(diff)} گرم اضافه` : `${fmt(Math.abs(diff))} گرم کم`;

    const warning=overlay.querySelector('#pickerWarning');
    const confirmBtn=overlay.querySelector('.confirmSettle');

    if(Math.abs(diff)<0.0005 && selected.length){
      warning.textContent='پوشش کامل است.';
      warning.className='pickerWarning ok';
      confirmBtn.disabled=false;
    }else{
      warning.textContent='برای ثبت، انتخاب باید دقیقاً کسری را پوشش دهد.';
      warning.className='pickerWarning';
      confirmBtn.disabled=true;
    }
  }

  renderRows();
  updateCalc();

  overlay.querySelector('.modalClose').onclick=closeSettlementPicker;
  overlay.querySelector('.cancelSettle').onclick=closeSettlementPicker;
  overlay.onclick=e=>{if(e.target===overlay)closeSettlementPicker()};

  overlay.querySelector('.confirmSettle').onclick=()=>{
    const sources=selectedSources();
    const eq=sources.reduce((a,s)=>a+assetEq18(s.name,s.qty),0);
    if(Math.abs(eq-targetEq)>=0.0005)return;

    const msg=`${coverLabel(targetName,targetQty)} با ${sources.map(s=>coverLabel(s.name,s.qty)).join(' + ')} پوشش داده شود؟`;
    if(settlementConfirm(msg)){
      addSmartSettlement({targetName,targetQty,sources});
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
}
function cloneTpl(id){return document.getElementById(id).content.cloneNode(true)}
function setView(node){const v=document.getElementById('view');v.innerHTML='';v.append(node);window.scrollTo({top:0,behavior:'instant'})}

function renderDashboard(){
  setView(cloneTpl('dashboardTpl'));
  const today=state.trades.filter(isToday);
  const buy=today.filter(t=>t.side==='BUY').reduce((a,t)=>a+eq18(t),0);
  const sell=today.filter(t=>t.side==='SELL').reduce((a,t)=>a+eq18(t),0);
  const bal=calcGoldBalance();
  document.getElementById('buyToday').textContent=fmt(buy); document.getElementById('sellToday').textContent=fmt(sell); document.getElementById('goldBalance').textContent=signed(bal);
  document.getElementById('mainAdvice').textContent=bal>0?`برای بالانس ${fmt(bal)} گرم بفروش`:bal<0?`برای بالانس ${fmt(bal)} گرم بخر`:'بالانس طلا صفر است';
  const unnamed=today.filter(t=>!t.party).length;
  document.getElementById('todaySummary').innerHTML=`تعداد معاملات امروز: <b>${fmt(today.length,0)}</b><br>ثبت‌های بدون طرف حساب: <b>${fmt(unnamed,0)}</b><br>طلای وزنی: <b>${signed(rawGold())} گرم</b>`;

  const rg=rawGold(),fc=coinBal('تمام سکه'),hc=coinBal('نیم سکه'),qc=coinBal('ربع سکه'),fxb=usdBalance();
  document.getElementById('sideRawGold').textContent = Math.abs(rg)<1e-9 ? 'بالانس' : `${fmt(rg)} گرم • ${rg>0?'بفروش':'بخر'}`;
  document.getElementById('sideFullCoin').textContent = coinActionMini(fc,'تمام');
  document.getElementById('sideHalfCoin').textContent = coinActionMini(hc,'نیم');
  document.getElementById('sideQuarterCoin').textContent = coinActionMini(qc,'ربع');
  document.getElementById('sideFx').textContent = Math.abs(fxb)<1e-9 ? 'بالانس' : `${fmt(fxb)} دلار ${fxb>0?'بفروش':'بخر'}`;

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

  coverRows.forEach(row=>{
    const bal=coverBalance(row.name);
    if(bal>=-0.000001)return;

    const targetQty=Math.abs(bal);
    const proposal=smartExactCover(row.name,targetQty);
    if(!proposal || !proposal.length)return;

    const wrap=document.getElementById(row.actionId);
    if(!wrap)return;

    const text=proposal.map(p=>coverLabel(p.name,p.qty)).join(' + ');
    wrap.innerHTML=`
      <div class="coverageHint">پیشنهاد: ${text}</div>
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
}

function renderEntry(){
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
  minusBtn.onclick=()=>{qty.value=Math.max(0,(parseFloat(qty.value)||0)-step);qty.dispatchEvent(new Event('input'))};
  plusBtn.onclick=()=>{qty.value=(parseFloat(qty.value)||0)+step;qty.dispatchEvent(new Event('input'))};

  const chipVals=type==='COIN'?[1,2,5]:type==='GOLD'?[100,250,500]:[1000,5000,10000];
  chips.innerHTML=chipVals.map(x=>`<button data-chip="${x}">${new Intl.NumberFormat('fa-IR').format(x)}${type==='COIN'?' عدد':type==='GOLD'?' گرم':''}</button>`).join('');
  chips.querySelectorAll('button').forEach(b=>b.onclick=()=>{qty.value=b.dataset.chip;qty.dispatchEvent(new Event('input'))});

  [total,unitRate].forEach(el=>el.addEventListener('input',()=>{
    if(type!=='GOLD'||qty.value.trim()){autoWeight.classList.add('hidden');return}
    const t=Number(total.value.replaceAll(',','')),r=Number(unitRate.value.replaceAll(',',''));
    if(t>0&&r>0){autoWeight.textContent=`وزن محاسبه‌شده: ${fmt(t/r)} گرم`;autoWeight.classList.remove('hidden')}else autoWeight.classList.add('hidden')
  }));

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
      qty.value=t.qty; total.value=t.total||''; unitRate.value=t.rate||'';party.value=t.party||'';note.value=t.note||'';
      normalCoin.checked=t.coinType==='NORMAL';refreshMode();
    }
  }

  saveTrade.onclick=()=>{
    const asset=type==='COIN'?selectedCoin:selectedAsset;
    let q=Number(qty.value||0),auto=false;
    if(!q&&type==='GOLD'){
      const t=Number(total.value.replaceAll(',','')||0),r=Number(unitRate.value.replaceAll(',','')||0);
      if(t>0&&r>0){q=t/r;auto=true}
    }
    if(!(q>0)){alert('وزن / تعداد / مقدار را وارد کن');return}
    const trade={
      id:editId||Date.now(),
      side:entryBuy?'BUY':'SELL',
      asset,qty:q,total:Number(total.value.replaceAll(',','')||0),rate:Number(unitRate.value.replaceAll(',','')||0),
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
  ledgerList.innerHTML=data.length?'':'<div class="panel">ثبت امروز پیدا نشد.</div>';
  data.forEach(t=>{
    const el=document.createElement('article');el.className='tradeCard';
    const settlementBadge=t.kind==='SETTLEMENT' ? '<span class="settlementBadge">تسویه داخلی</span>' : '';
    el.innerHTML=`<div class="top"><b>${t.asset} • ${fmt(t.qty)} ${settlementBadge}</b><span class="pill ${t.side==='BUY'?'buy':'sell'}">${t.side==='BUY'?'خرید':'فروش'}</span></div>
      <div class="meta">${t.party?`طرف حساب: ${t.party}`:'بدون طرف حساب'}${t.total?`<br>مبلغ: ${new Intl.NumberFormat('fa-IR').format(t.total)} تومان`:''}${t.rate?`<br>نرخ: ${new Intl.NumberFormat('fa-IR').format(t.rate)}`:''}${t.note?`<br>${t.note}`:''}</div>
      <div class="actions"><button data-edit>ویرایش</button><button data-del>حذف</button></div>`;
    el.querySelector('[data-edit]').onclick=()=>{editId=t.id;entryType=t.asset.includes('سکه')?'COIN':(t.asset==='آبشده'||t.asset==='طلای متفرقه')?'GOLD':t.asset==='دلار'?'USD':t.asset==='درهم'?'AED':t.asset==='یورو'?'EUR':'CUSTOM';show('entry')};
    el.querySelector('[data-del]').onclick=()=>{if(confirm('این ثبت حذف شود؟')){state.trades=state.trades.filter(x=>x.id!==t.id);save();renderLedger()}};
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
    return `<article class="reportCard settlementCard">
      <h3>پوشش داخلی</h3>
      <strong>${coverLabel(target.asset,target.qty)}</strong>
      <div class="action">با ${srcText}</div>
      <small>${new Date(g.ts).toLocaleString('fa-IR')}</small>
    </article>`;
  }).join('') : '<div class="panel mutedBox">هنوز تسویه داخلی ثبت نشده</div>';
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
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
