/**
 * textures.js
 * ---------------------------------------------------------------------------
 * Procedurally paints all block textures onto small canvases (no external
 * image assets needed), then hands back THREE.CanvasTexture objects keyed
 * by texture name (matches the keys used in blocks.js BLOCK_DATA.faces).
 *
 * Also exposes:
 *   makeSeededRandom(seed) -> deterministic PRNG function () => [0,1)
 *   generateBlockIcon(blockId) -> data URL for hotbar icons
 * ---------------------------------------------------------------------------
 */

const TEX_SIZE = 16; // classic 16x16 block texture resolution

function makeSeededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function makeCanvas(size) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return c;
}

function shade(hex, amt) {
  const num = parseInt(hex.replace("#", ""), 16);
  let r = (num >> 16) + amt;
  let g = ((num >> 8) & 0xff) + amt;
  let b = (num & 0xff) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}

/** Fills a canvas with a base color plus per-pixel noise speckle for texture. */
function paintNoisy(ctx, size, baseHex, variance, rand) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = (rand() - 0.5) * variance;
      ctx.fillStyle = shade(baseHex, Math.round(n));
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

const TEXTURE_RECIPES = {
  grass_top: (ctx, size, rand) => {
    paintNoisy(ctx, size, "#5a9e3d", 26, rand);
    for (let i = 0; i < size * 1.5; i++) {
      const x = Math.floor(rand() * size), y = Math.floor(rand() * size);
      ctx.fillStyle = rand() > 0.5 ? "#4f8f34" : "#6bb04a";
      ctx.fillRect(x, y, 1, 1);
    }
  },
  grass_side: (ctx, size, rand) => {
    paintNoisy(ctx, size, "#8a6136", 18, rand);
    const grassH = Math.floor(size * 0.3125); // ~5px of 16
    paintNoisy(ctx, size, "#5a9e3d", 22, rand);
    ctx.fillStyle = "#7a5530";
    ctx.fillRect(0, grassH, size, size - grassH);
    for (let x = 0; x < size; x++) {
      ctx.fillStyle = shade("#7a5530", (rand() - 0.5) * 20);
      ctx.fillRect(x, grassH, 1, size - grassH);
    }
    for (let x = 0; x < size; x++) {
      const dip = Math.floor(rand() * 3) - 1;
      ctx.fillStyle = shade("#5a9e3d", (rand() - 0.5) * 20);
      ctx.fillRect(x, Math.max(0, grassH - 1 + dip), 1, 3);
    }
  },
  dirt: (ctx, size, rand) => {
    paintNoisy(ctx, size, "#7a5530", 22, rand);
    for (let i = 0; i < size; i++) {
      const x = Math.floor(rand() * size), y = Math.floor(rand() * size);
      ctx.fillStyle = shade("#7a5530", -30);
      ctx.fillRect(x, y, rand() > 0.6 ? 2 : 1, 1);
    }
  },
  stone: (ctx, size, rand) => {
    paintNoisy(ctx, size, "#8a8a8e", 16, rand);
    for (let i = 0; i < size * 1.2; i++) {
      const x = Math.floor(rand() * size), y = Math.floor(rand() * size);
      ctx.fillStyle = shade("#8a8a8e", rand() > 0.5 ? -26 : 20);
      ctx.fillRect(x, y, rand() > 0.7 ? 2 : 1, 1);
    }
  },
  sand: (ctx, size, rand) => {
    paintNoisy(ctx, size, "#dcc57a", 14, rand);
    for (let i = 0; i < size; i++) {
      const x = Math.floor(rand() * size), y = Math.floor(rand() * size);
      ctx.fillStyle = shade("#dcc57a", (rand() - 0.5) * 24);
      ctx.fillRect(x, y, 1, 1);
    }
  },
  water: (ctx, size, rand) => {
    paintNoisy(ctx, size, "#2f6fd6", 14, rand);
    for (let y = 0; y < size; y += 2) {
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(0, y, size, 1);
    }
  },
  wood_side: (ctx, size, rand) => {
    paintNoisy(ctx, size, "#5b3a22", 12, rand);
    for (let x = 0; x < size; x += 3) {
      ctx.fillStyle = shade("#5b3a22", -22);
      ctx.fillRect(x, 0, 1, size);
    }
  },
  wood_top: (ctx, size, rand) => {
    const cx = size / 2, cy = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const ring = Math.sin(d * 1.6) * 10;
        ctx.fillStyle = shade("#a9764a", ring + (rand() - 0.5) * 8);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  },
  leaves: (ctx, size, rand) => {
    paintNoisy(ctx, size, "#3f8f3a", 24, rand);
    for (let i = 0; i < size * 2; i++) {
      const x = Math.floor(rand() * size), y = Math.floor(rand() * size);
      ctx.fillStyle = rand() > 0.5 ? "#347a30" : "#4fa848";
      ctx.fillRect(x, y, 1, 1);
    }
  },
  bedrock: (ctx, size, rand) => {
    paintNoisy(ctx, size, "#3a3a3e", 20, rand);
    for (let i = 0; i < size * 1.5; i++) {
      const x = Math.floor(rand() * size), y = Math.floor(rand() * size);
      ctx.fillStyle = shade("#3a3a3e", rand() > 0.5 ? -20 : 24);
      ctx.fillRect(x, y, rand() > 0.6 ? 2 : 1, 1);
    }
  },
  plank: (ctx, size, rand) => {
    paintNoisy(ctx, size, "#b98a4e", 10, rand);
    for (let y = 0; y < size; y += 4) {
      ctx.fillStyle = shade("#b98a4e", -24);
      ctx.fillRect(0, y, size, 1);
    }
  },
  cobblestone: (ctx, size, rand) => {
    paintNoisy(ctx, size, "#7d7d80", 18, rand);
    for (let i = 0; i < size; i++) {
      const x = Math.floor(rand() * size), y = Math.floor(rand() * size);
      ctx.fillStyle = shade("#7d7d80", -30);
      ctx.fillRect(x, y, 2, 1);
    }
  },
  leaves_dark: (ctx, size, rand) => {
    paintNoisy(ctx, size, "#2e6e2c", 22, rand);
    for (let i = 0; i < size * 2; i++) {
      const x = Math.floor(rand() * size), y = Math.floor(rand() * size);
      ctx.fillStyle = rand() > 0.5 ? "#245621" : "#3c8038";
      ctx.fillRect(x, y, 1, 1);
    }
  },
};

/** Builds and returns { key: THREE.CanvasTexture } for every recipe above. */
function generateTextures() {
  const rand = makeSeededRandom(9001);
  const textures = {};
  for (const key in TEXTURE_RECIPES) {
    const canvas = makeCanvas(TEX_SIZE);
    const ctx = canvas.getContext("2d");
    TEXTURE_RECIPES[key](ctx, TEX_SIZE, rand);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    textures[key] = tex;
  }
  return textures;
}

/** Generates a small icon data URL (top+side blend) for the hotbar UI. */
const _iconCache = {};
function generateBlockIcon(blockId) {
  if (_iconCache[blockId]) return _iconCache[blockId];

  const data = BLOCK_DATA[blockId];
  const size = 32;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");
  const rand = makeSeededRandom(9001 + blockId);

  if (data && data.faces) {
    const tmp = makeCanvas(TEX_SIZE);
    const tctx = tmp.getContext("2d");
    const recipe = TEXTURE_RECIPES[data.faces.top] || TEXTURE_RECIPES[data.faces.side];
    if (recipe) recipe(tctx, TEX_SIZE, rand);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, size, size);
  } else {
    ctx.fillStyle = "#444";
    ctx.fillRect(0, 0, size, size);
  }

  const url = canvas.toDataURL();
  _iconCache[blockId] = url;
  return url;
}
