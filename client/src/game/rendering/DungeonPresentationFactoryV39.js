/**
 * Babylon presentation helpers for Dungeon production pass V3.9.
 * Gameplay collision, HP and deterministic state remain owned by DungeonScene.
 */
export const DUNGEON_PRESENTATION_FACTORY_VERSION = 'dungeon-presentation-factory-v3.9.7';

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

function createOracleCoreFallbackV397({ scene, BABYLON, root, style }) {
  const shell = material(scene, BABYLON, `${style}:shell`, { diffuse: '#142f45', emissive: '#04111e' });
  const trim = material(scene, BABYLON, `${style}:trim`, { diffuse: '#286b8d', emissive: '#082b42' });
  const glow = material(scene, BABYLON, `${style}:glow`, {
    diffuse: '#7ee8ff', emissive: '#38bdf8', disableLighting: true,
  });
  const dark = material(scene, BABYLON, `${style}:dark`, { diffuse: '#06131f', emissive: '#01070d' });
  const meshes = [];

  const body = setVisualOnly(BABYLON.MeshBuilder.CreateSphere(`${style}:body`, {
    diameter: 2.75, segments: 20,
  }, scene));
  body.parent = root;
  body.position.y = .18;
  body.scaling.set(1.18, .62, 1.05);
  body.material = shell;
  meshes.push(body);

  const eye = setVisualOnly(BABYLON.MeshBuilder.CreateSphere(`${style}:eye`, {
    diameter: .92, segments: 16,
  }, scene));
  eye.parent = root;
  eye.position.set(0, .48, 1.02);
  eye.scaling.set(1.22, .72, .44);
  eye.material = glow;
  meshes.push(eye);

  const rings = [];
  for (let index = 0; index < 3; index += 1) {
    const ring = setVisualOnly(BABYLON.MeshBuilder.CreateTorus(`${style}:ring:${index}`, {
      diameter: 3.45 + index * .58, thickness: .12 + index * .025, tessellation: 52,
    }, scene));
    ring.parent = root;
    ring.position.y = .20 + index * .05;
    ring.rotation.x = Math.PI / 2 + (index - 1) * .16;
    ring.rotation.z = (index - 1) * .18;
    ring.material = index === 1 ? glow : trim;
    rings.push(ring);
    meshes.push(ring);
  }

  const pylons = [];
  for (let index = 0; index < 4; index += 1) {
    const angle = index * Math.PI / 2;
    const pylon = setVisualOnly(BABYLON.MeshBuilder.CreateBox(`${style}:pylon:${index}`, {
      width: .34, height: .32, depth: 1.38,
    }, scene));
    pylon.parent = root;
    pylon.position.set(Math.sin(angle) * 2.25, .08, Math.cos(angle) * 2.25);
    pylon.rotation.y = angle;
    pylon.material = dark;
    pylons.push(pylon);
    meshes.push(pylon);

    const emitter = setVisualOnly(BABYLON.MeshBuilder.CreateSphere(`${style}:emitter:${index}`, {
      diameter: .34, segments: 10,
    }, scene));
    emitter.parent = root;
    emitter.position.set(Math.sin(angle) * 2.68, .12, Math.cos(angle) * 2.68);
    emitter.material = glow;
    meshes.push(emitter);
  }

  let elapsed = 0;
  return {
    meshes,
    tick(deltaMs = 0, state = 'move') {
      const delta = Math.max(0, Number(deltaMs) || 0);
      elapsed += delta;
      rings.forEach((ring, index) => {
        ring.rotation.y += delta * (.00022 + index * .00010) * (index % 2 ? -1 : 1);
      });
      pylons.forEach((pylon, index) => {
        pylon.position.y = .08 + Math.sin(elapsed * .0022 + index * 1.4) * .10;
      });
      const pulse = 1 + (state === 'enrage' ? .20 : .09) * Math.sin(elapsed * .010);
      eye.scaling.set(1.22 * pulse, .72 * pulse, .44 * pulse);
    },
    dispose() { meshes.forEach(mesh => mesh?.dispose?.()); },
  };
}

function createRiftLeviathanFallbackV397({ scene, BABYLON, root, style }) {
  const carapace = material(scene, BABYLON, `${style}:carapace`, { diffuse: '#35101b', emissive: '#130208' });
  const bone = material(scene, BABYLON, `${style}:bone`, { diffuse: '#6f263b', emissive: '#230510' });
  const dark = material(scene, BABYLON, `${style}:dark`, { diffuse: '#12040a', emissive: '#020103' });
  const glow = material(scene, BABYLON, `${style}:glow`, {
    diffuse: '#ff6b3d', emissive: '#ff1744', disableLighting: true,
  });
  const meshes = [];

  const core = setVisualOnly(BABYLON.MeshBuilder.CreatePolyhedron(`${style}:core`, {
    type: 2, size: 1.45,
  }, scene));
  core.parent = root;
  core.position.y = .18;
  core.scaling.set(1.28, .58, 1.65);
  core.material = carapace;
  meshes.push(core);

  const heart = setVisualOnly(BABYLON.MeshBuilder.CreateSphere(`${style}:heart`, {
    diameter: .78, segments: 14,
  }, scene));
  heart.parent = root;
  heart.position.set(0, .42, .78);
  heart.material = glow;
  meshes.push(heart);

  const ribs = [];
  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index += 1) {
      const rib = setVisualOnly(BABYLON.MeshBuilder.CreateBox(`${style}:rib:${side}:${index}`, {
        width: 1.18 + index * .12, height: .20, depth: .34,
      }, scene));
      rib.parent = root;
      rib.position.set(side * (1.20 + index * .56), .10 - index * .03, .15 - index * .34);
      rib.rotation.y = side * (.30 + index * .13);
      rib.rotation.z = side * (.10 + index * .05);
      rib.material = index === 2 ? dark : bone;
      ribs.push(rib);
      meshes.push(rib);
    }
  }

  const jaws = [];
  for (const side of [-1, 1]) {
    const jaw = setVisualOnly(BABYLON.MeshBuilder.CreateCylinder(`${style}:jaw:${side}`, {
      height: 2.15, diameterTop: .10, diameterBottom: .52, tessellation: 9,
    }, scene));
    jaw.parent = root;
    jaw.position.set(side * .58, .02, 1.92);
    jaw.rotation.x = Math.PI / 2;
    jaw.rotation.z = side * .25;
    jaw.material = bone;
    jaws.push(jaw);
    meshes.push(jaw);
  }

  const halo = setVisualOnly(BABYLON.MeshBuilder.CreateTorus(`${style}:halo`, {
    diameter: 4.75, thickness: .15, tessellation: 52,
  }, scene));
  halo.parent = root;
  halo.position.y = .10;
  halo.rotation.x = Math.PI / 2;
  halo.material = glow;
  meshes.push(halo);

  let elapsed = 0;
  return {
    meshes,
    tick(deltaMs = 0, state = 'move') {
      const delta = Math.max(0, Number(deltaMs) || 0);
      elapsed += delta;
      halo.rotation.y -= delta * .00042;
      ribs.forEach((rib, index) => {
        rib.rotation.z += Math.sin(elapsed * .0024 + index) * .0008 * delta;
      });
      const pulse = 1 + (state === 'enrage' ? .28 : .11) * Math.sin(elapsed * .013);
      heart.scaling.setAll(pulse);
      jaws.forEach((jaw, index) => {
        jaw.rotation.z = (index ? .25 : -.25) * (1 + .18 * Math.sin(elapsed * .004));
      });
    },
    dispose() { meshes.forEach(mesh => mesh?.dispose?.()); },
  };
}

/** A readable mechanical fallback used only while/if the atlas or GLB is unavailable. */
export function createDungeonBossFallbackV39({ scene, BABYLON, root, style = 'rust_driller' } = {}) {
  if (!scene || !BABYLON || !root) return null;
  if (style === 'oracle_core') return createOracleCoreFallbackV397({ scene, BABYLON, root, style });
  if (style === 'rift_leviathan') return createRiftLeviathanFallbackV397({ scene, BABYLON, root, style });
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

export function createDungeonHazardVisualV39({
  scene, BABYLON, name = 'drifting-scrap', position, variant = 0,
  style = 'drifting_scrap',
} = {}) {
  const root = BABYLON.MeshBuilder.CreateSphere(`${name}:collider`, { diameter: 1.65 + (variant % 3) * .18, segments: 6 }, scene);
  root.position.copyFrom(position);
  root.visibility = .02;
  root.isPickable = false;

  if (style === 'ion_current_lanes') {
    const shellMat = material(scene, BABYLON, `${style}:shell`, {
      diffuse: '#12354b', emissive: '#08283b', alpha: .88,
    });
    const glowMat = material(scene, BABYLON, `${style}:glow`, {
      diffuse: '#8aeaff', emissive: '#38bdf8', disableLighting: true,
    });
    const darkMat = material(scene, BABYLON, `${style}:dark`, { diffuse: '#06131f', emissive: '#01070d' });
    const core = setVisualOnly(BABYLON.MeshBuilder.CreateCylinder(`${name}:ion-core`, {
      height: 1.25, diameter: .54, tessellation: 12,
    }, scene));
    core.parent = root;
    core.rotation.x = Math.PI / 2;
    core.material = glowMat;

    const shell = setVisualOnly(BABYLON.MeshBuilder.CreatePolyhedron(`${name}:ion-shell`, {
      type: variant % 2 ? 1 : 2, size: .68,
    }, scene));
    shell.parent = root;
    shell.scaling.set(1.15, .62, 1.28);
    shell.material = shellMat;

    const rings = [0, 1].map(index => {
      const ring = setVisualOnly(BABYLON.MeshBuilder.CreateTorus(`${name}:ion-ring:${index}`, {
        diameter: 1.42 + index * .38, thickness: .10, tessellation: 30,
      }, scene));
      ring.parent = root;
      ring.rotation.x = Math.PI / 2 + (index ? .18 : -.18);
      ring.material = index ? darkMat : glowMat;
      return ring;
    });
    return {
      mesh: root,
      style,
      setRatio(ratio = 1) {
        const safe = clamp(Number(ratio) || 0, 0, 1);
        const impact = 1 - safe;
        shell.visibility = .48 + safe * .52;
        shell.scaling.set(1.15 - impact * .18, .62 - impact * .10, 1.28 - impact * .18);
        rings.forEach((ring, index) => {
          ring.visibility = .55 + safe * .45;
          ring.rotation.y += impact * .045 * (index ? -1 : 1);
        });
        core.scaling.setAll(1 + impact * .30);
      },
      dispose: () => root.dispose(),
    };
  }

  if (style === 'rift_shear_lanes') {
    const shardMat = material(scene, BABYLON, `${style}:shard`, { diffuse: '#4e1528', emissive: '#17030a' });
    const darkMat = material(scene, BABYLON, `${style}:dark`, { diffuse: '#16040b', emissive: '#020103' });
    const glowMat = material(scene, BABYLON, `${style}:glow`, {
      diffuse: '#ff7a45', emissive: '#ff1744', disableLighting: true,
    });
    const shard = setVisualOnly(BABYLON.MeshBuilder.CreatePolyhedron(`${name}:rift-shard`, {
      type: variant % 2 ? 2 : 1, size: .82,
    }, scene));
    shard.parent = root;
    shard.scaling.set(.82, .70, 1.38);
    shard.material = shardMat;

    const halo = setVisualOnly(BABYLON.MeshBuilder.CreateTorus(`${name}:rift-halo`, {
      diameter: 1.78, thickness: .12, tessellation: 32,
    }, scene));
    halo.parent = root;
    halo.rotation.x = Math.PI / 2;
    halo.rotation.z = variant * .22;
    halo.material = glowMat;

    const spines = [];
    for (let index = 0; index < 3; index += 1) {
      const spine = setVisualOnly(BABYLON.MeshBuilder.CreateBox(`${name}:rift-spine:${index}`, {
        width: .16, height: .22, depth: 1.50,
      }, scene));
      spine.parent = root;
      spine.rotation.y = index * Math.PI / 3;
      spine.material = index === 1 ? glowMat : darkMat;
      spines.push(spine);
    }
    return {
      mesh: root,
      style,
      setRatio(ratio = 1) {
        const safe = clamp(Number(ratio) || 0, 0, 1);
        const impact = 1 - safe;
        shard.visibility = .42 + safe * .58;
        shard.rotation.z += impact * .035;
        halo.scaling.setAll(1 + impact * .28);
        halo.visibility = .55 + impact * .45;
        spines.forEach((spine, index) => {
          spine.visibility = safe < .28 && index === 1 ? .28 : 1;
        });
      },
      dispose: () => root.dispose(),
    };
  }

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
    style,
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
  depth = 8, colorHex = '#ff8a32', mode = 'corridor',
} = {}) {
  if (mode === 'none') {
    return { mesh: null, marker: null, update() {}, dispose() {} };
  }
  const mat = material(scene, BABYLON, `hazard-warning:${mode}:${colorHex}`, {
    diffuse: colorHex, emissive: colorHex, alpha: mode === 'edge_pulse' ? .30 : .22, disableLighting: true,
  });

  if (mode === 'edge_pulse') {
    // A compact entry shimmer warns that something is crossing the top edge,
    // but deliberately does not draw the rock's future path through the arena.
    const marker = BABYLON.MeshBuilder.CreateTorus(`${name}:entry`, {
      diameter: Math.max(.78, width * .82), thickness: .09, tessellation: 28,
    }, scene);
    marker.position.set(x, .055, z);
    marker.rotation.x = Math.PI / 2;
    marker.material = mat;
    marker.isPickable = false;

    const glint = BABYLON.MeshBuilder.CreateBox(`${name}:glint`, {
      width: Math.max(.42, width * .58), height: .018, depth: .12,
    }, scene);
    glint.position.set(x, .045, z + .08);
    glint.material = mat;
    glint.isPickable = false;

    return {
      mesh: null,
      marker,
      glint,
      update(nowMs = 0) {
        const wave = (1 + Math.sin(Number(nowMs) * .042)) * .5;
        marker.visibility = .28 + wave * .55;
        marker.scaling.setAll(.88 + wave * .24);
        glint.visibility = .18 + wave * .46;
        glint.scaling.x = .82 + wave * .36;
      },
      dispose() { marker.dispose(); glint.dispose(); },
    };
  }

  if (mode === 'lane_charge') {
    const gateDepth = Math.max(1.15, Number(depth) || 1.75);
    const gate = BABYLON.MeshBuilder.CreateBox(`${name}:gate`, {
      width: Math.max(.65, width), height: .022, depth: gateDepth,
    }, scene);
    gate.position.set(x, .035, z + gateDepth * .32);
    gate.material = mat;
    gate.isPickable = false;

    const rails = [-1, 1].map(side => {
      const rail = BABYLON.MeshBuilder.CreateBox(`${name}:rail:${side}`, {
        width: .08, height: .030, depth: gateDepth * 1.08,
      }, scene);
      rail.position.set(x + side * Math.max(.30, width * .42), .050, z + gateDepth * .32);
      rail.material = mat;
      rail.isPickable = false;
      return rail;
    });

    const marker = BABYLON.MeshBuilder.CreateTorus(`${name}:charge`, {
      diameter: Math.max(.80, width * .78), thickness: .09, tessellation: 30,
    }, scene);
    marker.position.set(x, .060, z + gateDepth * .74);
    marker.rotation.x = Math.PI / 2;
    marker.material = mat;
    marker.isPickable = false;

    return {
      mesh: gate,
      marker,
      rails,
      update(nowMs = 0) {
        const wave = (1 + Math.sin(Number(nowMs) * .030)) * .5;
        gate.visibility = .14 + wave * .32;
        marker.visibility = .35 + wave * .60;
        marker.scaling.setAll(.86 + wave * .28);
        rails.forEach((rail, index) => {
          rail.visibility = .24 + wave * .58;
          rail.scaling.z = .82 + wave * .28 + index * .02;
        });
      },
      dispose() { gate.dispose(); marker.dispose(); rails.forEach(rail => rail.dispose()); },
    };
  }

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
  count = 12, scrollSpeed = .014, style = 'salvage_belt',
} = {}) {
  const palette = style === 'nereus_defense_core'
    ? {
      a: { diffuse: '#12334b', emissive: '#041522' },
      b: { diffuse: '#1f5873', emissive: '#07283a' },
      glow: { diffuse: '#76e4ff', emissive: '#38bdf8', disableLighting: true },
    }
    : style === 'abaddon_rift'
      ? {
        a: { diffuse: '#3d1221', emissive: '#120208' },
        b: { diffuse: '#67223a', emissive: '#230611' },
        glow: { diffuse: '#ff734b', emissive: '#ff1744', disableLighting: true },
      }
      : {
        a: { diffuse: '#102622', emissive: '#02100d' },
        b: { diffuse: '#19312c', emissive: '#03120f' },
        glow: { diffuse: '#4ade80', emissive: '#123c26', disableLighting: true },
      };
  const matA = material(scene, BABYLON, `backdrop:${style}:a`, palette.a);
  const matB = material(scene, BABYLON, `backdrop:${style}:b`, palette.b);
  const glowMat = material(scene, BABYLON, `backdrop:${style}:glow`, palette.glow);
  const items = [];
  for (let index = 0; index < Math.max(0, Math.trunc(count)); index += 1) {
    let mesh;
    if (style === 'nereus_defense_core' && index % 3 === 0) {
      mesh = setVisualOnly(BABYLON.MeshBuilder.CreateTorus(`dungeon-backdrop:${style}:${index}`, {
        diameter: .72 + (index % 4) * .18, thickness: .055, tessellation: 24,
      }, scene));
      mesh.rotation.x = Math.PI / 2;
      mesh.material = index % 2 ? matB : glowMat;
    } else if (style === 'nereus_defense_core') {
      mesh = setVisualOnly(BABYLON.MeshBuilder.CreateBox(`dungeon-backdrop:${style}:${index}`, {
        width: .16 + (index % 2) * .08, height: .12, depth: .90 + (index % 4) * .22,
      }, scene));
      mesh.material = index % 3 ? matA : matB;
    } else if (style === 'abaddon_rift') {
      mesh = setVisualOnly(BABYLON.MeshBuilder.CreatePolyhedron(`dungeon-backdrop:${style}:${index}`, {
        type: index % 2 === 0 ? 2 : 1,
        size: .40 + (index % 4) * .17,
      }, scene));
      mesh.scaling.set(.72, .58, 1.34 + (index % 3) * .18);
      mesh.material = index % 4 === 0 ? glowMat : index % 2 ? matA : matB;
    } else {
      mesh = setVisualOnly(BABYLON.MeshBuilder.CreatePolyhedron(`dungeon-backdrop:${style}:${index}`, {
        type: index % 2 === 0 ? 1 : 2,
        size: .35 + (index % 4) * .15,
      }, scene));
      mesh.material = index % 3 ? matA : matB;
    }
    const lane = ((index * 37) % 101) / 100;
    const depth = ((index * 61) % 103) / 102;
    mesh.position.set((lane * 2 - 1) * arenaHalfWidth * .94, -.42, (depth * 2 - 1) * worldHalfHeight);
    mesh.rotation.y = index * .47;
    mesh.visibility = .42 + (index % 3) * .08;
    items.push(mesh);
  }
  return {
    tick(frameScale = 1) {
      for (let index = 0; index < items.length; index += 1) {
        const mesh = items[index];
        mesh.position.z += scrollSpeed * (1 + (index % 3) * .22) * frameScale;
        mesh.rotation.y += (style === 'abaddon_rift' ? .0032 : .0022) * frameScale * (index % 2 ? 1 : -1);
        if (style === 'nereus_defense_core') mesh.rotation.z += .0009 * frameScale * (index % 2 ? -1 : 1);
        if (mesh.position.z > worldHalfHeight + 1.5) mesh.position.z = -worldHalfHeight - 1.5;
      }
    },
    dispose() { items.forEach(mesh => mesh.dispose()); },
  };
}
