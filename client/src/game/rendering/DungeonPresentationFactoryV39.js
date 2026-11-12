/**
 * Babylon presentation helpers for Dungeon production pass V3.9.
 * Gameplay collision, HP and deterministic state remain owned by DungeonScene.
 */
export const DUNGEON_PRESENTATION_FACTORY_VERSION = 'dungeon-presentation-factory-v3.9.0';

const sceneCaches = new WeakMap();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const color = (BABYLON, hex) => BABYLON.Color3.FromHexString(hex);

function cacheFor(scene) {
  let cache = sceneCaches.get(scene);
  if (!cache) {
    cache = new Map();
    sceneCaches.set(scene, cache);
    scene.onDisposeObservable?.addOnce?.(() => {
      for (const material of cache.values()) material?.dispose?.();
      cache.clear();
      sceneCaches.delete(scene);
    });
  }
  return cache;
}

function material(scene, BABYLON, id, {
  diffuse = '#111827', emissive = '#000000', alpha = 1, disableLighting = false,
} = {}) {
  const cache = cacheFor(scene);
  if (cache.has(id)) return cache.get(id);
  const mat = new BABYLON.StandardMaterial(`dungeon-v39:${id}`, scene);
  mat.diffuseColor = color(BABYLON, diffuse);
  mat.emissiveColor = color(BABYLON, emissive);
  mat.alpha = alpha;
  mat.disableLighting = disableLighting;
  mat.backFaceCulling = false;
  if (alpha < 1 && BABYLON.Material?.MATERIAL_ALPHABLEND !== undefined) {
    mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
  }
  cache.set(id, mat);
  return mat;
}

const setVisualOnly = mesh => {
  if (!mesh) return mesh;
  mesh.isPickable = false;
  mesh.checkCollisions = false;
  mesh.metadata = { ...(mesh.metadata || {}), visualOnly: true, dungeonPresentationVersion: DUNGEON_PRESENTATION_FACTORY_VERSION };
  return mesh;
};

/** A readable mechanical fallback used only while/if the atlas or GLB is unavailable. */
export function createDungeonBossFallbackV39({ scene, BABYLON, root, style = 'rust_driller' } = {}) {
  if (!scene || !BABYLON || !root) return null;
  const steel = material(scene, BABYLON, `${style}:steel`, { diffuse: '#2a3438', emissive: '#07100f' });
  const rust = material(scene, BABYLON, `${style}:rust`, { diffuse: '#7a3921', emissive: '#1b0702' });
  const glow = material(scene, BABYLON, `${style}:glow`, { diffuse: '#ff8a32', emissive: '#ff6b21', disableLighting: true });
  const dark = material(scene, BABYLON, `${style}:dark`, { diffuse: '#11191b', emissive: '#020606' });

  const hull = setVisualOnly(BABYLON.MeshBuilder.CreateCylinder(`${style}:hull`, {
    height: .72, diameter: 3.35, tessellation: 16,
  }, scene));
  hull.parent = root;
  hull.position.y = .10;
  hull.material = steel;

  const ring = setVisualOnly(BABYLON.MeshBuilder.CreateTorus(`${style}:ring`, {
    diameter: 4.55, thickness: .28, tessellation: 48,
  }, scene));
  ring.parent = root;
  ring.position.y = .18;
  ring.rotation.x = Math.PI / 2;
  ring.material = rust;

  const drill = setVisualOnly(BABYLON.MeshBuilder.CreateCylinder(`${style}:drill`, {
    height: 2.65, diameterTop: .12, diameterBottom: 1.18, tessellation: 14,
  }, scene));
  drill.parent = root;
  drill.position.set(0, .14, 2.10);
  drill.rotation.x = Math.PI / 2;
  drill.material = rust;

  const core = setVisualOnly(BABYLON.MeshBuilder.CreateSphere(`${style}:core`, {
    diameter: 1.05, segments: 16,
  }, scene));
  core.parent = root;
  core.position.y = .55;
  core.material = glow;

  const arms = [];
  for (const side of [-1, 1]) {
    const arm = setVisualOnly(BABYLON.MeshBuilder.CreateBox(`${style}:arm:${side}`, {
      width: 1.55, height: .30, depth: .62,
    }, scene));
    arm.parent = root;
    arm.position.set(side * 1.80, .05, -.12);
    arm.rotation.y = side * .18;
    arm.material = dark;
    arms.push(arm);

    const pod = setVisualOnly(BABYLON.MeshBuilder.CreateCylinder(`${style}:pod:${side}`, {
      height: .82, diameter: .70, tessellation: 12,
    }, scene));
    pod.parent = root;
    pod.position.set(side * 2.45, .05, -.12);
    pod.rotation.z = Math.PI / 2;
    pod.material = rust;
    arms.push(pod);
  }

  const thrusters = [];
  for (const side of [-.75, .75]) {
    const thruster = setVisualOnly(BABYLON.MeshBuilder.CreateCylinder(`${style}:thruster:${side}`, {
      height: .72, diameterTop: .28, diameterBottom: .46, tessellation: 10,
    }, scene));
    thruster.parent = root;
    thruster.position.set(side, .08, -1.78);
    thruster.rotation.x = Math.PI / 2;
    thruster.material = glow;
    thrusters.push(thruster);
  }

  let elapsed = 0;
  return {
    meshes: [hull, ring, drill, core, ...arms, ...thrusters],
    tick(deltaMs = 0, state = 'move') {
      elapsed += Math.max(0, Number(deltaMs) || 0);
      ring.rotation.y += .00034 * Math.max(0, Number(deltaMs) || 0);
      drill.rotation.y -= .00055 * Math.max(0, Number(deltaMs) || 0);
      const pulse = 1 + (state === 'enrage' ? .16 : .07) * Math.sin(elapsed * .012);
      core.scaling.setAll(pulse);
    },
    dispose() {
      [hull, ring, drill, core, ...arms, ...thrusters].forEach(mesh => mesh?.dispose?.());
    },
  };
}

export function createDungeonBreakableVisualV39({
  scene, BABYLON, name = 'ore-cache', position, style = 'ore_pod', scale = 1,
} = {}) {
  const safeScale = clamp(Number(scale) || 1, .65, 1.45);
  const dimensions = style === 'salvage_core'
    ? { width: 2.35, height: .82, depth: 2.10 }
    : style === 'power_cell' || style === 'shield_relay'
      ? { width: 1.65, height: .78, depth: 1.55 }
      : style === 'rift_anchor'
        ? { width: 1.95, height: 1.05, depth: 1.95 }
        : { width: 2.15, height: .62, depth: 1.75 };
  const root = BABYLON.MeshBuilder.CreateBox(`${name}:collider`, dimensions, scene);
  root.position.copyFrom(position);
  root.visibility = .02;
  root.isPickable = false;
  root.scaling.setAll(safeScale);
  root.metadata = { ...(root.metadata || {}), breakableStyle: style, visualOnlyCollider: true };

  const frameMat = material(scene, BABYLON, `${style}:frame`, { diffuse: '#27302d', emissive: '#06100d' });
  const darkMat = material(scene, BABYLON, `${style}:dark`, { diffuse: '#111918', emissive: '#020706' });
  const oreMat = material(scene, BABYLON, `${style}:ore`, { diffuse: '#80713d', emissive: '#3b3108' });
  const glowHex = style === 'shield_relay' ? '#55d9ff' : style === 'rift_anchor' ? '#ff476f' : '#ffd166';
  const glowMat = material(scene, BABYLON, `${style}:glow`, { diffuse: glowHex, emissive: glowHex, disableLighting: true });
  const damageParts = [];
  const glowParts = [];

  if (style === 'salvage_core') {
    const body = setVisualOnly(BABYLON.MeshBuilder.CreateCylinder(`${name}:body`, {
      height: .72, diameter: 1.75, tessellation: 14,
    }, scene));
    body.parent = root;
    body.position.y = .08;
    body.material = frameMat;
    damageParts.push(body);

    const ring = setVisualOnly(BABYLON.MeshBuilder.CreateTorus(`${name}:ring`, {
      diameter: 2.15, thickness: .18, tessellation: 32,
    }, scene));
    ring.parent = root;
    ring.position.y = .18;
    ring.rotation.x = Math.PI / 2;
    ring.material = oreMat;
    damageParts.push(ring);

    const core = setVisualOnly(BABYLON.MeshBuilder.CreateSphere(`${name}:core`, { diameter: .72, segments: 12 }, scene));
    core.parent = root;
    core.position.y = .42;
    core.material = glowMat;
    glowParts.push(core);

    for (const side of [-1, 1]) {
      const brace = setVisualOnly(BABYLON.MeshBuilder.CreateBox(`${name}:brace:${side}`, {
        width: .38, height: .35, depth: 1.85,
      }, scene));
      brace.parent = root;
      brace.position.x = side * .92;
      brace.material = darkMat;
      damageParts.push(brace);
    }
  } else if (style === 'power_cell' || style === 'shield_relay') {
    const body = setVisualOnly(BABYLON.MeshBuilder.CreateCylinder(`${name}:cell`, {
      height: 1.25, diameter: .88, tessellation: 12,
    }, scene));
    body.parent = root;
    body.position.y = .05;
    body.rotation.z = Math.PI / 2;
    body.material = frameMat;
    damageParts.push(body);

    for (const side of [-1, 1]) {
      const cap = setVisualOnly(BABYLON.MeshBuilder.CreateCylinder(`${name}:cap:${side}`, {
        height: .18, diameter: 1.08, tessellation: 12,
      }, scene));
      cap.parent = root;
      cap.position.x = side * .68;
      cap.rotation.z = Math.PI / 2;
      cap.material = darkMat;
      damageParts.push(cap);
    }

    const core = setVisualOnly(BABYLON.MeshBuilder.CreateCylinder(`${name}:energy`, {
      height: .82, diameter: .46, tessellation: 12,
    }, scene));
    core.parent = root;
    core.rotation.z = Math.PI / 2;
    core.material = glowMat;
    glowParts.push(core);
  } else if (style === 'rift_anchor') {
    const spine = setVisualOnly(BABYLON.MeshBuilder.CreatePolyhedron(`${name}:spine`, {
      type: 1, size: .88,
    }, scene));
    spine.parent = root;
    spine.position.y = .22;
    spine.material = darkMat;
    damageParts.push(spine);

    const ring = setVisualOnly(BABYLON.MeshBuilder.CreateTorus(`${name}:rift-ring`, {
      diameter: 1.75, thickness: .16, tessellation: 36,
    }, scene));
    ring.parent = root;
    ring.position.y = .26;
    ring.rotation.x = Math.PI / 2;
    ring.material = glowMat;
    glowParts.push(ring);

    for (let index = 0; index < 3; index += 1) {
      const shard = setVisualOnly(BABYLON.MeshBuilder.CreateBox(`${name}:anchor:${index}`, {
        width: .24, height: .36, depth: 1.25,
      }, scene));
      shard.parent = root;
      shard.rotation.y = index * (Math.PI * 2 / 3);
      shard.position.y = .05;
      shard.material = frameMat;
      damageParts.push(shard);
    }
  } else {
    const frame = setVisualOnly(BABYLON.MeshBuilder.CreateBox(`${name}:frame`, { width: 2.0, height: .50, depth: 1.62 }, scene));
    frame.parent = root;
    frame.material = frameMat;
    damageParts.push(frame);

    for (const side of [-1, 1]) {
      const band = setVisualOnly(BABYLON.MeshBuilder.CreateBox(`${name}:band:${side}`, { width: .18, height: .62, depth: 1.76 }, scene));
      band.parent = root;
      band.position.x = side * .58;
      band.material = glowMat;
      glowParts.push(band);
    }

    for (let index = 0; index < 4; index += 1) {
      const shard = setVisualOnly(BABYLON.MeshBuilder.CreatePolyhedron(`${name}:ore:${index}`, {
        type: 1, size: .38 + (index % 2) * .10,
      }, scene));
      shard.parent = root;
      shard.position.set(-.62 + index * .42, .43, (index % 2 ? .22 : -.18));
      shard.rotation.y = index * .63;
      shard.material = index === 1 ? glowMat : oreMat;
      (index === 1 ? glowParts : damageParts).push(shard);
    }
  }

  return {
    mesh: root,
    style,
    setRatio(ratio = 1) {
      const safe = clamp(Number(ratio) || 0, 0, 1);
      const damage = 1 - safe;
      damageParts.forEach((part, index) => {
        part.visibility = safe <= .20 && index % 2 ? .34 : safe <= .45 && index % 3 === 1 ? .68 : 1;
        part.scaling.y = .78 + safe * .22;
      });
      glowParts.forEach((part, index) => {
        const pulse = 1 + damage * (.18 + index * .03);
        part.scaling.setAll(pulse);
        part.visibility = .62 + damage * .38;
      });
      root.rotation.z = damage * .06;
    },
    dispose() { root.dispose(); },
  };
}

export function createDungeonHazardVisualV39({ scene, BABYLON, name = 'drifting-scrap', position, variant = 0 } = {}) {
  const root = BABYLON.MeshBuilder.CreateSphere(`${name}:collider`, { diameter: 1.65 + (variant % 3) * .18, segments: 6 }, scene);
  root.position.copyFrom(position);
  root.visibility = .02;
  root.isPickable = false;

  const scrapMat = material(scene, BABYLON, 'drifting-scrap:metal', { diffuse: '#4b3b32', emissive: '#120805' });
  const rustMat = material(scene, BABYLON, 'drifting-scrap:rust', { diffuse: '#8b4427', emissive: '#241006' });
  const warningMat = material(scene, BABYLON, 'drifting-scrap:warning', { diffuse: '#ff9a3d', emissive: '#ff6b21', disableLighting: true });

  const chunk = setVisualOnly(BABYLON.MeshBuilder.CreatePolyhedron(`${name}:chunk`, {
    type: variant % 2 === 0 ? 1 : 2,
    size: .78 + (variant % 3) * .12,
  }, scene));
  chunk.parent = root;
  chunk.material = scrapMat;

  const strut = setVisualOnly(BABYLON.MeshBuilder.CreateBox(`${name}:strut`, {
    width: 1.75, height: .16, depth: .24,
  }, scene));
  strut.parent = root;
  strut.rotation.y = .48 + variant * .31;
  strut.material = rustMat;

  const beacon = setVisualOnly(BABYLON.MeshBuilder.CreateSphere(`${name}:beacon`, {
    diameter: .22, segments: 8,
  }, scene));
  beacon.parent = root;
  beacon.position.set(.40, .35, -.18);
  beacon.material = warningMat;

  return {
    mesh: root,
    setRatio(ratio = 1) {
      const safe = clamp(Number(ratio) || 0, 0, 1);
      const impact = 1 - safe;
      chunk.scaling.setAll(.88 + safe * .12);
      strut.visibility = safe <= .30 ? .36 : safe <= .60 ? .68 : 1;
      beacon.scaling.setAll(1 + impact * .52);
      beacon.visibility = .55 + impact * .45;
      root.rotation.z += impact * .018;
    },
    dispose: () => root.dispose(),
  };
}

export function createDungeonHazardTelegraphV39({
  scene, BABYLON, name = 'hazard-warning', x = 0, z = -8, width = 1.5,
  depth = 8, colorHex = '#ff8a32',
} = {}) {
  const mat = material(scene, BABYLON, `hazard-warning:${colorHex}`, {
    diffuse: colorHex, emissive: colorHex, alpha: .22, disableLighting: true,
  });
  const corridor = BABYLON.MeshBuilder.CreateBox(name, { width: 1, height: .025, depth: 1 }, scene);
  corridor.position.set(x, .035, z);
  corridor.scaling.set(width, 1, depth);
  corridor.material = mat;
  corridor.isPickable = false;

  const marker = BABYLON.MeshBuilder.CreateTorus(`${name}:marker`, {
    diameter: Math.max(.9, width * .75), thickness: .10, tessellation: 28,
  }, scene);
  marker.position.set(x, .055, z + depth * .42);
  marker.rotation.x = Math.PI / 2;
  marker.material = mat;
  marker.isPickable = false;

  return {
    mesh: corridor,
    marker,
    update(nowMs = 0) {
      const pulse = .40 + .28 * (1 + Math.sin(Number(nowMs) * .025)) * .5;
      corridor.visibility = pulse;
      marker.visibility = Math.min(1, pulse + .22);
      marker.scaling.setAll(1 + .12 * Math.sin(Number(nowMs) * .020));
    },
    dispose() { corridor.dispose(); marker.dispose(); },
  };
}

/** Decorative background only; no collision and no gameplay state. */
export function createDungeonBackdropV39({
  scene, BABYLON, arenaHalfWidth = 8, worldHalfHeight = 15,
  count = 12, scrollSpeed = .014,
} = {}) {
  const matA = material(scene, BABYLON, 'backdrop:scrap-a', { diffuse: '#102622', emissive: '#02100d' });
  const matB = material(scene, BABYLON, 'backdrop:scrap-b', { diffuse: '#19312c', emissive: '#03120f' });
  const items = [];
  for (let index = 0; index < Math.max(0, Math.trunc(count)); index += 1) {
    const mesh = setVisualOnly(BABYLON.MeshBuilder.CreatePolyhedron(`dungeon-backdrop:${index}`, {
      type: index % 2 === 0 ? 1 : 2,
      size: .35 + (index % 4) * .15,
    }, scene));
    const lane = ((index * 37) % 101) / 100;
    const depth = ((index * 61) % 103) / 102;
    mesh.position.set((lane * 2 - 1) * arenaHalfWidth * .94, -.42, (depth * 2 - 1) * worldHalfHeight);
    mesh.rotation.y = index * .47;
    mesh.material = index % 3 ? matA : matB;
    mesh.visibility = .42 + (index % 3) * .08;
    items.push(mesh);
  }
  return {
    tick(frameScale = 1) {
      for (let index = 0; index < items.length; index += 1) {
        const mesh = items[index];
        mesh.position.z += scrollSpeed * (1 + (index % 3) * .22) * frameScale;
        mesh.rotation.y += .0022 * frameScale * (index % 2 ? 1 : -1);
        if (mesh.position.z > worldHalfHeight + 1.5) mesh.position.z = -worldHalfHeight - 1.5;
      }
    },
    dispose() { items.forEach(mesh => mesh.dispose()); },
  };
}
