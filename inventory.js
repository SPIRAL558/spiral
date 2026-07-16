/**
 * inventory.js
 * ---------------------------------------------------------------------------
 * Manages the 9-slot hotbar: which block type sits in each slot and how many
 * of that block the player is carrying. Stacks are capped at MAX_STACK (16):
 * placing a block removes one from the stack, breaking a block adds one back
 * (up to the cap), and a slot clears itself once its count reaches 0.
 * ---------------------------------------------------------------------------
 */

const MAX_STACK = 16;

const Inventory = {
  slots: [],          // array of 9 entries: { blockId, count } or null for empty
  selectedIndex: 0,

  init() {
    this.slots = new Array(9).fill(null);
    DEFAULT_HOTBAR.forEach((blockId, i) => {
      if (i < 9) this.slots[i] = { blockId, count: MAX_STACK };
    });
    this.selectedIndex = 0;
  },

  select(index) {
    if (index < 0 || index > 8) return;
    this.selectedIndex = index;
  },

  scrollSelect(delta) {
    this.selectedIndex = (this.selectedIndex + delta + 9) % 9;
  },

  getSelectedBlock() {
    const slot = this.slots[this.selectedIndex];
    return slot ? slot.blockId : BLOCK.AIR;
  },

  /** Returns true if the currently selected slot has a placeable block with at least 1 in stock. */
  hasSelectedBlock() {
    const slot = this.slots[this.selectedIndex];
    return !!(slot && slot.blockId !== BLOCK.AIR && slot.count > 0);
  },

  /**
   * Called when the player places a block: removes one from the selected
   * stack, clearing the slot entirely once it reaches 0 so it disappears
   * from the hotbar.
   */
  onBlockPlaced() {
    const slot = this.slots[this.selectedIndex];
    if (!slot) return;
    slot.count -= 1;
    if (slot.count <= 0) {
      this.slots[this.selectedIndex] = null;
    }
  },

  /**
   * Called when the player breaks a block: adds one to the matching stack
   * (up to MAX_STACK). If the block type isn't already in the hotbar, it's
   * placed into the first empty slot with a count of 1.
   */
  onBlockBroken(blockId) {
    const data = BLOCK_DATA[blockId];
    if (!data || !data.inHotbar) return;

    const existing = this.slots.find((s) => s && s.blockId === blockId);
    if (existing) {
      existing.count = Math.min(MAX_STACK, existing.count + 1);
      return;
    }

    const emptyIndex = this.slots.findIndex((s) => !s);
    if (emptyIndex !== -1) {
      this.slots[emptyIndex] = { blockId, count: 1 };
    }
  },
};
