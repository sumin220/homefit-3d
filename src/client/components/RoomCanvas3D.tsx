import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  CollisionHazard,
  ElevationLayer,
  IndoorMobilityProfile,
  SceneObject3D,
  TrajectoryWaypoint,
} from '../../shared/types';
import { Eye, Layers, RotateCcw, ShieldAlert, CheckCircle2, Lock, Tag } from 'lucide-react';

interface RoomCanvas3DProps {
  roomDimensions: { width: number; height: number; depth: number };
  objects: SceneObject3D[];
  beforeObjects?: SceneObject3D[];
  waypoints: TrajectoryWaypoint[];
  activeWaypointIndex: number;
  hazards: CollisionHazard[];
  profile: IndoorMobilityProfile;
  remediationMode: 'BEFORE' | 'AFTER';
  activeLayerFilter: 'all' | ElevationLayer;
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
}

type CameraPreset = 'isometric' | 'head_strike' | 'floor_stance' | 'top_down';

interface HudCalloutDescriptor {
  id: string;
  objectId: string | null;
  position3D: THREE.Vector3;
  badgeText: string;
  subText: string;
  tone: 'critical' | 'warning' | 'locked' | 'measured' | 'remediated';
}

export const RoomCanvas3D: React.FC<RoomCanvas3DProps> = ({
  roomDimensions,
  objects,
  beforeObjects = [],
  waypoints,
  activeWaypointIndex,
  hazards,
  profile,
  remediationMode,
  activeLayerFilter,
  selectedObjectId,
  onSelectObject,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const hudItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [showLayerSlices, setShowLayerSlices] = useState<boolean>(true);
  const [showHudCallouts, setShowHudCallouts] = useState<boolean>(true);

  // Store spherical orbit coordinates in a ref for interactive drag/zoom
  const orbitRef = useRef({
    theta: -0.65, // horizontal angle (radians)
    phi: 1.05, // vertical angle from top (radians)
    radius: 3.7,
    target: new THREE.Vector3(0, 0.95, 0),
    isDragging: false,
    lastX: 0,
    lastY: 0,
  });

  // Build 3D-to-2D HUD callout descriptors for hazards, locked fixtures, tape-measured items, and AFTER displacements
  const hudCallouts: HudCalloutDescriptor[] = React.useMemo(() => {
    const items: HudCalloutDescriptor[] = [];
    const seenObjectIds = new Set<string>();

    // 1. Active Collision Hazards (highest visual priority)
    hazards.forEach((haz) => {
      if (activeLayerFilter !== 'all' && activeLayerFilter !== haz.layer) return;
      const primaryObjId = haz.objectIds[0] || null;
      if (primaryObjId) seenObjectIds.add(primaryObjId);

      let shortBadge = `⚠️ ${haz.layer.toUpperCase()}: ${haz.measuredValueCm}cm`;
      if (haz.hazardType === 'OVERHEAD_GLASS_HEAD_STRIKE') {
        shortBadge = `💥 Head Strike (${haz.measuredValueCm >= 0 ? `+${haz.measuredValueCm}` : haz.measuredValueCm}cm)`;
      } else if (haz.hazardType === 'HIGH_REACH_CRUTCH_RELEASE') {
        shortBadge = `⬆️ High Reach Y=${haz.measuredValueCm}cm`;
      } else if (haz.hazardType === 'FLOOR_CLUTTER_STANCE_BLOCK') {
        shortBadge = `📏 Stance ${haz.measuredValueCm}cm < ${haz.requiredValueCm}cm`;
      } else if (haz.hazardType === 'PASSAGE_PINCH_COLLISION') {
        shortBadge = `📐 Pinch ${haz.measuredValueCm}cm < ${haz.requiredValueCm}cm`;
      } else if (haz.hazardType === 'THRESHOLD_TRIP_OR_BLOCK') {
        shortBadge = `⚡ Step Lip ${haz.measuredValueCm}cm`;
      } else if (haz.hazardType === 'TURNING_RADIUS_COLLISION') {
        shortBadge = `🔄 Turn Ø ${haz.measuredValueCm}cm < ${haz.requiredValueCm}cm`;
      } else if (haz.hazardType === 'WET_FLOOR_SLIP_AMPLIFIER') {
        shortBadge = `💧 Wet Glazed Tile Slip`;
      }

      items.push({
        id: `hud-haz-${haz.id}`,
        objectId: primaryObjId,
        position3D: new THREE.Vector3(
          haz.collisionPoint3D.x,
          haz.collisionPoint3D.y + 0.14,
          haz.collisionPoint3D.z
        ),
        badgeText: shortBadge,
        subText: `Req: ${haz.requiredValueCm}cm · Click to inspect`,
        tone: haz.severity === 'CRITICAL' ? 'critical' : 'warning',
      });
    });

    // 2. Caregiver Locked (HITL) or User Tape-Measured objects
    objects.forEach((obj) => {
      if (activeLayerFilter !== 'all' && activeLayerFilter !== obj.layer) return;
      const topY = obj.position.y + obj.dimensions.height / 2 + 0.1;

      if (obj.lockedByUser) {
        items.push({
          id: `hud-lock-${obj.id}`,
          objectId: obj.id,
          position3D: new THREE.Vector3(obj.position.x, topY, obj.position.z),
          badgeText: `🔒 Locked: ${obj.name.split('(')[0].trim()}`,
          subText: 'HITL Constraint Active',
          tone: 'locked',
        });
        seenObjectIds.add(obj.id);
      } else if (obj.measurementStatus === 'user_measured') {
        items.push({
          id: `hud-meas-${obj.id}`,
          objectId: obj.id,
          position3D: new THREE.Vector3(obj.position.x, topY, obj.position.z),
          badgeText: `📏 Measured: ${Math.round(obj.dimensions.width * 100)}×${Math.round(
            obj.dimensions.depth * 100
          )}cm (Y=${Math.round(obj.position.y * 100)}cm)`,
          subText: obj.name.split('(')[0].trim(),
          tone: 'measured',
        });
        seenObjectIds.add(obj.id);
      }
    });

    // 3. In AFTER mode, show remediation callouts for moved/recessed/added safety items
    if (remediationMode === 'AFTER') {
      objects.forEach((afterObj) => {
        if (activeLayerFilter !== 'all' && activeLayerFilter !== afterObj.layer) return;
        if (seenObjectIds.has(afterObj.id)) return;

        const beforeObj = beforeObjects.find((b) => b.id === afterObj.id);
        const topY = afterObj.position.y + afterObj.dimensions.height / 2 + 0.1;

        if (beforeObj) {
          const dxCm = Math.round((afterObj.position.x - beforeObj.position.x) * 100);
          const dzCm = Math.round((afterObj.position.z - beforeObj.position.z) * 100);
          const dwCm = Math.round((afterObj.dimensions.width - beforeObj.dimensions.width) * 100);
          const dhCm = Math.round((afterObj.dimensions.height - beforeObj.dimensions.height) * 100);

          if (Math.hypot(dxCm, dzCm) >= 4) {
            items.push({
              id: `hud-shift-${afterObj.id}`,
              objectId: afterObj.id,
              position3D: new THREE.Vector3(afterObj.position.x, topY, afterObj.position.z),
              badgeText: `↔ Relocated ${Math.round(Math.hypot(dxCm, dzCm))}cm`,
              subText: afterObj.name.split('(')[0].trim(),
              tone: 'remediated',
            });
          } else if (Math.abs(dwCm) >= 5 || afterObj.materialHazard === 'shatterproof_guarded') {
            items.push({
              id: `hud-guard-${afterObj.id}`,
              objectId: afterObj.id,
              position3D: new THREE.Vector3(afterObj.position.x, topY, afterObj.position.z),
              badgeText: `🛡️ Recessed & Shatter-Guarded`,
              subText: `Depth ${Math.round(afterObj.dimensions.width * 100)}cm · Safe Arc`,
              tone: 'remediated',
            });
          } else if (afterObj.category === 'door_threshold' && Math.abs(dhCm) >= 1) {
            items.push({
              id: `hud-ramp-${afterObj.id}`,
              objectId: afterObj.id,
              position3D: new THREE.Vector3(afterObj.position.x, topY + 0.08, afterObj.position.z),
              badgeText: `✅ Beveled Ramp (0.3cm)`,
              subText: 'Zero-lip doorway transition',
              tone: 'remediated',
            });
          }
        } else if (afterObj.category === 'safety_addition' || afterObj.category === 'grab_bar') {
          items.push({
            id: `hud-add-${afterObj.id}`,
            objectId: afterObj.id,
            position3D: new THREE.Vector3(afterObj.position.x, topY, afterObj.position.z),
            badgeText: `➕ Added: ${afterObj.name.split('(')[0].trim()}`,
            subText: `Y=${Math.round(afterObj.position.y * 100)}cm · Welfare Spec`,
            tone: 'remediated',
          });
        }
      });
    }

    return items.slice(0, 8);
  }, [hazards, objects, beforeObjects, remediationMode, activeLayerFilter]);

  // Apply camera presets when selected
  useEffect(() => {
    const orbit = orbitRef.current;
    if (cameraPreset === 'isometric') {
      orbit.theta = -0.62;
      orbit.phi = 1.05;
      orbit.radius = Math.max(roomDimensions.width, roomDimensions.depth) * 1.48;
      orbit.target.set(0, 0.92, 0);
    } else if (cameraPreset === 'head_strike') {
      // Close-up on the overhead cabinet & sit-to-stand head trajectory (130-190cm layer)
      orbit.theta = -0.95;
      orbit.phi = 1.18;
      orbit.radius = 2.15;
      orbit.target.set(0.25, 1.38, -0.35);
    } else if (cameraPreset === 'floor_stance') {
      // Low angle inspecting floor caddies, threshold, and crutch stance width
      orbit.theta = -0.45;
      orbit.phi = 1.32;
      orbit.radius = 2.55;
      orbit.target.set(0.0, 0.35, 0.15);
    } else if (cameraPreset === 'top_down') {
      orbit.theta = 0.0;
      orbit.phi = 0.18;
      orbit.radius = 4.2;
      orbit.target.set(0, 0.5, 0);
    }
  }, [cameraPreset, roomDimensions.width, roomDimensions.depth]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#060d1f');
    scene.fog = new THREE.FogExp2('#060d1f', 0.065);

    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 50);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight('#cbd5e1', 0.85);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight('#f8fafc', 1.25);
    dirLight.position.set(2.5, 4.5, 3.2);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const rimLight = new THREE.PointLight(
      remediationMode === 'BEFORE' ? '#ef4444' : '#10b981',
      0.8,
      6
    );
    rimLight.position.set(0.5, 1.9, -0.2);
    scene.add(rimLight);

    // Room Shell Group
    const roomGroup = new THREE.Group();
    scene.add(roomGroup);

    const { width: rw, height: rh, depth: rd } = roomDimensions;

    // Floor Slab
    const floorGeo = new THREE.PlaneGeometry(rw, rd);
    const floorMat = new THREE.MeshStandardMaterial({
      color: remediationMode === 'BEFORE' ? '#1e293b' : '#0f292a',
      roughness: 0.75,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    roomGroup.add(floorMesh);

    // Subtle Metric Grid on Floor (10cm / 50cm grid visual)
    const gridHelper = new THREE.GridHelper(
      Math.max(rw, rd),
      Math.round(Math.max(rw, rd) * 4),
      '#38bdf8',
      '#1e293b'
    );
    gridHelper.position.y = 0.003;
    (gridHelper.material as THREE.Material).opacity = 0.35;
    (gridHelper.material as THREE.Material).transparent = true;
    roomGroup.add(gridHelper);

    // Back Wall & Side Walls (Translucent architectural wireframe + tinted planes)
    const wallMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    });

    // Back wall (Z = -rd/2)
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(rw, rh), wallMat);
    backWall.position.set(0, rh / 2, -rd / 2);
    roomGroup.add(backWall);

    // Left wall (X = -rw/2)
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(rd, rh), wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-rw / 2, rh / 2, 0);
    roomGroup.add(leftWall);

    // Right wall (X = +rw/2)
    const rightWallMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide,
    });
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(rd, rh), rightWallMat);
    rightWall.rotation.y = Math.PI / 2;
    rightWall.position.set(rw / 2, rh / 2, 0);
    roomGroup.add(rightWall);

    // Room bounding box wireframe
    const roomBoxGeo = new THREE.BoxGeometry(rw, rh, rd);
    const roomEdges = new THREE.EdgesGeometry(roomBoxGeo);
    const roomLines = new THREE.LineSegments(
      roomEdges,
      new THREE.LineBasicMaterial({ color: '#475569', transparent: true, opacity: 0.6 })
    );
    roomLines.position.set(0, rh / 2, 0);
    roomGroup.add(roomLines);

    // -------------------------------------------------------------------------
    // 3 ELEVATION LAYER PLANES (Floor 0.30m, Mid 1.30m, Overhead 1.90m)
    // -------------------------------------------------------------------------
    if (showLayerSlices) {
      const layerSpecs: Array<{ y: number; color: string; layer: ElevationLayer }> = [
        { y: 0.3, color: '#38bdf8', layer: 'floor' },
        { y: 1.3, color: '#f59e0b', layer: 'mid' },
        { y: 1.85, color: '#f43f5e', layer: 'overhead' },
      ];

      layerSpecs.forEach((spec) => {
        if (activeLayerFilter !== 'all' && activeLayerFilter !== spec.layer) return;
        const sliceGeo = new THREE.PlaneGeometry(rw - 0.04, rd - 0.04);
        const sliceEdges = new THREE.EdgesGeometry(sliceGeo);
        const sliceLine = new THREE.LineSegments(
          sliceEdges,
          new THREE.LineDashedMaterial({
            color: spec.color,
            dashSize: 0.1,
            gapSize: 0.06,
            transparent: true,
            opacity: activeLayerFilter === spec.layer ? 0.9 : 0.4,
          })
        );
        sliceLine.computeLineDistances();
        sliceLine.rotation.x = -Math.PI / 2;
        sliceLine.position.set(0, spec.y, 0);
        roomGroup.add(sliceLine);
      });
    }

    // -------------------------------------------------------------------------
    // RENDER 3D SCENE OBJECTS (Fixtures, Floor Clutter, Overhead Glass Cabinet)
    // -------------------------------------------------------------------------
    const hazardObjectIds = new Set(hazards.flatMap((h) => h.objectIds));
    const interactiveMeshes: Array<{ mesh: THREE.Object3D; objectId: string }> = [];

    objects.forEach((obj) => {
      const isLayerMatch = activeLayerFilter === 'all' || obj.layer === activeLayerFilter;
      const isHazardObj = hazardObjectIds.has(obj.id);
      const isSelected = selectedObjectId === obj.id;
      const isGlassHazard = obj.materialHazard === 'tempered_glass';
      const isSafetyAddition =
        obj.category === 'safety_addition' || obj.materialHazard === 'shatterproof_guarded';

      const geo = new THREE.BoxGeometry(
        obj.dimensions.width,
        obj.dimensions.height,
        obj.dimensions.depth
      );

      let baseColor = obj.color || '#64748b';
      if (isHazardObj && remediationMode === 'BEFORE') {
        baseColor = isGlassHazard ? '#fb7185' : '#f97316';
      } else if (isSafetyAddition && remediationMode === 'AFTER') {
        baseColor = '#10b981';
      }

      const mat = new THREE.MeshPhysicalMaterial({
        color: baseColor,
        transparent: true,
        opacity: !isLayerMatch
          ? 0.15
          : obj.category === 'wet_zone'
          ? 0.45
          : isGlassHazard
          ? 0.72
          : 0.88,
        roughness: isGlassHazard ? 0.15 : 0.55,
        metalness: obj.category === 'grab_bar' ? 0.7 : 0.1,
        emissive: isSelected
          ? '#38bdf8'
          : isHazardObj && remediationMode === 'BEFORE'
          ? '#991b1b'
          : isSafetyAddition && remediationMode === 'AFTER'
          ? '#065f46'
          : '#000000',
        emissiveIntensity: isSelected ? 0.45 : isHazardObj || isSafetyAddition ? 0.35 : 0,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
      mesh.castShadow = obj.category !== 'wet_zone';
      mesh.receiveShadow = true;
      roomGroup.add(mesh);

      interactiveMeshes.push({ mesh, objectId: obj.id });

      // Crisp Bounding Box Edges
      const edgesGeo = new THREE.EdgesGeometry(geo);
      const edgeColor = isSelected
        ? '#38bdf8'
        : obj.lockedByUser
        ? '#eab308'
        : isHazardObj && remediationMode === 'BEFORE'
        ? '#ef4444'
        : isSafetyAddition
        ? '#34d399'
        : obj.measurementStatus === 'user_measured'
        ? '#10b981'
        : obj.measurementStatus === 'visual_estimate'
        ? '#fbbf24'
        : '#94a3b8';

      const edgeMat = new THREE.LineBasicMaterial({
        color: edgeColor,
        transparent: true,
        opacity: isLayerMatch ? 0.95 : 0.25,
      });
      const wireframe = new THREE.LineSegments(edgesGeo, edgeMat);
      mesh.add(wireframe);

      // If this is the overhead glass cabinet in BEFORE mode, add a downward red danger projection zone
      if (obj.category === 'overhead_cabinet' && remediationMode === 'BEFORE' && isHazardObj) {
        const dangerZoneHeight = obj.position.y - obj.dimensions.height / 2;
        const dangerGeo = new THREE.BoxGeometry(
          obj.dimensions.width,
          dangerZoneHeight,
          obj.dimensions.depth
        );
        const dangerMat = new THREE.MeshBasicMaterial({
          color: '#ef4444',
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
        });
        const dangerMesh = new THREE.Mesh(dangerGeo, dangerMat);
        dangerMesh.position.set(
          obj.position.x,
          dangerZoneHeight / 2,
          obj.position.z
        );
        roomGroup.add(dangerMesh);
      }
    });

    // -------------------------------------------------------------------------
    // P1-3: RENDER 3D DISPLACEMENT VECTORS & GHOST WIREFRAMES IN 'AFTER' MODE
    // -------------------------------------------------------------------------
    if (remediationMode === 'AFTER' && beforeObjects.length > 0) {
      beforeObjects.forEach((beforeObj) => {
        if (activeLayerFilter !== 'all' && activeLayerFilter !== beforeObj.layer) return;
        const afterObj = objects.find((o) => o.id === beforeObj.id);

        if (afterObj) {
          const fromVec = new THREE.Vector3(
            beforeObj.position.x,
            beforeObj.position.y,
            beforeObj.position.z
          );
          const toVec = new THREE.Vector3(
            afterObj.position.x,
            afterObj.position.y,
            afterObj.position.z
          );
          const dist = fromVec.distanceTo(toVec);
          const widthDelta = Math.abs(afterObj.dimensions.width - beforeObj.dimensions.width);

          if (dist > 0.04 || widthDelta > 0.05) {
            // 1. Ghost dashed wireframe at original BEFORE coordinates
            const ghostGeo = new THREE.BoxGeometry(
              beforeObj.dimensions.width,
              beforeObj.dimensions.height,
              beforeObj.dimensions.depth
            );
            const ghostEdges = new THREE.EdgesGeometry(ghostGeo);
            const ghostLine = new THREE.LineSegments(
              ghostEdges,
              new THREE.LineDashedMaterial({
                color: '#f43f5e',
                dashSize: 0.05,
                gapSize: 0.04,
                transparent: true,
                opacity: 0.55,
              })
            );
            ghostLine.computeLineDistances();
            ghostLine.position.copy(fromVec);
            roomGroup.add(ghostLine);

            // 2. 3D ArrowHelper showing displacement vector from BEFORE -> AFTER
            if (dist > 0.04) {
              const dir = toVec.clone().sub(fromVec).normalize();
              const arrow = new THREE.ArrowHelper(
                dir,
                fromVec,
                dist,
                0x34d399,
                Math.min(0.12, dist * 0.45),
                0.07
              );
              roomGroup.add(arrow);
            }
          }
        } else if (beforeObj.category === 'floor_clutter') {
          // Removed floor clutter footprint (dashed rose outline on floor showing cleared zone)
          const ghostGeo = new THREE.BoxGeometry(
            beforeObj.dimensions.width,
            0.02,
            beforeObj.dimensions.depth
          );
          const ghostEdges = new THREE.EdgesGeometry(ghostGeo);
          const ghostLine = new THREE.LineSegments(
            ghostEdges,
            new THREE.LineDashedMaterial({
              color: '#34d399',
              dashSize: 0.04,
              gapSize: 0.03,
              transparent: true,
              opacity: 0.5,
            })
          );
          ghostLine.computeLineDistances();
          ghostLine.position.set(beforeObj.position.x, 0.015, beforeObj.position.z);
          roomGroup.add(ghostLine);
        }
      });
    }

    // -------------------------------------------------------------------------
    // RENDER TRAJECTORY PATH & HEAD-STRIKE ARC
    // -------------------------------------------------------------------------
    if (waypoints.length >= 2) {
      // Floor path curve
      const floorPoints = waypoints.map((wp) => new THREE.Vector3(wp.x, 0.03, wp.z));
      const floorCurve = new THREE.CatmullRomCurve3(floorPoints);
      const floorTubeGeo = new THREE.TubeGeometry(floorCurve, 40, 0.022, 8, false);
      const floorTubeMat = new THREE.MeshBasicMaterial({
        color: remediationMode === 'BEFORE' ? '#f97316' : '#10b981',
        transparent: true,
        opacity: 0.85,
      });
      roomGroup.add(new THREE.Mesh(floorTubeGeo, floorTubeMat));

      // 3D Head-Arc Trajectory Curve (showing how head height + forward pitch travels in 3D space!)
      const userScale = profile.userHeightCm / 168;
      const headPoints = waypoints.map((wp) => {
        const rad = (wp.facingAngleDeg * Math.PI) / 180;
        const pitchScale = profile.sitToStandForwardPitchCm / 28;
        const hx = wp.x + Math.sin(rad) * wp.headForwardOffsetM * pitchScale;
        const hz = wp.z - Math.cos(rad) * wp.headForwardOffsetM * pitchScale;
        const hy = wp.headHeightM * userScale;
        return new THREE.Vector3(hx, hy, hz);
      });

      const headCurve = new THREE.CatmullRomCurve3(headPoints);
      const headTubeGeo = new THREE.TubeGeometry(headCurve, 48, 0.018, 8, false);
      const headTubeMat = new THREE.MeshBasicMaterial({
        color: remediationMode === 'BEFORE' ? '#f43f5e' : '#38bdf8',
        transparent: true,
        opacity: 0.9,
      });
      roomGroup.add(new THREE.Mesh(headTubeGeo, headTubeMat));

      // Waypoint markers on floor
      waypoints.forEach((wp, idx) => {
        const isCurrent = idx === activeWaypointIndex;
        const ringGeo = new THREE.RingGeometry(
          isCurrent ? 0.11 : 0.06,
          isCurrent ? 0.16 : 0.09,
          24
        );
        const ringMat = new THREE.MeshBasicMaterial({
          color: isCurrent ? '#38bdf8' : '#94a3b8',
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(wp.x, 0.02, wp.z);
        roomGroup.add(ring);
      });
    }

    // -------------------------------------------------------------------------
    // RENDER ARTICULATED 3D HUMAN AVATAR (Crutches vs. Manual Wheelchair)
    // -------------------------------------------------------------------------
    const activeWp =
      waypoints[Math.min(activeWaypointIndex, waypoints.length - 1)] || waypoints[0];

    const avatarGroup = new THREE.Group();
    if (activeWp) {
      const userScale = profile.userHeightCm / 168;
      const rad = (activeWp.facingAngleDeg * Math.PI) / 180;
      const pitchRad = (activeWp.torsoForwardPitchDeg * Math.PI) / 180;
      const pitchScale = profile.sitToStandForwardPitchCm / 28;

      avatarGroup.position.set(activeWp.x, 0, activeWp.z);
      avatarGroup.rotation.y = -rad;

      const bodyColor = remediationMode === 'BEFORE' ? '#38bdf8' : '#34d399';
      const bodyMat = new THREE.MeshStandardMaterial({
        color: bodyColor,
        roughness: 0.35,
        metalness: 0.15,
      });

      if (profile.id === 'wheelchair') {
        // Manual Wheelchair + Seated User
        const wheelRadius = 0.3;
        const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.04, 24);
        const wheelMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.6 });
        const rimGeo = new THREE.TorusGeometry(wheelRadius - 0.02, 0.015, 12, 28);
        const rimMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.8 });

        [-0.32, 0.32].forEach((sideX) => {
          const wheel = new THREE.Mesh(wheelGeo, wheelMat);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(sideX, wheelRadius, 0);
          avatarGroup.add(wheel);

          const rim = new THREE.Mesh(rimGeo, rimMat);
          rim.rotation.y = Math.PI / 2;
          rim.position.set(sideX + (sideX > 0 ? 0.025 : -0.025), wheelRadius, 0);
          avatarGroup.add(rim);
        });

        // Seat & Backrest
        const seat = new THREE.Mesh(
          new THREE.BoxGeometry(0.54, 0.06, 0.48),
          new THREE.MeshStandardMaterial({ color: '#334155' })
        );
        seat.position.set(0, 0.48, 0);
        avatarGroup.add(seat);

        // Seated Torso & Head
        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.52, 16), bodyMat);
        torso.position.set(0, 0.78, -0.04);
        avatarGroup.add(torso);

        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.125, 24, 24),
          new THREE.MeshStandardMaterial({ color: '#f8fafc', emissive: bodyColor, emissiveIntensity: 0.25 })
        );
        head.position.set(0, 1.18, -0.06);
        avatarGroup.add(head);

        // Turning Circle Ring on Floor
        const turnRadiusM = profile.turningRadiusCm / 200;
        const turnRing = new THREE.Mesh(
          new THREE.RingGeometry(turnRadiusM - 0.02, turnRadiusM, 48),
          new THREE.MeshBasicMaterial({
            color: remediationMode === 'BEFORE' ? '#ef4444' : '#10b981',
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.45,
          })
        );
        turnRing.rotation.x = -Math.PI / 2;
        turnRing.position.y = 0.015;
        avatarGroup.add(turnRing);
      } else {
        // Articulated Crutch User
        const isSittingOrRising =
          activeWp.posture === 'sitting' || activeWp.posture === 'sit_to_stand_lean';
        const hipHeight = (isSittingOrRising ? 0.72 : 0.88) * userScale;

        // Legs
        const legGeo = new THREE.CylinderGeometry(0.055, 0.045, hipHeight, 12);
        [-0.12, 0.12].forEach((lx) => {
          const leg = new THREE.Mesh(legGeo, bodyMat);
          leg.position.set(lx, hipHeight / 2, 0);
          avatarGroup.add(leg);
        });

        // Upper body pivot group at hips
        const upperBodyPivot = new THREE.Group();
        upperBodyPivot.position.set(0, hipHeight, 0);
        upperBodyPivot.rotation.x = -pitchRad * pitchScale;

        const torsoLen = 0.52 * userScale;
        const torsoMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.12, torsoLen, 16),
          bodyMat
        );
        torsoMesh.position.set(0, torsoLen / 2, 0);
        upperBodyPivot.add(torsoMesh);

        // Head Sphere
        const hasOverheadHazardHere = hazards.some(
          (h) => h.layer === 'overhead' && h.waypointId === activeWp.id
        );
        const headMat = new THREE.MeshStandardMaterial({
          color: hasOverheadHazardHere && remediationMode === 'BEFORE' ? '#ef4444' : '#f8fafc',
          emissive: hasOverheadHazardHere && remediationMode === 'BEFORE' ? '#dc2626' : bodyColor,
          emissiveIntensity: hasOverheadHazardHere && remediationMode === 'BEFORE' ? 0.75 : 0.25,
          roughness: 0.2,
        });
        const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.125, 24, 24), headMat);
        headMesh.position.set(0, torsoLen + 0.16 * userScale, 0);
        upperBodyPivot.add(headMesh);

        // Head safety envelope wireframe sphere
        const headEnvelope = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 16, 16),
          new THREE.MeshBasicMaterial({
            color: hasOverheadHazardHere && remediationMode === 'BEFORE' ? '#ef4444' : '#38bdf8',
            wireframe: true,
            transparent: true,
            opacity: 0.45,
          })
        );
        headEnvelope.position.copy(headMesh.position);
        upperBodyPivot.add(headEnvelope);

        avatarGroup.add(upperBodyPivot);

        // Bilateral Axillary / Forearm Crutches
        const stanceHalfWidthM = (profile.minPassageWidthCm / 100) * 0.46;
        const crutchMat = new THREE.MeshStandardMaterial({
          color: '#fbbf24',
          metalness: 0.6,
          roughness: 0.3,
        });
        const crutchLen = 1.18 * userScale;
        const crutchGeo = new THREE.CylinderGeometry(0.018, 0.014, crutchLen, 10);

        [-stanceHalfWidthM, stanceHalfWidthM].forEach((cx, idx) => {
          const crutch = new THREE.Mesh(crutchGeo, crutchMat);
          if (activeWp.posture === 'overhead_reach' && idx === 1 && remediationMode === 'BEFORE') {
            crutch.position.set(cx * 0.85, crutchLen * 0.68, -0.18);
            crutch.rotation.z = -0.35;
            crutch.rotation.x = -0.45;
          } else {
            crutch.position.set(cx, crutchLen / 2, -0.08);
            crutch.rotation.z = cx > 0 ? 0.14 : -0.14;
            crutch.rotation.x = -0.1;
          }
          avatarGroup.add(crutch);
        });

        // Floor Stance Width Indicator Bar under Crutch Tips
        const stanceBarGeo = new THREE.BoxGeometry(stanceHalfWidthM * 2.1, 0.015, 0.08);
        const stanceBarMat = new THREE.MeshBasicMaterial({
          color: remediationMode === 'BEFORE' ? '#f59e0b' : '#10b981',
          transparent: true,
          opacity: 0.7,
        });
        const stanceBar = new THREE.Mesh(stanceBarGeo, stanceBarMat);
        stanceBar.position.set(0, 0.01, -0.08);
        avatarGroup.add(stanceBar);
      }

      scene.add(avatarGroup);
    }

    // -------------------------------------------------------------------------
    // RENDER 3D COLLISION HAZARD SPHERES & PULSING RINGS
    // -------------------------------------------------------------------------
    const pulsingRings: THREE.Mesh[] = [];
    hazards.forEach((haz) => {
      if (activeLayerFilter !== 'all' && activeLayerFilter !== haz.layer) return;

      const { x, y, z } = haz.collisionPoint3D;
      const isCrit = haz.severity === 'CRITICAL';
      const color = isCrit ? '#ef4444' : '#f59e0b';

      const sphereGeo = new THREE.SphereGeometry(isCrit ? 0.085 : 0.065, 20, 20);
      const sphereMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.position.set(x, y, z);
      scene.add(sphere);

      const outerGeo = new THREE.SphereGeometry(0.16, 16, 16);
      const outerMat = new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity: 0.65,
      });
      const outerSphere = new THREE.Mesh(outerGeo, outerMat);
      outerSphere.position.set(x, y, z);
      scene.add(outerSphere);
      pulsingRings.push(outerSphere);
    });

    // -------------------------------------------------------------------------
    // INTERACTIVE POINTER ORBIT + CLICK SELECTION
    // -------------------------------------------------------------------------
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const onPointerDown = (e: MouseEvent) => {
      orbitRef.current.isDragging = true;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: MouseEvent) => {
      if (!orbitRef.current.isDragging) return;
      const dx = e.clientX - orbitRef.current.lastX;
      const dy = e.clientY - orbitRef.current.lastY;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;

      orbitRef.current.theta -= dx * 0.0075;
      orbitRef.current.phi = Math.max(
        0.15,
        Math.min(Math.PI / 2 - 0.04, orbitRef.current.phi - dy * 0.0065)
      );
    };

    const onPointerUp = (e: MouseEvent) => {
      orbitRef.current.isDragging = false;
      const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (moveDist < 5) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);

        const targets = interactiveMeshes.map((m) => m.mesh);
        const hits = raycaster.intersectObjects(targets, false);
        if (hits.length > 0) {
          const hitMesh = hits[0].object;
          const found = interactiveMeshes.find((m) => m.mesh === hitMesh);
          if (found) {
            onSelectObject(found.objectId === selectedObjectId ? null : found.objectId);
          }
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbitRef.current.radius = Math.max(
        1.5,
        Math.min(6.5, orbitRef.current.radius + e.deltaY * 0.0025)
      );
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    domElem.addEventListener('wheel', onWheel, { passive: false });

    // Animation Loop + 3D-to-2D HUD Projection
    let animId = 0;
    let clock = 0;
    const tempProjVec = new THREE.Vector3();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      clock += 0.045;

      // Update camera position from spherical coordinates
      const { theta, phi, radius, target } = orbitRef.current;
      camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = target.y + radius * Math.cos(phi);
      camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(target);
      camera.updateMatrixWorld();

      // Pulse collision spheres
      const scale = 1 + Math.sin(clock * 2.2) * 0.25;
      pulsingRings.forEach((ring) => {
        ring.scale.set(scale, scale, scale);
      });

      // Update 3D-to-2D projected floating HUD callouts
      if (showHudCallouts) {
        const cw = container.clientWidth || width;
        const ch = container.clientHeight || height;
        hudCallouts.forEach((callout) => {
          const el = hudItemRefs.current[callout.id];
          if (!el) return;
          tempProjVec.copy(callout.position3D).project(camera);
          // Check if inside camera frustum
          if (tempProjVec.z > 1 || tempProjVec.z < -1) {
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
            return;
          }
          const screenX = (tempProjVec.x * 0.5 + 0.5) * cw;
          const screenY = (-tempProjVec.y * 0.5 + 0.5) * ch;
          if (screenX < 25 || screenX > cw - 25 || screenY < 45 || screenY > ch - 55) {
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
            return;
          }
          el.style.opacity = '1';
          el.style.pointerEvents = 'auto';
          el.style.transform = `translate3d(${Math.round(screenX)}px, ${Math.round(screenY)}px, 0) translate(-50%, -100%)`;
        });
      }

      renderer.render(scene, camera);
    };
    animate();

    // Handle Resize
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 520;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      domElem.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      domElem.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [
    roomDimensions,
    objects,
    beforeObjects,
    waypoints,
    activeWaypointIndex,
    hazards,
    profile,
    remediationMode,
    activeLayerFilter,
    selectedObjectId,
    showLayerSlices,
    showHudCallouts,
    hudCallouts,
  ]);

  const activeWaypoint =
    waypoints[Math.min(activeWaypointIndex, waypoints.length - 1)] || waypoints[0];
  const selectedObj = objects.find((o) => o.id === selectedObjectId);

  return (
    <div className="relative w-full h-[500px] lg:h-[560px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl select-none">
      {/* Three.js Canvas Mount */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* P1-3: Real-Time 3D-to-2D Projected Floating HUD Callouts */}
      {showHudCallouts && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
          {hudCallouts.map((callout) => {
            const isSelected = callout.objectId && selectedObjectId === callout.objectId;
            const toneStyle =
              callout.tone === 'critical'
                ? 'bg-rose-950/90 border-rose-500/80 text-rose-100 shadow-rose-950/60'
                : callout.tone === 'warning'
                ? 'bg-amber-950/90 border-amber-400/80 text-amber-100 shadow-amber-950/60'
                : callout.tone === 'locked'
                ? 'bg-yellow-950/90 border-yellow-400/80 text-yellow-100 shadow-yellow-950/60'
                : callout.tone === 'measured'
                ? 'bg-sky-950/90 border-sky-400/80 text-sky-100 shadow-sky-950/60'
                : 'bg-emerald-950/90 border-emerald-400/80 text-emerald-100 shadow-emerald-950/60';

            return (
              <button
                key={callout.id}
                ref={(el) => {
                  hudItemRefs.current[callout.id] = el;
                }}
                type="button"
                onClick={() => {
                  if (callout.objectId) {
                    onSelectObject(
                      selectedObjectId === callout.objectId ? null : callout.objectId
                    );
                  }
                }}
                style={{ opacity: 0, left: 0, top: 0 }}
                className={`absolute px-2 py-1 rounded-lg border text-left backdrop-blur-md shadow-lg transition-opacity duration-150 ${toneStyle} ${
                  isSelected ? 'ring-2 ring-sky-400 scale-105' : 'hover:scale-105'
                }`}
              >
                <div className="text-[10px] font-bold font-mono leading-tight whitespace-nowrap">
                  {callout.badgeText}
                </div>
                <div className="text-[9px] opacity-80 leading-tight whitespace-nowrap">
                  {callout.subText}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Top-Left Status Overlay Badge */}
      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 pointer-events-none z-20">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-md border shadow-lg ${
            remediationMode === 'BEFORE'
              ? 'bg-rose-950/85 border-rose-500/50 text-rose-200'
              : 'bg-emerald-950/85 border-emerald-500/50 text-emerald-200'
          }`}
        >
          {remediationMode === 'BEFORE' ? (
            <>
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>BEFORE: Unmodified Room ({hazards.length} 3D Collisions Detected)</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>AFTER: Argon 3D Remediated Patch ({hazards.length} Collisions)</span>
            </>
          )}
        </div>

        <div className="px-2.5 py-1 rounded-lg bg-slate-900/85 border border-slate-700/70 text-[11px] font-mono text-slate-300 backdrop-blur-md">
          Room: {roomDimensions.width.toFixed(1)}m × {roomDimensions.depth.toFixed(1)}m ×{' '}
          {roomDimensions.height.toFixed(1)}m
        </div>
      </div>

      {/* Top-Right Camera Preset Controls */}
      <div className="absolute top-3 right-3 flex flex-wrap items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 p-1.5 rounded-xl backdrop-blur-md z-20">
        {(
          [
            { id: 'isometric', label: '3D Orbit' },
            { id: 'head_strike', label: 'Overhead Arc (130-195cm)' },
            { id: 'floor_stance', label: 'Floor Stance (0-30cm)' },
            { id: 'top_down', label: 'Top Plan' },
          ] as Array<{ id: CameraPreset; label: string }>
        ).map((preset) => (
          <button
            key={preset.id}
            onClick={() => setCameraPreset(preset.id)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
              cameraPreset === preset.id
                ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            {preset.label}
          </button>
        ))}
        <button
          onClick={() => setShowHudCallouts((v) => !v)}
          title="Toggle 3D Floating HUD Callout Badges"
          className={`px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition ${
            showHudCallouts
              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          <Tag className="w-3 h-3" />
          <span>HUD</span>
        </button>
        <button
          onClick={() => setShowLayerSlices((v) => !v)}
          title="Toggle 3D Elevation Slice Planes"
          className={`p-1.5 rounded-lg text-xs transition ${
            showLayerSlices ? 'bg-slate-800 text-sky-400' : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setCameraPreset('isometric')}
          title="Reset Camera"
          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Elevation Layer Legend (Left Side) */}
      <div className="absolute left-3 bottom-16 hidden sm:flex flex-col gap-1.5 bg-slate-900/85 border border-slate-800/90 p-2.5 rounded-xl backdrop-blur-md text-[11px] pointer-events-none z-20">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
          3D Volumetric Check Layers
        </div>
        <div className="flex items-center gap-2 text-rose-300">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
          <span>Overhead Layer (130–195cm): Sit-to-Stand Head Arc</span>
        </div>
        <div className="flex items-center gap-2 text-amber-300">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
          <span>Mid Layer (30–130cm): Turning Ø &amp; Grab Bar Transfer</span>
        </div>
        <div className="flex items-center gap-2 text-sky-300">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
          <span>Floor Layer (0–30cm): Crutch Stance, Clutter &amp; Threshold</span>
        </div>
      </div>

      {/* Selected Object Inspector Popup (Right Bottom) */}
      {selectedObj && (
        <div className="absolute right-3 bottom-16 max-w-xs bg-slate-900/95 border border-sky-500/50 p-3 rounded-xl backdrop-blur-md shadow-xl text-xs z-20">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-semibold text-sky-300 truncate">{selectedObj.name}</span>
            <button
              onClick={() => onSelectObject(null)}
              className="text-slate-400 hover:text-white text-[11px]"
            >
              ✕
            </button>
          </div>
          <div className="text-[11px] text-slate-400 mb-1.5">{selectedObj.koreanName}</div>
          <div className="grid grid-cols-2 gap-1 text-[11px] font-mono bg-slate-950/70 p-1.5 rounded-lg mb-1.5">
            <div>Layer: {selectedObj.layer.toUpperCase()}</div>
            <div>
              Size: {Math.round(selectedObj.dimensions.width * 100)}×
              {Math.round(selectedObj.dimensions.height * 100)}×
              {Math.round(selectedObj.dimensions.depth * 100)}cm
            </div>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">{selectedObj.evidenceNote}</p>
          {selectedObj.uncertaintyNote && (
            <p className="mt-1 text-[10px] text-amber-300/90 bg-amber-950/50 border border-amber-500/30 px-2 py-1 rounded">
              ⚠️ {selectedObj.uncertaintyNote}
            </p>
          )}
          {selectedObj.lockedByUser && (
            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-yellow-300 font-medium">
              <Lock className="w-3 h-3" /> Locked by Caregiver (HITL Constraint)
            </div>
          )}
        </div>
      )}

      {/* Bottom Active Waypoint Kinematic Bar */}
      {activeWaypoint && (
        <div className="absolute bottom-3 inset-x-3 bg-slate-900/90 border border-slate-700/80 px-3.5 py-2 rounded-xl backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-2 z-20">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400/40 text-sky-300 font-mono text-xs font-semibold shrink-0">
              Step {activeWaypoint.stepNumber}/{waypoints.length}
            </span>
            <div className="truncate">
              <span className="text-xs font-semibold text-white mr-2">{activeWaypoint.label}</span>
              <span className="text-xs text-slate-300 hidden md:inline">
                — {activeWaypoint.description}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono text-slate-300 shrink-0">
            <span>Torso Pitch: +{activeWaypoint.torsoForwardPitchDeg}°</span>
            <span>Head Y: {Math.round(activeWaypoint.headHeightM * 100)}cm</span>
            <span className="text-slate-400 hidden sm:inline">
              <Eye className="w-3.5 h-3.5 inline mr-1" />
              Drag to orbit · Scroll to zoom · Click box/HUD to inspect
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
