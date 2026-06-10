/* ════════════════════════════════════════════════════════════════
   存档抽象层（Save System）
   现在用 localStorage，以后换后端只改这一个文件，游戏代码不动。

   数据层级：
     player (玩家名) → 3 个存档槽 → 每槽一份完整存档

   localStorage key 设计：
     lunar.activePlayer        当前玩家名
     lunar.activeSlot          当前激活存档槽 (1/2/3)
     lunar.save.<player>.<slot>  一份存档 JSON
   ════════════════════════════════════════════════════════════════ */

const SaveSys = (() => {
  const K_PLAYER = 'lunar.activePlayer';
  const K_SLOT   = 'lunar.activeSlot';
  const saveKey  = (player, slot) => `lunar.save.${player}.${slot}`;

  // ── 初始存档模板（新游戏时用）──
  function newSaveData(playerName, slot) {
    const now = Date.now();
    return {
      meta: {
        player: playerName,
        slot,
        createdAt: now,
        lastPlayed: now,
        playtimeSec: 0,
      },
      // 资源
      resources: {
        soil: 0,
        ice: 0,
        oxygen: 100,     // %
        power: 0,        // kW
        titanium: 0,
      },
      // 月球车
      rover: {
        // null = 用游戏默认初始位置（起始 tile）
        pos: null,
        fwd: null,
      },
      // 基地
      base: {
        installed: {},   // room → [deviceId...]
      },
      // 月壤采集进度（稳定 ID "clat_clon_i" → {u:已采次数, d:采光时间戳}）
      rocks: {
        charges: {},
        depleted: {},
      },
      // 已发现的月壤点（采集过至少一次）：稳定 ID → {lat, lon}
      // 用于地图浅蓝点标记 + 自动采集导航目标
      discoveredRocks: {},
      // 已部署的信号基站：[{id, lat, lon, x, y, z, r}]
      // r=信号半径(km)；xyz=3D世界坐标(给outside判定)；lat/lon给地图画圆
      signalStations: [],
      // ── 网格背包（载重系统）──
      // rover=车背包；warehouses=多个基地仓库。item={uid,type,x,y,rot,count}
      inventory: {
        rover: { cols:6, rows:5, maxWeight:200, items:[] },
        warehouses: [
          { id:'wh0', name:'仓库 1', locked:false, cols:24, rows:10, maxWeight:5000, items:[] },
          { id:'wh1', name:'仓库 2', locked:true,  cols:24, rows:10, maxWeight:5000, items:[] },
          { id:'wh2', name:'仓库 3', locked:true,  cols:24, rows:10, maxWeight:5000, items:[] },
        ],
      },
      // 游戏内时间（day 是该存档的游玩天数；sunAngle 不存这里，它是全局世界时间）
      time: {
        day: 1,
      },
    };
  }

  // ── 玩家/激活态 ──
  function getActivePlayer() { return localStorage.getItem(K_PLAYER) || null; }
  function setActivePlayer(name) { localStorage.setItem(K_PLAYER, name); }
  function getActiveSlot() { return parseInt(localStorage.getItem(K_SLOT) || '0', 10) || null; }
  function setActiveSlot(slot) { localStorage.setItem(K_SLOT, String(slot)); }

  // ── 存档增删查 ──
  function loadSave(player, slot) {
    const raw = localStorage.getItem(saveKey(player, slot));
    return raw ? JSON.parse(raw) : null;
  }
  function writeSave(player, slot, data) {
    data.meta = data.meta || {};
    data.meta.lastPlayed = Date.now();
    localStorage.setItem(saveKey(player, slot), JSON.stringify(data));
  }
  function deleteSave(player, slot) {
    localStorage.removeItem(saveKey(player, slot));
  }
  // 列出某玩家 3 个槽的摘要（空槽返回 null）
  function listSlots(player) {
    const out = [];
    for (let s = 1; s <= 3; s++) {
      const d = loadSave(player, s);
      if (!d) { out.push(null); continue; }
      out.push({
        slot: s,
        player: d.meta.player,
        lastPlayed: d.meta.lastPlayed,
        playtimeSec: d.meta.playtimeSec || 0,
        soil: Math.floor(d.base?.resources?.soil ?? d.resources?.soil ?? 0),
        day: d.time?.day ?? 1,
      });
    }
    return out;
  }

  // ── 新游戏 / 继续 ──
  function newGame(player, slot) {
    const data = newSaveData(player, slot);
    writeSave(player, slot, data);
    setActivePlayer(player);
    setActiveSlot(slot);
    return data;
  }
  function continueGame(player, slot) {
    const data = loadSave(player, slot);
    if (!data) return null;
    setActivePlayer(player);
    setActiveSlot(slot);
    return data;
  }

  // ── 当前激活存档的读写（游戏内调用）──
  function getCurrent() {
    const p = getActivePlayer(), s = getActiveSlot();
    if (!p || !s) return null;
    return loadSave(p, s);
  }
  function saveCurrent(data) {
    const p = getActivePlayer(), s = getActiveSlot();
    if (!p || !s) return false;
    writeSave(p, s, data);
    return true;
  }
  // 局部更新：传一个改函数，自动 load→改→write
  function patchCurrent(fn) {
    const d = getCurrent();
    if (!d) return false;
    fn(d);
    return saveCurrent(d);
  }

  // ── 通用键路径读写（任意嵌套字段，统一入口）──
  // get('base.resources.soil')  →  值（不存在返回 undefined）
  // set('rover.pos', [x,y,z])   →  自动建中间层 + 写存档
  function get(path, fallback) {
    const d = getCurrent(); if (!d) return fallback;
    const v = path.split('.').reduce((o,k)=> (o==null?undefined:o[k]), d);
    return v === undefined ? fallback : v;
  }
  function set(path, value) {
    return patchCurrent(d => {
      const keys = path.split('.');
      let o = d;
      for (let i=0;i<keys.length-1;i++){ if(typeof o[keys[i]]!=='object'||o[keys[i]]==null) o[keys[i]]={}; o=o[keys[i]]; }
      o[keys[keys.length-1]] = value;
    });
  }
  // 批量设置：set({'base.resources.soil':100,'rover.pos':[...]})
  function setMany(obj) {
    return patchCurrent(d => {
      for (const path in obj){
        const keys=path.split('.'); let o=d;
        for(let i=0;i<keys.length-1;i++){ if(typeof o[keys[i]]!=='object'||o[keys[i]]==null) o[keys[i]]={}; o=o[keys[i]]; }
        o[keys[keys.length-1]] = obj[path];
      }
    });
  }

  // ── 全局世界时间（不分玩家/存档，纯按真实时间推算）──
  // 月球一直在转，所有玩家共享同一昼夜。sunAngle = 真实流逝时间映射到 [0,2π)
  const K_EPOCH = 'lunar.worldEpoch';      // 世界纪元起点（首次运行时记下的时间戳）
  const DAY_SECS = 7200;                    // 2 小时一昼夜
  function worldEpoch() {
    let e = parseInt(localStorage.getItem(K_EPOCH) || '0', 10);
    if (!e) { e = Date.now(); localStorage.setItem(K_EPOCH, String(e)); }
    return e;
  }
  function getSunAngle() {
    const elapsedSec = (Date.now() - worldEpoch()) / 1000;
    return ((elapsedSec / DAY_SECS) * Math.PI * 2) % (Math.PI * 2);
  }

  // ════════ 网格背包 ════════
  // 物品定义表（静态）。w/h占格，weight单重kg，stack堆叠，tier品质，icon
  const ITEM_DEFS = {
    soil:    { name:'月壤',   w:1,h:1, weight:0.001, stack:1000, tier:'common',   icon:'🪨', desc:'月球表土。1g/个，满格1000个=1kg。' },
    ice:     { name:'水冰',   w:1,h:1, weight:0.001, stack:1000, tier:'common',   icon:'🧊', desc:'地下水冰。' },
    titanium:{ name:'钛矿石', w:1,h:2, weight:8,     stack:20,   tier:'uncommon', icon:'⛏️', desc:'高强度金属矿。' },
    battery: { name:'电池组', w:2,h:1, weight:12,    stack:8,    tier:'uncommon', icon:'🔋', desc:'储能电池。' },
    oxytank: { name:'氧气罐', w:1,h:2, weight:15,    stack:6,    tier:'rare',     icon:'🫧', desc:'压缩氧气。' },
    drill:   { name:'钻机',   w:2,h:2, weight:40,    stack:1,    tier:'rare',     icon:'🛠️', desc:'重型钻探设备。' },
    reactor: { name:'核电堆', w:2,h:3, weight:120,   stack:1,    tier:'epic',     icon:'☢️', desc:'小型核反应堆。' },
    beacon:  { name:'信号基站', w:1,h:2, weight:25,  stack:5,    tier:'rare',     icon:'📡', desc:'部署后提供200m信号范围。信号范围相连即可通讯。开车到现场按 B 部署。' },
  };
  function itemDef(t){ return ITEM_DEFS[t] || null; }
  function itemSize(t, rot){ const d=ITEM_DEFS[t]||{w:1,h:1}; return rot?{w:d.h,h:d.w}:{w:d.w,h:d.h}; }

  let _uidSeq = Date.now() % 1e6;
  function newUid(){ return 'i'+(_uidSeq++).toString(36)+Math.floor(Math.random()*1296).toString(36); }

  // 旧存档补全 inventory（在 loadSave 后调用）
  function ensureInv(d){
    if(!d) return d;
    if(!d.inventory){ d.inventory = newSaveData(d.meta?.player||'', d.meta?.slot||1).inventory; }
    if(!d.inventory.rover) d.inventory.rover = { cols:6,rows:5,maxWeight:200,items:[] };
    if(!Array.isArray(d.inventory.warehouses)){
      d.inventory.warehouses = newSaveData('',1).inventory.warehouses;
    }
    return d;
  }

  // 容器寻址：'rover' | 'wh0'/'wh1'/'wh2' | 'warehouse'(=wh0)
  function container(d, which){
    if(!d?.inventory) return null;
    if(which==='rover') return d.inventory.rover;
    const list = d.inventory.warehouses||[];
    if(which==='warehouse') return list[0]||null;
    if(which && which.startsWith('wh')){ const i=parseInt(which.slice(2),10); return list[i]||null; }
    return null;
  }
  function getInv(which){ const d=getCurrent(); return d? container(ensureInv(d), which) : null; }
  function warehouses(){ const d=getCurrent(); return d? ensureInv(d).inventory.warehouses : []; }
  // 设仓库网格尺寸（代码常量强制固定）。不小于已放物品边界。尺寸已对则不写存档。改了返回 true
  function setWhSize(idx, cols, rows){
    const d0=getCurrent(); if(!d0) return false; ensureInv(d0);
    const w0=d0.inventory.warehouses[idx]; if(!w0) return false;
    let minC=1, minR=1;
    for(const it of w0.items){ const s=itemSize(it.type,it.rot); minC=Math.max(minC,it.x+s.w); minR=Math.max(minR,it.y+s.h); }
    const nc=Math.max(minC,cols), nr=Math.max(minR,rows);
    if(nc===w0.cols && nr===w0.rows) return false;   // 已经是目标尺寸，不写
    patchCurrent(d=>{ ensureInv(d); const w=d.inventory.warehouses[idx]; if(w){ w.cols=nc; w.rows=nr; } });
    return true;
  }
  function invWeight(which){ const c=getInv(which); return c? c.items.reduce((s,it)=>s+(itemDef(it.type)?.weight||0)*(it.count||1),0):0; }
  function countItem(type, which){
    const sum=c=> c? c.items.filter(i=>i.type===type).reduce((s,i)=>s+(i.count||1),0):0;
    if(which) return sum(getInv(which));
    let t=sum(getInv('rover')); for(const w of warehouses()) t+=sum(w); return t;
  }
  // 占格检测（ignoreUid=移动自己时忽略自身）
  function canPlace(which, type, x, y, rot, ignoreUid){
    const c=getInv(which); if(!c||c.locked) return false;
    const {w,h}=itemSize(type,rot);
    if(x<0||y<0||x+w>c.cols||y+h>c.rows) return false;
    for(const it of c.items){ if(it.uid===ignoreUid) continue;
      const s=itemSize(it.type,it.rot);
      if(x<it.x+s.w && x+w>it.x && y<it.y+s.h && y+h>it.y) return false; }
    return true;
  }
  function firstFit(which, type, rot){
    const c=getInv(which); if(!c) return null;
    for(let y=0;y<c.rows;y++) for(let x=0;x<c.cols;x++) if(canPlace(which,type,x,y,rot||0)) return {x,y,rot:rot||0};
    if(!rot) return firstFit(which,type,1);
    return null;
  }
  function canFit(which, type, n){
    n=n||1; const c=getInv(which), def=itemDef(type); if(!c||!def||c.locked) return false;
    if(invWeight(which)+def.weight*n > c.maxWeight) return false;
    let room=0; if(def.stack>1) for(const it of c.items) if(it.type===type) room+=def.stack-(it.count||1);
    if(room>=n) return true;
    return !!firstFit(which,type,0);
  }
  function invAdd(which, type, count){
    count=count||1; const def=itemDef(type); if(!def) return false;
    return patchCurrent(d=>{ ensureInv(d); const c=container(d,which); if(!c||c.locked) return;
      if(def.stack>1){ for(const it of c.items){ if(it.type===type && (it.count||1)<def.stack){
        const put=Math.min(def.stack-(it.count||1),count); it.count=(it.count||1)+put; count-=put; if(count<=0) return; } } }
      while(count>0){ const fit=firstFitOn(c,type,0); if(!fit) return;
        const put=Math.min(def.stack,count); c.items.push({uid:newUid(),type,x:fit.x,y:fit.y,rot:fit.rot,count:put}); count-=put; } });
  }
  // 在具体容器对象上找空位（供 invAdd 内部用，不读 getCurrent）
  function firstFitOn(c, type, rot){
    const {w,h}=itemSize(type,rot);
    const fits=(x,y)=>{ if(x<0||y<0||x+w>c.cols||y+h>c.rows) return false;
      for(const it of c.items){ const s=itemSize(it.type,it.rot);
        if(x<it.x+s.w && x+w>it.x && y<it.y+s.h && y+h>it.y) return false; } return true; };
    for(let y=0;y<c.rows;y++) for(let x=0;x<c.cols;x++) if(fits(x,y)) return {x,y,rot};
    if(!rot) return firstFitOn(c,type,1);
    return null;
  }
  function invMove(fromWhich, uid, toWhich, x, y, rot){
    return patchCurrent(d=>{ ensureInv(d);
      const fc=container(d,fromWhich), tc=container(d,toWhich); if(!fc||!tc||tc.locked) return;
      const idx=fc.items.findIndex(i=>i.uid===uid); if(idx<0) return;
      const it=fc.items[idx]; const {w,h}=itemSize(it.type,rot);
      if(x<0||y<0||x+w>tc.cols||y+h>tc.rows) return;

      // 合并：落点命中一个同类型、未满堆的物品 → 合并堆叠（超上限的留在原地）
      const def=ITEM_DEFS[it.type];
      if(def && def.stack>1){
        const tgt=tc.items.find(o=>{ if(o.uid===uid) return false; if(o.type!==it.type) return false;
          if((o.count||1)>=def.stack) return false;          // 目标堆已满
          const s=itemSize(o.type,o.rot);
          // 落点(左上角)落在目标物品占格范围内 = 命中它
          return x>=o.x && x<o.x+s.w && y>=o.y && y<o.y+s.h; });
        if(tgt){
          const room=def.stack-(tgt.count||1);
          const give=Math.min(room, it.count||1);
          tgt.count=(tgt.count||1)+give;
          it.count=(it.count||1)-give;
          if(it.count<=0) fc.items.splice(idx,1);   // 源堆清空则删除
          return;   // 合并完成（剩余的留在原位，不移动）
        }
      }

      // 普通移动：占格冲突检测
      for(const o of tc.items){ if(o.uid===uid) continue; const s=itemSize(o.type,o.rot);
        if(x<o.x+s.w && x+w>o.x && y<o.y+s.h && y+h>o.y) return; }
      fc.items.splice(idx,1); it.x=x; it.y=y; it.rot=rot; tc.items.push(it); });
  }

  // 按 uid 删除整个物品（右键丢弃用）
  function invRemoveItem(which, uid){
    return patchCurrent(d=>{ ensureInv(d); const c=container(d,which); if(!c) return;
      const i=c.items.findIndex(it=>it.uid===uid); if(i>=0) c.items.splice(i,1); });
  }
  // 从容器消耗 n 个某类物品（扣堆叠，空了删格）。成功返回 true
  function invConsume(which, type, n){
    n=n||1; if(countItem(type,which)<n) return false;
    patchCurrent(d=>{ ensureInv(d); const c=container(d,which); if(!c) return;
      for(let i=c.items.length-1;i>=0 && n>0;i--){ const it=c.items[i]; if(it.type!==type) continue;
        const take=Math.min(it.count||1, n); it.count=(it.count||1)-take; n-=take;
        if(it.count<=0) c.items.splice(i,1); } });
    return true;
  }

  // ════════ 信号基站 ════════
  function getStations(){ const d=getCurrent(); if(!d) return []; if(!Array.isArray(d.signalStations)) d.signalStations=[]; return d.signalStations; }
  function addStation(st){   // st={lat,lon,x,y,z,r}
    return patchCurrent(d=>{ if(!Array.isArray(d.signalStations)) d.signalStations=[];
      d.signalStations.push({ id:'st'+Date.now().toString(36)+Math.floor(Math.random()*1296).toString(36), ...st }); });
  }
  function removeStation(id){
    return patchCurrent(d=>{ if(Array.isArray(d.signalStations)) d.signalStations=d.signalStations.filter(s=>s.id!==id); });
  }

  return {
    newSaveData,
    ITEM_DEFS, itemDef, itemSize,
    getInv, warehouses, setWhSize, invWeight, countItem, canPlace, canFit, firstFit, invAdd, invMove, invConsume, invRemoveItem,
    getStations, addStation, removeStation,
    getActivePlayer, setActivePlayer,
    getActiveSlot, setActiveSlot,
    loadSave, writeSave, deleteSave, listSlots,
    newGame, continueGame,
    getCurrent, saveCurrent, patchCurrent,
    get, set, setMany,
    getSunAngle, DAY_SECS,
  };
})();

// 供 ES module 和普通 script 两种引入
if (typeof window !== 'undefined') window.SaveSys = SaveSys;
