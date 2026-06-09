// ===================== MATH UTILITIES =====================
const PI = Math.PI, sin = Math.sin, cos = Math.cos, sqrt = Math.sqrt;
const floor = Math.floor, abs = Math.abs, min = Math.min, max = Math.max;

function mat4Perspective(fovY, aspect, near, far) {
    const f = 1.0 / Math.tan(fovY / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0
    ]);
}

function mat4Identity() {
    return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}

function mat4Multiply(a, b) {
    const r = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            r[j * 4 + i] = a[i] * b[j*4] + a[4+i] * b[j*4+1] + a[8+i] * b[j*4+2] + a[12+i] * b[j*4+3];
        }
    }
    return r;
}

function mat4Translate(x, y, z) {
    const m = mat4Identity();
    m[12] = x; m[13] = y; m[14] = z;
    return m;
}

function vec3Sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function vec3Len(v) { return sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]); }
function vec3Norm(v) { const l=vec3Len(v); return [v[0]/l,v[1]/l,v[2]/l]; }
function vec3Cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function vec3Dot(a, b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }

// ===================== BLOCK TYPES =====================
const BLOCK = {
    AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, WOOD: 4, LEAVES: 5, SAND: 6, WATER: 7
};

const BLOCK_NAMES = {
    [BLOCK.GRASS]: 'Grass', [BLOCK.DIRT]: 'Dirt', [BLOCK.STONE]: 'Stone',
    [BLOCK.WOOD]: 'Wood', [BLOCK.LEAVES]: 'Leaves', [BLOCK.SAND]: 'Sand',
    [BLOCK.WATER]: 'Water'
};

const HOTBAR_BLOCKS = [BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.WOOD, BLOCK.LEAVES, BLOCK.SAND];

// ===================== WATER FLOW =====================
let waterFlowQueue = [];
let waterFlowProcessed = new Set();
let waterFlowGen = 0;
const WATER_FLOW_INTERVAL = 500;

function triggerWaterFlow(bx, by, bz) {
    waterFlowGen++;
    const dirs = [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]];
    for (let d = 0; d < dirs.length; d++) {
        const nx = bx + dirs[d][0], ny = by + dirs[d][1], nz = bz + dirs[d][2];
        if (getBlock(nx, ny, nz) === BLOCK.WATER && !waterFlowProcessed.has(`${waterFlowGen},${nx},${ny},${nz}`)) {
            waterFlowQueue.push({ x: nx, y: ny, z: nz, time: performance.now() + WATER_FLOW_INTERVAL, gen: waterFlowGen });
            waterFlowProcessed.add(`${waterFlowGen},${nx},${ny},${nz}`);
        }
    }
}

function processWaterFlow(nowMs) {
    const dirs = [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,-1,0]];
    for (let i = waterFlowQueue.length - 1; i >= 0; i--) {
        if (waterFlowQueue[i].time > nowMs) continue;
        const entry = waterFlowQueue.splice(i, 1)[0];
        if (getBlock(entry.x, entry.y, entry.z) !== BLOCK.WATER) continue;
        for (let d = 0; d < dirs.length; d++) {
            const nx = entry.x + dirs[d][0], ny = entry.y + dirs[d][1], nz = entry.z + dirs[d][2];
            if (ny < 0 || ny >= WORLD_HEIGHT) continue;
            if (nx < -128 || nx >= 128 || nz < -128 || nz >= 128) continue;
            if (getBlock(nx, ny, nz) === BLOCK.AIR && !waterFlowProcessed.has(`${entry.gen},${nx},${ny},${nz}`)) {
                setBlock(nx, ny, nz, BLOCK.WATER);
                waterFlowProcessed.add(`${entry.gen},${nx},${ny},${nz}`);
                waterFlowQueue.push({ x: nx, y: ny, z: nz, time: performance.now() + WATER_FLOW_INTERVAL, gen: entry.gen });
            }
        }
    }
}

// ===================== AUDIO SYSTEM =====================
let audioCtx = null;
let footstepGain = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        footstepGain = audioCtx.createGain();
        footstepGain.gain.value = 1;
        footstepGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx.state === 'running';
}

function getFootstepCategory(blockType) {
    if (blockType === BLOCK.GRASS || blockType === BLOCK.DIRT) return 'grass';
    if (blockType === BLOCK.STONE) return 'stone';
    if (blockType === BLOCK.WOOD) return 'wood';
    return 'generic';
}

function playGrassFootstep() {
    if (!audioCtx || !footstepGain) return;
    const now = audioCtx.currentTime;
    const bufLen = audioCtx.sampleRate * 0.08;
    const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
        const t = i / audioCtx.sampleRate;
        const env = Math.exp(-t * 50) * (1 + 0.3 * Math.sin(t * 80));
        d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const flt = audioCtx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(600, now);
    flt.frequency.exponentialRampToValueAtTime(200, now + 0.08);
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    src.connect(flt).connect(gain).connect(footstepGain);
    src.start(now);
}

function playStoneFootstep() {
    if (!audioCtx || !footstepGain) return;
    const now = audioCtx.currentTime;
    const bufLen = audioCtx.sampleRate * 0.12;
    const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
        const t = i / audioCtx.sampleRate;
        const env = Math.exp(-t * 25) * (1 + 0.5 * Math.sin(t * 300));
        d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const flt = audioCtx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 3000;
    flt.Q.value = 1.5;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    src.connect(flt).connect(gain).connect(footstepGain);
    src.start(now);
}

function playWoodFootstep() {
    if (!audioCtx || !footstepGain) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.06);
    const g1 = audioCtx.createGain();
    g1.gain.setValueAtTime(0.18, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(g1).connect(footstepGain);
    osc.start(now);
    osc.stop(now + 0.1);
    const bufLen = audioCtx.sampleRate * 0.06;
    const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    const dd = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
        const t = i / audioCtx.sampleRate;
        dd[i] = (Math.random() * 2 - 1) * Math.exp(-t * 40);
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const flt = audioCtx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 1200;
    flt.Q.value = 2;
    const g2 = audioCtx.createGain();
    g2.gain.value = 0.1;
    src.connect(flt).connect(g2).connect(footstepGain);
    src.start(now);
}

function playGenericFootstep() {
    if (!audioCtx || !footstepGain) return;
    const now = audioCtx.currentTime;
    const bufLen = audioCtx.sampleRate * 0.1;
    const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
        const t = i / audioCtx.sampleRate;
        d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 35);
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const flt = audioCtx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 800;
    flt.Q.value = 1;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.13, now);
    src.connect(flt).connect(gain).connect(footstepGain);
    src.start(now);
}

function playJumpSound() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const dur = 0.12;
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.linearRampToValueAtTime(90, now + dur);
    const flt = audioCtx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(500, now);
    flt.frequency.linearRampToValueAtTime(300, now + dur);
    flt.Q.value = 2;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.015);
    gain.gain.setValueAtTime(0.15, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(flt).connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + dur);
}

function startCreeperSizzle(c) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const bufLen = audioCtx.sampleRate * 2;
    const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
        d[i] = Math.random() * 2 - 1;
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const flt = audioCtx.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.value = 2000;
    c._sizzleGain = audioCtx.createGain();
    c._sizzleGain.gain.setValueAtTime(0.06, now);
    src.connect(flt).connect(c._sizzleGain).connect(audioCtx.destination);
    src.start(now);
    c._sizzleSrc = src;
}

function updateCreeperSizzle(c) {
    if (!c._sizzleGain || !audioCtx) return;
    const elapsed = 1.5 - c.explodeTimer;
    const progress = elapsed / 1.5;
    const dxp = camera.x - c.x, dzp = camera.z - c.z;
    const dist = sqrt(dxp*dxp + dzp*dzp);
    const vol = max(0, min(1, 1 - (dist - 2) / 40));
    c._sizzleGain.gain.linearRampToValueAtTime((0.06 + progress * 0.2) * vol, audioCtx.currentTime + 0.05);
}

function stopCreeperSizzle(c) {
    if (c._sizzleSrc) {
        try { c._sizzleSrc.stop(); } catch(e) {}
        c._sizzleSrc = null;
    }
    c._sizzleGain = null;
}

function fadeCreeperSizzle(c) {
    if (!c._sizzleGain || !audioCtx) return;
    const now = audioCtx.currentTime;
    c._sizzleFading = true;
    c._sizzleFadeEnd = now + 1.0;
    c._sizzleGain.gain.cancelScheduledValues(now);
    c._sizzleGain.gain.setValueAtTime(c._sizzleGain.gain.value, now);
    c._sizzleGain.gain.linearRampToValueAtTime(0, now + 1.0);
}

function finishCreeperSizzleFade(c) {
    if (c._sizzleSrc) {
        try { c._sizzleSrc.stop(); } catch(e) {}
        c._sizzleSrc = null;
    }
    c._sizzleGain = null;
    c._sizzleFading = false;
}

function playExplosion(dist) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const dur = 0.6;
    const vol = max(0, min(1, 1 - (dist - 2) / 40));
    const bufLen = audioCtx.sampleRate * dur;
    const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
        const t = i / audioCtx.sampleRate;
        const env = Math.exp(-t * 6) * (1 + 0.4 * Math.sin(t * 30));
        d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const flt = audioCtx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(4000, now);
    flt.frequency.exponentialRampToValueAtTime(80, now + dur);
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.35 * vol, now);
    src.connect(flt).connect(gain).connect(audioCtx.destination);
    src.start(now);
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + dur * 0.6);
    const g2 = audioCtx.createGain();
    g2.gain.setValueAtTime(0.3 * vol, now);
    g2.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.6);
    osc.connect(g2).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + dur);
}

function playFootstep(blockType) {
    const cat = getFootstepCategory(blockType);
    if (cat === 'grass') playGrassFootstep();
    else if (cat === 'stone') playStoneFootstep();
    else if (cat === 'wood') playWoodFootstep();
    else playGenericFootstep();
}

function playFallDamage() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const dur = 0.25;
    // Crunch noise burst
    const bufLen = audioCtx.sampleRate * dur;
    const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
        const t = i / audioCtx.sampleRate;
        const env = Math.exp(-t * 20) * (1 + 0.5 * Math.sin(t * 40));
        d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const flt = audioCtx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(3000, now);
    flt.frequency.exponentialRampToValueAtTime(400, now + dur);
    flt.Q.value = 2;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    src.connect(flt).connect(gain).connect(audioCtx.destination);
    src.start(now);
    // Low thud for impact
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
    const g2 = audioCtx.createGain();
    g2.gain.setValueAtTime(0.6, now);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(g2).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
}

// ===================== TEXTURE GENERATION =====================
const TEX_SIZE = 16;

function makeTexture(pixels) {
    const c = document.createElement('canvas');
    c.width = TEX_SIZE; c.height = TEX_SIZE;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    for (let i = 0; i < pixels.length; i++) {
        const p = pixels[i];
        img.data[i*4]   = p[0];
        img.data[i*4+1] = p[1];
        img.data[i*4+2] = p[2];
        img.data[i*4+3] = p[3] !== undefined ? p[3] : 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
}

function jitter(base, amount) {
    return max(0, min(255, base + (Math.random() - 0.5) * amount));
}

function genGrassTop() {
    const p = [];
    for (let i = 0; i < 256; i++) {
        const g = jitter(130, 30);
        p.push([jitter(55, 15), g, jitter(35, 10)]);
    }
    return makeTexture(p);
}

function genGrassSide() {
    const p = [];
    for (let y = 0; y < TEX_SIZE; y++) {
        for (let x = 0; x < TEX_SIZE; x++) {
            const i = y * 16 + x;
            if (y < 3) {
                const g = jitter(125, 25);
                p.push([jitter(50, 12), g, jitter(30, 8)]);
            }
            else if (y === 3) {
                const g = jitter(120, 25);
                if (Math.random() > 0.4) p.push([jitter(50, 12), g, jitter(30, 8)]);
                else p.push([jitter(134, 10), jitter(82, 10), jitter(46, 8)]);
            }
            else {
                p.push([jitter(134, 15), jitter(82, 12), jitter(46, 10)]);
            }
        }
    }
    return makeTexture(p);
}

function genDirt() {
    const p = [];
    for (let i = 0; i < 256; i++) {
        p.push([jitter(134, 18), jitter(82, 15), jitter(46, 12)]);
    }
    return makeTexture(p);
}

function genStone() {
    const p = [];
    for (let y = 0; y < TEX_SIZE; y++) {
        for (let x = 0; x < TEX_SIZE; x++) {
            const i = y * 16 + x;
            let base = jitter(128, 20);
            if ((x + y) % 7 === 0) base = jitter(100, 15);
            if (x % 5 === 0 && y > 6 && y < 10) base = jitter(105, 10);
            p.push([base, base, base]);
        }
    }
    return makeTexture(p);
}

function genWoodSide() {
    const p = [];
    for (let y = 0; y < TEX_SIZE; y++) {
        for (let x = 0; x < TEX_SIZE; x++) {
            const i = y * 16 + x;
            const stripe = (x % 4 < 2) ? -15 : 0;
            const r = jitter(102 + stripe, 12);
            const g = jitter(72 + stripe, 10);
            const b = jitter(38 + stripe * 0.5, 8);
            p.push([r, g, b]);
        }
    }
    return makeTexture(p);
}

function genWoodTop() {
    const p = [];
    for (let y = 0; y < TEX_SIZE; y++) {
        for (let x = 0; x < TEX_SIZE; x++) {
            const i = y * 16 + x;
            const dx = x - 7.5, dy = y - 7.5;
            const dist = sqrt(dx*dx + dy*dy);
            const ring = (floor(dist * 2) % 3 === 0) ? -12 : 0;
            const r = jitter(140 + ring, 10);
            const g = jitter(97 + ring, 8);
            const b = jitter(51 + ring * 0.5, 6);
            p.push([r, g, b]);
        }
    }
    return makeTexture(p);
}

function genLeaves() {
    const p = [];
    for (let i = 0; i < 256; i++) {
        const v = Math.random();
        if (v > 0.7) p.push([jitter(35, 10), jitter(160, 25), jitter(25, 8)]);
        else if (v > 0.4) p.push([jitter(25, 8), jitter(130, 20), jitter(18, 6)]);
        else p.push([jitter(20, 6), jitter(100, 15), jitter(14, 5)]);
    }
    return makeTexture(p);
}

function genSand() {
    const p = [];
    for (let i = 0; i < 256; i++) {
        const base = jitter(215, 18);
        p.push([base + 8, base + 4, jitter(base - 30, 12)]);
    }
    return makeTexture(p);
}

function genWater() {
    const p = [];
    for (let y = 0; y < TEX_SIZE; y++) {
        for (let x = 0; x < TEX_SIZE; x++) {
            const wave = sin(x * 0.8 + y * 0.3) * 15 + cos(y * 0.6) * 10;
            const r = jitter(25, 12);
            const g = jitter(90 + wave, 20);
            const b = jitter(170 + wave, 25);
            p.push([r, g, b, 180]);
        }
    }
    return makeTexture(p);
}

// Build texture atlas: each block has up to 3 textures (top, side, bottom)
// Layout in atlas: each tex is TEX_SIZE x TEX_SIZE, arranged in a grid
const ATLAS_COLS = 8;

// Texture map: blockType -> { top, side, bottom } canvas textures
const TEXTURES = {};

function initTextures() {
    const grassTop = genGrassTop();
    const grassSide = genGrassSide();
    const dirtTex = genDirt();
    const stoneTex = genStone();
    const woodSide = genWoodSide();
    const woodTop = genWoodTop();
    const leavesTex = genLeaves();
    const sandTex = genSand();
    const waterTex = genWater();

    TEXTURES[BLOCK.GRASS]  = { top: grassTop, side: grassSide, bottom: dirtTex };
    TEXTURES[BLOCK.DIRT]   = { top: dirtTex, side: dirtTex, bottom: dirtTex };
    TEXTURES[BLOCK.STONE]  = { top: stoneTex, side: stoneTex, bottom: stoneTex };
    TEXTURES[BLOCK.WOOD]   = { top: woodTop, side: woodSide, bottom: woodTop };
    TEXTURES[BLOCK.LEAVES] = { top: leavesTex, side: leavesTex, bottom: leavesTex };
    TEXTURES[BLOCK.SAND]   = { top: sandTex, side: sandTex, bottom: sandTex };
    TEXTURES[BLOCK.WATER]  = { top: waterTex, side: waterTex, bottom: waterTex };
}

// Collect unique textures and build atlas
let atlasData = null;
let atlasTexMap = {};

function buildAtlas() {
    const uniqueTextures = [];
    const texIndexMap = {};

    for (const btype in TEXTURES) {
        for (const face of ['top', 'side', 'bottom']) {
            const tex = TEXTURES[btype][face];
            const key = `${btype}_${face}`;
            if (!texIndexMap[key]) {
                texIndexMap[key] = uniqueTextures.length;
                uniqueTextures.push(tex);
            }
            else {
                texIndexMap[key] = texIndexMap[key];
            }
        }
    }

    const cols = ATLAS_COLS;
    const rows = Math.ceil(uniqueTextures.length / cols);
    const atlasW = cols * TEX_SIZE;
    const atlasH = rows * TEX_SIZE;

    const c = document.createElement('canvas');
    c.width = atlasW; c.height = atlasH;
    const ctx = c.getContext('2d');

    for (let i = 0; i < uniqueTextures.length; i++) {
        const col = i % cols;
        const row = floor(i / cols);
        ctx.drawImage(uniqueTextures[i], col * TEX_SIZE, row * TEX_SIZE);
    }

    atlasData = c;

    // Build UV lookup: (blockType, face) -> { u0, v0, u1, v1 }
    for (const btype in TEXTURES) {
        atlasTexMap[btype] = {};
        for (const face of ['top', 'side', 'bottom']) {
            const key = `${btype}_${face}`;
            const idx = texIndexMap[key];
            const col = idx % cols;
            const row = floor(idx / cols);
            const u0 = col * TEX_SIZE / atlasW;
            const v0 = row * TEX_SIZE / atlasH;
            const u1 = (col + 1) * TEX_SIZE / atlasW;
            const v1 = (row + 1) * TEX_SIZE / atlasH;
            atlasTexMap[btype][face] = { u0, v0, u1, v1 };
        }
    }
}

// ===================== WORLD DATA (chunk-based) =====================
const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 40;
const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
const CHUNK_VOLUME = CHUNK_AREA * WORLD_HEIGHT;
const chunks = {};

function chunkKey(cx, cz) { return cx + ',' + cz; }

function localMod(v, m) { return ((v % m) + m) % m; }

function getChunkRef(cx, cz) {
    const key = chunkKey(cx, cz);
    if (!chunks[key]) {
        chunks[key] = { data: new Uint8Array(CHUNK_VOLUME), dirty: true, posBuf: null, normBuf: null, uvBuf: null, vertCount: 0, wPosBuf: null, wNormBuf: null, wUvBuf: null, wVertCount: 0 };
    }
    return chunks[key];
}

function getBlock(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return BLOCK.AIR;
    const cx = floor(x / CHUNK_SIZE), cz = floor(z / CHUNK_SIZE);
    const chunk = chunks[chunkKey(cx, cz)];
    if (!chunk) return BLOCK.AIR;
    const lx = localMod(x, CHUNK_SIZE), lz = localMod(z, CHUNK_SIZE);
    return chunk.data[lx + lz * CHUNK_SIZE + y * CHUNK_AREA];
}

function setBlock(x, y, z, type) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const cx = floor(x / CHUNK_SIZE), cz = floor(z / CHUNK_SIZE);
    const chunk = getChunkRef(cx, cz);
    const lx = localMod(x, CHUNK_SIZE), lz = localMod(z, CHUNK_SIZE);
    const idx = lx + lz * CHUNK_SIZE + y * CHUNK_AREA;
    if (chunk.data[idx] === type) return;
    chunk.data[idx] = type;
    chunk.dirty = true;
    // Mark neighbor chunks dirty at boundaries for face culling
    if (lx === 0) getChunkRef(cx - 1, cz).dirty = true;
    if (lx === CHUNK_SIZE - 1) getChunkRef(cx + 1, cz).dirty = true;
    if (lz === 0) getChunkRef(cx, cz - 1).dirty = true;
    if (lz === CHUNK_SIZE - 1) getChunkRef(cx, cz + 1).dirty = true;
}

// Simple noise for terrain generation
function hash2D(x, z) {
    let n = x * 374761393 + z * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) & 0x7fffffff) / 0x7fffffff;
}

function smoothNoise(x, z) {
    const ix = floor(x), iz = floor(z);
    const fx = x - ix, fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sz = fz * fz * (3 - 2 * fz);
    const n00 = hash2D(ix, iz), n10 = hash2D(ix+1, iz);
    const n01 = hash2D(ix, iz+1), n11 = hash2D(ix+1, iz+1);
    const nx0 = n00 + (n10 - n00) * sx;
    const nx1 = n01 + (n11 - n01) * sx;
    return nx0 + (nx1 - nx0) * sz;
}

function terrainHeight(x, z) {
    let h = 0;
    h += smoothNoise(x * 0.02, z * 0.02) * 12;
    h += smoothNoise(x * 0.05, z * 0.05) * 4;
    h += smoothNoise(x * 0.1, z * 0.1) * 2;
    return floor(h) + 6;
}

function generateWorld() {
    const radius = 128;
    for (let x = -radius; x < radius; x++) {
        for (let z = -radius; z < radius; z++) {
            const h = terrainHeight(x, z);
            for (let y = 0; y <= h; y++) {
                if (y === h) setBlock(x, y, z, BLOCK.GRASS);
                else if (y > h - 4) setBlock(x, y, z, BLOCK.DIRT);
                else setBlock(x, y, z, BLOCK.STONE);
            }
        }
    }
    for (let i = 0; i < 120; i++) {
        const tx = floor((hash2D(i * 7, 0) - 0.5) * radius * 1.5);
        const tz = floor((hash2D(i * 13, 0) - 0.5) * radius * 1.5);
        const th = terrainHeight(tx, tz);
        if (th > 8 && th < 16) {
            const treeH = 4 + floor(hash2D(tx, tz) * 3);
            for (let y = th + 1; y <= th + treeH; y++) setBlock(tx, y, tz, BLOCK.WOOD);
            for (let lx = -2; lx <= 2; lx++) {
                for (let lz = -2; lz <= 2; lz++) {
                    for (let ly = th + treeH - 1; ly <= th + treeH + 2; ly++) {
                        if (lx === 0 && lz === 0 && ly <= th + treeH) continue;
                        if (abs(lx) === 2 && abs(lz) === 2 && hash2D(lx + i, lz) > 0.5) continue;
                        setBlock(tx + lx, ly, tz + lz, BLOCK.LEAVES);
                    }
                }
            }
        }
    }
}

function generateLakes() {
    const WATER_LEVEL = 7;
    const SPAWN_SAFE_RADIUS = 15;

    for (let x = -128; x < 128; x++) {
        for (let z = -128; z < 128; z++) {
            if (sqrt(x*x + z*z) < SPAWN_SAFE_RADIUS) continue;
            const h = terrainHeight(x, z);
            if (h < WATER_LEVEL) {
                setBlock(x, h, z, BLOCK.WATER);
                for (let y = h + 1; y <= WATER_LEVEL; y++) {
                    setBlock(x, y, z, BLOCK.WATER);
                }
            }
        }
    }

    for (let i = 0; i < 35; i++) {
        const cx = floor((hash2D(i * 31 + 500, i * 47) - 0.5) * 240);
        const cz = floor((hash2D(i * 53 + 600, i * 61) - 0.5) * 240);

        if (sqrt(cx*cx + cz*cz) < SPAWN_SAFE_RADIUS) continue;

        const radius = 3 + floor(hash2D(i + 700, 800) * 6);

        // Find lowest terrain in lake area — water surface sits flush here
        let minTerrainH = WORLD_HEIGHT;
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const dist = sqrt(dx*dx + dz*dz);
                if (dist > radius) continue;
                const h = terrainHeight(cx + dx, cz + dz);
                if (h < minTerrainH) minTerrainH = h;
            }
        }

        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const dist = sqrt(dx*dx + dz*dz);
                if (dist > radius) continue;

                const wx = cx + dx, wz = cz + dz;
                const terrainH = terrainHeight(wx, wz);
                const depthFactor = 1 - dist / (radius + 1);
                const lakeBottom = max(1, minTerrainH - floor(3 * depthFactor));

                for (let y = lakeBottom; y <= minTerrainH; y++) {
                    setBlock(wx, y, wz, BLOCK.WATER);
                }
                if (terrainH > minTerrainH) {
                    for (let y = minTerrainH + 1; y <= terrainH; y++) {
                        setBlock(wx, y, wz, BLOCK.AIR);
                    }
                }
            }
        }
    }
}

// ===================== CHUNK MESH BUILDING =====================
const FACE_DEFS = [
    { dir: [0, 1, 0], face: 'top', norm: [0,1,0] },
    { dir: [0,-1, 0], face: 'bottom', norm: [0,-1,0] },
    { dir: [1, 0, 0], face: 'right', norm: [1,0,0] },
    { dir: [-1, 0, 0], face: 'left', norm: [-1,0,0] },
    { dir: [0, 0, 1], face: 'front', norm: [0,0,1] },
    { dir: [0, 0,-1], face: 'back', norm: [0,0,-1] },
];

function buildChunkMesh(cx, cz) {
    const chunk = chunks[chunkKey(cx, cz)];
    if (!chunk) return null;
    const data = chunk.data;
    const wx0 = cx * CHUNK_SIZE, wz0 = cz * CHUNK_SIZE;
    const opPos = [], opNorm = [], opUVs = [];
    const trPos = [], trNorm = [], trUVs = [];

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                const type = data[lx + lz * CHUNK_SIZE + ly * CHUNK_AREA];
                if (type === BLOCK.AIR) continue;
                const texInfo = atlasTexMap[type];
                if (!texInfo) continue;

                const wx = wx0 + lx, wz = wz0 + lz;
                const isWater = type === BLOCK.WATER;

                for (let fi = 0; fi < 6; fi++) {
                    const f = FACE_DEFS[fi];
                    const neighbor = getBlock(wx + f.dir[0], ly + f.dir[1], wz + f.dir[2]);

                    if (isWater) {
                        if (neighbor !== BLOCK.AIR) continue;
                    } else {
                        if (neighbor !== BLOCK.AIR && neighbor !== BLOCK.WATER) continue;
                    }

                    const uv = texInfo[f.face] || texInfo['side'];
                    let verts;

                    const waterLevel = isWater ? 0.88 : 1;

                    switch (f.face) {
                        case 'top':    verts = [[wx,ly+waterLevel,wz],[wx+1,ly+waterLevel,wz],[wx+1,ly+waterLevel,wz+1],[wx,ly+waterLevel,wz],[wx+1,ly+waterLevel,wz+1],[wx,ly+waterLevel,wz+1]]; break;
                        case 'bottom': verts = [[wx,ly,wz],[wx+1,ly,wz],[wx+1,ly,wz+1],[wx,ly,wz],[wx+1,ly,wz+1],[wx,ly,wz+1]]; break;
                        case 'right':  verts = [[wx+1,ly,wz],[wx+1,ly+waterLevel,wz],[wx+1,ly+waterLevel,wz+1],[wx+1,ly,wz],[wx+1,ly+waterLevel,wz+1],[wx+1,ly,wz+1]]; break;
                        case 'left':   verts = [[wx,ly,wz],[wx,ly+waterLevel,wz],[wx,ly+waterLevel,wz+1],[wx,ly,wz],[wx,ly+waterLevel,wz+1],[wx,ly,wz+1]]; break;
                        case 'front':  verts = [[wx,ly,wz+1],[wx+1,ly,wz+1],[wx+1,ly+waterLevel,wz+1],[wx,ly,wz+1],[wx+1,ly+waterLevel,wz+1],[wx,ly+waterLevel,wz+1]]; break;
                        case 'back':   verts = [[wx+1,ly,wz],[wx,ly,wz],[wx,ly+waterLevel,wz],[wx+1,ly,wz],[wx,ly+waterLevel,wz],[wx+1,ly+waterLevel,wz]]; break;
                    }

                    const posArr = isWater ? trPos : opPos;
                    const normArr = isWater ? trNorm : opNorm;
                    const uvArr = isWater ? trUVs : opUVs;

                    for (let vi = 0; vi < 6; vi++) {
                        posArr.push(verts[vi][0], verts[vi][1], verts[vi][2]);
                        normArr.push(f.norm[0], f.norm[1], f.norm[2]);
                    }

                    if (f.face === 'left' || f.face === 'right') {
                        uvArr.push(uv.u0,uv.v1, uv.u0,uv.v0, uv.u1,uv.v0, uv.u0,uv.v1, uv.u1,uv.v0, uv.u1,uv.v1);
                    }
                    else {
                        uvArr.push(uv.u0,uv.v1, uv.u1,uv.v1, uv.u1,uv.v0, uv.u0,uv.v1, uv.u1,uv.v0, uv.u0,uv.v0);
                    }
                }
            }
        }
    }

    return {
        opaque: { positions: new Float32Array(opPos), normals: new Float32Array(opNorm), uvs: new Float32Array(opUVs) },
        transparent: { positions: new Float32Array(trPos), normals: new Float32Array(trNorm), uvs: new Float32Array(trUVs) }
    };
}

// ===================== WEBGL SETUP =====================
const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl', { antialias: true });

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

// Shaders with texture support
const vsSource = `
    attribute vec3 aPos;
    attribute vec3 aNorm;
    attribute vec2 aUV;
    uniform mat4 uProj;
    uniform mat4 uView;
    varying vec3 vNorm;
    varying vec2 vUV;
    varying float vDist;
    void main() {
        gl_Position = uProj * uView * vec4(aPos, 1.0);
        vNorm = aNorm;
        vUV = aUV;
        vDist = length((uView * vec4(aPos, 1.0)).xyz);
    }
`;

const fsSource = `
    precision mediump float;
    varying vec3 vNorm;
    varying vec2 vUV;
    varying float vDist;
    uniform sampler2D uTex;
    void main() {
        vec4 texColor = texture2D(uTex, vUV);

        // Directional lighting
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
        float diff = max(dot(normalize(vNorm), lightDir), 0.0);
        float ambient = 0.45;
        vec3 color = texColor.rgb * (ambient + diff * 0.55);

        // Fog
        float fog = clamp((vDist - 30.0) / 60.0, 0.0, 1.0);
        vec3 fogColor = vec3(0.55, 0.72, 0.9);
        color = mix(color, fogColor, fog);

        gl_FragColor = vec4(color, texColor.a);
    }
`;

function compileShader(src, type) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
    }
    return s;
}

const vs = compileShader(vsSource, gl.VERTEX_SHADER);
const fs = compileShader(fsSource, gl.FRAGMENT_SHADER);
const prog = gl.createProgram();
gl.attachShader(prog, vs);
gl.attachShader(prog, fs);
gl.linkProgram(prog);
gl.useProgram(prog);

const aPos = gl.getAttribLocation(prog, 'aPos');
const aNorm = gl.getAttribLocation(prog, 'aNorm');
const aUV = gl.getAttribLocation(prog, 'aUV');
const uProj = gl.getUniformLocation(prog, 'uProj');
const uView = gl.getUniformLocation(prog, 'uView');

gl.enable(gl.DEPTH_TEST);
gl.enable(gl.POLYGON_OFFSET_FILL);
gl.polygonOffset(-1, -1);
gl.clearColor(0.55, 0.72, 0.9, 1);

const tex = gl.createTexture();
const RENDER_DIST = 80;
const RENDER_DIST_SQ = RENDER_DIST * RENDER_DIST;

function uploadAtlas() {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
}

function uploadChunkMesh(cx, cz) {
    const chunk = chunks[chunkKey(cx, cz)];
    if (!chunk) return;
    const mesh = buildChunkMesh(cx, cz);
    if (!mesh) {
        chunk.dirty = false;
        return;
    }

    // Upload opaque mesh
    if (mesh.opaque.positions.length === 0) {
        if (chunk.posBuf) { gl.deleteBuffer(chunk.posBuf); chunk.posBuf = null; }
        if (chunk.normBuf) { gl.deleteBuffer(chunk.normBuf); chunk.normBuf = null; }
        if (chunk.uvBuf) { gl.deleteBuffer(chunk.uvBuf); chunk.uvBuf = null; }
        chunk.vertCount = 0;
    } else {
        chunk.vertCount = mesh.opaque.positions.length / 3;
        if (!chunk.posBuf) chunk.posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, chunk.posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.opaque.positions, gl.STATIC_DRAW);
        if (!chunk.normBuf) chunk.normBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, chunk.normBuf);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.opaque.normals, gl.STATIC_DRAW);
        if (!chunk.uvBuf) chunk.uvBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, chunk.uvBuf);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.opaque.uvs, gl.STATIC_DRAW);
    }

    // Upload transparent (water) mesh
    if (mesh.transparent.positions.length === 0) {
        if (chunk.wPosBuf) { gl.deleteBuffer(chunk.wPosBuf); chunk.wPosBuf = null; }
        if (chunk.wNormBuf) { gl.deleteBuffer(chunk.wNormBuf); chunk.wNormBuf = null; }
        if (chunk.wUvBuf) { gl.deleteBuffer(chunk.wUvBuf); chunk.wUvBuf = null; }
        chunk.wVertCount = 0;
    } else {
        chunk.wVertCount = mesh.transparent.positions.length / 3;
        if (!chunk.wPosBuf) chunk.wPosBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, chunk.wPosBuf);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.transparent.positions, gl.STATIC_DRAW);
        if (!chunk.wNormBuf) chunk.wNormBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, chunk.wNormBuf);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.transparent.normals, gl.STATIC_DRAW);
        if (!chunk.wUvBuf) chunk.wUvBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, chunk.wUvBuf);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.transparent.uvs, gl.STATIC_DRAW);
    }

    chunk.dirty = false;
}

function rebuildDirtyChunks() {
    for (const key in chunks) {
        const chunk = chunks[key];
        if (chunk.dirty) {
            const [cx, cz] = key.split(',').map(Number);
            uploadChunkMesh(cx, cz);
        }
    }
}

function bindChunkAttribs(chunk) {
    gl.bindBuffer(gl.ARRAY_BUFFER, chunk.posBuf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, chunk.normBuf);
    gl.enableVertexAttribArray(aNorm);
    gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, chunk.uvBuf);
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
}

function bindWaterAttribs(chunk) {
    gl.bindBuffer(gl.ARRAY_BUFFER, chunk.wPosBuf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, chunk.wNormBuf);
    gl.enableVertexAttribArray(aNorm);
    gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, chunk.wUvBuf);
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
}

// ===================== HIGHLIGHT BLOCK (wireframe) =====================
const hlVS = `
    attribute vec3 aPos;
    uniform mat4 uProj;
    uniform mat4 uView;
    void main() {
        gl_Position = uProj * uView * vec4(aPos, 1.0);
    }
`;

const hlFS = `
    precision mediump float;
    void main() {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.6);
    }
`;

const hlProg = gl.createProgram();
gl.attachShader(hlProg, compileShader(hlVS, gl.VERTEX_SHADER));
gl.attachShader(hlProg, compileShader(hlFS, gl.FRAGMENT_SHADER));
gl.linkProgram(hlProg);

const hlAPos = gl.getAttribLocation(hlProg, 'aPos');
const hlUProj = gl.getUniformLocation(hlProg, 'uProj');
const hlUView = gl.getUniformLocation(hlProg, 'uView');

const hlVerts = new Float32Array([
    0,0,0, 1,0,0, 1,0,0, 1,0,1, 1,0,1, 0,0,1, 0,0,1, 0,0,0,
    0,1,0, 1,1,0, 1,1,0, 1,1,1, 1,1,1, 0,1,1, 0,1,1, 0,1,0,
    0,0,0, 0,1,0, 1,0,0, 1,1,0, 1,0,1, 1,1,1, 0,0,1, 0,1,1
]);

const hlBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, hlBuf);
gl.bufferData(gl.ARRAY_BUFFER, hlVerts, gl.STATIC_DRAW);

// ===================== CREEPER SHADER (solid color with model matrix) =====================
const crVS = `
    attribute vec3 aPos;
    attribute vec3 aNorm;
    uniform mat4 uProj;
    uniform mat4 uView;
    uniform mat4 uModel;
    varying vec3 vNorm;
    varying float vDist;
    varying float vWorldY;
    void main() {
        vec4 worldPos = uModel * vec4(aPos, 1.0);
        gl_Position = uProj * uView * worldPos;
        vNorm = mat3(uModel) * aNorm;
        vDist = length((uView * worldPos).xyz);
        vWorldY = worldPos.y;
    }
`;

const crFS = `
    precision mediump float;
    varying vec3 vNorm;
    varying float vDist;
    varying float vWorldY;
    uniform vec3 uColor;
    uniform float uWaterSurface;
    void main() {
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
        float diff = max(dot(normalize(vNorm), lightDir), 0.0);
        float ambient = 0.45;
        vec3 color = uColor * (ambient + diff * 0.55);
        if (uWaterSurface > -100.0 && vWorldY < uWaterSurface) {
            float submerge = clamp((uWaterSurface - vWorldY) / 0.6, 0.0, 1.0);
            color = mix(color, vec3(0.12, 0.35, 0.6), submerge * 0.45);
        }
        float fog = clamp((vDist - 30.0) / 60.0, 0.0, 1.0);
        vec3 fogColor = vec3(0.55, 0.72, 0.9);
        color = mix(color, fogColor, fog);
        gl_FragColor = vec4(color, 1.0);
    }
`;

const crProg = gl.createProgram();
gl.attachShader(crProg, compileShader(crVS, gl.VERTEX_SHADER));
gl.attachShader(crProg, compileShader(crFS, gl.FRAGMENT_SHADER));
gl.linkProgram(crProg);

const crAPos = gl.getAttribLocation(crProg, 'aPos');
const crANorm = gl.getAttribLocation(crProg, 'aNorm');
const crUProj = gl.getUniformLocation(crProg, 'uProj');
const crUView = gl.getUniformLocation(crProg, 'uView');
const crUModel = gl.getUniformLocation(crProg, 'uModel');
const crUColor = gl.getUniformLocation(crProg, 'uColor');
const crUWaterSurface = gl.getUniformLocation(crProg, 'uWaterSurface');

// Build a box mesh: 6 faces, each 2 triangles
function buildBoxMesh() {
    const pos = [], norm = [];
    const faces = [
        { n: [0,1,0], v: [[0,1,0],[1,1,0],[1,1,1],[0,1,0],[1,1,1],[0,1,1]] },
        { n: [0,-1,0], v: [[0,0,0],[1,0,0],[1,0,1],[0,0,0],[1,0,1],[0,0,1]] },
        { n: [1,0,0], v: [[1,0,0],[1,1,0],[1,1,1],[1,0,0],[1,1,1],[1,0,1]] },
        { n: [-1,0,0], v: [[0,0,0],[0,1,0],[0,1,1],[0,0,0],[0,1,1],[0,0,1]] },
        { n: [0,0,1], v: [[0,0,1],[1,0,1],[1,1,1],[0,0,1],[1,1,1],[0,1,1]] },
        { n: [0,0,-1], v: [[1,0,0],[0,0,0],[0,1,0],[1,0,0],[0,1,0],[1,1,0]] },
    ];
    for (const f of faces) {
        for (const v of f.v) { pos.push(v[0], v[1], v[2]); }
        for (let i = 0; i < 6; i++) { norm.push(f.n[0], f.n[1], f.n[2]); }
    }
    return { pos: new Float32Array(pos), norm: new Float32Array(norm) };
}

const boxMesh = buildBoxMesh();
const crPosBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, crPosBuf);
gl.bufferData(gl.ARRAY_BUFFER, boxMesh.pos, gl.STATIC_DRAW);
const crNormBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, crNormBuf);
gl.bufferData(gl.ARRAY_BUFFER, boxMesh.norm, gl.STATIC_DRAW);

// Creeper entity list
const creepers = [];
const creeperSpawnQueue = [];
const CREEPER_SPAWN_DELAY = 10;
const MAX_CREEPERS = 20;

function spawnCreeper(x, y, z) {
    creepers.push({
        x, y, z,
        vx: 0, vy: 0, vz: 0,
        yaw: Math.random() * PI * 2,
        state: 'wander',
        timer: 1 + Math.random() * 3,
        wanderDir: [Math.cos(Math.random()*PI*2), Math.sin(Math.random()*PI*2)],
        grounded: false,
        explodeTimer: 0,
    });
}

function spawnCreeperAwayFromPlayer(minDist) {
    const WORLD_RADIUS = 128;
    for (let attempt = 0; attempt < 50; attempt++) {
        let sx = camera.x + (Math.random() - 0.5) * 512;
        let sz = camera.z + (Math.random() - 0.5) * 512;
        sx = max(-WORLD_RADIUS, min(WORLD_RADIUS - 1, sx));
        sz = max(-WORLD_RADIUS, min(WORLD_RADIUS - 1, sz));
        const dxp = sx - camera.x, dzp = sz - camera.z;
        if (sqrt(dxp*dxp + dzp*dzp) < minDist) continue;
        const sy = terrainHeight(floor(sx), floor(sz)) + 1;
        if (getBlock(floor(sx), floor(sy), floor(sz)) === BLOCK.WATER) continue;
        spawnCreeper(sx, sy, sz);
        return true;
    }
    return false;
}

function updateCreeper(c, dt) {
    const GRAVITY = -20;
    const JUMP_VEL = 8;
    const CHASE_DIST = 10;
    const EXPLODE_DIST = 2;

    dt = min(dt, 0.05);

    const dxp = camera.x - c.x;
    const dzp = camera.z - c.z;
    const dist = sqrt(dxp*dxp + dzp*dzp);

    if (c.state === 'explode') {
        if (dist >= 5) {
            fadeCreeperSizzle(c);
            c.state = 'fading';
        }
        else {
            c.explodeTimer -= dt;
            updateCreeperSizzle(c);
            if (c.explodeTimer <= 0) {
                creeperExplode(c);
                return false;
            }
        }
        return true;
    }

    if (c.state === 'fading') {
        if (audioCtx && audioCtx.currentTime >= c._sizzleFadeEnd) {
            finishCreeperSizzleFade(c);
            c.state = 'wander';
            c.timer = 1 + Math.random() * 3;
            const angle = Math.random() * PI * 2;
            c.wanderDir = [Math.cos(angle), Math.sin(angle)];
        }
        return true;
    }

    if (dist < CHASE_DIST) {
        c.state = 'chase';
    }
    else if (c.state === 'chase') {
        c.state = 'wander';
    }

    let moveX = 0, moveZ = 0;
    const walkSpeed = camera.speed * 0.5;

    if (c.state === 'chase' && dist > EXPLODE_DIST) {
        const len = sqrt(dxp*dxp + dzp*dzp);
        if (len > 0.01) {
            moveX = dxp / len;
            moveZ = dzp / len;
        }
        c.yaw = Math.atan2(moveX, moveZ);
    }
    else if (c.state === 'wander') {
        c.timer -= dt;
        if (c.timer <= 0) {
            const angle = Math.random() * PI * 2;
            c.wanderDir = [Math.cos(angle), Math.sin(angle)];
            c.timer = 1 + Math.random() * 3;
        }
        moveX = c.wanderDir[0];
        moveZ = c.wanderDir[1];
        c.yaw = Math.atan2(moveX, moveZ);
    }

    const spd = walkSpeed * dt;
    let nx = c.x + moveX * spd;
    let nz = c.z + moveZ * spd;

    const hw = 0.25, ph = 1.8;
    let blockedX = false, blockedZ = false;

    if (!creeperCollides(nx, c.y, c.z, hw, ph)) {
        c.x = nx; c.vx = moveX * walkSpeed;
    }
    else {
        c.vx = 0; blockedX = true;
    }
    
    if (!creeperCollides(c.x, c.y, nz, hw, ph)) {
        c.z = nz; c.vz = moveZ * walkSpeed;
    }
    else {
        c.vz = 0; blockedZ = true;
    }

    if ((moveX !== 0 || moveZ !== 0) && c.grounded) {
        const aheadDist = 0.6;
        const ax = c.x + moveX * aheadDist;
        const az = c.z + moveZ * aheadDist;
        const hasObstacle = blockedX || blockedZ || isSolid(ax, c.y, az) || isSolid(ax, c.y + 0.5, az);
        if (hasObstacle && !isSolid(c.x, c.y + 1.0, c.z) && !isSolid(c.x, c.y + 1.5, c.z)) {
            c.vy = JUMP_VEL;
            c.grounded = false;
        }
    }

    c.vy += GRAVITY * dt;
    const stepY = c.vy * dt;

    if (!creeperCollides(c.x, c.y + stepY, c.z, hw, ph)) {
        c.y += stepY;
        if (c.vy > 0) c.grounded = false;
    }
    else {
        if (c.vy < 0) c.grounded = true;
        c.vy = 0;
    }

    // Check if creeper is in water
    const cInWater = getBlock(floor(c.x), floor(c.y + 0.5), floor(c.z)) === BLOCK.WATER;

    if (cInWater && c.state !== 'explode' && c.state !== 'fading') {
        // Float partially submerged: feet below surface so ~half body visible
        const waterSurfaceY = floor(c.y) + 1;
        const targetY = waterSurfaceY - 0.85 + sin(performance.now() * 0.002 + c.x * 3) * 0.06;
        c.y += (targetY - c.y) * 0.1;
        c.vy = 0;
        c.grounded = false;

        // Reduced horizontal movement in water (70% slower)
        const waterSpd = walkSpeed * 0.3 * dt;
        // Check collisions at mid-body and head height to avoid ground below water
        const checkY = c.y + 0.6;
        if (!creeperCollides(c.x + moveX * waterSpd, checkY, c.z, hw, ph)) {
            c.x += moveX * waterSpd;
            c.vx = moveX * walkSpeed * 0.3;
        } else {
            c.vx = 0;
        }
        if (!creeperCollides(c.x, checkY, c.z + moveZ * waterSpd, hw, ph)) {
            c.z += moveZ * waterSpd;
            c.vz = moveZ * walkSpeed * 0.3;
        } else {
            c.vz = 0;
        }

        if (dist < EXPLODE_DIST && c.state === 'chase' && abs(camera.y - c.y) < 2) {
            c.state = 'explode';
            c.explodeTimer = 1.5;
            c.vy = 0;
            c.vx = 0;
            c.vz = 0;
            startCreeperSizzle(c);
        }

        if (c.y < -10) {
            return false;
        }
        return true;
    }

    if (dist < EXPLODE_DIST && c.state === 'chase' && abs(camera.y - c.y) < 2) {
        c.state = 'explode';
        c.explodeTimer = 1.5;
        c.vy = 0;
        c.vx = 0;
        c.vz = 0;
        startCreeperSizzle(c);
    }

    if (c.y < -10) {
        return false;
    }

    return true;
}

function creeperCollides(px, py, pz, hw, ph) {
    for (let cy = 0; cy < ph; cy += 0.85) {
        if (isSolid(px - hw, py + cy, pz - hw)) return true;
        if (isSolid(px + hw, py + cy, pz - hw)) return true;
        if (isSolid(px - hw, py + cy, pz + hw)) return true;
        if (isSolid(px + hw, py + cy, pz + hw)) return true;
    }
    return false;
}

function creeperExplode(c) {
    const dxp = camera.x - c.x, dzp = camera.z - c.z;
    const dist = sqrt(dxp*dxp + dzp*dzp);
    stopCreeperSizzle(c);
    playExplosion(dist);

    const inWater = getBlock(floor(c.x), floor(c.y + 0.5), floor(c.z)) === BLOCK.WATER;

    // Calculate damage based on distance at moment of explosion
    if (!isDead) {
        const blockDist = floor(dist);
        let damage = min(5, max(0, 6 - blockDist));
        if (inWater) {
            damage = floor(damage * 0.5);
        }
        if (damage > 0) {
            playerHealth -= damage;
            if (playerHealth <= 0) {
                killPlayer('You were blown up by a Creeper.');
            }
        }
    }

    const RADIUS = inWater ? 1.75 : 3.5;
    for (let bx = floor(c.x - RADIUS); bx <= floor(c.x + RADIUS); bx++) {
        for (let by = floor(c.y - RADIUS); by <= floor(c.y + RADIUS); by++) {
            for (let bz = floor(c.z - RADIUS); bz <= floor(c.z + RADIUS); bz++) {
                const d = sqrt((bx+0.5-c.x)**2 + (by+0.5-c.y)**2 + (bz+0.5-c.z)**2);
                const block = getBlock(bx, by, bz);
                if (d < RADIUS && block !== BLOCK.AIR && block !== BLOCK.WATER) {
                    setBlock(bx, by, bz, BLOCK.AIR);
                    triggerWaterFlow(bx, by, bz);
                }
            }
        }
    }
}

function mat4Scale(x, y, z) {
    const m = mat4Identity();
    m[0] = x; m[5] = y; m[10] = z;
    return m;
}

function mat4RotateY(angle) {
    const c = cos(angle), s = sin(angle);
    return new Float32Array([c,0,s,0, 0,1,0,0, -s,0,c,0, 0,0,0,1]);
}

function renderCreeper(c, proj, view) {
    const CREEPER_GREEN = [0.15, 0.65, 0.15];
    const DARK_GREEN = [0.1, 0.45, 0.1];

    gl.useProgram(crProg);
    gl.uniformMatrix4fv(crUProj, false, proj);
    gl.uniformMatrix4fv(crUView, false, view);
    const inWater = getBlock(floor(c.x), floor(c.y + 0.5), floor(c.z)) === BLOCK.WATER;
    gl.uniform1f(crUWaterSurface, inWater ? (floor(c.y) + 1.0) : -200.0);

    gl.bindBuffer(gl.ARRAY_BUFFER, crPosBuf);
    gl.enableVertexAttribArray(crAPos);
    gl.vertexAttribPointer(crAPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, crNormBuf);
    gl.enableVertexAttribArray(crANorm);
    gl.vertexAttribPointer(crANorm, 3, gl.FLOAT, false, 0, 0);

    const baseModel = mat4Translate(c.x, c.y, c.z);
    const rotY = mat4RotateY(c.yaw + PI/2);

    if (c.state === 'explode') {
        const flash = sin(c.explodeTimer * 20) > 0;
        gl.uniform3f(crUColor, flash ? 1.0 : 0.8, flash ? 1.0 : 0.3, flash ? 1.0 : 0.1);
    }
    else {
        gl.uniform3f(crUColor, CREEPER_GREEN[0], CREEPER_GREEN[1], CREEPER_GREEN[2]);
    }

    const boxVerts = boxMesh.pos.length / 3;

    // Body: 0.6w x 1.2h, centered at y=0.9
    {
        const s = mat4Scale(0.6, 1.2, 0.6);
        const t = mat4Translate(-0.3, 0.6, -0.3);
        const m = mat4Multiply(mat4Multiply(baseModel, rotY), mat4Multiply(s, t));
        gl.uniformMatrix4fv(crUModel, false, m);
        gl.drawArrays(gl.TRIANGLES, 0, boxVerts);
    }

    // Head: 0.5w x 0.5h, on top of body
    {
        const s = mat4Scale(0.5, 0.5, 0.5);
        const t = mat4Translate(-0.25, 1.65, -0.25);
        const m = mat4Multiply(mat4Multiply(baseModel, rotY), mat4Multiply(s, t));
        gl.uniformMatrix4fv(crUModel, false, m);
        gl.drawArrays(gl.TRIANGLES, 0, boxVerts);
    }

    // Legs (darker green)
    gl.uniform3f(crUColor, DARK_GREEN[0], DARK_GREEN[1], DARK_GREEN[2]);
    const legOffset = (c.state !== 'explode' && (Math.abs(c.vx) > 0.1 || Math.abs(c.vz) > 0.1)) ? sin(performance.now() * 0.012) * 0.15 : 0;

    // Left leg
    {
        const s = mat4Scale(0.2, 0.6, 0.2);
        const t = mat4Translate(-0.18, legOffset, -0.25);
        const m = mat4Multiply(mat4Multiply(baseModel, rotY), mat4Multiply(s, t));
        gl.uniformMatrix4fv(crUModel, false, m);
        gl.drawArrays(gl.TRIANGLES, 0, boxVerts);
    }

    // Right leg
    {
        const s = mat4Scale(0.2, 0.6, 0.2);
        const t = mat4Translate(0.18, -legOffset, -0.25);
        const m = mat4Multiply(mat4Multiply(baseModel, rotY), mat4Multiply(s, t));
        gl.uniformMatrix4fv(crUModel, false, m);
        gl.drawArrays(gl.TRIANGLES, 0, boxVerts);
    }

    // Face details (dark green patches on head) - eyes and mouth
    gl.uniform3f(crUColor, DARK_GREEN[0], DARK_GREEN[1], DARK_GREEN[2]);
    // Left eye
    {
        const s = mat4Scale(0.1, 0.1, 0.05);
        const t = mat4Translate(-0.12, 1.8, -0.5);
        const m = mat4Multiply(mat4Multiply(baseModel, rotY), mat4Multiply(s, t));
        gl.uniformMatrix4fv(crUModel, false, m);
        gl.drawArrays(gl.TRIANGLES, 0, boxVerts);
    }
    // Right eye
    {
        const s = mat4Scale(0.1, 0.1, 0.05);
        const t = mat4Translate(0.12, 1.8, -0.5);
        const m = mat4Multiply(mat4Multiply(baseModel, rotY), mat4Multiply(s, t));
        gl.uniformMatrix4fv(crUModel, false, m);
        gl.drawArrays(gl.TRIANGLES, 0, boxVerts);
    }
    // Mouth (inverted smile)
    {
        const s = mat4Scale(0.2, 0.08, 0.05);
        const t = mat4Translate(0, 1.72, -0.5);
        const m = mat4Multiply(mat4Multiply(baseModel, rotY), mat4Multiply(s, t));
        gl.uniformMatrix4fv(crUModel, false, m);
        gl.drawArrays(gl.TRIANGLES, 0, boxVerts);
    }

    // Nose bridge
    {
        const s = mat4Scale(0.12, 0.08, 0.05);
        const t = mat4Translate(0, 1.76, -0.5);
        const m = mat4Multiply(mat4Multiply(baseModel, rotY), mat4Multiply(s, t));
        gl.uniformMatrix4fv(crUModel, false, m);
        gl.drawArrays(gl.TRIANGLES, 0, boxVerts);
    }
}

// ===================== CAMERA / CONTROLS =====================
const camera = {
    x: 0, y: 50, z: 0,
    yaw: 3, pitch: -0.3,
    speed: 5.5,
    vy: 0,
    grounded: false,
};

const keys = {};
let selectedSlot = 0;
let locked = false;

// Health system
let playerHealth = 10;
let isDead = false;
let deathMessage = '';
let fallDamageEnabled = false;
const SPAWN_X = 0;
const SPAWN_Z = 0;
let spawnY = 0;

document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (isDead && e.code === 'Space') {
        respawnPlayer();
        return;
    }
    if (e.code >= 'Digit1' && e.code <= 'Digit6') {
        selectedSlot = parseInt(e.code.charAt(5)) - 1;
        updateHotbar();
    }
});
document.addEventListener('keyup', e => keys[e.code] = false);

canvas.addEventListener('click', () => {
    initAudio();
    if (!locked) canvas.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
    locked = !!document.pointerLockElement;
});

document.addEventListener('mousemove', e => {
    if (!locked) return;
    camera.yaw -= e.movementX * 0.002;
    camera.pitch += e.movementY * 0.002;
    camera.pitch = max(-PI/2 + 0.01, min(PI/2 - 0.01, camera.pitch));
});

canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.deltaY > 0) {
        selectedSlot = (selectedSlot + 1) % HOTBAR_BLOCKS.length;
    } else {
        selectedSlot = (selectedSlot - 1 + HOTBAR_BLOCKS.length) % HOTBAR_BLOCKS.length;
    }
    updateHotbar();
});

// ===================== RAYCASTING =====================
function getCameraDir() {
    return [
        -sin(camera.yaw) * cos(camera.pitch),
        sin(camera.pitch),
        -cos(camera.yaw) * cos(camera.pitch)
    ];
}

function raycast(origin, dir, maxDist) {
    const step = 0.05;
    let px = origin[0], py = origin[1], pz = origin[2];
    let prevBx, prevBy, prevBz;

    for (let d = 0; d < maxDist; d += step) {
        px = origin[0] + dir[0] * d;
        py = origin[1] + dir[1] * d;
        pz = origin[2] + dir[2] * d;

        const bx = floor(px), by = floor(py), bz = floor(pz);
        const block = getBlock(bx, by, bz);
        if (block !== BLOCK.AIR && block !== BLOCK.WATER) {
            return {
                hit: true,
                blockX: bx, blockY: by, blockZ: bz,
                placeX: prevBx !== undefined ? prevBx : bx,
                placeY: prevBy !== undefined ? prevBy : by,
                placeZ: prevBz !== undefined ? prevBz : bz,
            };
        }
        prevBx = bx; prevBy = by; prevBz = bz;
    }
    return { hit: false };
}

// ===================== BLOCK INTERACTION =====================
canvas.addEventListener('mousedown', e => {
    if (!locked) return;

    const dir = getCameraDir();
    const eyeY = camera.y + 1.4;
    const result = raycast([camera.x, eyeY, camera.z], dir, 8);

    if (result.hit) {
        const hitType = getBlock(result.blockX, result.blockY, result.blockZ);
        if (e.button === 0) {
            if (hitType === BLOCK.WATER) return;
            const brokenX = result.blockX, brokenY = result.blockY, brokenZ = result.blockZ;
            setBlock(brokenX, brokenY, brokenZ, BLOCK.AIR);
            triggerWaterFlow(brokenX, brokenY, brokenZ);
        }
        else if (e.button === 2) {
            let px, py, pz;
            if (hitType === BLOCK.WATER) {
                px = result.blockX; py = result.blockY; pz = result.blockZ;
            } else {
                px = result.placeX; py = result.placeY; pz = result.placeZ;
            }
            const playerMinX = camera.x - 0.3, playerMaxX = camera.x + 0.3;
            const playerMinZ = camera.z - 0.3, playerMaxZ = camera.z + 0.3;
            const playerMinY = camera.y, playerMaxY = camera.y + 3.4;
            if (px+1 > playerMinX && px < playerMaxX && py+1 > playerMinY && py < playerMaxY && pz+1 > playerMinZ && pz < playerMaxZ) return;
            setBlock(px, py, pz, HOTBAR_BLOCKS[selectedSlot]);
            triggerWaterFlow(px, py, pz);
        }
    }
});

canvas.addEventListener('contextmenu', e => e.preventDefault());

// ===================== HOTBAR UI =====================
function updateHotbar() {
    const hotbar = document.getElementById('hotbar');
    hotbar.innerHTML = '';
    for (let i = 0; i < HOTBAR_BLOCKS.length; i++) {
        const slot = document.createElement('div');
        slot.className = 'slot' + (i === selectedSlot ? ' active' : '');

        // Draw texture preview
        const btype = HOTBAR_BLOCKS[i];
        const texCanvas = TEXTURES[btype].top;
        const img = document.createElement('img');
        img.src = texCanvas.toDataURL();
        img.style.cssText = 'position:absolute;top:8px;left:8px;width:30px;height:30px;image-rendering:pixelated;';
        slot.appendChild(img);

        const num = document.createElement('span');
        num.style.cssText = 'position:absolute;top:1px;left:3px;font-size:10px;z-index:1;';
        num.textContent = i + 1;
        slot.appendChild(num);

        hotbar.appendChild(slot);
    }
}

// ===================== HEARTS UI =====================
let lastHeartCount = -1;

function updateHearts() {
    if (playerHealth === lastHeartCount) return;
    lastHeartCount = playerHealth;
    const heartsDiv = document.getElementById('hearts');
    heartsDiv.innerHTML = '';
    for (let i = 0; i < 10; i++) {
        const heart = document.createElement('span');
        heart.className = 'heart' + (i >= playerHealth ? ' empty' : '');
        heart.textContent = '\u2764';
        heartsDiv.appendChild(heart);
    }
}

// ===================== RESPAWN =====================
function killPlayer(message) {
    playerHealth = 0;
    isDead = true;
    deathMessage = message;
    document.getElementById('deathScreen').innerHTML = message + '<br><br>Press SPACE to continue...';
    document.getElementById('deathScreen').style.display = 'flex';
    canvas.style.filter = 'brightness(0.4) grayscale(0.6)';
    updateHearts();
}

function respawnPlayer() {
    isDead = false;
    playerHealth = 10;
    fallDamageEnabled = false;
    camera.x = SPAWN_X;
    camera.y = spawnY + 3;
    camera.z = SPAWN_Z;
    camera.vy = 0;
    deathMessage = '';
    document.getElementById('deathScreen').style.display = 'none';
    canvas.style.filter = '';
    updateHearts();
}

// ===================== GAME LOOP =====================
let lastTime = performance.now();

function isSolid(x, y, z) {
    const b = getBlock(floor(x), floor(y), floor(z));
    return b !== BLOCK.AIR && b !== BLOCK.WATER;
}

function isInWater(px, py, pz) {
    const hw = 0.28;
    const checks = [
        [px - hw, py, pz - hw], [px + hw, py, pz - hw],
        [px - hw, py, pz + hw], [px + hw, py, pz + hw],
        [px, py, pz], [px, py + 1.7, pz]
    ];
    for (const c of checks) {
        if (getBlock(floor(c[0]), floor(c[1]), floor(c[2])) === BLOCK.WATER) return true;
    }
    return false;
}

function playerCollides(px, py, pz) {
    const hw = 0.28;
    const ph = 3.4;
    for (let cy = 0; cy < ph; cy += 1.7) {
        if (isSolid(px - hw, py + cy, pz - hw)) return true;
        if (isSolid(px + hw, py + cy, pz - hw)) return true;
        if (isSolid(px - hw, py + cy, pz + hw)) return true;
        if (isSolid(px + hw, py + cy, pz + hw)) return true;
    }
    return false;
}

function updateCamera(dt) {
    const GRAVITY = -20;
    const JUMP_VEL = 8;
    const WATER_GRAVITY = -3;
    const SWIM_SPEED = 4;

    dt = min(dt, 0.05);

    if (isDead) return;

    let dx = 0, dz = 0;
    if (keys['KeyW']) { dx -= sin(camera.yaw); dz -= cos(camera.yaw); }
    if (keys['KeyS']) { dx += sin(camera.yaw); dz += cos(camera.yaw); }
    if (keys['KeyA']) { dx -= cos(camera.yaw); dz += sin(camera.yaw); }
    if (keys['KeyD']) { dx += cos(camera.yaw); dz -= sin(camera.yaw); }
    const isWalking = keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'];
    if (dx || dz) {
        const len = sqrt(dx*dx + dz*dz);
        dx /= len; dz /= len;
    }

    const inWater = isInWater(camera.x, camera.y, camera.z);
    const moveSpeed = inWater ? SWIM_SPEED : camera.speed;
    const spd = moveSpeed * dt;

    if (!playerCollides(camera.x + dx * spd, camera.y, camera.z)) {
        camera.x += dx * spd;
    }
    if (!playerCollides(camera.x, camera.y, camera.z + dz * spd)) {
        camera.z += dz * spd;
    }

    // Auto-jump out of water onto land at same height
    if (inWater && isWalking) {
        const aheadX = camera.x + dx * 0.6;
        const aheadZ = camera.z + dz * 0.6;
        const footY = floor(camera.y);
        if (isSolid(aheadX, footY, aheadZ) || isSolid(aheadX, footY + 1, aheadZ)) {
            if (!playerCollides(camera.x, camera.y + 1.2, camera.z)) {
                camera.vy = JUMP_VEL * 0.7;
            }
        }
    }

    if (isWalking && camera.grounded) {
        if (!camera._stepDist) camera._stepDist = 0;
        camera._stepDist += spd;
        while (camera._stepDist >= 1.833) {
            camera._stepDist -= 1.833;
            const blockBelow = getBlock(floor(camera.x), floor(camera.y - 0.1), floor(camera.z));
            if (blockBelow !== BLOCK.AIR && blockBelow !== BLOCK.WATER) {
                playFootstep(blockBelow);
            }
        }
        if (!camera._wasWalking && footstepGain) {
            footstepGain.gain.setValueAtTime(1, audioCtx.currentTime);
        }
    }
    else {
        camera._stepDist = 0;
        if (footstepGain) {
            footstepGain.gain.setValueAtTime(0, audioCtx.currentTime);
        }
    }
    camera._wasWalking = isWalking && camera.grounded;

    if (inWater) {
        camera.vy += WATER_GRAVITY * dt;
        if (keys['Space']) {
            camera.vy = SWIM_SPEED;
            camera.grounded = false;
        }
        camera.vy = max(-2, min(SWIM_SPEED, camera.vy));
    } else {
        camera.vy += GRAVITY * dt;
        if (keys['Space'] && camera.grounded) {
            camera.vy = JUMP_VEL;
            camera.grounded = false;
            playJumpSound();
        }
    }

    const stepY = camera.vy * dt;
    if (!playerCollides(camera.x, camera.y + stepY, camera.z)) {
        camera.y += stepY;
        if (camera.vy > 0) camera.grounded = false;
        if (camera.vy < 0) camera.grounded = false;
        if (!camera.grounded && camera.vy < 0) {
            if (!('_fallStartY' in camera)) camera._fallStartY = camera.y;
        }
    }
    else {
        if (camera.vy < 0 && !inWater) {
            const fallDist = floor((camera._fallStartY || camera.y) - camera.y);
            const fallDamage = max(0, fallDist - 3);
            if (fallDamageEnabled && fallDamage > 0 && !isDead) {
                playFallDamage();
                playerHealth -= fallDamage;
                if (playerHealth <= 0) {
                    killPlayer('You fell from a great height.');
                }
            }
        }
        camera.grounded = true;
        delete camera._fallStartY;
        camera.vy = 0;
    }

    if (!fallDamageEnabled && camera.grounded) {
        fallDamageEnabled = true;
    }

    if (!camera.grounded && camera.vy >= 0) {
        delete camera._fallStartY;
    }

    if (camera.y < -10) {
        killPlayer('You fell out of the world.');
    }
}

function getViewMatrix() {
    const fwd = [
        -sin(camera.yaw) * cos(camera.pitch),
        sin(camera.pitch),
        -cos(camera.yaw) * cos(camera.pitch)
    ];

    const right = vec3Norm(vec3Cross(fwd, [0, 1, 0]));
    const up = vec3Cross(right, fwd);

    const eyeY = isDead ? camera.y + 0.3 : camera.y + 1.4;
    return new Float32Array([
        right[0], up[0], -fwd[0], 0,
        right[1], up[1], -fwd[1], 0,
        right[2], up[2], -fwd[2], 0,
        -(vec3Dot(right, [camera.x, eyeY, camera.z])),
        -(vec3Dot(up, [camera.x, eyeY, camera.z])),
          vec3Dot(fwd, [camera.x, eyeY, camera.z]),
        1
    ]);
}

function render() {
    const now = performance.now();
    const dt = min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    updateCamera(dt);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const proj = mat4Perspective(PI / 3, canvas.width / canvas.height, 0.5, 200);
    const view = getViewMatrix();

    // Rebuild any dirty chunks
    rebuildDirtyChunks();

    gl.useProgram(prog);
    gl.uniformMatrix4fv(uProj, false, proj);
    gl.uniformMatrix4fv(uView, false, view);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);

    // Draw all visible chunks within render distance
    const pcx = floor(camera.x / CHUNK_SIZE), pcz = floor(camera.z / CHUNK_SIZE);
    const chunkRange = floor(RENDER_DIST / CHUNK_SIZE) + 1;

    // Pass 1: Opaque geometry
    for (let dx = -chunkRange; dx <= chunkRange; dx++) {
        for (let dz = -chunkRange; dz <= chunkRange; dz++) {
            const cx = pcx + dx, cz = pcz + dz;
            const key = chunkKey(cx, cz);
            const chunk = chunks[key];
            if (!chunk || chunk.vertCount === 0) continue;
            const dcx = (cx * CHUNK_SIZE + CHUNK_SIZE / 2) - camera.x;
            const dcz = (cz * CHUNK_SIZE + CHUNK_SIZE / 2) - camera.z;
            if (dcx * dcx + dcz * dcz > RENDER_DIST_SQ) continue;
            bindChunkAttribs(chunk);
            gl.drawArrays(gl.TRIANGLES, 0, chunk.vertCount);
        }
    }

    // Pass 2: Transparent water geometry with blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (let dx = -chunkRange; dx <= chunkRange; dx++) {
        for (let dz = -chunkRange; dz <= chunkRange; dz++) {
            const cx = pcx + dx, cz = pcz + dz;
            const key = chunkKey(cx, cz);
            const chunk = chunks[key];
            if (!chunk || chunk.wVertCount === 0) continue;
            const dcx = (cx * CHUNK_SIZE + CHUNK_SIZE / 2) - camera.x;
            const dcz = (cz * CHUNK_SIZE + CHUNK_SIZE / 2) - camera.z;
            if (dcx * dcx + dcz * dcz > RENDER_DIST_SQ) continue;
            bindWaterAttribs(chunk);
            gl.drawArrays(gl.TRIANGLES, 0, chunk.wVertCount);
        }
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    const dir = getCameraDir();
    const eyeY = camera.y + 1.4;
    const result = raycast([camera.x, eyeY, camera.z], dir, 8);

    if (result.hit && getBlock(result.blockX, result.blockY, result.blockZ) !== BLOCK.WATER) {
        gl.useProgram(hlProg);
        gl.uniformMatrix4fv(hlUProj, false, proj);

        const hlView = mat4Translate(result.blockX + 0.005, result.blockY + 0.005, result.blockZ + 0.005);
        gl.uniformMatrix4fv(hlUView, false, mat4Multiply(view, hlView));

        gl.bindBuffer(gl.ARRAY_BUFFER, hlBuf);
        gl.enableVertexAttribArray(hlAPos);
        gl.vertexAttribPointer(hlAPos, 3, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.LINES, 0, hlVerts.length / 3);
    }

    // Update and render Creepers
    for (let i = creepers.length - 1; i >= 0; i--) {
        const alive = updateCreeper(creepers[i], dt);
        if (!alive) {
            creepers.splice(i, 1);
            creeperSpawnQueue.push(performance.now() + CREEPER_SPAWN_DELAY * 1000);
            continue;
        }
        const dxp = camera.x - creepers[i].x;
        const dzp = camera.z - creepers[i].z;
        if (sqrt(dxp*dxp + dzp*dzp) < 120) {
            renderCreeper(creepers[i], proj, view);
        }
    }

    // Process pending creeper spawns
    const nowMs = performance.now();
    for (let i = creeperSpawnQueue.length - 1; i >= 0; i--) {
        if (creeperSpawnQueue[i] <= nowMs && creepers.length < MAX_CREEPERS) {
            spawnCreeperAwayFromPlayer(20);
            creeperSpawnQueue.splice(i, 1);
        }
    }

    processWaterFlow(nowMs);

    document.getElementById('creeperCount').innerHTML = 'Creepers: ' + creepers.length;
    updateHearts();

    requestAnimationFrame(render);
}

// ===================== INIT =====================
initTextures();
buildAtlas();
uploadAtlas();
generateWorld();
generateLakes();

for (let i = 0; i < 20; i++) {
    const cx = (hash2D(i * 7 + 1, i * 13) - 0.5) * 256;
    const cz = (hash2D(i * 17 + 3, i * 19) - 0.5) * 256;
    const cy = terrainHeight(floor(cx), floor(cz)) + 1;
    if (getBlock(floor(cx), floor(cy), floor(cz)) !== BLOCK.WATER) {
        spawnCreeper(cx, cy, cz);
    }
}

camera.y = terrainHeight(0, 0) + 3;
spawnY = terrainHeight(0, 0);

// All chunks marked dirty by setBlock() will rebuild on first render frame
updateHotbar();
updateHearts();
requestAnimationFrame(render);
