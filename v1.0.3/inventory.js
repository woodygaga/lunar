/* ════════════════════════════════════════════════════════════════
   网格背包 UI（暗黑式拖拽摆位）—— 重做版 (2026-06-06)
   依赖 storage.js。嵌入 base 第3页（mount 容器）或全屏遮罩。

   设计要点（吸取今天踩坑教训）：
   - 布局用固定像素，不依赖 flex 撑高/撑宽（避免塌缩→标题竖排→网格被推屏外）
   - 标题 white-space:nowrap（绝不竖排）
   - 拖拽用 mouse 事件绑 document（不受 touch-action/滚动手势/原生拖拽干扰）
   - 容器给明确像素宽高
   ════════════════════════════════════════════════════════════════ */
const LunarInv = (() => {
  const CELL = 44, GAP = 2;
  // 仓库固定框架尺寸（写死在代码，不读存档；改这两个数=所有存档立即生效）
  const WH_COLS = 29, WH_ROWS = 12;
  const TIER_COLOR = { common:'rgba(150,195,255,0.55)', uncommon:'rgba(120,235,180,0.75)', rare:'rgba(120,180,255,0.85)', epic:'rgba(220,150,255,0.9)' };
  const TIER_GLOW  = { common:'rgba(120,170,255,0.25)', uncommon:'rgba(80,235,160,0.35)', rare:'rgba(100,160,255,0.45)', epic:'rgba(210,130,255,0.5)' };

  let _root=null, _cfg=null, _embedded=false, _activeWh=0, _drag=null, _hiEl=null, _tip=null;

  function injectCss(){
    if(document.getElementById('lunarInvCss')) return;
    const s=document.createElement('style'); s.id='lunarInvCss';
    s.textContent = `
    #lunarInvMask{ position:fixed; inset:0; z-index:9000; display:flex; align-items:center; justify-content:center;
      background:rgba(4,7,14,0.72); backdrop-filter:blur(6px); font-family:'Segoe UI','PingFang SC',sans-serif; }
    .li-wrap{ font-family:'Segoe UI','PingFang SC',sans-serif; color:#e8eaf0; }
    .li-panel{ background:rgba(12,18,30,0.82); border:1px solid rgba(140,180,240,0.32); border-radius:6px;
      padding:12px 14px 14px; box-shadow:0 0 30px rgba(40,80,160,0.22); display:inline-block; vertical-align:top; }
    .li-head{ white-space:nowrap; margin-bottom:8px; }
    .li-title{ font-size:13px; letter-spacing:0.15em; color:rgba(210,230,255,0.95); }
    .li-load{ font-size:10px; letter-spacing:0.05em; margin-left:10px; color:rgba(180,220,255,0.5); }
    .li-load.over{ color:rgba(255,120,90,0.95); }
    .li-grid{ position:relative; border:1px solid rgba(140,180,240,0.30); border-radius:3px; touch-action:none;
      background:
        repeating-linear-gradient(0deg,transparent 0 ${CELL-1}px,rgba(150,195,255,0.10) ${CELL-1}px ${CELL}px),
        repeating-linear-gradient(90deg,transparent 0 ${CELL-1}px,rgba(150,195,255,0.10) ${CELL-1}px ${CELL}px); }
    .li-item{ position:absolute; display:flex; align-items:center; justify-content:center; border-radius:3px;
      cursor:grab; box-sizing:border-box; user-select:none; -webkit-user-select:none; -webkit-user-drag:none;
      touch-action:none; background:rgba(20,30,48,0.85); overflow:hidden; }
    .li-item:hover{ box-shadow:0 0 0 1px rgba(255,255,255,0.25) inset; }
    .li-item.dragging{ opacity:0.25; }
    .li-ico{ font-size:19px; line-height:1; pointer-events:none; }
    .li-cnt{ position:absolute; right:2px; bottom:0; font-size:10px; color:#fff; text-shadow:0 0 3px #000; pointer-events:none; }
    .li-cellhi{ position:absolute; border-radius:2px; pointer-events:none; z-index:5; }
    .li-cellhi.ok{ background:rgba(110,180,255,0.22); box-shadow:0 0 0 1px rgba(140,200,255,0.7) inset; }
    .li-cellhi.bad{ background:rgba(255,90,70,0.20); box-shadow:0 0 0 1px rgba(255,110,90,0.8) inset; }
    .li-ghost{ position:fixed; pointer-events:none; z-index:9999; opacity:0.9; display:flex; align-items:center;
      justify-content:center; border-radius:3px; background:rgba(30,45,70,0.92); }
    .li-tabs{ margin-bottom:10px; white-space:nowrap; }
    .li-tab{ display:inline-block; padding:6px 14px; font-size:12px; letter-spacing:0.1em; cursor:pointer;
      color:rgba(180,220,255,0.55); background:rgba(255,255,255,0.03); border:1px solid rgba(140,180,240,0.18);
      border-radius:5px 5px 0 0; margin-right:5px; }
    .li-tab.active{ color:rgba(220,240,255,0.98); background:rgba(140,180,240,0.16); border-color:rgba(140,180,240,0.45); }
    .li-tab.locked{ color:rgba(150,170,200,0.4); cursor:not-allowed; }
    .li-close{ position:absolute; top:18px; right:24px; font-size:13px; letter-spacing:0.15em; color:rgba(200,225,255,0.7);
      cursor:pointer; padding:6px 14px; border:1px solid rgba(140,180,240,0.4); border-radius:3px;
      background:rgba(140,180,240,0.08); z-index:10; }
    .li-hint{ font-size:11px; color:rgba(180,220,255,0.4); letter-spacing:0.1em; margin-top:8px; }
    .li-tip{ position:fixed; z-index:9998; pointer-events:none; max-width:200px; background:rgba(8,14,24,0.96);
      border:1px solid rgba(140,180,240,0.4); border-radius:4px; padding:8px 10px; font-size:11px;
      color:rgba(220,235,255,0.92); line-height:1.5; display:none; }
    .li-tip .tn{ font-size:12px; margin-bottom:3px; } .li-tip .tm{ color:rgba(180,220,255,0.55); font-size:10px; }
    .li-menu{ position:fixed; z-index:10000; min-width:130px; background:rgba(10,16,28,0.97);
      border:1px solid rgba(140,180,240,0.45); border-radius:5px; padding:4px 0; box-shadow:0 6px 24px rgba(0,0,0,0.6);
      font-family:'Segoe UI','PingFang SC',sans-serif; user-select:none; }
    .li-menu .mi{ padding:8px 16px; font-size:12px; letter-spacing:0.08em; color:rgba(210,230,255,0.9); cursor:pointer; white-space:nowrap; }
    .li-menu .mi:hover{ background:rgba(140,180,240,0.18); }
    .li-menu .mi.danger{ color:rgba(255,150,120,0.9); }
    .li-menu .mi.danger:hover{ background:rgba(255,100,80,0.18); }
    .li-menu .mhead{ padding:6px 16px 4px; font-size:11px; color:rgba(180,220,255,0.5); border-bottom:1px solid rgba(140,180,240,0.15); margin-bottom:3px; }
    `;
    document.head.appendChild(s);
  }

  const fmtW = kg => kg>=1 ? (kg%1===0?kg:kg.toFixed(1))+' kg' : Math.round(kg*1000)+' g';

  // ── 渲染一个容器面板（固定像素，不依赖 flex）──
  function renderPanel(which, title){
    // 仓库尺寸用代码常量强制固定（不读存档）——改 WH_COLS/WH_ROWS 即所有存档生效
    if(which.startsWith('wh') && which!=='warehouse'){
      const idx = parseInt(which.slice(2),10);
      if(!isNaN(idx)) SaveSys.setWhSize(idx, WH_COLS, WH_ROWS);
    }
    const c = SaveSys.getInv(which);
    const tMap = { rover:'月球车 · 背包', warehouse:'基地 · 仓库' };
    const w = SaveSys.invWeight(which), over = w > c.maxWeight;
    const panel = document.createElement('div');
    panel.className = 'li-panel';
    const gw = c.cols*CELL, gh = c.rows*CELL;
    panel.innerHTML = `
      <div class="li-head"><span class="li-title">${title||tMap[which]||which}</span>` +
      `<span class="li-load ${over?'over':''}">载重 ${fmtW(w)} / ${c.maxWeight} kg</span></div>`;
    const grid = document.createElement('div');
    grid.className = 'li-grid'; grid.dataset.which = which;
    grid.style.width = gw+'px'; grid.style.height = gh+'px';
    c.items.forEach(it => grid.appendChild(renderItem(which, it)));
    panel.appendChild(grid);
    return panel;
  }

  function renderItem(which, it){
    const def = SaveSys.itemDef(it.type), sz = SaveSys.itemSize(it.type, it.rot);
    const el = document.createElement('div');
    el.className = 'li-item'; el.draggable = false;
    el.dataset.uid = it.uid; el.dataset.which = which;
    el.style.left = (it.x*CELL+GAP)+'px'; el.style.top = (it.y*CELL+GAP)+'px';
    el.style.width = (sz.w*CELL-GAP*2)+'px'; el.style.height = (sz.h*CELL-GAP*2)+'px';
    el.style.border = '1px solid '+(TIER_COLOR[def?.tier]||TIER_COLOR.common);
    el.style.boxShadow = '0 0 8px '+(TIER_GLOW[def?.tier]||TIER_GLOW.common);
    el.innerHTML = `<span class="li-ico">${def?.icon||'❔'}</span>`+(it.count>1?`<span class="li-cnt">${it.count}</span>`:'');
    el.addEventListener('mousedown', e=>dragStart(e, which, it));
    el.addEventListener('mouseenter', e=>showTip(e, def, it));
    el.addEventListener('mousemove', moveTip);
    el.addEventListener('mouseleave', hideTip);
    // 右键：拿着东西时由 heldCancel 取消；否则弹快捷菜单
    el.addEventListener('contextmenu', e=>{ e.preventDefault(); e.stopPropagation();
      if(_drag) return;   // 拿起态右键=取消（heldCancel 处理）
      showItemMenu(e, which, it);
    });
    return el;
  }

  // ── tooltip ──
  function showTip(e, def, it){ if(_drag) return;
    if(!_tip){ _tip=document.createElement('div'); _tip.className='li-tip'; document.body.appendChild(_tip); }
    _tip.innerHTML = `<div class="tn" style="color:${TIER_COLOR[def?.tier]||'#cde'}">${def?.name||it.type}</div>`+
      `<div class="tm">${def?.w}×${def?.h} · ${fmtW(def?.weight||0)}/个${it.count>1?(' · ×'+it.count):''}</div>`+
      `<div style="margin-top:4px;color:rgba(210,230,255,0.8)">${def?.desc||''}</div>`;
    _tip.style.display='block'; moveTip(e); }
  function moveTip(e){ if(_tip&&_tip.style.display!=='none'){ _tip.style.left=(e.clientX+14)+'px'; _tip.style.top=(e.clientY+14)+'px'; } }
  function hideTip(){ if(_tip) _tip.style.display='none'; }

  // ── 右键快捷菜单 ──
  let _menu=null;
  function closeMenu(){ if(_menu){ _menu.remove(); _menu=null; document.removeEventListener('mousedown', _menuOutside, true); } }
  function _menuOutside(e){ if(_menu && !_menu.contains(e.target)) closeMenu(); }
  function showItemMenu(e, which, it){
    closeMenu(); hideTip();
    const def=SaveSys.itemDef(it.type);
    // 目标容器：在车→转到当前仓库；在仓库(whN)→转到车
    const isRover = which==='rover';
    const target = isRover ? ('wh'+_activeWh) : 'rover';
    const targetName = isRover ? '仓库' : '车背包';
    _menu=document.createElement('div'); _menu.className='li-menu';
    _menu.innerHTML = `<div class="mhead">${def?.icon||''} ${def?.name||it.type}${it.count>1?(' ×'+it.count):''}</div>`;
    const add=(label,cls,fn)=>{ const mi=document.createElement('div'); mi.className='mi'+(cls?' '+cls:''); mi.textContent=label;
      mi.addEventListener('click',()=>{ fn(); closeMenu(); refresh(); }); _menu.appendChild(mi); };
    // 信号基站在车背包里：可"部署到车当前位置"（发事件给 outside 执行）
    if(it.type==='beacon' && which==='rover'){
      add('📡 部署到当前位置', '', ()=>{
        window.dispatchEvent(new CustomEvent('deployBeacon'));
      });
    }
    add('→ 转到'+targetName, '', ()=>moveWholeItem(which, it.uid, target));
    add('丢弃', 'danger', ()=>{ if(confirm('确定丢弃 '+(def?.name||it.type)+(it.count>1?(' ×'+it.count):'')+' ?')) SaveSys.invRemoveItem(which, it.uid); });
    document.body.appendChild(_menu);
    // 定位（避免超出屏幕）
    const mw=150, mh=_menu.offsetHeight||90;
    _menu.style.left=Math.min(e.clientX, innerWidth-mw)+'px';
    _menu.style.top =Math.min(e.clientY, innerHeight-mh)+'px';
    setTimeout(()=>document.addEventListener('mousedown', _menuOutside, true), 0);
  }
  // 把整个物品转移到另一容器（自动找空位 / 堆叠）
  function moveWholeItem(fromWhich, uid, toWhich){
    const src=SaveSys.getInv(fromWhich); const it=src?.items.find(i=>i.uid===uid); if(!it) return;
    const def=SaveSys.itemDef(it.type);
    // 重量/容量检查
    if(!SaveSys.canFit(toWhich, it.type, it.count||1)){ alert('目标容器放不下'); return; }
    const fit=SaveSys.firstFit(toWhich, it.type, it.rot||0);
    if(!fit){ alert('目标容器没有空位'); return; }
    SaveSys.invMove(fromWhich, uid, toWhich, fit.x, fit.y, fit.rot);
  }

  // ════════ 持有态交互：统一拖拽 + 点击拿放 ════════
  // _drag.held=false：mousedown 后的候选态（移动超阈值=拖拽，松手=放下；没怎么动松手=转为拿起态）
  // _drag.held=true ：点击拿起态（物品持续跟随鼠标，再点一下放下，右键取消，R 旋转）
  const CLICK_THRESH = 6;   // 移动小于此像素视为"点击"而非拖拽

  function dragStart(e, which, it){
    if(e.button!==0) return;
    if(_drag && _drag.held) return;   // 拿起态的放下由 document 级 heldClick 统一处理
    e.preventDefault(); hideTip();
    const def=SaveSys.itemDef(it.type), sz=SaveSys.itemSize(it.type,it.rot);
    const srcEl=e.currentTarget, r=srcEl.getBoundingClientRect();
    const ghost=document.createElement('div'); ghost.className='li-ghost';
    ghost.style.width=(sz.w*CELL-GAP*2)+'px'; ghost.style.height=(sz.h*CELL-GAP*2)+'px';
    ghost.style.border='1px solid '+(TIER_COLOR[def?.tier]||TIER_COLOR.common);
    ghost.style.left='0'; ghost.style.top='0'; ghost.style.willChange='transform';
    ghost.innerHTML=`<span class="li-ico">${def?.icon||'❔'}</span>`;
    document.body.appendChild(ghost);
    _drag={ which, uid:it.uid, type:it.type, rot:it.rot||0, sz, ghost, srcEl,
            offX:e.clientX-r.left, offY:e.clientY-r.top,
            startX:e.clientX, startY:e.clientY, held:false };
    srcEl.classList.add('dragging');
    moveGhost(e.clientX, e.clientY);
    document.addEventListener('mousemove', dragMove, true);
    document.addEventListener('mouseup', dragUp, true);
    document.addEventListener('mousedown', heldClick, true);  // 拿起态下点击放下
    document.addEventListener('contextmenu', heldCancel, true); // 右键取消
    window.addEventListener('keydown', dragKey, true);          // R 旋转（绑 window，不受焦点影响）
  }

  // 幽灵用 transform 移动（GPU 合成层，不触发重排，最跟手）
  function moveGhost(cx, cy){ if(_drag){ _drag.ghost.style.transform=`translate3d(${cx-_drag.offX}px,${cy-_drag.offY}px,0)`; } }

  let _lastMouse=null, _hiRaf=0;
  function dragMove(e){ if(!_drag) return; e.preventDefault();
    _lastMouse={x:e.clientX,y:e.clientY};
    moveGhost(e.clientX, e.clientY);              // 幽灵即时跟手（轻）
    // 高亮计算较重，放 rAF 每帧最多一次，避免阻塞幽灵
    if(!_hiRaf) _hiRaf=requestAnimationFrame(updateHi); }
  function updateHi(){ _hiRaf=0; if(!_drag||!_lastMouse) return;
    clearHi(); const hit=hitGrid(_lastMouse.x,_lastMouse.y);
    if(hit){ const ok=canPlaceX(hit.which,hit.x,hit.y); showHi(hit.grid,hit.x,hit.y,ok); } }

  function dragUp(e){ if(!_drag || _drag.held) return; e.preventDefault();
    const moved = Math.abs(e.clientX-_drag.startX) + Math.abs(e.clientY-_drag.startY);
    if(moved > CLICK_THRESH){
      // 拖拽：当场放下
      tryDrop(e.clientX, e.clientY);
    } else {
      // 点击：转为"拿起态"，物品继续跟随，等下次点击放下
      _drag.held = true;
    }
  }

  // 拿起态下：在任意位置 mousedown 左键 → 放下
  function heldClick(e){
    if(!_drag || !_drag.held) return;
    if(e.button!==0) return;
    e.preventDefault();
    e.stopPropagation();              // 阻止传到物品 dragStart，避免放下后立刻又拿起
    tryDrop(e.clientX, e.clientY);
  }
  // 拿起态下：右键 → 放回原位取消
  function heldCancel(e){
    if(!_drag) return;
    e.preventDefault();
    endDrag(); refresh();   // 不写存档=物品回原位
  }

  function tryDrop(cx, cy){
    const hit=hitGrid(cx, cy);
    if(hit && canPlaceX(hit.which,hit.x,hit.y)){
      SaveSys.invMove(_drag.which,_drag.uid,hit.which,hit.x,hit.y,_drag.rot);
      endDrag(); refresh();
    }
    // 落点非法：保持持有态（拿起模式下继续拿着；拖拽模式下也回到可继续移动）
    else if(_drag && !_drag.held){ _drag.held = true; }  // 拖到非法处=转拿起态，不丢
  }

  function dragKey(e){ if(_drag && (e.key==='r'||e.key==='R')){ e.preventDefault();
    _drag.rot=_drag.rot?0:1; _drag.sz=SaveSys.itemSize(_drag.type,_drag.rot);
    _drag.ghost.style.width=(_drag.sz.w*CELL-GAP*2)+'px'; _drag.ghost.style.height=(_drag.sz.h*CELL-GAP*2)+'px';
    // 旋转后立即更新高亮
    clearHi(); const m=_lastMouse; if(m){ const hit=hitGrid(m.x,m.y); if(hit) showHi(hit.grid,hit.x,hit.y,canPlaceX(hit.which,hit.x,hit.y)); } } }

  function endDrag(){ if(!_drag) return;
    if(_hiRaf){ cancelAnimationFrame(_hiRaf); _hiRaf=0; }
    _drag.ghost.remove(); if(_drag.srcEl) _drag.srcEl.classList.remove('dragging'); clearHi();
    document.removeEventListener('mousemove', dragMove, true);
    document.removeEventListener('mouseup', dragUp, true);
    document.removeEventListener('mousedown', heldClick, true);
    document.removeEventListener('contextmenu', heldCancel, true);
    window.removeEventListener('keydown', dragKey, true);
    _drag=null; }

  function hitGrid(cx, cy){
    if(!_root) return null;
    for(const g of _root.querySelectorAll('.li-grid')){
      const r=g.getBoundingClientRect();
      if(cx>=r.left&&cx<=r.right&&cy>=r.top&&cy<=r.bottom){
        const sz=_drag.sz;
        let gx=Math.round((cx-_drag.offX-r.left)/CELL), gy=Math.round((cy-_drag.offY-r.top)/CELL);
        const cols=Math.round(r.width/CELL), rows=Math.round(r.height/CELL);
        gx=Math.max(0,Math.min(gx,cols-sz.w)); gy=Math.max(0,Math.min(gy,rows-sz.h));
        return { which:g.dataset.which, grid:g, x:gx, y:gy };
      }
    }
    return null;
  }
  function canPlaceX(toWhich, x, y){
    const same=toWhich===_drag.which;
    // 合并：落点命中同类未满堆 → 合法（合并不增总量，跳过占格/重量检查）
    if(mergeTargetAt(toWhich, x, y)) return true;
    if(!SaveSys.canPlace(toWhich,_drag.type,x,y,_drag.rot, same?_drag.uid:undefined)) return false;
    if(!same){ const c=SaveSys.getInv(toWhich), def=SaveSys.itemDef(_drag.type);
      const src=SaveSys.getInv(_drag.which).items.find(o=>o.uid===_drag.uid);
      if(SaveSys.invWeight(toWhich)+def.weight*(src?.count||1) > c.maxWeight) return false; }
    return true;
  }
  // 落点(x,y)是否命中一个同类型、未满堆的物品（可合并）
  function mergeTargetAt(toWhich, x, y){
    const def=SaveSys.itemDef(_drag.type); if(!def || def.stack<=1) return null;
    const c=SaveSys.getInv(toWhich); if(!c) return null;
    return c.items.find(o=>{ if(o.uid===_drag.uid) return false; if(o.type!==_drag.type) return false;
      if((o.count||1)>=def.stack) return false;
      const s=SaveSys.itemSize(o.type,o.rot);
      return x>=o.x && x<o.x+s.w && y>=o.y && y<o.y+s.h; }) || null;
  }
  function showHi(grid, x, y, ok){ const sz=_drag.sz;
    if(!_hiEl) _hiEl=document.createElement('div');
    _hiEl.className='li-cellhi '+(ok?'ok':'bad');
    _hiEl.style.left=(x*CELL+GAP)+'px'; _hiEl.style.top=(y*CELL+GAP)+'px';
    _hiEl.style.width=(sz.w*CELL-GAP*2)+'px'; _hiEl.style.height=(sz.h*CELL-GAP*2)+'px';
    _hiEl.style.display='block'; if(_hiEl.parentNode!==grid) grid.appendChild(_hiEl); }
  function clearHi(){ if(_hiEl) _hiEl.style.display='none'; }

  // ── 重绘 ──
  function refresh(){
    if(!_root||!_cfg||_drag) return;
    const body=_root.querySelector('#liBody'); body.innerHTML=''; _hiEl=null;
    if(_cfg.mode==='warehouse'){ renderWarehouse(body); return; }
    body.appendChild(renderPanel(_cfg.left));
    if(_cfg.right) body.appendChild(renderPanel(_cfg.right));
  }

  // warehouse 布局：顶部切仓栏 + 仓库网格 + 车背包（横向并排，固定像素）
  function renderWarehouse(body){
    const whs=SaveSys.warehouses(); if(_activeWh>=whs.length) _activeWh=0;
    const tabs=document.createElement('div'); tabs.className='li-tabs';
    whs.forEach((w,i)=>{ const t=document.createElement('span');
      t.className='li-tab'+(i===_activeWh?' active':'')+(w.locked?' locked':'');
      t.textContent=(w.locked?'🔒 ':'')+w.name;
      if(!w.locked) t.addEventListener('click',()=>{ _activeWh=i; refresh(); });
      tabs.appendChild(t); });
    body.appendChild(tabs);

    // 车背包固定右侧不换行；仓库占左边剩余宽（列数已按剩余宽算，不会横向溢出）
    const row=document.createElement('div'); row.style.cssText='display:flex;gap:18px;align-items:flex-start;overflow:hidden;';
    const cur=whs[_activeWh];
    if(cur.locked){
      const lk=document.createElement('div');
      lk.style.cssText='flex:1;padding:80px 0;border:1px dashed rgba(140,180,240,0.25);'
        +'border-radius:6px;text-align:center;color:rgba(150,180,220,0.5);font-size:16px;';
      lk.innerHTML=`🔒<br><span style="font-size:14px">${cur.name} 未解锁</span>`;
      row.appendChild(lk);
    } else {
      row.appendChild(renderPanel('wh'+_activeWh, '基地 · '+cur.name));
    }
    const roverP = renderPanel('rover');
    roverP.style.flexShrink = '0';     // 车背包固定宽，不被压缩
    row.appendChild(roverP);
    body.appendChild(row);
  }

  // ── 打开 / 关闭 ──
  function open(cfg){
    if(!window.SaveSys){ console.warn('[LunarInv] SaveSys 未加载'); return; }
    injectCss(); close();
    _cfg=cfg||{left:'rover'}; _embedded=!!_cfg.mount; _activeWh=0;
    const hint='拖动摆放 · 拖动时按 R 旋转 · 车 ↔ 仓库 可互转';
    if(_embedded){
      const host=_cfg.mount; host.innerHTML=''; host.style.padding='8px 12px';
      _root=document.createElement('div'); _root.className='li-wrap';
      _root.innerHTML=`<div id="liBody"></div><div class="li-hint">${hint}</div>`;
      host.appendChild(_root);
    } else {
      _root=document.createElement('div'); _root.id='lunarInvMask';
      _root.innerHTML=`<div class="li-close" id="liClose">关闭 ✕</div>`
        +`<div class="li-wrap" style="text-align:center"><div id="liBody"></div><div class="li-hint">${hint}</div></div>`;
      document.body.appendChild(_root);
      document.getElementById('liClose').addEventListener('click', close);
      _root.addEventListener('mousedown', e=>{ if(e.target===_root) close(); });
    }
    refresh();
  }
  function close(){
    if(_drag) endDrag();
    closeMenu();
    if(_root){ if(_embedded && _root.parentNode) _root.parentNode.innerHTML=''; else _root.remove(); _root=null; }
    if(_tip){ _tip.remove(); _tip=null; } _hiEl=null; _embedded=false;
  }

  return { open, close, refresh, CELL,
    isDragging: () => !!_drag,
    isOpen: () => !!_root };
})();
if (typeof window !== 'undefined') window.LunarInv = LunarInv;
