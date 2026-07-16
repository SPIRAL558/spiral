/**
 * world.js
 * ---------------------------------------------------------------------------
 * Procedural voxel world generation + meshing.
 *
 * The world is a single flat 3D grid (small enough not to need chunking)
 * sized WORLD_SIZE x WORLD_HEIGHT x WORLD_SIZE. Terrain is generated with a
 * simple layered value-noise heightmap (no external noise library, hand
 * rolled below), producing hills, a lake with sand shoreline, and trees.
 *
 * The world exposes:
 *   World.getBlock(x, y, z)
 *   World.setBlock(x, y, z, blockId)
 *   World.buildMesh(scene)       -> (re)builds the visible mesh from data
 *   World.raycastBlock(origin, dir, maxDist) -> hit info for break/place
 * ---------------------------------------------------------------------------
 */

const WORLD_SIZE = 224;     // width/depth of the world in blocks
const WORLD_HEIGHT = 40;    // vertical build limit
const WATER_LEVEL = 11;     // y-level of the lake surface
const SEA_LEVEL_BASE = 10;  // baseline ground height before hills

const World = {
  size: WORLD_SIZE,
  height: WORLD_HEIGHT,
  data: null,           // Uint8Array, index = x + z*size + y*size*size
  meshGroup: null,      // THREE.Group holding all block meshes
  textures: null,
  materials: null,      // per-texture-key THREE.Material cache
  spiralNpcMesh: null,  // small easter-egg NPC mesh

  index(x, y, z) {
    return x + z * this.size + y * this.size * this.size;
  },

  inBounds(x, y, z) {
    return x >= 0 && x < this.size && y >= 0 && y < this.height && z >= 0 && z < this.size;
  },

  getBlock(x, y, z) {
    if (!this.inBounds(x, y, z)) return BLOCK.AIR;
    return this.data[this.index(x, y, z)];
  },

  setBlock(x, y, z, id) {
    if (!this.inBounds(x, y, z)) return;
    this.data[this.index(x, y, z)] = id;
  },

  // -------------------------------------------------------------------------
  // Terrain generation
  // -------------------------------------------------------------------------

  /**
   * Tiny hand-rolled 2D value-noise function (no external deps). Smooths a
   * pseudo-random lattice with bilinear interpolation, then layers a couple
   * of octaves for gentle rolling hills.
   */
  makeHeightNoise(seed) {
    const rand = makeSeededRandom(seed);
    const latticeSize = 12;
    const lattice = [];
    for (let i = 0; i < latticeSize * latticeSize; i++) lattice.push(rand());

    function latticeVal(ix, iz) {
      const wrappedX = ((ix % latticeSize) + latticeSize) % latticeSize;
      const wrappedZ = ((iz % latticeSize) + latticeSize) % latticeSize;
      return lattice[wrappedX + wrappedZ * latticeSize];
    }

    function smooth(t) {
      return t * t * (3 - 2 * t);
    }

    return function noise2D(x, z, scale) {
      const sx = x / scale;
      const sz = z / scale;
      const ix = Math.floor(sx);
      const iz = Math.floor(sz);
      const fx = smooth(sx - ix);
      const fz = smooth(sz - iz);

      const v00 = latticeVal(ix, iz);
      const v10 = latticeVal(ix + 1, iz);
      const v01 = latticeVal(ix, iz + 1);
      const v11 = latticeVal(ix + 1, iz + 1);

      const top = v00 + (v10 - v00) * fx;
      const bottom = v01 + (v11 - v01) * fx;
      return top + (bottom - top) * fz;
    };
  },

  generate() {
    this.data = new Uint8Array(this.size * this.height * this.size);

    const noiseA = this.makeHeightNoise(1337);
    const noiseB = this.makeHeightNoise(4242);

    // Lake basin: a circular low area near one side of the map
    const lakeCenterX = this.size * 0.32;
    const lakeCenterZ = this.size * 0.62;
    const lakeRadius = this.size * 0.16;

    const heightMap = [];

    for (let x = 0; x < this.size; x++) {
      heightMap[x] = [];
      for (let z = 0; z < this.size; z++) {
        // Layered noise for rolling hills
        let h = 0;
        h += noiseA(x, z, 14) * 5;
        h += noiseB(x, z, 6) * 2.2;
        let height = Math.round(SEA_LEVEL_BASE + h);

        // Carve the lake basin down
        const dLake = Math.sqrt((x - lakeCenterX) ** 2 + (z - lakeCenterZ) ** 2);
        if (dLake < lakeRadius) {
          const t = 1 - dLake / lakeRadius;
          height -= Math.round(t * 6);
        }

        height = Math.max(2, Math.min(this.height - 4, height));
        heightMap[x][z] = height;
      }
    }

    // Fill terrain columns
    for (let x = 0; x < this.size; x++) {
      for (let z = 0; z < this.size; z++) {
        const surfaceY = heightMap[x][z];

        for (let y = 0; y <= surfaceY; y++) {
          let block;
          if (y === 0) {
            block = BLOCK.BEDROCK;
          } else if (y < surfaceY - 3) {
            block = BLOCK.STONE;
          } else if (y < surfaceY) {
            block = BLOCK.DIRT;
          } else {
            // Top layer: sand near/under water, grass otherwise
            block = surfaceY <= WATER_LEVEL ? BLOCK.SAND : BLOCK.GRASS;
          }
          this.setBlock(x, y, z, block);
        }

        // Fill water on top of any column whose surface is below water level
        if (surfaceY < WATER_LEVEL) {
          for (let y = surfaceY + 1; y <= WATER_LEVEL; y++) {
            this.setBlock(x, y, z, BLOCK.WATER);
          }
        }
      }
    }

    // Reserve a village footprint away from the lake, roughly centered
    const villageCenterX = Math.floor(this.size * 0.68);
    const villageCenterZ = Math.floor(this.size * 0.34);
    const villageRadius = this.size * 0.16;

    // Scatter trees on grass, away from the water's edge and the village
    const treeRand = makeSeededRandom(777);
    for (let x = 3; x < this.size - 3; x++) {
      for (let z = 3; z < this.size - 3; z++) {
        const surfaceY = heightMap[x][z];
        const topBlock = this.getBlock(x, surfaceY, z);
        if (topBlock !== BLOCK.GRASS) continue;

        const dVillage = Math.hypot(x - villageCenterX, z - villageCenterZ);
        if (dVillage < villageRadius + 4) continue; // keep village clear of trees

        if (treeRand() < 0.018) {
          const dark = treeRand() > 0.6;
          this.placeTree(x, surfaceY + 1, z, treeRand, dark);
        }
      }
    }

    this.heightMap = heightMap;

    // Build the village structures on cleared, flattened ground
    this.buildVillage(villageCenterX, villageCenterZ, villageRadius, heightMap);

    // Scatter decorative detail (flowers, tall grass, small rocks) — these
    // are lightweight instanced meshes layered on top of the voxel terrain,
    // not voxel blocks themselves, to keep the mesher simple and fast.
    this.decorations = this.scatterDetail(heightMap, villageCenterX, villageCenterZ, villageRadius);
  },

  placeTree(x, y, z, rand, dark) {
    const trunkHeight = 4 + Math.floor(rand() * 2);
    for (let i = 0; i < trunkHeight; i++) {
      this.setBlock(x, y + i, z, BLOCK.WOOD);
    }
    // Simple round leaf canopy
    const leafType = dark ? BLOCK.LEAVES_DARK : BLOCK.LEAVES;
    const topY = y + trunkHeight;
    for (let lx = -2; lx <= 2; lx++) {
      for (let lz = -2; lz <= 2; lz++) {
        for (let ly = -2; ly <= 1; ly++) {
          const dist = Math.sqrt(lx * lx + lz * lz + (ly < 0 ? ly * 0.6 : ly) ** 2);
          if (dist <= 2.3) {
            const bx = x + lx, by = topY + ly, bz = z + lz;
            if (this.getBlock(bx, by, bz) === BLOCK.AIR) {
              this.setBlock(bx, by, bz, leafType);
            }
          }
        }
      }
    }
  },

  /**
   * Flattens a patch of ground near the village center and places a small
   * varied hamlet: differently-sized houses with windows and peaked roofs,
   * a well at the crossroads, a fenced farm patch, and lampposts lining
   * the paths — enough visual variety to not read as four identical boxes.
   */
  buildVillage(cx, cz, radius, heightMap) {
    const rand = makeSeededRandom(2024);

    // Flatten the footprint to the average local height so buildings sit flush
    let avgH = 0, count = 0;
    for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
      for (let z = Math.floor(cz - radius); z <= cz + radius; z++) {
        if (x < 1 || z < 1 || x >= this.size - 1 || z >= this.size - 1) continue;
        avgH += heightMap[x][z];
        count++;
      }
    }
    const groundY = Math.round(avgH / count);

    for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
      for (let z = Math.floor(cz - radius); z <= cz + radius; z++) {
        if (x < 1 || z < 1 || x >= this.size - 1 || z >= this.size - 1) continue;
        const d = Math.hypot(x - cx, z - cz);
        if (d > radius) continue;

        const currentH = heightMap[x][z];
        if (currentH === groundY) continue;

        if (currentH > groundY) {
          for (let y = groundY + 1; y <= currentH; y++) this.setBlock(x, y, z, BLOCK.AIR);
        } else {
          for (let y = currentH + 1; y <= groundY; y++) this.setBlock(x, y, z, BLOCK.DIRT);
        }
        this.setBlock(x, groundY, z, BLOCK.GRASS);
        heightMap[x][z] = groundY;
      }
    }

    // Lay a cobblestone crossroad path
    for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
      if (Math.hypot(x - cx, 0) > radius) continue;
      this.setBlock(x, groundY, cz, BLOCK.COBBLESTONE);
    }
    for (let z = Math.floor(cz - radius); z <= cz + radius; z++) {
      if (Math.hypot(0, z - cz) > radius) continue;
      this.setBlock(cx, groundY, z, BLOCK.COBBLESTONE);
    }

    // A well at the crossroads center — a small ring of cobblestone with
    // a water pool in the middle, breaking up the flat path visually.
    this.placeWell(cx, groundY, cz);

    // Houses of varied footprint/height around the crossroads, each with
    // its own random size/door-facing so no two look identical.
    const housePlans = [
      { x: cx - 9, z: cz - 9, w: 5, d: 5, h: 4 },
      { x: cx + 6, z: cz - 10, w: 6, d: 4, h: 5 },
      { x: cx - 10, z: cz + 6, w: 4, d: 6, h: 4 },
      { x: cx + 7, z: cz + 7, w: 6, d: 6, h: 5 },
    ];
    for (const plan of housePlans) {
      this.placeHouse(plan.x, groundY + 1, plan.z, plan.w, plan.d, plan.h, rand);
      // Lamppost near each house's front corner
      this.placeLamppost(plan.x - 1, groundY + 1, plan.z - 1);
    }

    // A small fenced farm patch off to one side of the village
    this.placeFarm(cx + 2, groundY, cz - radius + 3, rand);

    this.villageCenter = { x: cx, y: groundY + 1, z: cz };
  },

  /**
   * Builds one house with varied dimensions, a doorway, small window
   * openings on the side walls, and a proper peaked (gable) roof instead
   * of a flat cobblestone cap.
   */
  placeHouse(x, y, z, w, d, h, rand) {
    const facingDoorOnX = rand() > 0.5;
    const doorMidD = Math.floor(d / 2);
    const doorMidW = Math.floor(w / 2);

    for (let ix = 0; ix < w; ix++) {
      for (let iz = 0; iz < d; iz++) {
        for (let iy = 0; iy < h; iy++) {
          const bx = x + ix, by = y + iy, bz = z + iz;
          const isWall = ix === 0 || ix === w - 1 || iz === 0 || iz === d - 1;
          const isFloor = iy === 0;

          if (isFloor) {
            this.setBlock(bx, by, bz, BLOCK.PLANK);
            continue;
          }
          if (!isWall) continue;

          // Doorway: a 2-high gap centered on the front wall
          const isDoorway = facingDoorOnX
            ? (iz === 0 && ix === doorMidW && iy <= 1)
            : (ix === 0 && iz === doorMidD && iy <= 1);
          if (isDoorway) {
            this.setBlock(bx, by, bz, BLOCK.AIR);
            continue;
          }

          // Window: a single gap at head height on the side walls (not the
          // door wall), skipped near corners so the frame reads clearly.
          const isSideWall = facingDoorOnX ? (ix === 0 || ix === w - 1) : (iz === 0 || iz === d - 1);
          const midAxis = facingDoorOnX ? iz : ix;
          const axisLen = facingDoorOnX ? d : w;
          const isWindow = isSideWall && iy === 2 && midAxis === Math.floor(axisLen / 2) && axisLen > 3;
          if (isWindow) {
            this.setBlock(bx, by, bz, BLOCK.AIR);
            continue;
          }

          const isCorner = (ix === 0 || ix === w - 1) && (iz === 0 || iz === d - 1);
          this.setBlock(bx, by, bz, (isCorner || iy === 1) ? BLOCK.COBBLESTONE : BLOCK.PLANK);
        }
      }
    }

    this.placeGableRoof(x, y + h, z, w, d, rand);
  },

  /**
   * A proper peaked (gable) roof: each row steps up toward the ridge line
   * instead of a single flat cap, which is what made every house read as
   * a plain box before.
   */
  placeGableRoof(x, roofBaseY, z, w, d, rand) {
    const alongX = w >= d; // ridge runs along the longer axis
    const span = alongX ? d : w;
    const length = alongX ? w : d;
    const peakHeight = Math.ceil(span / 2);

    for (let s = 0; s < span; s++) {
      const distFromEdge = Math.min(s, span - 1 - s);
      const rowHeight = Math.min(distFromEdge, peakHeight - 1);
      for (let l = -1; l <= length; l++) {
        for (let level = 0; level <= rowHeight; level++) {
          const bx = alongX ? x + l : x + s;
          const bz = alongX ? z + s : z + l;
          const by = roofBaseY + level;
          if (l === -1 || l === length) {
            // Eave overhang: only the bottom roof row extends past the wall
            if (level !== 0) continue;
          }
          this.setBlock(bx, by, bz, BLOCK.COBBLESTONE);
        }
      }
    }
  },

  /** A small circular well: cobblestone ring around a 1-block water pool. */
  placeWell(x, y, z) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bx = x + 2 + dx, bz = z + 2 + dz;
        if (dx === 0 && dz === 0) {
          this.setBlock(bx, y, bz, BLOCK.WATER);
        } else {
          this.setBlock(bx, y, bz, BLOCK.COBBLESTONE);
          this.setBlock(bx, y + 1, bz, dx === 0 || dz === 0 ? BLOCK.AIR : BLOCK.COBBLESTONE);
        }
      }
    }
  },

  /** A simple wood-post lamppost (no light source, purely a landmark prop). */
  placeLamppost(x, y, z) {
    for (let i = 0; i < 3; i++) this.setBlock(x, y + i, z, BLOCK.WOOD);
    this.setBlock(x, y + 3, z, BLOCK.LEAVES); // lantern-ish cap, distinct silhouette
  },

  /** A small fenced (cobblestone-bordered) farm patch of dirt rows. */
  placeFarm(x, y, z, rand) {
    const w = 5, d = 4;
    for (let ix = -1; ix <= w; ix++) {
      for (let iz = -1; iz <= d; iz++) {
        const bx = x + ix, bz = z + iz;
        const isBorder = ix === -1 || ix === w || iz === -1 || iz === d;
        if (isBorder) {
          this.setBlock(bx, y + 1, bz, BLOCK.COBBLESTONE);
        } else {
          this.setBlock(bx, y, bz, BLOCK.DIRT);
        }
      }
    }
  },

  /**
   * Scatters small decorative sprite meshes (flowers, tall grass tufts,
   * pebbles) across grass tiles outside the village footprint. Returns a
   * THREE.Group the caller can add to the scene.
   */
  scatterDetail(heightMap, villageCX, villageCZ, villageRadius) {
    const group = new THREE.Group();
    group.name = "worldDetail";
    const rand = makeSeededRandom(5150);

    const flowerColors = [0xE5484D, 0xF5C64B, 0xF5C64B, 0xE5484D];
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x5a9e3d, side: THREE.DoubleSide });

    for (let x = 2; x < this.size - 2; x++) {
      for (let z = 2; z < this.size - 2; z++) {
        const surfaceY = heightMap[x][z];
        if (this.getBlock(x, surfaceY, z) !== BLOCK.GRASS) continue;
        if (this.getBlock(x, surfaceY + 1, z) !== BLOCK.AIR) continue;

        const dVillage = Math.hypot(x - villageCX, z - villageCZ);
        if (dVillage < villageRadius + 2) continue;

        const roll = rand();
        if (roll < 0.025) {
          // Flower: two crossed planes
          const color = flowerColors[Math.floor(rand() * flowerColors.length)];
          const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
          const flower = this._makeCrossSprite(0.5, 0.5, mat);
          flower.position.set(x + 0.5, surfaceY + 1.25, z + 0.5);
          group.add(flower);
        } else if (roll < 0.07) {
          // Tall grass tuft
          const tuft = this._makeCrossSprite(0.6, 0.55, grassMat);
          tuft.position.set(x + 0.5, surfaceY + 1.2, z + 0.5);
          group.add(tuft);
        } else if (roll < 0.078) {
          // Small pebble/rock cluster
          const rockMat = new THREE.MeshLambertMaterial({ color: 0x8a8a8e });
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + rand() * 0.1), rockMat);
          rock.position.set(x + 0.5, surfaceY + 1.1, z + 0.5);
          rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
          rock.castShadow = true;
          group.add(rock);
        }
      }
    }

    return group;
  },

  /** Two intersecting vertical planes — the classic Minecraft "cross" sprite look. */
  _makeCrossSprite(width, height, material) {
    const geo = new THREE.PlaneGeometry(width, height);
    const p1 = new THREE.Mesh(geo, material);
    const p2 = new THREE.Mesh(geo, material);
    p2.rotation.y = Math.PI / 2;
    const group = new THREE.Group();
    group.add(p1, p2);
    return group;
  },

  /** Finds a safe spawn point on top of the terrain near the map center. */
  findSpawnPoint() {
    const cx = Math.floor(this.size / 2);
    const cz = Math.floor(this.size / 2);
    for (let r = 0; r < this.size / 2; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const x = cx + dx, z = cz + dz;
          if (x < 0 || z < 0 || x >= this.size || z >= this.size) continue;
          const h = this.heightMap[x][z];
          if (this.getBlock(x, h, z) === BLOCK.GRASS) {
            return { x: x + 0.5, y: h + 1.6, z: z + 0.5 };
          }
        }
      }
    }
    return { x: cx + 0.5, y: SEA_LEVEL_BASE + 3, z: cz + 0.5 };
  },

  // -------------------------------------------------------------------------
  // Meshing — greedy-ish per-face culling (only render faces touching air
  // or transparent neighbors), grouped by texture to keep draw calls low.
  // -------------------------------------------------------------------------

  buildMaterials(textures) {
    this.textures = textures;
    this.materials = {};
    for (const key in textures) {
      this.materials[key] = new THREE.MeshLambertMaterial({
        map: textures[key],
        transparent: key === "water" || key === "leaves",
        opacity: key === "water" ? 0.75 : 1,
        alphaTest: key === "leaves" ? 0.1 : 0,
        side: key === "water" ? THREE.DoubleSide : THREE.FrontSide,
      });
    }
  },

  /**
   * Rebuilds the full world mesh. For a world of this size this is cheap
   * enough to redo entirely whenever a block changes (simplicity over
   * micro-optimized partial rebuilds), while still hitting 60fps targets
   * because of face culling + merged geometry per texture.
   */
  buildMesh(scene) {
    if (this.meshGroup) {
      scene.remove(this.meshGroup);
      this.meshGroup.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
    }

    this.meshGroup = new THREE.Group();
    this.meshGroup.name = "worldMesh";

    // Bucket geometry data per texture key so we can merge into one
    // BufferGeometry per material (huge draw-call savings).
    const buckets = {}; // textureKey -> { positions:[], normals:[], uvs:[], indices:[] }

    function getBucket(key) {
      if (!buckets[key]) {
        buckets[key] = { positions: [], normals: [], uvs: [], indices: [], vertCount: 0 };
      }
      return buckets[key];
    }

    const FACES = [
      { dir: [1, 0, 0], corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], normal: [1,0,0], side: "side" },
      { dir: [-1, 0, 0], corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], normal: [-1,0,0], side: "side" },
      { dir: [0, 1, 0], corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]], normal: [0,1,0], side: "top" },
      { dir: [0, -1, 0], corners: [[0,0,1],[0,0,0],[1,0,0],[1,0,1]], normal: [0,-1,0], side: "bottom" },
      { dir: [0, 0, 1], corners: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]], normal: [0,0,1], side: "side" },
      { dir: [0, 0, -1], corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]], normal: [0,0,-1], side: "side" },
    ];

    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.height; y++) {
        for (let z = 0; z < this.size; z++) {
          const id = this.getBlock(x, y, z);
          if (id === BLOCK.AIR) continue;

          const data = BLOCK_DATA[id];
          if (!data.faces) continue;

          for (const face of FACES) {
            const nx = x + face.dir[0];
            const ny = y + face.dir[1];
            const nz = z + face.dir[2];
            const neighbor = this.getBlock(nx, ny, nz);

            // Skip face if neighbor is same solid opaque type (simple culling).
            // Render if neighbor is air, or if neighbor is transparent and
            // different from current block (e.g. water surface vs air).
            const neighborData = BLOCK_DATA[neighbor];
            const hideFace =
              neighbor !== BLOCK.AIR &&
              !neighborData.transparent &&
              true;
            if (hideFace) continue;
            if (neighbor === id && neighborData.transparent) continue; // e.g. water-water

            const texKey = data.faces[face.side];
            const bucket = getBucket(texKey);
            const startIndex = bucket.vertCount;

            for (const corner of face.corners) {
              bucket.positions.push(x + corner[0], y + corner[1], z + corner[2]);
              bucket.normals.push(face.normal[0], face.normal[1], face.normal[2]);
            }
            bucket.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
            bucket.indices.push(
              startIndex, startIndex + 1, startIndex + 2,
              startIndex, startIndex + 2, startIndex + 3
            );
            bucket.vertCount += 4;
          }
        }
      }
    }

    for (const texKey in buckets) {
      const bucket = buckets[texKey];
      if (bucket.positions.length === 0) continue;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(bucket.positions, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(bucket.normals, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(bucket.uvs, 2));
      geometry.setIndex(bucket.indices);

      const material = this.materials[texKey] || this.materials.stone;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = texKey !== "water" && texKey !== "leaves";
      mesh.receiveShadow = true;
      mesh.name = "blocks_" + texKey;
      this.meshGroup.add(mesh);
    }

    scene.add(this.meshGroup);
  },

  /** Rebuilds mesh (call after any setBlock change to reflect it visually). */
  refreshMesh(scene) {
    this.buildMesh(scene);
  },

  // -------------------------------------------------------------------------
  // Raycasting against the voxel grid (DDA-style step) for block break/place
  // -------------------------------------------------------------------------

  raycastBlock(origin, direction, maxDistance) {
    const step = 0.05;
    const pos = origin.clone();
    const dir = direction.clone().normalize();
    let lastEmpty = null;

    for (let t = 0; t < maxDistance; t += step) {
      const checkPos = pos.clone().add(dir.clone().multiplyScalar(t));
      const bx = Math.floor(checkPos.x);
      const by = Math.floor(checkPos.y);
      const bz = Math.floor(checkPos.z);
      const block = this.getBlock(bx, by, bz);

      if (block !== BLOCK.AIR && block !== BLOCK.WATER) {
        return {
          hit: true,
          block: { x: bx, y: by, z: bz },
          place: lastEmpty,
          blockId: block,
        };
      }
      lastEmpty = { x: bx, y: by, z: bz };
    }
    return { hit: false };
  },

  // -------------------------------------------------------------------------
  // Small "SPIRAL" easter-egg NPC — a simple blocky humanoid standing near
  // spawn, purely decorative, not interactive.
  // -------------------------------------------------------------------------

  spawnSpiralNpc(scene) {
    const group = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: 0xd8a878 });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x5865f2 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2b2f3a });

    const bodyGroup = new THREE.Group(); // everything except the nametag bobs together

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
    head.position.y = 1.55;
    head.name = "npcHead";
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.3), shirt);
    body.position.y = 1.0;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.22), pants);
    legL.position.set(-0.12, 0.375, 0);
    legL.name = "npcLegL";
    const legR = legL.clone();
    legR.position.x = 0.12;
    legR.name = "npcLegR";
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), shirt);
    armL.position.set(-0.35, 1.0, 0);
    armL.name = "npcArmL";
    const armR = armL.clone();
    armR.position.x = 0.35;
    armR.name = "npcArmR";

    bodyGroup.add(head, body, legL, legR, armL, armR);
    bodyGroup.traverse((obj) => { if (obj.isMesh) { obj.castShadow = true; } });
    group.add(bodyGroup);

    // Floating name tag: rendered via a canvas sprite so it always faces
    // the camera and reads crisply at any distance, like a Minecraft
    // player nametag.
    const nameSprite = this._makeNameTagSprite("SPIR4L7733");
    nameSprite.position.y = 2.15;
    group.add(nameSprite);

    const spawn = this.findSpawnPoint();
    const npcSpot = this.findNearbyGroundTile(Math.floor(spawn.x), Math.floor(spawn.z), 6);
    group.position.set(npcSpot.x + 0.5, npcSpot.y + 1, npcSpot.z + 0.5);
    group.name = "spiralNpc";
    group.userData.bodyGroup = bodyGroup;
    group.userData.armL = armL;
    group.userData.armR = armR;
    group.userData.legL = legL;
    group.userData.legR = legR;
    group.userData.head = head;
    group.userData.baseY = group.position.y;
    scene.add(group);
    this.spiralNpcMesh = group;
    return group;
  },

  /**
   * Searches outward in a ring from (startX, startZ) for a tile that is
   * actually safe to stand on: solid grass underneath, and clear air for
   * two blocks above (so the NPC never spawns underground, inside a tree,
   * or floating over water/a cliff edge).
   */
  findNearbyGroundTile(startX, startZ, maxRadius) {
    for (let r = 1; r <= maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // ring only
          const x = startX + dx, z = startZ + dz;
          if (x < 1 || z < 1 || x >= this.size - 1 || z >= this.size - 1) continue;
          const h = this.heightMap[x][z];
          const ground = this.getBlock(x, h, z);
          if (ground !== BLOCK.GRASS) continue;
          if (this.getBlock(x, h + 1, z) !== BLOCK.AIR) continue;
          if (this.getBlock(x, h + 2, z) !== BLOCK.AIR) continue;
          return { x, y: h, z };
        }
      }
    }
    // Fallback: the spawn tile itself (always guaranteed valid by findSpawnPoint)
    const h = this.heightMap[startX][startZ];
    return { x: startX, y: h, z: startZ };
  },

  /** Builds a billboard sprite with the NPC's name rendered on a canvas. */
  _makeNameTagSprite(text) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const fontSize = 48;
    ctx.font = `bold ${fontSize}px 'Segoe UI', sans-serif`;
    const textWidth = ctx.measureText(text).width;

    canvas.width = textWidth + 40;
    canvas.height = fontSize + 24;

    ctx.font = `bold ${fontSize}px 'Segoe UI', sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    // Background pill (semi-transparent, like MC nametags)
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    const r = 12;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(canvas.width, 0, canvas.width, canvas.height, r);
    ctx.arcTo(canvas.width, canvas.height, 0, canvas.height, r);
    ctx.arcTo(0, canvas.height, 0, 0, r);
    ctx.arcTo(0, 0, canvas.width, 0, r);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(mat);
    const scale = 0.0032;
    sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
    sprite.renderOrder = 999;
    return sprite;
  },

  /**
   * Small idle animation for the SPIRAL NPC: gentle vertical bob, subtle
   * swaying arms, and a slow head turn — purely cosmetic, called every frame.
   */
  updateSpiralNpc(elapsed) {
    const npc = this.spiralNpcMesh;
    if (!npc) return;

    const bob = Math.sin(elapsed * 1.6) * 0.05;
    npc.position.y = npc.userData.baseY + bob;

    const swing = Math.sin(elapsed * 1.6) * 0.12;
    if (npc.userData.armL) npc.userData.armL.rotation.x = swing;
    if (npc.userData.armR) npc.userData.armR.rotation.x = -swing;

    const headTurn = Math.sin(elapsed * 0.5) * 0.35;
    if (npc.userData.head) npc.userData.head.rotation.y = headTurn;

    npc.rotation.y = Math.sin(elapsed * 0.15) * 0.4;
  },
};
