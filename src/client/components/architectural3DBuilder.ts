import * as THREE from 'three';
import {
  IndoorMobilityProfile,
  SceneObject3D,
  TrajectoryWaypoint,
} from '../../shared/types';

/**
 * Generates a procedural ceramic tile canvas texture with realistic grout lines
 */
function createTileTexture(
  baseHex: string,
  groutHex: string,
  tilesX = 8,
  tilesY = 8
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = groutHex;
  ctx.fillRect(0, 0, 512, 512);

  const cellW = 512 / tilesX;
  const cellH = 512 / tilesY;
  const gap = 3;

  for (let ix = 0; ix < tilesX; ix++) {
    for (let iy = 0; iy < tilesY; iy++) {
      ctx.fillStyle = baseHex;
      ctx.fillRect(
        ix * cellW + gap,
        iy * cellH + gap,
        cellW - gap * 2,
        cellH - gap * 2
      );
      // Subtle specular bevel highlight on each tile
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        ix * cellW + gap + 1,
        iy * cellH + gap + 1,
        cellW - gap * 2 - 2,
        cellH - gap * 2 - 2
      );
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Builds a warm, realistic architectural cutaway room environment (tiled floor, wainscoting walls, baseboard, lighting)
 */
export function buildArchitecturalRoomShell(
  scene: THREE.Scene,
  roomGroup: THREE.Group,
  roomDimensions: { width: number; height: number; depth: number },
  remediationMode: 'BEFORE' | 'AFTER'
) {
  scene.background = new THREE.Color('#0b1324');
  scene.fog = new THREE.FogExp2('#0b1324', 0.035);

  // Warm interior studio lighting
  const hemiLight = new THREE.HemisphereLight('#f8fafc', '#334155', 1.15);
  hemiLight.position.set(0, 4, 0);
  scene.add(hemiLight);

  const mainLight = new THREE.DirectionalLight('#fffbeb', 1.35);
  mainLight.position.set(2.4, 4.2, 2.8);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 1024;
  mainLight.shadow.mapSize.height = 1024;
  scene.add(mainLight);

  const fillLight = new THREE.PointLight(
    remediationMode === 'BEFORE' ? '#fda4af' : '#6ee7b7',
    0.55,
    5.5
  );
  fillLight.position.set(0.3, 1.85, -0.15);
  scene.add(fillLight);

  const { width: rw, height: rh, depth: rd } = roomDimensions;

  // 1. Architectural Tiled Floor Slab with Thickness
  const floorTex = createTileTexture(
    remediationMode === 'BEFORE' ? '#334155' : '#1e3a3a',
    '#1e293b',
    Math.round(rw * 5),
    Math.round(rd * 5)
  );
  const floorSlabGeo = new THREE.BoxGeometry(rw + 0.08, 0.06, rd + 0.08);
  const floorSlabMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.45,
    metalness: 0.08,
  });
  const floorSlab = new THREE.Mesh(floorSlabGeo, floorSlabMat);
  floorSlab.position.set(0, -0.03, 0);
  floorSlab.receiveShadow = true;
  roomGroup.add(floorSlab);

  // 2. Cutaway Back Wall & Right Wall (Architectural Tiled Interior)
  const wallTileTex = createTileTexture('#334155', '#1e293b', 8, 8);
  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTileTex,
    roughness: 0.55,
    metalness: 0.05,
    transparent: true,
    opacity: 0.72,
  });

  // Back wall (Z = -rd/2)
  const backWallGeo = new THREE.BoxGeometry(rw + 0.08, rh, 0.05);
  const backWall = new THREE.Mesh(backWallGeo, wallMat);
  backWall.position.set(0, rh / 2, -rd / 2 - 0.025);
  backWall.receiveShadow = true;
  roomGroup.add(backWall);

  // Right wall (X = +rw/2) — holds grab bar & overhead cabinet in bathroom preset
  const rightWallGeo = new THREE.BoxGeometry(0.05, rh, rd + 0.08);
  const rightWall = new THREE.Mesh(rightWallGeo, wallMat);
  rightWall.position.set(rw / 2 + 0.025, rh / 2, 0);
  rightWall.receiveShadow = true;
  roomGroup.add(rightWall);

  // Left wall (X = -rw/2) — subtle low cutaway so camera can see inside easily
  const leftWallMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    transparent: true,
    opacity: 0.2,
  });
  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(rd, rh), leftWallMat);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(-rw / 2, rh / 2, 0);
  roomGroup.add(leftWall);

  // Baseboard Molding along Back & Right Wall
  const baseboardMat = new THREE.MeshStandardMaterial({
    color: '#64748b',
    roughness: 0.4,
  });
  const backBaseboard = new THREE.Mesh(
    new THREE.BoxGeometry(rw, 0.06, 0.02),
    baseboardMat
  );
  backBaseboard.position.set(0, 0.03, -rd / 2 + 0.01);
  roomGroup.add(backBaseboard);

  const rightBaseboard = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.06, rd),
    baseboardMat
  );
  rightBaseboard.position.set(rw / 2 - 0.01, 0.03, 0);
  roomGroup.add(rightBaseboard);
}

/**
 * Builds a recognizable, multi-part 3D architectural model for each SceneObject3D
 * instead of a primitive Lego BoxGeometry.
 */
export function createArchitecturalObjectGroup(
  obj: SceneObject3D,
  options: {
    isLayerMatch: boolean;
    isHazardObj: boolean;
    isSelected: boolean;
    remediationMode: 'BEFORE' | 'AFTER';
  }
): { group: THREE.Group; hitMesh: THREE.Mesh } {
  const { isLayerMatch, isHazardObj, isSelected, remediationMode } = options;
  const group = new THREE.Group();
  group.position.set(obj.position.x, obj.position.y, obj.position.z);

  const { width: w, height: h, depth: d } = obj.dimensions;
  const opacityMul = isLayerMatch ? 1 : 0.22;

  const isSafetyAddition =
    obj.category === 'safety_addition' ||
    obj.materialHazard === 'shatterproof_guarded';

  // Invisible hit-box mesh for accurate raycasting & selection outline
  const hitGeo = new THREE.BoxGeometry(w, Math.max(0.04, h), d);
  const hitMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const hitMesh = new THREE.Mesh(hitGeo, hitMat);
  group.add(hitMesh);

  // Subtle Selection or Hazard Highlight Frame (only shown when selected, locked, or hazard)
  if (isSelected || obj.lockedByUser || (isHazardObj && remediationMode === 'BEFORE')) {
    const edgeColor = isSelected
      ? '#38bdf8'
      : obj.lockedByUser
      ? '#eab308'
      : '#ef4444';
    const frameEdges = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(w + 0.02, Math.max(0.04, h) + 0.02, d + 0.02)
    );
    const frameLine = new THREE.LineSegments(
      frameEdges,
      new THREE.LineBasicMaterial({
        color: edgeColor,
        transparent: true,
        opacity: isSelected ? 0.95 : 0.65,
      })
    );
    group.add(frameLine);
  }

  const lowerId = `${obj.id} ${obj.name}`.toLowerCase();

  // =========================================================================
  // 1. TOILET FIXTURE (Pedestal + Contoured Bowl + Seat + Water Tank + Flush)
  // =========================================================================
  if (obj.category === 'toilet') {
    const porcelainMat = new THREE.MeshPhysicalMaterial({
      color: '#f8fafc',
      roughness: 0.14,
      metalness: 0.05,
      clearcoat: 0.85,
      transparent: opacityMul < 1,
      opacity: opacityMul,
    });
    const tankDepth = d * 0.34;
    const bowlDepth = d * 0.66;

    // Rear Water Cistern Tank
    const tankMesh = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.88, h * 0.48, tankDepth),
      porcelainMat
    );
    tankMesh.position.set(0, h * 0.22, -d / 2 + tankDepth / 2);
    tankMesh.castShadow = true;
    group.add(tankMesh);

    // Tank Top Lid + Chrome Flush Button
    const lidMesh = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.92, 0.035, tankDepth * 1.06),
      porcelainMat
    );
    lidMesh.position.set(0, h * 0.47, -d / 2 + tankDepth / 2);
    group.add(lidMesh);

    const flushBtn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16),
      new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.85, roughness: 0.2 })
    );
    flushBtn.position.set(0, h * 0.495, -d / 2 + tankDepth / 2);
    group.add(flushBtn);

    // Lower Pedestal Base
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.36, w * 0.32, h * 0.5, 24),
      porcelainMat
    );
    pedestal.scale.set(1, 1, 1.35);
    pedestal.position.set(0, -h / 2 + h * 0.25, d * 0.08);
    pedestal.castShadow = true;
    group.add(pedestal);

    // Contoured Bowl Rim
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.46, w * 0.36, h * 0.16, 28),
      porcelainMat
    );
    bowl.scale.set(1, 1, (bowlDepth / w) * 1.15);
    bowl.position.set(0, 0.02, d * 0.12);
    bowl.castShadow = true;
    group.add(bowl);

    // Toilet Seat Ring
    const seatRing = new THREE.Mesh(
      new THREE.TorusGeometry(w * 0.36, 0.035, 12, 28),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2 })
    );
    seatRing.rotation.x = Math.PI / 2;
    seatRing.scale.set(1, 1.25, 1);
    seatRing.position.set(0, 0.1, d * 0.12);
    group.add(seatRing);

    return { group, hitMesh };
  }

  // =========================================================================
  // 2. SINK / WASHBASIN FIXTURE (Pedestal + Ceramic Basin + Chrome Faucet)
  // =========================================================================
  if (obj.category === 'sink') {
    const porcelainMat = new THREE.MeshPhysicalMaterial({
      color: '#f1f5f9',
      roughness: 0.15,
      clearcoat: 0.8,
      transparent: opacityMul < 1,
      opacity: opacityMul,
    });
    // Pedestal column
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.2, w * 0.17, h * 0.78, 20),
      porcelainMat
    );
    col.position.set(0, -h * 0.11, 0);
    col.castShadow = true;
    group.add(col);

    // Top Basin Bowl
    const basin = new THREE.Mesh(
      new THREE.BoxGeometry(w, h * 0.24, d),
      porcelainMat
    );
    basin.position.set(0, h / 2 - h * 0.12, 0);
    basin.castShadow = true;
    group.add(basin);

    // Chrome Faucet
    const chromeMat = new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      metalness: 0.9,
      roughness: 0.15,
    });
    const spout = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.11, 12),
      chromeMat
    );
    spout.position.set(0, h / 2 + 0.055, -d * 0.25);
    group.add(spout);

    return { group, hitMesh };
  }

  // =========================================================================
  // 3. OVERHEAD GLASS CABINET (Wood/Metal Carcass + Shelves + Framed Glass Doors)
  // =========================================================================
  if (obj.category === 'overhead_cabinet') {
    const isGuarded =
      remediationMode === 'AFTER' || obj.materialHazard === 'shatterproof_guarded';
    const carcassMat = new THREE.MeshStandardMaterial({
      color: isGuarded ? '#0f766e' : '#475569',
      roughness: 0.45,
      metalness: 0.2,
      transparent: opacityMul < 1,
      opacity: opacityMul,
    });

    const wallThick = 0.022;
    // Top, Bottom, Left, Right, Back panels + Middle Shelf
    const topPanel = new THREE.Mesh(new THREE.BoxGeometry(w, wallThick, d), carcassMat);
    topPanel.position.set(0, h / 2 - wallThick / 2, 0);
    group.add(topPanel);

    const botPanel = new THREE.Mesh(new THREE.BoxGeometry(w, wallThick, d), carcassMat);
    botPanel.position.set(0, -h / 2 + wallThick / 2, 0);
    group.add(botPanel);

    const midShelf = new THREE.Mesh(
      new THREE.BoxGeometry(w - wallThick * 2, 0.016, d * 0.88),
      carcassMat
    );
    midShelf.position.set(0, 0, 0);
    group.add(midShelf);

    const backPanel = new THREE.Mesh(
      new THREE.BoxGeometry(w - wallThick * 2, h - wallThick * 2, wallThick),
      carcassMat
    );
    backPanel.position.set(0, wallThick / 2, 0);
    // Align back panel toward the wall side (X+ or Z-)
    if (d > w) {
      // Mounted on right wall (facing -X)
      backPanel.geometry = new THREE.BoxGeometry(wallThick, h, d);
      backPanel.position.set(w / 2 - wallThick / 2, 0, 0);
    } else {
      backPanel.position.set(0, 0, -d / 2 + wallThick / 2);
    }
    group.add(backPanel);

    // Translucent Tempered Glass Door Pane on Front Face
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: isGuarded ? '#6ee7b7' : isHazardObj ? '#fda4af' : '#bae6fd',
      transparent: true,
      opacity: (isGuarded ? 0.42 : 0.55) * opacityMul,
      roughness: 0.1,
      metalness: 0.1,
      clearcoat: 1.0,
    });

    const isRightWallMounted = d > w;
    const glassGeo = isRightWallMounted
      ? new THREE.BoxGeometry(0.012, h * 0.88, d * 0.92)
      : new THREE.BoxGeometry(w * 0.92, h * 0.88, 0.012);
    const glassPane = new THREE.Mesh(glassGeo, glassMat);
    if (isRightWallMounted) {
      glassPane.position.set(-w / 2 + 0.012, 0, 0);
    } else {
      glassPane.position.set(0, 0, d / 2 - 0.012);
    }
    group.add(glassPane);

    // Chrome Door Handles
    const handleMat = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      metalness: 0.9,
      roughness: 0.15,
    });
    const handleMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.12, 10),
      handleMat
    );
    if (isRightWallMounted) {
      handleMesh.position.set(-w / 2 - 0.01, -h * 0.15, 0.04);
    } else {
      handleMesh.position.set(0.04, -h * 0.15, d / 2 + 0.01);
    }
    group.add(handleMesh);

    // Bottom Edge Hazard Bar (BEFORE) vs Soft Elastomer Cushion Bumper (AFTER)
    const bumperMat = new THREE.MeshStandardMaterial({
      color: isGuarded ? '#10b981' : '#ef4444',
      emissive: isGuarded ? '#059669' : '#dc2626',
      emissiveIntensity: 0.5,
      roughness: 0.3,
    });
    const bumperGeo = isRightWallMounted
      ? new THREE.BoxGeometry(0.035, 0.035, d)
      : new THREE.BoxGeometry(w, 0.035, 0.035);
    const bumper = new THREE.Mesh(bumperGeo, bumperMat);
    if (isRightWallMounted) {
      bumper.position.set(-w / 2, -h / 2, 0);
    } else {
      bumper.position.set(0, -h / 2, d / 2);
    }
    group.add(bumper);

    return { group, hitMesh };
  }

  // =========================================================================
  // 4. STAINLESS STEEL GRAB BAR (Tubular Rail + Wall Flanges + Grip Sleeve)
  // =========================================================================
  if (obj.category === 'grab_bar') {
    const steelMat = new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      metalness: 0.88,
      roughness: 0.18,
    });
    const gripMat = new THREE.MeshStandardMaterial({
      color: remediationMode === 'AFTER' ? '#10b981' : '#38bdf8',
      roughness: 0.5,
    });

    const isZLong = d >= w;
    const barLength = isZLong ? d * 0.9 : w * 0.9;

    const mainRail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, barLength, 16),
      steelMat
    );
    if (isZLong) {
      mainRail.rotation.x = Math.PI / 2;
    } else {
      mainRail.rotation.z = Math.PI / 2;
    }
    group.add(mainRail);

    // Central Textured Grip Sleeve
    const gripSleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, barLength * 0.45, 16),
      gripMat
    );
    if (isZLong) {
      gripSleeve.rotation.x = Math.PI / 2;
    } else {
      gripSleeve.rotation.z = Math.PI / 2;
    }
    group.add(gripSleeve);

    // Wall Mounting Flanges at Both Ends
    [-barLength * 0.42, barLength * 0.42].forEach((offset) => {
      const flange = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.04, 16),
        steelMat
      );
      if (isZLong) {
        flange.rotation.z = Math.PI / 2;
        flange.position.set(w * 0.25, 0, offset);
      } else {
        flange.rotation.x = Math.PI / 2;
        flange.position.set(offset, 0, -d * 0.25);
      }
      group.add(flange);
    });

    return { group, hitMesh };
  }

  // =========================================================================
  // 5. FLOOR CLUTTER (Hollow Washbasin, Bucket, Storage Caddy, Bath Mat)
  // =========================================================================
  if (obj.category === 'floor_clutter') {
    const baseColor = isHazardObj && remediationMode === 'BEFORE' ? '#f97316' : obj.color || '#38bdf8';
    const plasticMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.35,
      metalness: 0.05,
    });

    if (lowerId.includes('basin') || lowerId.includes('bucket')) {
      // Round/Oval Washbasin or Bucket with Rim and Dark Hollow Interior
      const radius = Math.min(w, d) * 0.46;
      const outerCyl = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 0.82, h, 24),
        plasticMat
      );
      outerCyl.castShadow = true;
      group.add(outerCyl);

      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.016, 12, 24),
        plasticMat
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.set(0, h / 2, 0);
      group.add(rim);

      const innerCavity = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.9, radius * 0.78, 0.01, 24),
        new THREE.MeshBasicMaterial({ color: '#0f172a' })
      );
      innerCavity.position.set(0, h / 2 - 0.005, 0);
      group.add(innerCavity);

      return { group, hitMesh };
    }

    if (lowerId.includes('caddy') || lowerId.includes('rack')) {
      // 2-Tier Bathroom Caddy Basket with 4 Corner Posts + Bottles
      const trayH = h * 0.28;
      [-h * 0.3, h * 0.22].forEach((ty) => {
        const tray = new THREE.Mesh(new THREE.BoxGeometry(w, trayH, d), plasticMat);
        tray.position.set(0, ty, 0);
        tray.castShadow = true;
        group.add(tray);
      });
      // Corner posts
      const postMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0' });
      [
        [-w * 0.44, -d * 0.44],
        [w * 0.44, -d * 0.44],
        [-w * 0.44, d * 0.44],
        [w * 0.44, d * 0.44],
      ].forEach(([px, pz]) => {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.01, 0.01, h, 8),
          postMat
        );
        post.position.set(px, 0, pz);
        group.add(post);
      });
      return { group, hitMesh };
    }
  }

  // =========================================================================
  // 6. SAFETY ADDITIONS (Sloped Bevel Threshold Ramp, Waist Shelf, Drainage Mat)
  // =========================================================================
  if (obj.category === 'safety_addition') {
    const safeMat = new THREE.MeshStandardMaterial({
      color: '#10b981',
      roughness: 0.4,
      metalness: 0.15,
    });

    if (lowerId.includes('ramp')) {
      // Sloped Wedge Ramp Profile
      const rampMesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, Math.max(0.025, h), d),
        safeMat
      );
      rampMesh.rotation.x = 0.12;
      group.add(rampMesh);
      return { group, hitMesh };
    }

    if (lowerId.includes('shelf')) {
      // Wall-Mounted Waist-Level Easy-Reach Shelf + Chrome Rail + Bottles
      const shelfBoard = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.022, d),
        new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.25 })
      );
      shelfBoard.position.set(0, -h * 0.25, 0);
      group.add(shelfBoard);

      // Guard rail
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.035, d * 0.92),
        safeMat
      );
      rail.position.set(-w * 0.42, 0, 0);
      group.add(rail);

      // 2 Toiletry Pump Bottles on the shelf
      [-d * 0.22, d * 0.22].forEach((bz, bIdx) => {
        const bottle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.032, 0.035, h * 0.65, 14),
          new THREE.MeshStandardMaterial({
            color: bIdx === 0 ? '#38bdf8' : '#34d399',
            roughness: 0.25,
          })
        );
        bottle.position.set(0, h * 0.1, bz);
        group.add(bottle);
      });
      return { group, hitMesh };
    }
  }

  // =========================================================================
  // 7. FURNITURE (Bed, Sofa, Table, Storage Cabinet for Living/Bedroom Presets)
  // =========================================================================
  if (obj.category === 'furniture') {
    const woodMat = new THREE.MeshStandardMaterial({
      color: obj.color || '#64748b',
      roughness: 0.55,
    });

    if (lowerId.includes('bed')) {
      // Frame + Headboard + White Mattress + Blanket + Pillow
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(w, h * 0.45, d),
        woodMat
      );
      frame.position.set(0, -h * 0.27, 0);
      frame.castShadow = true;
      group.add(frame);

      const mattress = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.94, h * 0.32, d * 0.94),
        new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.6 })
      );
      mattress.position.set(0, h * 0.08, 0);
      group.add(mattress);

      const blanket = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.95, h * 0.34, d * 0.6),
        new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.65 })
      );
      blanket.position.set(0, h * 0.09, d * 0.16);
      group.add(blanket);

      const headboard = new THREE.Mesh(
        new THREE.BoxGeometry(w, h * 0.95, 0.08),
        woodMat
      );
      headboard.position.set(0, 0, -d / 2 + 0.04);
      group.add(headboard);

      return { group, hitMesh };
    }

    if (lowerId.includes('sofa') || lowerId.includes('couch')) {
      const fabricMat = new THREE.MeshStandardMaterial({
        color: obj.color || '#475569',
        roughness: 0.7,
      });
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(w, h * 0.48, d),
        fabricMat
      );
      seat.position.set(0, -h * 0.26, 0);
      seat.castShadow = true;
      group.add(seat);

      const backrest = new THREE.Mesh(
        new THREE.BoxGeometry(w, h * 0.55, d * 0.28),
        fabricMat
      );
      backrest.position.set(0, h * 0.22, -d * 0.36);
      group.add(backrest);

      return { group, hitMesh };
    }

    if (lowerId.includes('table') || lowerId.includes('desk')) {
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.045, d),
        woodMat
      );
      top.position.set(0, h / 2 - 0.022, 0);
      top.castShadow = true;
      group.add(top);

      [
        [-w * 0.44, -d * 0.44],
        [w * 0.44, -d * 0.44],
        [-w * 0.44, d * 0.44],
        [w * 0.44, d * 0.44],
      ].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.018, h - 0.04, 12),
          woodMat
        );
        leg.position.set(lx, -0.02, lz);
        leg.castShadow = true;
        group.add(leg);
      });

      return { group, hitMesh };
    }
  }

  // =========================================================================
  // 8. DEFAULT ARCHITECTURAL ELEMENT (Wet Floor Zone, Threshold Sill, etc.)
  // =========================================================================
  if (obj.category === 'wet_zone') {
    const wetMesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.008, d),
      new THREE.MeshPhysicalMaterial({
        color: remediationMode === 'BEFORE' ? '#0ea5e9' : '#10b981',
        transparent: true,
        opacity: 0.22 * opacityMul,
        roughness: 0.08,
        clearcoat: 1.0,
      })
    );
    group.add(wetMesh);
    return { group, hitMesh };
  }

  const fallbackColor =
    isHazardObj && remediationMode === 'BEFORE'
      ? '#f97316'
      : isSafetyAddition && remediationMode === 'AFTER'
      ? '#10b981'
      : obj.color || '#64748b';

  const bodyMesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, Math.max(0.025, h), d),
    new THREE.MeshStandardMaterial({
      color: fallbackColor,
      roughness: 0.45,
      metalness: 0.15,
      transparent: opacityMul < 1,
      opacity: opacityMul,
    })
  );
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  return { group, hitMesh };
}

/**
 * Builds an articulated 3D human mannequin with joints (hips, knees, ankles, torso, shoulders, elbows, head)
 * and realistic bilateral crutches or manual wheelchair.
 */
export function createArticulatedHumanAvatar(
  activeWp: TrajectoryWaypoint,
  profile: IndoorMobilityProfile,
  remediationMode: 'BEFORE' | 'AFTER',
  hasOverheadHazardHere: boolean
): THREE.Group {
  const avatarGroup = new THREE.Group();
  const userScale = profile.userHeightCm / 168;
  const rad = (activeWp.facingAngleDeg * Math.PI) / 180;
  const pitchRad = (activeWp.torsoForwardPitchDeg * Math.PI) / 180;
  const pitchScale = profile.sitToStandForwardPitchCm / 28;

  avatarGroup.position.set(activeWp.x, 0, activeWp.z);
  avatarGroup.rotation.y = -rad;

  const suitMat = new THREE.MeshStandardMaterial({
    color: remediationMode === 'BEFORE' ? '#0284c7' : '#059669',
    roughness: 0.4,
    metalness: 0.1,
  });
  const limbMat = new THREE.MeshStandardMaterial({
    color: '#334155',
    roughness: 0.5,
  });
  const jointMat = new THREE.MeshStandardMaterial({
    color: '#e2e8f0',
    metalness: 0.3,
    roughness: 0.3,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color:
      hasOverheadHazardHere && remediationMode === 'BEFORE'
        ? '#ef4444'
        : '#f8fafc',
    emissive:
      hasOverheadHazardHere && remediationMode === 'BEFORE'
        ? '#dc2626'
        : '#000000',
    emissiveIntensity:
      hasOverheadHazardHere && remediationMode === 'BEFORE' ? 0.55 : 0,
    roughness: 0.25,
  });

  if (profile.id === 'wheelchair') {
    // Detailed Manual Wheelchair + Articulated Seated Resident
    const wheelRadius = 0.3;
    const tireMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.7 });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      metalness: 0.85,
      roughness: 0.2,
    });

    [-0.31, 0.31].forEach((sideX) => {
      const tire = new THREE.Mesh(
        new THREE.TorusGeometry(wheelRadius, 0.022, 14, 32),
        tireMat
      );
      tire.rotation.y = Math.PI / 2;
      tire.position.set(sideX, wheelRadius, 0.04);
      avatarGroup.add(tire);

      const pushRim = new THREE.Mesh(
        new THREE.TorusGeometry(wheelRadius * 0.84, 0.01, 10, 28),
        chromeMat
      );
      pushRim.rotation.y = Math.PI / 2;
      pushRim.position.set(sideX + (sideX > 0 ? 0.025 : -0.025), wheelRadius, 0.04);
      avatarGroup.add(pushRim);

      // Front caster wheel
      const caster = new THREE.Mesh(
        new THREE.TorusGeometry(0.08, 0.016, 10, 20),
        tireMat
      );
      caster.rotation.y = Math.PI / 2;
      caster.position.set(sideX * 0.85, 0.08, -0.26);
      avatarGroup.add(caster);
    });

    // Seat & Backrest Frame
    const seatMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.05, 0.44),
      limbMat
    );
    seatMesh.position.set(0, 0.48, 0);
    avatarGroup.add(seatMesh);

    const backMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.44, 0.04),
      limbMat
    );
    backMesh.position.set(0, 0.72, 0.21);
    avatarGroup.add(backMesh);

    // Seated Legs + Torso + Head
    [-0.12, 0.12].forEach((lx) => {
      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.048, 0.36, 12),
        limbMat
      );
      thigh.rotation.x = Math.PI / 2;
      thigh.position.set(lx, 0.53, -0.14);
      avatarGroup.add(thigh);

      const shin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.046, 0.038, 0.38, 12),
        limbMat
      );
      shin.position.set(lx, 0.32, -0.32);
      avatarGroup.add(shin);
    });

    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.13, 0.48, 16),
      suitMat
    );
    torso.position.set(0, 0.78, 0.02);
    avatarGroup.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 24), skinMat);
    head.position.set(0, 1.15, 0.0);
    avatarGroup.add(head);

    return avatarGroup;
  }

  // =========================================================================
  // ARTICULATED CRUTCH USER (With Knee/Hip Flexion & Forward Sit-to-Stand Lean)
  // =========================================================================
  const isSittingOrRising =
    activeWp.posture === 'sitting' || activeWp.posture === 'sit_to_stand_lean';
  const hipHeight = (isSittingOrRising ? 0.72 : 0.88) * userScale;
  const kneeHeight = (isSittingOrRising ? 0.42 : 0.46) * userScale;
  const kneeZ = isSittingOrRising ? -0.14 : -0.02;

  [-0.12, 0.12].forEach((lx) => {
    // Shoe / Foot
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.085, 0.05, 0.21),
      limbMat
    );
    shoe.position.set(lx, 0.025, -0.04);
    avatarGroup.add(shoe);

    // Lower Leg (Shin: Ankle -> Knee)
    const shinLen = kneeHeight;
    const shin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.046, 0.038, shinLen, 14),
      limbMat
    );
    shin.position.set(lx, shinLen / 2 + 0.02, kneeZ / 2);
    if (isSittingOrRising) shin.rotation.x = 0.24;
    avatarGroup.add(shin);

    // Knee Joint Sphere
    const kneeJoint = new THREE.Mesh(
      new THREE.SphereGeometry(0.048, 12, 12),
      jointMat
    );
    kneeJoint.position.set(lx, kneeHeight, kneeZ);
    avatarGroup.add(kneeJoint);

    // Upper Leg (Thigh: Knee -> Hip)
    const thighLen = Math.hypot(hipHeight - kneeHeight, kneeZ);
    const thigh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.058, 0.048, thighLen, 14),
      limbMat
    );
    thigh.position.set(lx, (hipHeight + kneeHeight) / 2, kneeZ / 2);
    if (isSittingOrRising) thigh.rotation.x = -0.38;
    avatarGroup.add(thigh);
  });

  // Pelvis / Hip Bridge
  const pelvis = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.11, 0.18),
    limbMat
  );
  pelvis.position.set(0, hipHeight, 0);
  avatarGroup.add(pelvis);

  // Upper Body Pivot Group at Hips (rotates forward by torsoForwardPitchDeg!)
  const upperBodyPivot = new THREE.Group();
  upperBodyPivot.position.set(0, hipHeight, 0);
  upperBodyPivot.rotation.x = -pitchRad * pitchScale;

  const torsoLen = 0.5 * userScale;
  const torsoMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.155, 0.125, torsoLen, 18),
    suitMat
  );
  torsoMesh.scale.set(1.15, 1, 0.78);
  torsoMesh.position.set(0, torsoLen / 2 + 0.04, 0);
  torsoMesh.castShadow = true;
  upperBodyPivot.add(torsoMesh);

  // Shoulders & Arms holding Crutches
  const shoulderY = torsoLen + 0.02;
  [-0.2, 0.2].forEach((sx) => {
    const shoulder = new THREE.Mesh(
      new THREE.SphereGeometry(0.046, 12, 12),
      jointMat
    );
    shoulder.position.set(sx, shoulderY, 0);
    upperBodyPivot.add(shoulder);

    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.032, 0.42 * userScale, 12),
      suitMat
    );
    arm.position.set(sx * 1.12, shoulderY - 0.2 * userScale, -0.05);
    arm.rotation.x = 0.25;
    upperBodyPivot.add(arm);
  });

  // Neck + Sculpted Head + Direction Visor
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.05, 0.07, 12),
    jointMat
  );
  neck.position.set(0, torsoLen + 0.08, 0);
  upperBodyPivot.add(neck);

  const headY = torsoLen + 0.19 * userScale;
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 24), skinMat);
  headMesh.scale.set(0.92, 1.08, 1.0);
  headMesh.position.set(0, headY, 0);
  headMesh.castShadow = true;
  upperBodyPivot.add(headMesh);

  // Subtle Face Visor Band (shows exact head facing direction)
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.035, 0.06),
    new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.2 })
  );
  visor.position.set(0, headY + 0.01, -0.09);
  upperBodyPivot.add(visor);

  // Clean Halo Ring around Head only when Overhead Collision is active
  if (hasOverheadHazardHere && remediationMode === 'BEFORE') {
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.18, 32),
      new THREE.MeshBasicMaterial({
        color: '#ef4444',
        side: THREE.DoubleSide,
      })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.set(0, headY + 0.04, 0);
    upperBodyPivot.add(halo);
  }

  avatarGroup.add(upperBodyPivot);

  // Mobility Aid Equipment (Crutches, Folding Walker, or Single-Point Cane)
  const stanceHalfWidthM = (profile.minPassageWidthCm / 100) * 0.46;
  const aluminumMat = new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    metalness: 0.8,
    roughness: 0.25,
  });
  const padMat = new THREE.MeshStandardMaterial({
    color: '#f59e0b',
    roughness: 0.5,
  });
  const rubberMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.8 });

  if (profile.id === 'walker') {
    // 4-Legged Folding Walker / Rollator Frame in front of the resident
    const walkerGroup = new THREE.Group();
    const walkerH = 0.84 * userScale;
    const walkerHalfW = 0.27;
    const walkerFrontZ = -0.34;
    const walkerBackZ = -0.12;

    // 4 vertical legs + front wheels
    [
      [-walkerHalfW, walkerFrontZ, true],
      [walkerHalfW, walkerFrontZ, true],
      [-walkerHalfW, walkerBackZ, false],
      [walkerHalfW, walkerBackZ, false],
    ].forEach(([lx, lz, isFront]) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.013, 0.012, walkerH, 10),
        aluminumMat
      );
      leg.position.set(lx as number, walkerH / 2, lz as number);
      walkerGroup.add(leg);

      if (isFront) {
        const wheel = new THREE.Mesh(
          new THREE.TorusGeometry(0.055, 0.014, 10, 20),
          rubberMat
        );
        wheel.rotation.y = Math.PI / 2;
        wheel.position.set(lx as number, 0.055, lz as number);
        walkerGroup.add(wheel);
      } else {
        const tip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.022, 0.04, 10),
          rubberMat
        );
        tip.position.set(lx as number, 0.02, lz as number);
        walkerGroup.add(tip);
      }
    });

    // Side top bars + handgrips
    [-walkerHalfW, walkerHalfW].forEach((sx) => {
      const topSide = new THREE.Mesh(
        new THREE.CylinderGeometry(0.013, 0.013, Math.abs(walkerFrontZ - walkerBackZ), 10),
        aluminumMat
      );
      topSide.rotation.x = Math.PI / 2;
      topSide.position.set(sx, walkerH, (walkerFrontZ + walkerBackZ) / 2);
      walkerGroup.add(topSide);

      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.12, 10),
        padMat
      );
      grip.rotation.x = Math.PI / 2;
      grip.position.set(sx, walkerH + 0.005, walkerBackZ - 0.05);
      walkerGroup.add(grip);
    });

    // Front horizontal crossbar
    const frontCross = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, walkerHalfW * 2, 12),
      aluminumMat
    );
    frontCross.rotation.z = Math.PI / 2;
    frontCross.position.set(0, walkerH * 0.68, walkerFrontZ);
    walkerGroup.add(frontCross);

    avatarGroup.add(walkerGroup);
  } else if (profile.id === 'cane_grab_bar') {
    // Single-Point Quad-Base Walking Cane in the right hand
    const caneGroup = new THREE.Group();
    const caneH = 0.84 * userScale;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.01, caneH, 10),
      aluminumMat
    );
    shaft.position.set(0, caneH / 2, 0);
    caneGroup.add(shaft);

    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.032, 0.032, 0.13),
      padMat
    );
    handle.position.set(0, caneH, 0.02);
    caneGroup.add(handle);

    const quadBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.025, 0.11),
      rubberMat
    );
    quadBase.position.set(0, 0.015, 0);
    caneGroup.add(quadBase);

    caneGroup.position.set(0.26, 0, -0.14);
    avatarGroup.add(caneGroup);
  } else {
    // Detailed Bilateral Crutches (Underarm Pad + Dual Struts + Handgrip + Rubber Tip)
    const crutchLen = 1.16 * userScale;
    [-stanceHalfWidthM, stanceHalfWidthM].forEach((cx, idx) => {
      const crutchGroup = new THREE.Group();

      // Main shaft
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.011, crutchLen, 10),
        aluminumMat
      );
      crutchGroup.add(shaft);

      // Underarm Saddle Pad at top
      const underarmPad = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.04, 0.16),
        padMat
      );
      underarmPad.position.set(0, crutchLen / 2, 0);
      crutchGroup.add(underarmPad);

      // Handgrip in middle
      const handGrip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.016, 0.11, 10),
        padMat
      );
      handGrip.rotation.x = Math.PI / 2;
      handGrip.position.set(0, crutchLen * 0.12, 0);
      crutchGroup.add(handGrip);

      // Rubber Tip Ferrule at bottom
      const rubberTip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.026, 0.05, 12),
        rubberMat
      );
      rubberTip.position.set(0, -crutchLen / 2 + 0.025, 0);
      crutchGroup.add(rubberTip);

      if (activeWp.posture === 'overhead_reach' && idx === 1 && remediationMode === 'BEFORE') {
        crutchGroup.position.set(cx * 0.85, crutchLen * 0.65, -0.18);
        crutchGroup.rotation.z = -0.32;
        crutchGroup.rotation.x = -0.42;
      } else {
        crutchGroup.position.set(cx, crutchLen / 2, -0.08);
        crutchGroup.rotation.z = cx > 0 ? 0.13 : -0.13;
        crutchGroup.rotation.x = -0.08;
      }
      avatarGroup.add(crutchGroup);
    });
  }

  // Floor Stance Width Caliper Bar under Mobility Aid Footprint
  const stanceBar = new THREE.Mesh(
    new THREE.BoxGeometry(stanceHalfWidthM * 2.08, 0.012, 0.06),
    new THREE.MeshBasicMaterial({
      color: remediationMode === 'BEFORE' ? '#f97316' : '#10b981',
      transparent: true,
      opacity: 0.8,
    })
  );
  stanceBar.position.set(0, 0.008, -0.08);
  avatarGroup.add(stanceBar);

  return avatarGroup;
}
