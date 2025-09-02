(() => {
  "use strict";
  // ---------- Sizes ----------
  const CELL=28, COLS=10, ROWS=20;
  const W=COLS*CELL, H=ROWS*CELL;
  const LEFT_INFO_W=210, RIGHT_INFO_W=190;
  const WIN_W=LEFT_INFO_W+W+RIGHT_INFO_W, WIN_H=H;

  // ---------- Tunables ----------
  const BASE_FALL_S=0.520, LEVEL_STEP_MS=40/1000, MIN_FALL_S=0.090;
  const MOVE_COOLDOWN_S=0.110, ROT_COOLDOWN_S=0.230;

  // Soft drop pacing (seconds per cell)
  const SOFT_DROP_MAP = { slow: 0.10, normal: 0.06, fast: 0.04 };
  let SOFT_DROP_STEP_S = SOFT_DROP_MAP.normal;

  // ---------- Settings (persisted) ----------
  let settings = {
    showShadow:   true,
    particles:    true,
    gridFx:       true,
    outline:      true,
    crt:          false,
    softDropMode: "normal",
    cinematicFx:  true   // keep only this “new” feature
  };
  try {
    const s = JSON.parse(localStorage.getItem("photonBlocksSettings")||"{}");
    settings = {...settings, ...s};
    if (SOFT_DROP_MAP[settings.softDropMode]) SOFT_DROP_STEP_S = SOFT_DROP_MAP[settings.softDropMode];
  } catch {}

  // Wire settings UI
  const el = (id)=>document.getElementById(id);
  const panel = document.getElementById("settingsPanel");
  const syncPanel = ()=>{
    if (!panel) return;
    el("optShadow").checked   = settings.showShadow;
    el("optParticles").checked= settings.particles;
    el("optGridFx").checked   = settings.gridFx;
    el("optOutline").checked  = settings.outline;
    el("optCRT").checked      = settings.crt;
    el("optSoftDrop").value   = settings.softDropMode;
    el("optCinematic").checked= settings.cinematicFx;
  };
  const applyFromPanel = ()=>{
    if (!panel) return;
    settings.showShadow   = el("optShadow").checked;
    settings.particles    = el("optParticles").checked;
    settings.gridFx       = el("optGridFx").checked;
    settings.outline      = el("optOutline").checked;
    settings.crt          = el("optCRT").checked;
    settings.softDropMode = el("optSoftDrop").value;
    settings.cinematicFx  = el("optCinematic").checked;
    SOFT_DROP_STEP_S      = SOFT_DROP_MAP[settings.softDropMode] || SOFT_DROP_MAP.normal;
    localStorage.setItem("photonBlocksSettings", JSON.stringify(settings));
  };
  if (panel) {
    document.getElementById("settingsBtn")?.addEventListener("click", ()=>{
      syncPanel();
      panel.style.display = (panel.style.display==="none"||!panel.style.display) ? "block" : "none";
    });
    document.getElementById("applySettings")?.addEventListener("click", ()=>{ applyFromPanel(); panel.style.display="none"; });
    document.getElementById("closeSettings")?.addEventListener("click", ()=>{ panel.style.display="none"; });
    document.getElementById("resetSettings")?.addEventListener("click", ()=>{
      settings = { showShadow:true, particles:true, gridFx:true, outline:true, crt:false, softDropMode:"normal", cinematicFx:true };
      SOFT_DROP_STEP_S = SOFT_DROP_MAP.normal;
      localStorage.setItem("photonBlocksSettings", JSON.stringify(settings));
      syncPanel();
    });
    syncPanel();
  }

  // ---------- Visual constants ----------
  let SHOW_CRT=settings.crt, CRT_SCANLINE_ALPHA=8, CRT_VIGNETTE_STRENGTH=60;
  const BLOCK_GLOW=160, BLOCK_OUTLINE_A=230, SHADOW_ALPHA=90, SHADOW_BORDER_A=180;
  const GRID_ALPHA_X=40, GRID_ALPHA_Y=30;

  // Colors
  const WHITE=[245,250,255], UI_MUTED=[170,190,210], GLOW=[60,150,255];
  const BG_TOP=[8,12,26], BG_BOT=[12,8,30];
  const SHAPE_COLORS={I:[0,220,255],O:[255,220,0],T:[200,90,255],S:[0,235,150],Z:[255,80,120],J:[80,140,255],L:[255,160,60]};
  const SHAPES={I:[[1,1,1,1]],O:[[1,1],[1,1]],T:[[0,1,0],[1,1,1]],S:[[0,1,1],[1,1,0]],Z:[[1,1,0],[0,1,1]],J:[[1,0,0],[1,1,1]],L:[[0,0,1],[1,1,1]]};

  // ---------- Canvas / focus ----------
  const cvs=document.getElementById("game");
  cvs.width=WIN_W; cvs.height=WIN_H;
  const ctx=cvs.getContext("2d");
  const ensureFocus=()=>{ if(document.activeElement!==cvs) cvs.focus(); };
  window.addEventListener("load", ensureFocus);
  document.addEventListener("mousedown", ensureFocus);
  document.addEventListener("keydown", ensureFocus);

  // ---------- Utils ----------
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const rand={range(a,b){return a+(b-a)*Math.random();}, int(a,b){return Math.floor(this.range(a,b+1));}, shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}};
  const rgba=(c,a=255)=>`rgba(${c[0]},${c[1]},${c[2]},${a/255})`;
  const lighten=(c,amt)=>[clamp(c[0]+amt,0,255),clamp(c[1]+amt,0,255),clamp(c[2]+amt,0,255)];
  function makeCanvas(w,h){const o=document.createElement("canvas");o.width=w;o.height=h;return o;}
  function makeGradient(w,h,top,bot){const o=makeCanvas(w,h),g=o.getContext("2d");const grd=g.createLinearGradient(0,0,0,h);grd.addColorStop(0,rgba(top));grd.addColorStop(1,rgba(bot));g.fillStyle=grd;g.fillRect(0,0,w,h);return o;}
  const bgGrad=makeGradient(WIN_W,WIN_H,BG_TOP,BG_BOT);
  function scanlines(w,h,gap=3,alpha=CRT_SCANLINE_ALPHA){const o=makeCanvas(w,h),g=o.getContext("2d");g.strokeStyle=`rgba(255,255,255,${alpha/255})`;g.lineWidth=1;for(let y=0;y<h;y+=gap){g.beginPath();g.moveTo(0,y+.5);g.lineTo(w,y+.5);g.stroke();}return o;}
  const scan=scanlines(WIN_W,WIN_H);
  function vignette(w,h,str=CRT_VIGNETTE_STRENGTH){const o=makeCanvas(w,h),g=o.getContext("2d");const cx=w/2,cy=h/2,maxd=Math.hypot(cx,cy),step=3;for(let y=0;y<h;y+=step){for(let x=0;x<w;x+=step){const d=Math.hypot(x-cx,y-cy)/maxd;const a=Math.floor(str*Math.max(0,d-0.38));if(a>0){g.fillStyle=`rgba(0,0,0,${a/255})`;g.fillRect(x,y,step,step);}}}return o;}
  const vign=vignette(WIN_W,WIN_H);

  function roundedRect(g,x,y,w,h,r=6,fill=true,stroke=false,strokeW=2,strokeCol="white"){g.beginPath();g.moveTo(x+r,y);g.lineTo(x+w-r,y);g.quadraticCurveTo(x+w,y,x+w,y+r);g.lineTo(x+w,y+h-r);g.quadraticCurveTo(x+w,y+h,x+w-r,y+h);g.lineTo(x+r,y+h);g.quadraticCurveTo(x,y+h,x,y+h-r);g.lineTo(x,y+r);g.quadraticCurveTo(x,y,x+r,y);if(fill)g.fill();if(stroke){g.lineWidth=strokeW;g.strokeStyle=strokeCol;g.stroke();}}
  function addGlow(g,x,y,w,h,col,alpha=95){g.save();g.globalCompositeOperation="lighter";g.fillStyle=rgba(col,alpha);roundedRect(g,x-2,y-2,w+4,h+4,10,true,false);g.restore();}
  function outlineRect(g,x,y,w,h,col,a=120,width=2){g.save();g.strokeStyle=rgba(col,a);g.lineWidth=width;roundedRect(g,x,y,w,h,6,false,true,width,rgba(col,a));g.restore();}

  // ---------- Sprites ----------
  const BLOCK_CACHE=new Map(), GHOST_CACHE=new Map();
  function makeBlockSprite(color){const key=color.join(",");if(BLOCK_CACHE.has(key))return BLOCK_CACHE.get(key);const hr=CELL*3;const o=makeCanvas(CELL-4,CELL-4),g=o.getContext("2d");const t=makeCanvas(hr,hr),gt=t.getContext("2d");const r=Math.floor(hr*0.22);gt.fillStyle=rgba(color);roundedRect(gt,hr*.07,hr*.07,hr*.86,hr*.86,r,true,false);for(let i=1;i<=5;i++){const pad=Math.floor(hr*(0.07+i*0.01));const a=50-i*7;gt.fillStyle=rgba(lighten(color,40),Math.max(0,a));roundedRect(gt,pad,pad,hr-2*pad,hr-2*pad,r,true,false);}gt.lineWidth=Math.floor(hr*.05);gt.strokeStyle=rgba(lighten(color,20),220);roundedRect(gt,hr*.06,hr*.06,hr*.88,hr*.88,r,false,true,gt.lineWidth,gt.strokeStyle);g.imageSmoothingEnabled=true;g.drawImage(t,0,0,hr,hr,0,0,o.width,o.height);BLOCK_CACHE.set(key,o);return o;}
  function makeGhostSprite(color){const key="G:"+color.join(",");if(GHOST_CACHE.has(key))return GHOST_CACHE.get(key);const spr=makeBlockSprite(color);const o=makeCanvas(spr.width,spr.height),g=o.getContext("2d");g.drawImage(spr,0,0);g.fillStyle=rgba(color,SHADOW_ALPHA);g.fillRect(0,0,o.width,o.height);g.lineWidth=2;g.strokeStyle=rgba(color,SHADOW_BORDER_A);roundedRect(g,1,1,o.width-2,o.height-2,8,false,true,2,g.strokeStyle);GHOST_CACHE.set(key,o);return o;}

  // ---------- Game types ----------
  class Tetromino{
    constructor(k){this.k=k;this.blocks=SHAPES[k].map(r=>r.slice());this.color=SHAPE_COLORS[k];this.x=Math.floor(COLS/2-this.blocks[0].length/2);this.y=-2;}
    rotated(){const b=this.blocks,R=b.length,C=b[0].length;const out=Array.from({length:C},()=>Array(R).fill(0));for(let i=0;i<R;i++)for(let j=0;j<C;j++)out[j][R-1-i]=b[i][j];return out;}
    *cells(ox=0,oy=0,blocks=null){const b=blocks||this.blocks;for(let i=0;i<b.length;i++)for(let j=0;j<b[i].length;j++)if(b[i][j])yield[this.x+j+ox,this.y+i+oy];}
  }

  function createGrid(locked){const g=Array.from({length:ROWS},()=>Array(COLS).fill(null));for(const k in locked){const [x,y]=k.split(",").map(Number);if(x>=0&&x<COLS&&y>=0&&y<ROWS)g[y][x]=locked[k];}return g;}
  function valid(piece,grid,ox=0,oy=0,blocks=null){for(const[x,y]of piece.cells(ox,oy,blocks)){if(x<0||x>=COLS||y>=ROWS)return false;if(y>=0&&grid[y][x]!==null)return false;}return true;}
  function lockPiece(piece,locked){for(const[x,y]of piece.cells())locked[`${x},${y}`]=piece.color;}
  function findFullRows(grid){const out=[];for(let i=0;i<ROWS;i++){let ok=true;for(let x=0;x<COLS;x++)if(grid[i][x]==null){ok=false;break;}if(ok)out.push(i);}return out;}
  function clearRows(locked,rows){if(!rows.length)return;rows=rows.slice().sort((a,b)=>a-b);for(const r of rows)for(let x=0;x<COLS;x++)delete locked[`${x},${r}`];for(const r of rows){for(let y=r-1;y>=-30;y--){for(let x=0;x<COLS;x++){const k=`${x},${y}`;if(locked[k]){locked[`${x},${y+1}`]=locked[k];delete locked[k];}}}}}

  // ---------- FX (particles + shockwaves only) ----------
  class Particle{
    constructor(x,y,color){const ang=Math.random()*Math.PI*2,spd=90+Math.random()*210;this.vx=Math.cos(ang)*spd;this.vy=Math.sin(ang)*spd-100;this.x=x;this.y=y;this.life=0.35+Math.random()*0.35;this.color=color;this.size=2+Math.floor(Math.random()*3);this.age=0;}
    update(dt){this.age+=dt;this.x+=this.vx*dt;this.y+=this.vy*dt;this.vy+=440*dt;}
    dead(){return this.age>=this.life;}
    draw(g){ if(!settings.particles) return;
      const t=Math.max(0,1-this.age/this.life),a=Math.floor(200*t),sz=Math.floor(this.size*(0.7+0.6*t));
      g.save(); g.globalCompositeOperation="lighter";
      g.fillStyle=rgba(this.color,a);
      roundedRect(g,Math.floor(this.x)-Math.floor(sz/2),Math.floor(this.y)-Math.floor(sz/2),sz,sz,3,true,false);
      g.restore();
    }
  }
  class Shockwave{
    constructor(x,y,col,rad=16,dur=0.35){this.x=x;this.y=y;this.t=0;this.dur=dur;this.col=col;this.rad=rad;}
    update(dt){this.t+=dt;}
    dead(){return this.t>=this.dur;}
    draw(g){
      if(!settings.cinematicFx) return;
      const k=this.t/this.dur, r=this.rad + k*110, a=Math.floor(180*(1-k));
      g.save(); g.globalCompositeOperation="lighter";
      g.strokeStyle=rgba(this.col,a); g.lineWidth=2;
      g.beginPath(); g.arc(this.x,this.y,r,0,Math.PI*2); g.stroke();
      g.restore();
    }
  }
  class FX{
    constructor(){this.p=[];this.wave=null;this.shake_t=0;this.shocks=[];}
    burst(cx,cy,color,n=28){ if(!settings.particles) return; for(let i=0;i<n;i++)this.p.push(new Particle(cx,cy,color)); }
    startWave(rows){ if(rows&&rows.length) this.wave={rows:rows.slice(),t:0,dur:0.38}; }
    shock(x,y,col){ this.shocks.push(new Shockwave(x,y,col)); }
    addShake(amt=0.3){ this.shake_t=Math.min(0.5,this.shake_t+amt); }
    update(dt){
      this.p=this.p.filter(z=>!z.dead()); for(const z of this.p) z.update(dt);
      this.shocks=this.shocks.filter(s=>!s.dead()); for(const s of this.shocks) s.update(dt);
      if(this.wave){ this.wave.t+=dt; if(this.wave.t>=this.wave.dur) this.wave=null; }
      if(this.shake_t>0) this.shake_t=Math.max(0,this.shake_t-dt*1.7);
    }
    shakeOff(){ if(this.shake_t<=0) return [0,0]; const mag=6*(this.shake_t**0.7); return [Math.floor(-mag+Math.random()*mag*2), Math.floor(-mag+Math.random()*mag*2)]; }
    drawWave(g){
      if(!this.wave) return;
      const t=this.wave.t/this.wave.dur, w=Math.floor(W*(0.2+1.4*t)), a=Math.floor(160*(1-t)), x0=Math.floor((W-w)/2);
      g.save(); g.globalCompositeOperation="lighter";
      for(const r of this.wave.rows){ const y=r*CELL; g.fillStyle=`rgba(255,255,255,${a/255})`; roundedRect(g,x0,y,w,CELL,8,true,false); }
      g.restore();
    }
    drawShocks(g){ for(const s of this.shocks) s.draw(g); }
  }
  const fx=new FX();

  // ---------- Draw helpers ----------
  function drawGridBG(g,t_s){
    if(!settings.gridFx) return;
    g.save(); g.globalCompositeOperation="lighter";
    for(let x=0;x<=COLS;x++){
      const a=Math.floor(GRID_ALPHA_X*(0.5+0.5*Math.sin(t_s*1.5+x*0.6)));
      g.strokeStyle=rgba(GLOW,a); g.beginPath(); g.moveTo(x*CELL+.5,0); g.lineTo(x*CELL+.5,H); g.stroke();
    }
    for(let y=0;y<=ROWS;y++){
      const a=Math.floor(GRID_ALPHA_Y*(0.5+0.5*Math.sin(t_s*1.8+y*0.55)));
      g.strokeStyle=rgba(GLOW,a); g.beginPath(); g.moveTo(0,y*CELL+.5); g.lineTo(W,y*CELL+.5); g.stroke();
    }
    g.restore();
  }
  function drawBlock(g,x,y,color,pulse=1){
    const px=x*CELL, py=y*CELL;
    g.fillStyle=rgba([Math.min(255,color[0]+10),Math.min(255,color[1]+10),Math.min(255,color[2]+10)]);
    roundedRect(g,px+2,py+2,CELL-4,CELL-4,8,true,false);
    addGlow(g,px,py,CELL,CELL,color,95);
    g.drawImage(makeBlockSprite(color),px+2,py+2);
    if(settings.outline){ outlineRect(g,px+1,py+1,CELL-2,CELL-2,color,BLOCK_OUTLINE_A,3); }
  }
  function drawShadowPiece(g,piece,grid){
    if(!settings.showShadow) return;
    const ghost=new Tetromino(piece.k);
    ghost.blocks=piece.blocks.map(r=>r.slice());
    ghost.x=piece.x; ghost.y=piece.y;
    while(valid(ghost,grid,0,1))ghost.y+=1;
    const gs=makeGhostSprite(piece.color);
    for(const[x,y]of ghost.cells()){ if(y<0)continue; g.drawImage(gs,x*CELL+2,y*CELL+2); }
  }
  function drawNext(panelCtx,piece,t_s){
    panelCtx.clearRect(0,0,panelCtx.canvas.width,panelCtx.canvas.height);
    panelCtx.fillStyle=rgba(WHITE); panelCtx.font="18px Arial"; panelCtx.fillText("NEXT",14,22);
    const ox=22, oy=38;
    const wave=0.7+0.3*Math.sin(t_s*4.0);
    for(let i=0;i<piece.blocks.length;i++){
      for(let j=0;j<piece.blocks[i].length;j++){
        if(!piece.blocks[i][j]) continue;
        const px=ox+j*(CELL-6), py=oy+i*(CELL-6);
        addGlow(panelCtx,px,py,CELL-8,CELL-8,piece.color,Math.floor(130*wave));
        const spr=makeBlockSprite(piece.color);
        panelCtx.drawImage(spr,px,py,CELL-8,CELL-8);
      }
    }
  }
  function drawRightPanel(g,score,lines,level,nxt_piece,t_s,elapsed_s){
    const panelW=RIGHT_INFO_W, panelH=H, px=LEFT_INFO_W+W;
    g.save();
    g.fillStyle="rgba(10,20,35,0.78)";
    roundedRect(g,px+10,10,panelW-20,panelH-20,14,true,false);
    g.lineWidth=2; g.strokeStyle="rgba(80,160,255,0.24)";
    roundedRect(g,px+10,10,panelW-20,panelH-20,14,false,true,2,g.strokeStyle);

    const mm=Math.floor(elapsed_s/60), ss=Math.floor(elapsed_s%60);
    g.fillStyle=rgba(UI_MUTED); g.font="18px Arial"; g.fillText("TIME", px+22, 32);
    g.fillStyle=rgba(WHITE); g.font="28px Arial"; g.fillText(`${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`, px+22, 64);

    g.fillStyle=rgba(UI_MUTED); g.font="18px Arial"; g.fillText("SCORE", px+22, 96);
    g.fillStyle=rgba(WHITE); g.fillText(String(score), px+22, 118);
    g.fillStyle=rgba(UI_MUTED); g.fillText("LINES", px+22, 150);
    g.fillStyle=rgba(WHITE); g.fillText(String(lines), px+22, 172);
    g.fillStyle=rgba(UI_MUTED); g.fillText("LEVEL", px+22, 204);
    g.fillStyle=rgba(WHITE); g.fillText(String(level), px+22, 226);

    const nextW=panelW-40, nextH=120;
    g.fillStyle="rgba(18,30,55,0.70)";
    roundedRect(g, px+20,260, nextW,nextH,12,true,false);
    g.lineWidth=2; g.strokeStyle="rgba(80,160,255,0.27)";
    roundedRect(g, px+20,260, nextW,nextH,12,false,true,2,g.strokeStyle);
    if(!drawRightPanel._next) drawRightPanel._next=makeCanvas(nextW,nextH);
    const ng=drawRightPanel._next.getContext("2d");
    drawNext(ng, nxt_piece, t_s);
    g.drawImage(drawRightPanel._next, px+20,260);

    g.restore();
  }
  function drawLeftControls(g){
    g.save();
    g.fillStyle="rgba(10,20,35,0.78)";
    roundedRect(g, 10,10, LEFT_INFO_W-20, H-20, 14, true,false);
    g.lineWidth=2; g.strokeStyle="rgba(80,160,255,0.24)";
    roundedRect(g,10,10,LEFT_INFO_W-20,H-20,14,false,true,2,g.strokeStyle);
    g.fillStyle=rgba(WHITE); g.font="28px Arial"; g.fillText("CONTROLS",16,42);
    const lines=[["\u2190/\u2192 or A/D","Move"],["\u2193 or S","Soft drop"],["\u2191 or W","Rotate"],["SPACE","Hard drop"],["R","Restart"],["ESC","Quit"]];
    let y=74; g.font="18px Arial";
    for(const[k,desc] of lines){ g.fillStyle=rgba(WHITE); g.fillText(k,16,y); g.fillStyle=rgba(UI_MUTED); g.fillText(desc,110,y); y+=26; }
    g.restore();
  }

  // ---------- Bag ----------
  function newBag(){return rand.shuffle(Object.keys(SHAPES).slice());}
  class PieceQueue{constructor(){this.bag=newBag();}nextKey(){if(!this.bag.length)this.bag=newBag();return this.bag.pop();}peekKey(){if(!this.bag.length)this.bag=newBag();return this.bag[this.bag.length-1];}}

  // ---------- Input ----------
  const keysDown=new Set();
  const KEY_MOVES = new Set(["ArrowLeft","KeyA","ArrowRight","KeyD","ArrowDown","KeyS","ArrowUp","KeyW","Space","KeyR","Escape"]);
  window.addEventListener("keydown",e=>{keysDown.add(e.code); if(KEY_MOVES.has(e.code)) e.preventDefault();},{passive:false});
  window.addEventListener("keyup",e=>{keysDown.delete(e.code);});

  // ---------- Game state ----------
  function newGame(){
    const locked={}; const queue=new PieceQueue();
    let current=new Tetromino(queue.nextKey());
    let nxt=new Tetromino(queue.nextKey());
    let score=0,lines=0,level=1,fall_s=BASE_FALL_S;
    let move_timer=0,rot_timer=0,grav_timer=0,soft_timer=0;
    let clearing_rows=[], clear_t=0, clear_dur=0.28;
    const start_perf=performance.now()/1000; let last_perf=start_perf;
    let game_over=false;
    return {locked,queue,current,nxt,score,lines,level,fall_s,move_timer,rot_timer,grav_timer,soft_timer,clearing_rows,clear_t,clear_dur,start_perf,last_perf,game_over,want_restart:false};
  }
  let S=newGame();

  // ---------- Main loop ----------
  function step(){
    const now=performance.now()/1000; let dt=now-S.last_perf; if(dt>0.1) dt=0.1; S.last_perf=now;
    S.move_timer+=dt; S.rot_timer+=dt; S.soft_timer+=dt;
    const t_s=now-S.start_perf;

    if(keysDown.has("KeyR")) S.want_restart=true;
    if(keysDown.has("Escape")) window.close();
    if(S.want_restart) S=newGame();

    // level ramp
    const level_target=1 + Math.floor(S.lines/10) + Math.floor(t_s/60);
    if(level_target>S.level){ S.level=level_target; S.fall_s=Math.max(MIN_FALL_S, BASE_FALL_S - (S.level-1)*LEVEL_STEP_MS); }

    const grid=createGrid(S.locked);

    // input
    if(!S.game_over){
      if((keysDown.has("ArrowLeft")||keysDown.has("KeyA")) && S.move_timer>=MOVE_COOLDOWN_S){ if(valid(S.current,grid,-1,0)) S.current.x-=1; S.move_timer=0; }
      if((keysDown.has("ArrowRight")||keysDown.has("KeyD")) && S.move_timer>=MOVE_COOLDOWN_S){ if(valid(S.current,grid,1,0)) S.current.x+=1; S.move_timer=0; }

      // soft drop (timed)
      if(keysDown.has("ArrowDown")||keysDown.has("KeyS")){
        if(S.soft_timer >= SOFT_DROP_STEP_S){ if(valid(S.current,grid,0,1)) S.current.y += 1; S.soft_timer = 0; }
      } else {
        S.soft_timer = Math.min(S.soft_timer, SOFT_DROP_STEP_S);
      }

      // hard drop
      if(keysDown.has("Space") && !S._spaceLatch){
        let g2=createGrid(S.locked);
        while(valid(S.current,g2,0,1)) S.current.y+=1;
        lockPiece(S.current,S.locked);
        // bursts + shockwave at exact block center on the BOARD (no LEFT_INFO_W offset)
        for(const[x,y] of S.current.cells()){
          fx.burst(x*CELL+CELL/2, y*CELL+CELL/2, S.current.color, 10);
          fx.shock(x*CELL+CELL/2, y*CELL+CELL/2, S.current.color);
        }
        if(Object.keys(S.locked).some(k => Number(k.split(",")[1])<0)){ S.game_over=true; }
        else{
          S.current=S.nxt; S.nxt=new Tetromino(S.queue.nextKey());
          const g3=createGrid(S.locked);
          if(!valid(S.current,g3)) S.game_over=true;
          const rows=findFullRows(g3);
          if(rows.length){ S.clearing_rows=rows.slice(); S.clear_t=0; fx.startWave(rows); }
        }
        S._spaceLatch=true;
      }
      if(!keysDown.has("Space")) S._spaceLatch=false;

      // rotate
      if((keysDown.has("ArrowUp")||keysDown.has("KeyW")) && S.rot_timer>=ROT_COOLDOWN_S){
        const rb=S.current.rotated();
        for(const dx of [0,-1,1,-2,2]){ if(valid(S.current,grid,dx,0,rb)){ S.current.blocks=rb; S.current.x+=dx; break; } }
        S.rot_timer=0;
      }
    }

    // gravity
    if(!S.game_over){
      S.grav_timer+=dt;
      while(S.grav_timer>=S.fall_s){
        S.grav_timer-=S.fall_s;
        const g2=createGrid(S.locked);
        if(valid(S.current,g2,0,1)){ S.current.y+=1; }
        else{
          lockPiece(S.current,S.locked);
          for(const[x,y] of S.current.cells()){
            fx.burst(x*CELL+CELL/2, y*CELL+CELL/2, S.current.color, 6);
            fx.shock(x*CELL+CELL/2, y*CELL+CELL/2, S.current.color);
          }
          if(Object.keys(S.locked).some(k => Number(k.split(",")[1])<0)){ S.game_over=true; break; }
          S.current=S.nxt; S.nxt=new Tetromino(S.queue.nextKey());
          const g3=createGrid(S.locked);
          if(!valid(S.current,g3)){ S.game_over=true; break; }
          const rows=findFullRows(g3);
          if(rows.length){ S.clearing_rows=rows.slice(); S.clear_t=0; fx.startWave(rows); }
        }
      }
    }

    // line clear timing
    if(!S.game_over && S.clearing_rows.length){
      S.clear_t+=dt;
      if(S.clear_t>=S.clear_dur){
        clearRows(S.locked,S.clearing_rows);
        const n=S.clearing_rows.length;
        S.score+=n*120 + (n-1)*80; S.lines+=n;
        if(n>=4) fx.addShake(0.6);
        S.clearing_rows=[];
      }
    }

    fx.update(dt);

    // ---------- DRAW ----------
    ctx.drawImage(bgGrad,0,0);
    drawLeftControls(ctx);

    if(!step._play) step._play=makeCanvas(W,H);
    const pg=step._play.getContext("2d");
    pg.clearRect(0,0,W,H);

    addGlow(pg,0,0,W,H,[80,150,255],38);
    drawGridBG(pg, now - S.start_perf);

    drawShadowPiece(pg, S.current, createGrid(S.locked));

    const dgrid=createGrid(S.locked);
    for(const [x,y] of S.current.cells()){ if(y>=0 && y<ROWS) dgrid[y][x]=S.current.color; }
    for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){ const col=dgrid[y][x]; if(col) drawBlock(pg,x,y,col,1); }

    fx.drawWave(pg);
    for(const p of fx.p) p.draw(pg);
    fx.drawShocks(pg); // shockwaves drawn on the BOARD canvas → positions are correct

    const [ox,oy]=fx.shakeOff();
    ctx.drawImage(step._play, LEFT_INFO_W+ox, 0+oy);
    if(settings.outline){
      ctx.strokeStyle="rgba(120,200,255,0.27)"; ctx.lineWidth=3;
      ctx.strokeRect(LEFT_INFO_W+1.5, 1.5, W-3, H-3);
    }

    const nxt_piece=new Tetromino(S.nxt.k);
    drawRightPanel(ctx, S.score, S.lines, S.level, nxt_piece, now-S.start_perf, now-S.start_perf);

    if(settings.crt){ ctx.drawImage(vign,0,0); ctx.drawImage(scan,0,0); }

    if(S.game_over){
      ctx.save();
      ctx.fillStyle="rgba(0,0,0,0.62)"; ctx.fillRect(LEFT_INFO_W,0,W,H);
      ctx.fillStyle=rgba(WHITE); ctx.font="28px Arial";
      const msg="GAME OVER", sub="ESC quit, R restart";
      const tw=ctx.measureText(msg).width;
      ctx.fillText(msg, LEFT_INFO_W + W/2 - tw/2, H/2 - 30);
      ctx.fillStyle=rgba(UI_MUTED); ctx.font="18px Arial";
      const sw=ctx.measureText(sub).width;
      ctx.fillText(sub, LEFT_INFO_W + W/2 - sw/2, H/2 + 4);
      ctx.restore();
    }

    requestAnimationFrame(step);
  }

  cvs.focus();
  requestAnimationFrame(step);
})();
