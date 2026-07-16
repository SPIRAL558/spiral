/**
 * player.js
 * ---------------------------------------------------------------------------
 * First-person player controller: WASD movement, mouse-look via Pointer
 * Lock, gravity, jumping, and AABB-vs-voxel collision detection against the
 * World grid. Also tracks health/hunger state used by ui.js.
 * ---------------------------------------------------------------------------
 */

const Player = {
  camera: null,

  // Physics body — position is at the FEET (bottom-center of the AABB)
  position: new THREE.Vector3(0, 20, 0),
  velocity: new THREE.Vector3(0, 0, 0),

  width: 0.6,     // AABB horizontal size
  height: 1.8,    // AABB vertical size
  eyeHeight: 1.62,

  onGround: false,
  isFlying: false,
  fallStartY: null,   // y-position where the current fall began (null = not falling)

  yaw: 0,
  pitch: 0,

  moveSpeed: 4.3,
  sprintMultiplier: 1.5,
  jumpSpeed: 7.6,
  gravity: -20,

  keys: {},
  sprinting: false,

  // Touch input state (set by ui.js touch controls)
  touchDir: { forward: false, back: false, left: false, right: false },
  touchLook: { x: 0, y: 0 },
  touchJumpPressed: false,
  touchJumpHeld: false,

  // Stats
  health: 20,      // 10 hearts x 2
  maxHealth: 20,
  hunger: 20,
  maxHunger: 20,
  isDead: false,

  reachDistance: 6,

  init(camera) {
    this.camera = camera;
    const spawn = World.findSpawnPoint();
    this.position.set(spawn.x, spawn.y, spawn.z);
    this.yaw = 0;
    this.pitch = 0;
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;
    this.isDead = false;
    this.velocity.set(0, 0, 0);
    this.fallStartY = null;
  },

  respawn() {
    const spawn = World.findSpawnPoint();
    this.position.set(spawn.x, spawn.y, spawn.z);
    this.velocity.set(0, 0, 0);
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;
    this.isDead = false;
    this.fallStartY = null;
  },

  handleMouseMove(movementX, movementY, sensitivity) {
    this.yaw -= movementX * sensitivity;
    this.pitch -= movementY * sensitivity;
    const maxPitch = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
  },

  getForwardVector() {
    // Flattened to horizontal plane for WASD movement (don't fly by looking up)
    const v = new THREE.Vector3(0, 0, -1);
    v.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    return v;
  },

  getRightVector() {
    const v = new THREE.Vector3(1, 0, 0);
    v.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    return v;
  },

  // -------------------------------------------------------------------------
  // Collision detection: AABB vs voxel grid. We test movement per-axis so
  // the player slides along walls instead of getting fully stopped.
  // -------------------------------------------------------------------------

  collidesAt(pos) {
    const half = this.width / 2;
    const minX = Math.floor(pos.x - half);
    const maxX = Math.floor(pos.x + half);
    const minY = Math.floor(pos.y);
    const maxY = Math.floor(pos.y + this.height);
    const minZ = Math.floor(pos.z - half);
    const maxZ = Math.floor(pos.z + half);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (isSolidBlock(World.getBlock(x, y, z))) return true;
        }
      }
    }
    return false;
  },

  isInWater() {
    const b = World.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y + this.eyeHeight * 0.3),
      Math.floor(this.position.z)
    );
    return b === BLOCK.WATER;
  },

  update(dt) {
    if (this.isDead) return;

    const forward = this.getForwardVector();
    const right = this.getRightVector();

    let moveX = 0, moveZ = 0;

    // Keyboard input
    if (this.keys["KeyW"]) { moveX += forward.x; moveZ += forward.z; }
    if (this.keys["KeyS"]) { moveX -= forward.x; moveZ -= forward.z; }
    if (this.keys["KeyA"]) { moveX -= right.x; moveZ -= right.z; }
    if (this.keys["KeyD"]) { moveX += right.x; moveZ += right.z; }

    // Touch D-pad input (discrete forward/back/left/right buttons)
    if (this.touchDir.forward) { moveX += forward.x; moveZ += forward.z; }
    if (this.touchDir.back) { moveX -= forward.x; moveZ -= forward.z; }
    if (this.touchDir.left) { moveX -= right.x; moveZ -= right.z; }
    if (this.touchDir.right) { moveX += right.x; moveZ += right.z; }

    const len = Math.hypot(moveX, moveZ);
    if (len > 0) { moveX /= len; moveZ /= len; }

    const speed = this.moveSpeed * (this.sprinting ? this.sprintMultiplier : 1);
    const inWater = this.isInWater();
    const effectiveSpeed = inWater ? speed * 0.6 : speed;

    // Horizontal velocity (instant accel/decel for simplicity + responsiveness)
    this.velocity.x = moveX * effectiveSpeed;
    this.velocity.z = moveZ * effectiveSpeed;

    // Ground probe: check a hair below the feet BEFORE applying gravity so
    // walking off a ledge (or down a slope/staircase) is detected the same
    // frame, instead of lagging a frame behind and producing a floaty feel.
    const wasOnGround = this.onGround;
    this.onGround = this.checkGroundContact();

    // Started falling: remember the height we fell from so we can measure
    // the drop distance once we land (checked after this frame's movement
    // is actually applied below, since that's when a landing is detected).
    if (wasOnGround && !this.onGround && this.fallStartY === null) {
      this.fallStartY = this.position.y;
    }

    // Gravity
    if (!this.onGround) {
      this.velocity.y += this.gravity * (inWater ? 0.3 : 1) * dt;
      this.velocity.y = Math.max(this.velocity.y, inWater ? -3 : -30);
    } else if (this.velocity.y < 0) {
      // Standing on solid ground: don't let downward velocity accumulate
      // between frames (this is what caused the "still falling"/floaty
      // sensation when walking down a slope or off a block edge).
      this.velocity.y = 0;
    }

    // Jump
    const wantsJump = this.keys["Space"] || this.touchJumpPressed || this.touchJumpHeld;
    if (wantsJump && (this.onGround || inWater)) {
      this.velocity.y = inWater ? this.jumpSpeed * 0.5 : this.jumpSpeed;
      this.onGround = false;
    }
    this.touchJumpPressed = false;

    // Apply movement per-axis with collision resolution
    this.moveAxis("x", this.velocity.x * dt);
    this.moveAxis("z", this.velocity.z * dt);
    const yBefore = this.position.y;
    this.moveAxis("y", this.velocity.y * dt);

    // Landed: moveAxis("y", ...) is what actually sets onGround=true via
    // collision when moving downward, so this is the correct place to
    // detect a landing and apply fall damage based on how far we dropped.
    // Landing in water avoids damage entirely (matches typical block-game
    // fall-damage behavior).
    if (!wasOnGround && this.onGround && this.fallStartY !== null) {
      const fallDistance = this.fallStartY - yBefore;
      if (!inWater) this.applyFallDamage(fallDistance);
      this.fallStartY = null;
    } else if (this.onGround) {
      this.fallStartY = null;
    }

    // Snap to ground: if we're on ground and there's a small gap between
    // the feet and the surface below (e.g. stepping down a slope), pull
    // the player down onto it instead of leaving them hovering.
    if (this.onGround && this.velocity.y <= 0) {
      this.snapToGround();
    }

    // World bounds safety (in case player somehow leaves the grid)
    const margin = 0.5;
    this.position.x = Math.max(margin, Math.min(World.size - margin, this.position.x));
    this.position.z = Math.max(margin, Math.min(World.size - margin, this.position.z));

    // Fell into the void — respawn
    if (this.position.y < -10) {
      this.takeFallDamage(999);
    }

    // Update camera transform
    this.camera.position.set(
      this.position.x,
      this.position.y + this.eyeHeight,
      this.position.z
    );
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  },

  /** Returns true if there's solid ground directly beneath the player's feet. */
  checkGroundContact() {
    const probe = this.position.clone();
    probe.y -= 0.05; // tiny probe below the feet
    return this.collidesAt(probe);
  },

  /**
   * Pulls the player down onto the surface if there's a small gap below
   * their feet (e.g. after stepping off a block edge onto lower ground,
   * or down a single-block step) — prevents the "floating"/hover feeling
   * on staircases and ledges.
   */
  snapToGround() {
    const maxSnap = 0.6;
    const step = 0.05;
    for (let d = step; d <= maxSnap; d += step) {
      const testPos = this.position.clone();
      testPos.y -= d;
      if (this.collidesAt(testPos)) {
        this.position.y -= (d - step);
        return;
      }
    }
  },

  moveAxis(axis, delta) {
    if (delta === 0) return;
    const testPos = this.position.clone();
    testPos[axis] += delta;

    if (!this.collidesAt(testPos)) {
      this.position[axis] += delta;
      return;
    }

    // Collision on this axis: stop movement, and if it's the Y axis figure
    // out if we landed on ground (moving down) vs hit a ceiling (moving up).
    if (axis === "y") {
      if (delta < 0) {
        this.onGround = true;
      }
      this.velocity.y = 0;
    }
  },

  takeDamage(amount) {
    if (this.isDead) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.isDead = true;
    }
  },

  /**
   * Fall damage curve: no damage under 4 blocks, 1 heart (2 hp) at exactly
   * 4 blocks, 2 hearts (4 hp) at 5 blocks, then +2 hp per additional block
   * fallen beyond that — matches the requested scaling and can still be
   * fatal from a big enough drop.
   */
  applyFallDamage(blocksFallen) {
    if (blocksFallen < 4) return;
    const damage = blocksFallen < 5
      ? 2                                    // 4 blocks -> 1 heart
      : 4 + Math.floor(blocksFallen - 5) * 2; // 5 blocks -> 2 hearts, +1 heart per block after
    this.takeDamage(damage);
  },

  takeFallDamage(amount) {
    this.takeDamage(amount);
    if (this.isDead) return;
    // soft "respawn" reset instead of falling forever
    const spawn = World.findSpawnPoint();
    this.position.set(spawn.x, spawn.y, spawn.z);
    this.velocity.set(0, 0, 0);
  },

  /** Hunger is kept full at all times (drain disabled per game design). */
  tickHunger(dt, elapsedSeconds) {
    if (this.isDead) return;
    this.hunger = this.maxHunger;
  },

  getFacingDirection() {
    const dirs = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"];
    const angle = ((this.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const index = Math.round(angle / (Math.PI / 4)) % 8;
    return dirs[index];
  },
};
