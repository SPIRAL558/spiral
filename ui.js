/**
 * ui.js
 * ---------------------------------------------------------------------------
 * All 2D HUD rendering and interaction: hotbar slots, health hearts, hunger
 * bar, debug panel (FPS/coords/facing), pause menu, death screen, and the
 * mobile on-screen touch controls (dual virtual joysticks + action buttons).
 * ---------------------------------------------------------------------------
 */

const UI = {
  els: {},
  fpsFrames: 0,
  fpsLastTime: 0,
  fpsValue: 0,

  isMobile: false,
  isPaused: false,

  init() {
    this.els = {
      hud: document.getElementById("mc-hud"),
      fps: document.getElementById("mc-fps"),
      coords: document.getElementById("mc-coords"),
      facing: document.getElementById("mc-facing"),
      hearts: document.getElementById("mc-hearts"),
      hunger: document.getElementById("mc-hunger"),
      hotbar: document.getElementById("mc-hotbar"),
      pauseMenu: document.getElementById("mc-pause-menu"),
      pauseBtn: document.getElementById("mc-pause-btn"),
      deathScreen: document.getElementById("mc-death-screen"),
      touchControls: document.getElementById("mc-touch-controls"),
      blockTooltip: document.getElementById("mc-block-tooltip"),
      crosshair: document.querySelector(".mc-crosshair"),
    };

    this.isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 820;

    this.buildHotbar();
    this.buildHearts();
    this.buildHungerIcons();

    if (this.isMobile) {
      this.els.touchControls.classList.remove("mc-hidden");
      this.setupTouchControls();
    }
  },

  showHud() {
    this.els.hud.classList.remove("mc-hidden");
  },

  hideHud() {
    this.els.hud.classList.add("mc-hidden");
  },

  // -------------------------------------------------------------------------
  // Hotbar
  // -------------------------------------------------------------------------

  buildHotbar() {
    this.els.hotbar.innerHTML = "";
    for (let i = 0; i < 9; i++) {
      const slotEl = document.createElement("div");
      slotEl.className = "mc-hotbar-slot";
      slotEl.dataset.index = i;

      const keyLabel = document.createElement("div");
      keyLabel.className = "mc-hotbar-key";
      keyLabel.textContent = i === 8 ? "9" : String(i + 1);

      const iconWrap = document.createElement("div");
      iconWrap.className = "mc-hotbar-icon";

      const countLabel = document.createElement("div");
      countLabel.className = "mc-hotbar-count";

      slotEl.appendChild(iconWrap);
      slotEl.appendChild(countLabel);
      slotEl.appendChild(keyLabel);
      slotEl.addEventListener("click", () => Inventory.select(i));
      this.els.hotbar.appendChild(slotEl);
    }
    this.refreshHotbar();
  },

  refreshHotbar() {
    const slotEls = this.els.hotbar.querySelectorAll(".mc-hotbar-slot");
    slotEls.forEach((slotEl, i) => {
      const slot = Inventory.slots[i];
      const iconWrap = slotEl.querySelector(".mc-hotbar-icon");
      const countLabel = slotEl.querySelector(".mc-hotbar-count");
      if (slot) {
        iconWrap.style.backgroundImage = `url(${generateBlockIcon(slot.blockId)})`;
        iconWrap.style.display = "block";
        countLabel.textContent = slot.count;
        countLabel.style.display = "block";
      } else {
        iconWrap.style.backgroundImage = "";
        iconWrap.style.display = "none";
        countLabel.style.display = "none";
      }
      slotEl.classList.toggle("selected", i === Inventory.selectedIndex);
    });
  },

  // -------------------------------------------------------------------------
  // Hearts / hunger
  // -------------------------------------------------------------------------

  buildHearts() {
    this.els.hearts.innerHTML = "";
    for (let i = 0; i < 10; i++) {
      const heart = document.createElement("span");
      heart.className = "mc-heart";
      heart.textContent = "❤";
      this.els.hearts.appendChild(heart);
    }
  },

  buildHungerIcons() {
    this.els.hunger.innerHTML = "";
    for (let i = 0; i < 10; i++) {
      const icon = document.createElement("span");
      icon.className = "mc-hunger-icon";
      icon.textContent = "🍗";
      this.els.hunger.appendChild(icon);
    }
  },

  refreshStatusBars() {
    const heartEls = this.els.hearts.querySelectorAll(".mc-heart");
    const healthPoints = Player.health; // 0-20, 2 per heart
    heartEls.forEach((el, i) => {
      const heartValue = (i + 1) * 2;
      if (healthPoints >= heartValue) {
        el.classList.remove("mc-empty", "mc-half");
      } else if (healthPoints >= heartValue - 1) {
        el.classList.add("mc-half");
        el.classList.remove("mc-empty");
      } else {
        el.classList.add("mc-empty");
        el.classList.remove("mc-half");
      }
    });

    const hungerEls = this.els.hunger.querySelectorAll(".mc-hunger-icon");
    const hungerPoints = Player.hunger;
    hungerEls.forEach((el, i) => {
      const value = (i + 1) * 2;
      el.classList.toggle("mc-empty", hungerPoints < value - 1);
    });
  },

  // -------------------------------------------------------------------------
  // Debug panel (FPS / coords / facing)
  // -------------------------------------------------------------------------

  tickFps(now) {
    this.fpsFrames++;
    if (now - this.fpsLastTime >= 500) {
      this.fpsValue = Math.round((this.fpsFrames * 1000) / (now - this.fpsLastTime));
      this.fpsFrames = 0;
      this.fpsLastTime = now;
      this.els.fps.textContent = `FPS: ${this.fpsValue}`;
    }
  },

  refreshDebugPanel() {
    const p = Player.position;
    this.els.coords.textContent = `X: ${p.x.toFixed(1)}  Y: ${p.y.toFixed(1)}  Z: ${p.z.toFixed(1)}`;
    this.els.facing.textContent = `Facing: ${Player.getFacingDirection()}`;
  },

  // -------------------------------------------------------------------------
  // Pause / death screens
  // -------------------------------------------------------------------------

  showPauseMenu() {
    this.els.pauseMenu.classList.remove("mc-hidden");
    this.isPaused = true;
  },

  hidePauseMenu() {
    this.els.pauseMenu.classList.add("mc-hidden");
    this.isPaused = false;
  },

  showDeathScreen() {
    this.els.deathScreen.classList.remove("mc-hidden");
  },

  hideDeathScreen() {
    this.els.deathScreen.classList.add("mc-hidden");
  },

  showBlockTooltip(name) {
    this.els.blockTooltip.textContent = name;
    this.els.blockTooltip.classList.remove("mc-hidden");
    clearTimeout(this._tooltipTimeout);
    this._tooltipTimeout = setTimeout(() => {
      this.els.blockTooltip.classList.add("mc-hidden");
    }, 1200);
  },

  /**
   * Quick crosshair "punch" animation for block-break feedback. Removing
   * and re-adding the class (via a reflow) lets the animation restart
   * cleanly on rapid repeated breaks instead of only playing once.
   */
  punchCrosshair() {
    const el = this.els.crosshair;
    if (!el) return;
    el.classList.remove("mc-crosshair-hit");
    void el.offsetWidth; // force reflow so the animation can restart
    el.classList.add("mc-crosshair-hit");
  },

  /**
   * Drives the mining/breaking progress animation on the crosshair: grows
   * and reddens it smoothly from 0 (just started) to 1 (block breaks),
   * giving clear visual feedback during the short hold-to-mine delay.
   */
  setMiningProgress(progress) {
    const el = this.els.crosshair;
    if (!el) return;
    if (progress <= 0) {
      el.classList.remove("mc-crosshair-mining");
      el.style.removeProperty("--mine-progress");
      return;
    }
    el.classList.add("mc-crosshair-mining");
    el.style.setProperty("--mine-progress", progress.toFixed(3));
  },

  // -------------------------------------------------------------------------
  // Mobile touch controls: a D-pad for movement (front/back/left/right),
  // a free-drag look zone, and square action buttons for jump/break/place.
  // -------------------------------------------------------------------------

  setupTouchControls() {
    // D-pad movement buttons: each is a simple press-and-hold toggle. Using
    // touchstart/touchend/touchcancel on every button (the old code only
    // handled touchstart, which left buttons "stuck on" if a finger slid
    // off without a clean release).
    this.setupHoldButton("mc-move-forward", (down) => { Player.touchDir.forward = down; });
    this.setupHoldButton("mc-move-back", (down) => { Player.touchDir.back = down; });
    this.setupHoldButton("mc-move-left", (down) => { Player.touchDir.left = down; });
    this.setupHoldButton("mc-move-right", (down) => { Player.touchDir.right = down; });

    // Look zone: Bedrock-style free drag area — the touch origin becomes
    // wherever the finger first lands, rather than a fixed joystick base.
    this.setupLookZone(
      document.getElementById("mc-joystick-look"),
      (x, y) => { Player.touchLook.x = x; Player.touchLook.y = y; },
      () => { Player.touchLook.x = 0; Player.touchLook.y = 0; }
    );

    // Jump: held down triggers repeated jumps while grounded (matches how
    // Bedrock's jump button behaves when held over multiple blocks).
    this.setupHoldButton("mc-touch-jump", (down) => { Player.touchJumpHeld = down; });

    // Break: hold-to-mine, same as mouse — press starts mining (with a
    // short animated delay before the block actually breaks), release
    // cancels it if not finished yet.
    this.setupHoldButton("mc-touch-break", (down) => {
      window.dispatchEvent(new CustomEvent(down ? "mc-touch-break-start" : "mc-touch-break-end"));
    });
    // Place: fires immediately on press so a single tap places right away,
    // then repeats while held so dragging across multiple blocks keeps
    // placing continuously.
    this.setupHoldButton("mc-touch-place", (down) => {
      this._placeHeld = down;
      if (down) window.dispatchEvent(new CustomEvent("mc-touch-place"));
    });

    this._actionRepeatTimer = setInterval(() => {
      if (this._placeHeld) window.dispatchEvent(new CustomEvent("mc-touch-place"));
    }, 350);

    const invBtn = document.getElementById("mc-touch-inventory");
    if (invBtn) {
      invBtn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        // Cycles the hotbar selection as a lightweight stand-in "inventory" tap
        Inventory.scrollSelect(1);
        this.refreshHotbar();
      }, { passive: false });
    }
  },

  /**
   * Wires a button for press-and-hold behavior with reliable release
   * detection: touchend AND touchcancel both clear the pressed state (a
   * finger sliding off the button, an interrupting system gesture, etc.
   * all count as "released"), and the pressed CSS state is toggled so the
   * button visually reflects whether it's currently held.
   */
  setupHoldButton(id, onChange) {
    const el = document.getElementById(id);
    if (!el) return;

    const press = (e) => {
      e.preventDefault();
      el.classList.add("mc-btn-pressed");
      onChange(true);
    };
    const release = (e) => {
      e.preventDefault();
      el.classList.remove("mc-btn-pressed");
      onChange(false);
    };

    el.addEventListener("touchstart", press, { passive: false });
    el.addEventListener("touchend", release, { passive: false });
    el.addEventListener("touchcancel", release, { passive: false });
  },

  /**
   * A free-drag look zone (as opposed to a fixed joystick): wherever the
   * finger first touches down becomes the drag origin, and movement away
   * from that point drives camera rotation — this matches how Bedrock
   * Edition's touch camera control behaves (no visible base ring).
   */
  setupLookZone(zone, onMove, onEnd) {
    let active = false;
    let originX = 0, originY = 0;
    const maxDist = 60;
    let activeTouchId = null;

    const start = (touch) => {
      active = true;
      activeTouchId = touch.identifier;
      originX = touch.clientX;
      originY = touch.clientY;
    };

    const move = (touch) => {
      if (!active) return;
      let dx = touch.clientX - originX;
      let dy = touch.clientY - originY;
      const dist = Math.hypot(dx, dy);
      if (dist > maxDist) {
        dx = (dx / dist) * maxDist;
        dy = (dy / dist) * maxDist;
      }
      onMove(dx / maxDist, dy / maxDist);
      resetWatchdog();
    };

    // Watchdog: if we stop receiving touchmove for this finger (e.g. the
    // OS swallows the release event at the screen edge) we force a reset
    // shortly after, instead of letting rotation continue indefinitely.
    let watchdogTimer = null;
    const resetWatchdog = () => {
      clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(() => { if (active) end(); }, 400);
    };

    const end = () => {
      active = false;
      activeTouchId = null;
      clearTimeout(watchdogTimer);
      onEnd();
    };

    zone.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (active) return;
      start(e.changedTouches[0]);
    }, { passive: false });

    zone.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === activeTouchId) move(t);
      }
    }, { passive: false });

    zone.addEventListener("touchend", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === activeTouchId) end();
      }
    }, { passive: false });

    zone.addEventListener("touchcancel", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === activeTouchId) end();
      }
    }, { passive: false });

    // Safety net: if the finger slides off the look zone (or off the
    // screen entirely) before lifting, the zone's own touchend/touchcancel
    // never fires and the last rotation value gets stuck forever, which
    // looks like the camera spinning in an endless loop. Listening on the
    // whole document guarantees we still see the release and reset to 0.
    document.addEventListener("touchend", (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === activeTouchId) end();
      }
    }, { passive: true });

    document.addEventListener("touchcancel", (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === activeTouchId) end();
      }
    }, { passive: true });
  },

};
