/**
 * minecraft.js
 * ---------------------------------------------------------------------------
 * Main entry point. Sets up the Three.js scene, camera, renderer, lighting
 * (with a day/night cycle), fog, and the block-placement preview outline.
 * Wires together World, Player, Inventory, and UI, and drives the render
 * loop with a fixed-ish timestep for stable physics.
 * ---------------------------------------------------------------------------
 */

(function () {
  let scene, camera, renderer;
  let sunLight, ambientLight, hemiLight;
  let clock;
  let previewMesh;
  let raycastTargetBlock = null;
  let gameStarted = false;
  let dayTime = 0.28; // 0..1 fraction of a full day/night cycle, start mid-morning
  const DAY_LENGTH_SECONDS = 240; // one full day/night cycle
  let mouseSensitivity = 0.0040;
  const TOUCH_LOOK_SENSITIVITY = 2.6; // radians/sec at full joystick deflection

  const canvas = document.getElementById("mc-canvas");

  // ---------------------------------------------------------------------
  // Boot sequence
  // ---------------------------------------------------------------------

  function boot() {
    updateLoaderProgress(10, "Preparing renderer…");

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.05,
      500
    );

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    updateLoaderProgress(25, "Generating world…");
    setTimeout(() => {
      World.generate();

      updateLoaderProgress(55, "Painting textures…");
      const textures = generateTextures();
      World.buildMaterials(textures);

      updateLoaderProgress(75, "Building terrain mesh…");
      World.buildMesh(scene);
      if (World.decorations) scene.add(World.decorations);
      World.spawnSpiralNpc(scene);

      updateLoaderProgress(88, "Placing player…");
      setupLighting();
      setupSky();
      setupFog();
      setupPreviewOutline();

      Player.init(camera);
      Inventory.init();
      UI.init();

      window.addEventListener("resize", onWindowResize);
      setupInput();

      updateLoaderProgress(100, "Ready!");
      setTimeout(() => {
        document.getElementById("mc-loader").classList.add("mc-hidden");
        document.getElementById("mc-start-screen").classList.remove("mc-hidden");

        // Hide desktop-only control legend on touch devices
        if (UI.isMobile) {
          document.getElementById("mc-start-controls-desktop").style.display = "none";
        }
      }, 250);

      clock = new THREE.Clock();
      requestAnimationFrame(animate);
    }, 50);
  }

  function updateLoaderProgress(pct, statusText) {
    document.getElementById("mc-loader-fill").style.width = pct + "%";
    document.getElementById("mc-loader-status").textContent = statusText;
  }

  // ---------------------------------------------------------------------
  // Lighting, sky, fog
  // ---------------------------------------------------------------------

  function setupLighting() {
    hemiLight = new THREE.HemisphereLight(0x8fc7ff, 0x4a3a2a, 0.55);
    scene.add(hemiLight);

    ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
    scene.add(ambientLight);

    sunLight = new THREE.DirectionalLight(0xfff2d6, 1.0);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    const shadowSize = 65;
    sunLight.shadow.camera.left = -shadowSize;
    sunLight.shadow.camera.right = shadowSize;
    sunLight.shadow.camera.top = shadowSize;
    sunLight.shadow.camera.bottom = -shadowSize;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 120;
    sunLight.shadow.bias = -0.0015;
    scene.add(sunLight);
    scene.add(sunLight.target);
  }

  function setupSky() {
    scene.background = new THREE.Color(0x7ec8f0);
  }

  function setupFog() {
    scene.fog = new THREE.Fog(0x7ec8f0, 35, 110);
  }

  /**
   * Advances the day/night cycle: moves the sun across the sky, retints the
   * sky/fog color, and adjusts light intensity for dawn/day/dusk/night.
   */
  function updateDayNightCycle(dt) {
    dayTime += dt / DAY_LENGTH_SECONDS;
    if (dayTime > 1) dayTime -= 1;

    const angle = dayTime * Math.PI * 2;
    const sunHeight = Math.sin(angle);
    const sunX = Math.cos(angle) * 60;
    const sunY = sunHeight * 60;
    const sunZ = 20;

    sunLight.position.set(
      camera.position.x + sunX,
      Math.max(sunY, -10),
      camera.position.z + sunZ
    );
    sunLight.target.position.copy(camera.position);

    // Brightness curve: full daylight when sun is high, dim at night
    const dayFactor = Math.max(0, sunHeight);
    const nightFloor = 0.08;
    const intensity = nightFloor + dayFactor * 0.95;
    sunLight.intensity = intensity;
    hemiLight.intensity = 0.25 + dayFactor * 0.4;
    ambientLight.intensity = 0.12 + dayFactor * 0.2;

    // Sky color: blend day-blue -> sunset-orange -> night-navy
    const dayColor = new THREE.Color(0x7ec8f0);
    const sunsetColor = new THREE.Color(0xff9a56);
    const nightColor = new THREE.Color(0x0a0f1f);

    let skyColor;
    if (sunHeight > 0.15) {
      skyColor = dayColor;
    } else if (sunHeight > -0.15) {
      const t = (sunHeight + 0.15) / 0.3; // 0 at horizon-down, 1 at horizon-up
      skyColor = sunsetColor.clone().lerp(dayColor, Math.max(0, t));
      if (t < 0.5) skyColor = nightColor.clone().lerp(sunsetColor, t * 2);
    } else {
      skyColor = nightColor;
    }

    scene.background = skyColor;
    scene.fog.color = skyColor;
  }

  // ---------------------------------------------------------------------
  // Block placement preview outline (wireframe box on the targeted block)
  // ---------------------------------------------------------------------

  function setupPreviewOutline() {
    const geo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2, transparent: true, opacity: 0.6 });
    previewMesh = new THREE.LineSegments(edges, mat);
    previewMesh.visible = false;
    scene.add(previewMesh);
  }

  // ---------------------------------------------------------------------
  // Input handling
  // ---------------------------------------------------------------------

  function setupInput() {
    document.addEventListener("keydown", (e) => {
      Player.keys[e.code] = true;

      if (e.code === "ShiftLeft" || e.code === "ShiftRight") Player.sprinting = true;

      if (e.code >= "Digit1" && e.code <= "Digit9") {
        const idx = parseInt(e.code.replace("Digit", ""), 10) - 1;
        Inventory.select(idx);
        UI.refreshHotbar();
      }

      if (e.code === "Escape") {
        if (gameStarted) togglePause();
      }
    });

    document.addEventListener("keyup", (e) => {
      Player.keys[e.code] = false;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") Player.sprinting = false;
    });

    document.addEventListener("wheel", (e) => {
      if (!gameStarted || UI.isPaused) return;
      Inventory.scrollSelect(e.deltaY > 0 ? 1 : -1);
      UI.refreshHotbar();
    });

    canvas.addEventListener("mousedown", (e) => {
      if (!gameStarted || UI.isPaused) return;
      if (document.pointerLockElement !== canvas) return;
      if (e.button === 0) startMining();
      if (e.button === 2) placeBlock();
    });

    document.addEventListener("mouseup", (e) => {
      if (e.button === 0) stopMining();
    });

    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    document.addEventListener("mousemove", (e) => {
      if (!gameStarted || UI.isPaused) return;
      if (document.pointerLockElement !== canvas) return;
      Player.handleMouseMove(e.movementX, e.movementY, mouseSensitivity);
    });

    // Touch look: use the right-side joystick to rotate the camera
    window.addEventListener("mc-touch-break-start", () => { if (gameStarted && !UI.isPaused) startMining(); });
    window.addEventListener("mc-touch-break-end", () => stopMining());
    window.addEventListener("mc-touch-place", () => { if (gameStarted && !UI.isPaused) placeBlock(); });

    // Start screen button
    document.getElementById("mc-start-btn").addEventListener("click", startGame);

    // Pause menu buttons
    document.getElementById("mc-pause-btn").addEventListener("click", togglePause);
    document.getElementById("mc-resume-btn").addEventListener("click", togglePause);
    document.getElementById("mc-fullscreen-btn").addEventListener("click", toggleFullscreen);

    document.getElementById("mc-respawn-btn").addEventListener("click", () => {
      Player.respawn();
      UI.hideDeathScreen();
    });

    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement !== canvas && gameStarted && !UI.isPaused && !Player.isDead) {
        // Pointer lock lost unexpectedly (e.g. user pressed Esc) -> pause
        togglePause();
      }
    });
  }

  function startGame() {
    document.getElementById("mc-start-screen").classList.add("mc-hidden");
    UI.showHud();
    gameStarted = true;

    // Go fullscreen so the game fills the whole screen like the native app
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.documentElement.webkitRequestFullscreen) {
      document.documentElement.webkitRequestFullscreen();
    }

    if (!UI.isMobile) {
      canvas.requestPointerLock();
    }
  }

  function togglePause() {
    if (UI.isPaused) {
      UI.hidePauseMenu();
      if (!UI.isMobile) canvas.requestPointerLock();
    } else {
      UI.showPauseMenu();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ---------------------------------------------------------------------
  // Block breaking / placing
  // ---------------------------------------------------------------------

  function getLookRaycast() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    return World.raycastBlock(camera.position, dir, Player.reachDistance);
  }

  const MINE_DURATION = 350; // ms to hold before a block breaks

  let miningActive = false;
  let miningStartTime = 0;
  let miningTargetKey = null; // "x,y,z" of the block currently being mined

  function startMining() {
    if (miningActive) return;
    const result = getLookRaycast();
    if (!result.hit || result.blockId === BLOCK.BEDROCK) return;
    miningActive = true;
    miningStartTime = performance.now();
    miningTargetKey = `${result.block.x},${result.block.y},${result.block.z}`;
    UI.setMiningProgress(0);
  }

  function stopMining() {
    miningActive = false;
    miningTargetKey = null;
    UI.setMiningProgress(0);
  }

  /** Called every frame while a mine is in progress: tracks hold time and
   *  cancels if the player looks away from the original target block. */
  function updateMining() {
    if (!miningActive) return;

    const result = getLookRaycast();
    const currentKey = result.hit ? `${result.block.x},${result.block.y},${result.block.z}` : null;
    if (currentKey !== miningTargetKey) {
      stopMining();
      return;
    }

    const elapsed = performance.now() - miningStartTime;
    const progress = Math.min(1, elapsed / MINE_DURATION);
    UI.setMiningProgress(progress);

    if (progress >= 1) {
      completeBreak(result);
      stopMining();
    }
  }

  function completeBreak(result) {
    const { x, y, z } = result.block;
    if (result.blockId === BLOCK.BEDROCK) return; // indestructible world floor

    Inventory.onBlockBroken(result.blockId);
    World.setBlock(x, y, z, BLOCK.AIR);
    World.refreshMesh(scene);
    UI.refreshHotbar();
    UI.showBlockTooltip(`Broke ${getBlockName(result.blockId)}`);
    UI.punchCrosshair();
  }

  function placeBlock() {
    const result = getLookRaycast();
    if (!result.hit || !result.place) return;
    if (!Inventory.hasSelectedBlock()) return;

    const { x, y, z } = result.place;

    // Don't let the player place a block directly inside themselves
    const feet = Player.position;
    const overlapsPlayer =
      x === Math.floor(feet.x) &&
      z === Math.floor(feet.z) &&
      (y === Math.floor(feet.y) || y === Math.floor(feet.y + 1));
    if (overlapsPlayer) return;

    const blockId = Inventory.getSelectedBlock();
    World.setBlock(x, y, z, blockId);
    World.refreshMesh(scene);
    Inventory.onBlockPlaced();
    UI.refreshHotbar();
    UI.showBlockTooltip(`Placed ${getBlockName(blockId)}`);
  }

  function updatePreviewOutline() {
    const result = getLookRaycast();
    if (result.hit) {
      previewMesh.visible = true;
      previewMesh.position.set(result.block.x + 0.5, result.block.y + 0.5, result.block.z + 0.5);
    } else {
      previewMesh.visible = false;
    }
  }

  // ---------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------

  function animate(now) {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.1); // clamp to avoid huge steps on tab-switch

    UI.tickFps(now);

    if (gameStarted && !UI.isPaused && !Player.isDead) {
      // Apply touch-look joystick as continuous rotation input, scaled by
      // frame time so it feels the same regardless of framerate, with its
      // own tuned sensitivity (separate from mouse) and a mild response
      // curve so small nudges are precise and full deflection turns fast.
      if (Player.touchLook.x !== 0 || Player.touchLook.y !== 0) {
        const lx = Player.touchLook.x;
        const ly = Player.touchLook.y;
        const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.6);
        Player.yaw -= curve(lx) * TOUCH_LOOK_SENSITIVITY * dt;
        Player.pitch -= curve(ly) * TOUCH_LOOK_SENSITIVITY * dt;
        const maxPitch = Math.PI / 2 - 0.01;
        Player.pitch = Math.max(-maxPitch, Math.min(maxPitch, Player.pitch));
      }

      Player.update(dt);
      Player.tickHunger(dt);
      updateDayNightCycle(dt);
      updatePreviewOutline();
      updateMining();
      World.updateSpiralNpc(clock.elapsedTime);

      UI.refreshDebugPanel();
      UI.refreshStatusBars();

      if (Player.isDead) {
        UI.showDeathScreen();
        if (document.pointerLockElement === canvas) document.exitPointerLock();
      }
    } else {
      stopMining();
    }

    renderer.render(scene, camera);
  }

  // Kick everything off once the DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
