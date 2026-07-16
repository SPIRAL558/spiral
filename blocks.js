/**
 * blocks.js
 * ---------------------------------------------------------------------------
 * Defines every block type in SPIRAL Craft: its id, display name, and which
 * texture key each face of the cube should use. Also defines which blocks
 * are solid (for collision) and which are available in the creative-style
 * inventory / hotbar.
 * ---------------------------------------------------------------------------
 */

// Block IDs — 0 is always "air" (empty space, no mesh, no collision)
const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  WOOD: 6,
  LEAVES: 7,
  BEDROCK: 8,
  PLANK: 9,
  COBBLESTONE: 10,
  LEAVES_DARK: 11,
  FLOWER_RED: 12,
  FLOWER_YELLOW: 13,
  TALL_GRASS: 14,
};

/**
 * Per-block definition.
 * faces: { top, bottom, side } -> texture key (see textures.js)
 * solid: whether the player collides with it
 * transparent: whether neighboring faces should still render (glass/leaves/water)
 * inHotbar: whether it appears in the placeable inventory
 */
const BLOCK_DATA = {
  [BLOCK.AIR]: {
    name: "Air",
    solid: false,
    transparent: true,
    inHotbar: false,
  },
  [BLOCK.GRASS]: {
    name: "Grass Block",
    faces: { top: "grass_top", bottom: "dirt", side: "grass_side" },
    solid: true,
    transparent: false,
    inHotbar: true,
  },
  [BLOCK.DIRT]: {
    name: "Dirt",
    faces: { top: "dirt", bottom: "dirt", side: "dirt" },
    solid: true,
    transparent: false,
    inHotbar: true,
  },
  [BLOCK.STONE]: {
    name: "Stone",
    faces: { top: "stone", bottom: "stone", side: "stone" },
    solid: true,
    transparent: false,
    inHotbar: true,
  },
  [BLOCK.SAND]: {
    name: "Sand",
    faces: { top: "sand", bottom: "sand", side: "sand" },
    solid: true,
    transparent: false,
    inHotbar: true,
  },
  [BLOCK.WATER]: {
    name: "Water",
    faces: { top: "water", bottom: "water", side: "water" },
    solid: false,
    transparent: true,
    inHotbar: false,
  },
  [BLOCK.WOOD]: {
    name: "Wood Log",
    faces: { top: "wood_top", bottom: "wood_top", side: "wood_side" },
    solid: true,
    transparent: false,
    inHotbar: true,
  },
  [BLOCK.LEAVES]: {
    name: "Leaves",
    faces: { top: "leaves", bottom: "leaves", side: "leaves" },
    solid: true,
    transparent: true,
    inHotbar: true,
  },
  [BLOCK.BEDROCK]: {
    name: "Bedrock",
    faces: { top: "bedrock", bottom: "bedrock", side: "bedrock" },
    solid: true,
    transparent: false,
    inHotbar: false,
  },
  [BLOCK.PLANK]: {
    name: "Wood Planks",
    faces: { top: "plank", bottom: "plank", side: "plank" },
    solid: true,
    transparent: false,
    inHotbar: true,
  },
  [BLOCK.COBBLESTONE]: {
    name: "Cobblestone",
    faces: { top: "cobblestone", bottom: "cobblestone", side: "cobblestone" },
    solid: true,
    transparent: false,
    inHotbar: true,
  },
  [BLOCK.LEAVES_DARK]: {
    name: "Leaves",
    faces: { top: "leaves_dark", bottom: "leaves_dark", side: "leaves_dark" },
    solid: true,
    transparent: true,
    inHotbar: false,
  },
  [BLOCK.FLOWER_RED]: {
    name: "Red Flower",
    faces: { top: "leaves", bottom: "leaves", side: "leaves" },
    solid: false,
    transparent: true,
    inHotbar: false,
    decorative: true,
  },
  [BLOCK.FLOWER_YELLOW]: {
    name: "Yellow Flower",
    faces: { top: "sand", bottom: "sand", side: "sand" },
    solid: false,
    transparent: true,
    inHotbar: false,
    decorative: true,
  },
  [BLOCK.TALL_GRASS]: {
    name: "Tall Grass",
    faces: { top: "leaves", bottom: "leaves", side: "leaves" },
    solid: false,
    transparent: true,
    inHotbar: false,
    decorative: true,
  },
};

// The default hotbar loadout, in slot order (index 0-8)
const DEFAULT_HOTBAR = [
  BLOCK.GRASS,
  BLOCK.DIRT,
  BLOCK.STONE,
  BLOCK.SAND,
  BLOCK.WOOD,
  BLOCK.LEAVES,
  BLOCK.PLANK,
  BLOCK.COBBLESTONE,
];

function isSolidBlock(id) {
  const data = BLOCK_DATA[id];
  return !!(data && data.solid);
}

function isTransparentBlock(id) {
  const data = BLOCK_DATA[id];
  return data ? data.transparent : true;
}

function getBlockName(id) {
  const data = BLOCK_DATA[id];
  return data ? data.name : "Unknown";
}
