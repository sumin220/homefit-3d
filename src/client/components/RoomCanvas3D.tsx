import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  CollisionHazard,
  ElevationLayer,
  IndoorMobilityProfile,
  SceneObject3D,
  TrajectoryWaypoint,
} from '../../shared/types';
import {
  Eye,
  Layers,
  RotateCcw,
  ShieldAlert,
  CheckCircle2,
  Tag,
  Columns,
  Camera,
  Box,
} from 'lucide-react';
import { PhotoAROverlay } from './PhotoAROverlay';
import { HoverTooltip } from './HoverTooltip';
import {
  buildArchitecturalRoomShell,
  createArchitecturalObjectGroup,
  createArticulatedHumanAvatar,
} from './architectural3DBuilder';

interface RoomCanvas3DProps {
  photoUrl?: string;
  roomTitle?: string;
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
type SimulationViewMode = 'split' | 'photo_ar' | 'twin_3d';

interface HudCalloutDescriptor {
  id: string;
  objectId: string | null;
  position3D: THREE.Vector3;
  badgeText: string;
  tone: 'critical' | 'warning' | 'locked' | 'measured' | 'remediated';
}

export const RoomCanvas3D: React.FC<RoomCanvas3DProps> = ({
  photoUrl = '/presets/preset-1-bathroom-cabinet.png',
  roomTitle = 'Indoor Accessibility Simulation',
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
  const [viewMode, setViewMode] = useState<SimulationViewMode>('split');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [showLayerSlices, setShowLayerSlices] = useState<boolean>(false);
  const [showHudCallouts, setShowHudCallouts] = useState<boolean>(true);

  // Store spherical orbit coordinates in a ref for interactive drag/zoom
  const orbitRef = useRef({
    theta: -0.58,
    phi: 1.08,
    radius: 3.45,
    target: new THREE.Vector3(0, 0.92, 0),
    isDragging: false,
    lastX: 0,
    lastY: 0,
  });

  // De-cluttered 3D-to-2D HUD pins (concise 1-line pills, prioritized so they never flood the view)
  const hudCallouts: HudCalloutDescriptor[] = React.useMemo(() => {
    const items: HudCalloutDescriptor[] = [];
    const seenObjectIds = new Set<string>();
    const hazardObjIds = new Set<string>();
    hazards.forEach((h) => h.objectIds.forEach((id) => hazardObjIds.add(id)));

    // 1. Selected object always gets a pin if not already covered
    if (selectedObjectId) {
      const selObj = objects.find((o) => o.id === selectedObjectId);
      if (selObj) {
        seenObjectIds.add(selObj.id);
        items.push({
          id: `hud-sel-${selObj.id}`,
          objectId: selObj.id,
          position3D: new THREE.Vector3(
            selObj.position.x,
            selObj.position.y + selObj.dimensions.height / 2 + 0.12,
            selObj.position.z
          ),
          badgeText: `🎯 ${selObj.name.split('(')[0].trim()}`,
          tone: hazardObjIds.has(selObj.id)
            ? 'critical'
            : selObj.lockedByUser
            ? 'locked'
            : 'remediated',
        });
      }
    }

    // 2. Primary Collision Hazards (concise single-line label)
    hazards.forEach((haz) => {
      if (activeLayerFilter !== 'all' && activeLayerFilter !== haz.layer) return;
      const primaryObjId = haz.objectIds[0] || null;
      if (primaryObjId) seenObjectIds.add(primaryObjId);

      let shortBadge = `⚠️ ${haz.measuredValueCm}cm`;
      if (haz.hazardType === 'OVERHEAD_GLASS_HEAD_STRIKE') {
        shortBadge = `💥 Head Strike (${haz.measuredValueCm >= 0 ? `+${haz.measuredValueCm}` : haz.measuredValueCm}cm)`;
      } else if (haz.hazardType === 'HIGH_REACH_CRUTCH_RELEASE') {
        shortBadge = `⬆️ High Reach Y=${haz.measuredValueCm}cm`;
      } else if (haz.hazardType === 'FLOOR_CLUTTER_STANCE_BLOCK') {
        shortBadge = `📏 Stance ${haz.measuredValueCm}cm < ${haz.requiredValueCm}cm`;
      } else if (haz.hazardType === 'PASSAGE_PINCH_COLLISION') {
        shortBadge = `📐 Passage ${haz.measuredValueCm}cm < ${haz.requiredValueCm}cm`;
      } else if (haz.hazardType === 'THRESHOLD_TRIP_OR_BLOCK') {
        shortBadge = `⚡ Step Lip ${haz.measuredValueCm}cm`;
      } else if (haz.hazardType === 'TURNING_RADIUS_COLLISION') {
        shortBadge = `🔄 Turn Ø ${haz.measuredValueCm}cm`;
      } else if (haz.hazardType === 'WET_FLOOR_SLIP_AMPLIFIER') {
        shortBadge = `💧 Wet Tile Slip Risk`;
      }

      items.push({
        id: `hud-haz-${haz.id}`,
        objectId: primaryObjId,
        position3D: new THREE.Vector3(
          haz.collisionPoint3D.x,
          haz.collisionPoint3D.y + 0.12,
          haz.collisionPoint3D.z
        ),
        badgeText: shortBadge,
        tone: haz.severity === 'CRITICAL' ? 'critical' : 'warning',
      });
    });

    // 3. Caregiver Locked (HITL) or User Tape-Measured objects
    objects.forEach((obj) => {
      if (activeLayerFilter !== 'all' && activeLayerFilter !== obj.layer) return;
      const topY = obj.position.y + obj.dimensions.height / 2 + 0.1;

      if (obj.lockedByUser) {
        items.push({
          id: `hud-lock-${obj.id}`,
          objectId: obj.id,
          position3D: new THREE.Vector3(obj.position.x, topY, obj.position.z),
          badgeText: `🔒 Locked: ${obj.name.split('(')[0].trim()}`,
          tone: 'locked',
        });
      } else if (obj.measurementStatus === 'user_measured') {
        items.push({
          id: `hud-meas-${obj.id}`,
          objectId: obj.id,
          position3D: new THREE.Vector3(obj.position.x, topY, obj.position.z),
          badgeText: `📏 Tape: ${Math.round(obj.dimensions.width * 100)}×${Math.round(
            obj.dimensions.depth * 100
          )}cm`,
          tone: 'measured',
        });
      }
    });

    // 4. AFTER mode key safety remediation badges
    if (remediationMode === 'AFTER') {
      objects.forEach((afterObj) => {
        if (activeLayerFilter !== 'all' && activeLayerFilter !== afterObj.layer) return;
        if (seenObjectIds.has(afterObj.id)) return;
        const beforeObj = beforeObjects.find((b) => b.id === afterObj.id);
        if (!beforeObj) {
          items.push({
            id: `hud-new-${afterObj.id}`,
            objectId: afterObj.id,
            position3D: new THREE.Vector3(
              afterObj.position.x,
              afterObj.position.y + afterObj.dimensions.height / 2 + 0.1,
              afterObj.position.z
            ),
            badgeText: `✨ +${afterObj.name.split('(')[0].trim()}`,
            tone: 'remediated',
          });
        } else {
          const distCm = Math.round(
            Math.hypot(
              afterObj.position.x - beforeObj.position.x,
              afterObj.position.y - beforeObj.position.y,
              afterObj.position.z - beforeObj.position.z
            ) * 100
          );
          const depthDiffCm = Math.round(
            (beforeObj.dimensions.depth - afterObj.dimensions.depth) * 100
          );
          if (distCm >= 8 || depthDiffCm >= 4) {
            items.push({
              id: `hud-move-${afterObj.id}`,
              objectId: afterObj.id,
              position3D: new THREE.Vector3(
                afterObj.position.x,
                afterObj.position.y + afterObj.dimensions.height / 2 + 0.1,
                afterObj.position.z
              ),
              badgeText:
                depthDiffCm >= 4
                  ? `🔧 Depth -${depthDiffCm}cm`
                  : `🔧 Shifted ${distCm}cm`,
              tone: 'remediated',
            });
          }
        }
      });
    }

    // Cap at 4 pins maximum so the 3D scene stays crisp and uncluttered
    return items.slice(0, 4);
  }, [hazards, objects, beforeObjects, remediationMode, activeLayerFilter, selectedObjectId]);

  // Apply camera presets
  useEffect(() => {
    if (cameraPreset === 'isometric') {
      orbitRef.current.theta = -0.58;
      orbitRef.current.phi = 1.08;
      orbitRef.current.radius = 3.45;
      orbitRef.current.target.set(0, 0.92, 0);
    } else if (cameraPreset === 'head_strike') {
      orbitRef.current.theta = -1.22;
      orbitRef.current.phi = 1.32;
      orbitRef.current.radius = 2.45;
      orbitRef.current.target.set(0.15, 1.32, -0.35);
    } else if (cameraPreset === 'floor_stance') {
      orbitRef.current.theta = -0.32;
      orbitRef.current.phi = 0.88;
      orbitRef.current.radius = 2.75;
      orbitRef.current.target.set(0.0, 0.42, 0.1);
    } else if (cameraPreset === 'top_down') {
      orbitRef.current.theta = 0;
      orbitRef.current.phi = 0.18;
      orbitRef.current.radius = 4.2;
      orbitRef.current.target.set(0, 0.5, 0);
    }
  }, [cameraPreset]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container || viewMode === 'photo_ar') return;

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 480;

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 50);

    const updateCameraFromOrbit = () => {
      const { theta, phi, radius, target } = orbitRef.current;
      const clampedPhi = Math.max(0.12, Math.min(Math.PI / 2 - 0.04, phi));
      camera.position.x = target.x + radius * Math.sin(clampedPhi) * Math.sin(theta);
      camera.position.y = target.y + radius * Math.cos(clampedPhi);
      camera.position.z = target.z + radius * Math.sin(clampedPhi) * Math.cos(theta);
      camera.lookAt(target);
    };
    updateCameraFromOrbit();

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Architectural Room Shell (Tiled Floor, Wainscoting Walls, Baseboards, Lighting)
    const roomGroup = new THREE.Group();
    scene.add(roomGroup);
    buildArchitecturalRoomShell(scene, roomGroup, roomDimensions, remediationMode);

    // Optional 3-Layer Elevation Planes (only when toggled on)
    if (showLayerSlices) {
      const sliceLevels = [
        { y: 0.3, color: '#f97316', layer: 'floor' as ElevationLayer },
        { y: 1.3, color: '#38bdf8', layer: 'mid' as ElevationLayer },
        { y: 1.46, color: '#e11d48', layer: 'overhead' as ElevationLayer },
      ];
      sliceLevels.forEach((slice) => {
        if (activeLayerFilter !== 'all' && activeLayerFilter !== slice.layer) return;
        const planeGeo = new THREE.PlaneGeometry(roomDimensions.width, roomDimensions.depth);
        const planeMat = new THREE.MeshBasicMaterial({
          color: slice.color,
          transparent: true,
          opacity: 0.07,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = slice.y;
        scene.add(plane);
      });
    }

    // 3. Multi-Part Architectural 3D Objects (Toilet, Glass Cabinet, Grab Bar, Sink, Basins, Ramp, Furniture)
    const clickableMeshes: THREE.Object3D[] = [];
    const hazardObjIds = new Set<string>();
    hazards.forEach((h) => h.objectIds.forEach((id) => hazardObjIds.add(id)));

    objects.forEach((obj) => {
      const isLayerMatch = activeLayerFilter === 'all' || activeLayerFilter === obj.layer;
      const isSelected = obj.id === selectedObjectId;
      const isHazardObj = hazardObjIds.has(obj.id);

      const { group, hitMesh } = createArchitecturalObjectGroup(obj, {
        isLayerMatch,
        isHazardObj,
        isSelected,
        remediationMode,
      });
      scene.add(group);

      hitMesh.userData = { objectId: obj.id };
      clickableMeshes.push(hitMesh);

      group.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Mesh).isMesh) {
          child.userData = { objectId: obj.id };
          clickableMeshes.push(child);
        }
      });
    });

    // 4. Subtle AFTER Mode Displacement Vectors (Ghost Outline + Shift Arrow)
    if (remediationMode === 'AFTER' && beforeObjects.length > 0) {
      objects.forEach((afterObj) => {
        const beforeObj = beforeObjects.find((b) => b.id === afterObj.id);
        if (!beforeObj) return;

        const startVec = new THREE.Vector3(
          beforeObj.position.x,
          beforeObj.position.y,
          beforeObj.position.z
        );
        const endVec = new THREE.Vector3(
          afterObj.position.x,
          afterObj.position.y,
          afterObj.position.z
        );
        const dist = startVec.distanceTo(endVec);
        const depthChanged =
          Math.abs(beforeObj.dimensions.depth - afterObj.dimensions.depth) > 0.04;

        if (dist > 0.08 || depthChanged) {
          const ghostGeo = new THREE.BoxGeometry(
            beforeObj.dimensions.width,
            beforeObj.dimensions.height,
            beforeObj.dimensions.depth
          );
          const ghostEdges = new THREE.EdgesGeometry(ghostGeo);
          const ghostLine = new THREE.LineSegments(
            ghostEdges,
            new THREE.LineBasicMaterial({
              color: '#94a3b8',
              transparent: true,
              opacity: 0.28,
            })
          );
          ghostLine.position.copy(startVec);
          scene.add(ghostLine);

          if (dist > 0.08) {
            const dir = endVec.clone().sub(startVec).normalize();
            const arrowHelper = new THREE.ArrowHelper(
              dir,
              startVec,
              dist,
              0x34d399,
              Math.min(0.14, dist * 0.35),
              0.08
            );
            scene.add(arrowHelper);
          }
        }
      });
    }

    // 5. Floor Trajectory Ribbon & Sit-to-Stand Head Arc
    if (waypoints.length > 0) {
      const floorPoints = waypoints.map((wp) => new THREE.Vector3(wp.x, 0.025, wp.z));
      if (floorPoints.length >= 2) {
        const floorCurve = new THREE.CatmullRomCurve3(floorPoints);
        const tubeGeo = new THREE.TubeGeometry(floorCurve, 48, 0.024, 8, false);
        const tubeMat = new THREE.MeshStandardMaterial({
          color: remediationMode === 'AFTER' ? '#10b981' : '#38bdf8',
          emissive: remediationMode === 'AFTER' ? '#059669' : '#0284c7',
          emissiveIntensity: 0.45,
          roughness: 0.3,
        });
        const floorTube = new THREE.Mesh(tubeGeo, tubeMat);
        scene.add(floorTube);
      }

      // Head trajectory arc (smoothly traces sit-to-stand forward pitch)
      const headPoints = waypoints.map((wp) => {
        const rad = (wp.facingAngleDeg * Math.PI) / 180;
        const forwardShift =
          remediationMode === 'AFTER' && wp.posture === 'sit_to_stand_lean'
            ? wp.headForwardOffsetM * 0.45
            : wp.headForwardOffsetM;
        const headX = wp.x + Math.sin(rad) * forwardShift;
        const headZ = wp.z - Math.cos(rad) * forwardShift;
        return new THREE.Vector3(headX, wp.headHeightM, headZ);
      });
      if (headPoints.length >= 2) {
        const headCurve = new THREE.CatmullRomCurve3(headPoints);
        const headTubeGeo = new THREE.TubeGeometry(headCurve, 48, 0.014, 8, false);
        const hasOverheadCollision = hazards.some((h) => h.layer === 'overhead');
        const headTubeMat = new THREE.MeshStandardMaterial({
          color: hasOverheadCollision ? '#f43f5e' : '#34d399',
          emissive: hasOverheadCollision ? '#e11d48' : '#059669',
          emissiveIntensity: 0.65,
        });
        const headTube = new THREE.Mesh(headTubeGeo, headTubeMat);
        scene.add(headTube);
      }

      // Clean floor step markers
      waypoints.forEach((wp, idx) => {
        const isActive = idx === activeWaypointIndex;
        const ringGeo = new THREE.RingGeometry(
          isActive ? 0.11 : 0.06,
          isActive ? 0.15 : 0.09,
          32
        );
        const ringMat = new THREE.MeshBasicMaterial({
          color: isActive
            ? remediationMode === 'AFTER'
              ? '#10b981'
              : '#38bdf8'
            : '#64748b',
          side: THREE.DoubleSide,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = -Math.PI / 2;
        ringMesh.position.set(wp.x, 0.028, wp.z);
        scene.add(ringMesh);
      });
    }

    // 6. Articulated 3D Human Mannequin & Mobility Aid at Active Waypoint
    const activeWp = waypoints[activeWaypointIndex] || waypoints[0];
    const hasHeadHazard = hazards.some((h) => h.hazardType === 'OVERHEAD_GLASS_HEAD_STRIKE');
    if (activeWp) {
      const avatarGroup = createArticulatedHumanAvatar(
        activeWp,
        profile,
        remediationMode,
        hasHeadHazard
      );
      scene.add(avatarGroup);
    }

    // 7. Clean Subtle Hazard Pulse Rings (Replaces giant cluttered wireframe spheres)
    const hazardRingMeshes: THREE.Mesh[] = [];
    hazards.forEach((haz) => {
      if (activeLayerFilter !== 'all' && activeLayerFilter !== haz.layer) return;

      const ringGeo = new THREE.RingGeometry(0.08, 0.13, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: haz.severity === 'CRITICAL' ? '#f43f5e' : '#f59e0b',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(
        haz.collisionPoint3D.x,
        Math.max(0.03, haz.collisionPoint3D.y),
        haz.collisionPoint3D.z
      );
      if (haz.layer === 'floor') {
        ring.rotation.x = -Math.PI / 2;
      } else {
        ring.lookAt(camera.position);
      }
      scene.add(ring);
      hazardRingMeshes.push(ring);
    });

    // 8. Mouse Orbit, Wheel Zoom & Click Raycasting
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const handlePointerDown = (event: MouseEvent) => {
      orbitRef.current.isDragging = true;
      orbitRef.current.lastX = event.clientX;
      orbitRef.current.lastY = event.clientY;
      pointerDownPos = { x: event.clientX, y: event.clientY };
    };

    const handlePointerMove = (event: MouseEvent) => {
      if (!orbitRef.current.isDragging) return;
      const dx = event.clientX - orbitRef.current.lastX;
      const dy = event.clientY - orbitRef.current.lastY;
      orbitRef.current.lastX = event.clientX;
      orbitRef.current.lastY = event.clientY;

      orbitRef.current.theta -= dx * 0.0075;
      orbitRef.current.phi = Math.max(
        0.15,
        Math.min(Math.PI / 2 - 0.04, orbitRef.current.phi - dy * 0.0075)
      );
      updateCameraFromOrbit();
    };

    const handlePointerUp = (event: MouseEvent) => {
      orbitRef.current.isDragging = false;
      const moveDist = Math.hypot(
        event.clientX - pointerDownPos.x,
        event.clientY - pointerDownPos.y
      );
      if (moveDist < 5) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(clickableMeshes, false);
        if (intersects.length > 0) {
          const hitId = intersects[0].object.userData?.objectId;
          if (hitId) onSelectObject(hitId);
        }
      }
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      orbitRef.current.radius = Math.max(
        1.7,
        Math.min(6.2, orbitRef.current.radius + event.deltaY * 0.0025)
      );
      updateCameraFromOrbit();
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    domElem.addEventListener('wheel', handleWheel, { passive: false });

    // 9. Animation Loop with 2D Screen-Space HUD Pin Collision Avoidance
    let frameId = 0;
    let clock = 0;
    const projVec = new THREE.Vector3();

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      clock += 0.05;

      // Pulse hazard rings cleanly
      hazardRingMeshes.forEach((ring, i) => {
        const s = 1 + Math.sin(clock * 2.2 + i) * 0.16;
        ring.scale.set(s, s, s);
      });

      renderer.render(scene, camera);

      // Project 3D HUD pins to 2D and apply vertical separation so pins NEVER overlap
      if (showHudCallouts && hudCallouts.length > 0) {
        const cWidth = container.clientWidth || width;
        const cHeight = container.clientHeight || height;

        interface ProjectedPin {
          id: string;
          el: HTMLButtonElement;
          x: number;
          y: number;
          visible: boolean;
        }
        const projected: ProjectedPin[] = [];

        hudCallouts.forEach((item) => {
          const el = hudItemRefs.current[item.id];
          if (!el) return;
          projVec.copy(item.position3D).project(camera);
          if (projVec.z > 1) {
            projected.push({ id: item.id, el, x: 0, y: 0, visible: false });
          } else {
            const rawX = (projVec.x * 0.5 + 0.5) * cWidth;
            const rawY = (-projVec.y * 0.5 + 0.5) * cHeight;
            const clampedX = Math.max(95, Math.min(cWidth - 95, rawX));
            const clampedY = Math.max(54, Math.min(cHeight - 48, rawY));
            projected.push({
              id: item.id,
              el,
              x: clampedX,
              y: clampedY,
              visible: true,
            });
          }
        });

        // Sort visible pins top-to-bottom and push overlapping pins apart vertically
        const visiblePins = projected.filter((p) => p.visible).sort((a, b) => a.y - b.y);
        const minVerticalGap = 32;
        const minHorizontalGap = 165;

        for (let i = 1; i < visiblePins.length; i++) {
          for (let j = 0; j < i; j++) {
            const upper = visiblePins[j];
            const lower = visiblePins[i];
            if (Math.abs(lower.x - upper.x) < minHorizontalGap) {
              const dy = lower.y - upper.y;
              if (dy < minVerticalGap) {
                lower.y = Math.min(cHeight - 36, upper.y + minVerticalGap);
              }
            }
          }
        }

        projected.forEach((p) => {
          if (!p.visible) {
            p.el.style.opacity = '0';
            p.el.style.pointerEvents = 'none';
          } else {
            p.el.style.opacity = '1';
            p.el.style.pointerEvents = 'auto';
            p.el.style.transform = `translate(-50%, -100%) translate(${Math.round(
              p.x
            )}px, ${Math.round(p.y)}px)`;
          }
        });
      }
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth || 640;
      const newH = container.clientHeight || 480;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      domElem.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      domElem.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [
    viewMode,
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
    cameraPreset,
    showLayerSlices,
    showHudCallouts,
  ]);

  const activeWp = waypoints[activeWaypointIndex] || waypoints[0];

  return (
    <div className="rounded-3xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl">
      {/* =====================================================================
          CLEAN NON-OVERLAPPING STUDIO HEADER BAR (Outside Canvas)
      ===================================================================== */}
      <div className="bg-slate-900/95 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
        {/* Left: View Mode Switcher (Split Photo AR + 3D Twin / Photo AR Only / 3D Twin Only) */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <HoverTooltip
            title="Split View: Real Photo AR + 3D Digital Twin"
            description="Displays the 2D augmented-reality photo overlay side-by-side with the interactive 3D architectural digital twin for simultaneous visual and spatial verification."
            badge="Default View"
            align="left"
          >
            <button
              onClick={() => setViewMode('split')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition ${
                viewMode === 'split'
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Split: Photo AR + 3D Twin</span>
            </button>
          </HoverTooltip>

          <HoverTooltip
            title="Full-Width Real Photo AR View"
            description="Projects 3-layer collision zones, head-strike arcs, floor stance calipers, and AFTER modification ghosts directly onto the original indoor photograph."
            badge="2D AR Overlay"
            align="left"
          >
            <button
              onClick={() => setViewMode('photo_ar')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition ${
                viewMode === 'photo_ar'
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Real Photo AR</span>
            </button>
          </HoverTooltip>

          <HoverTooltip
            title="Full-Width 3D Architectural Twin"
            description="Expands the interactive Three.js 3D CAD simulation with articulated human posture, mobility aid physics, and 3-layer elevation slice planes."
            badge="WebGL 3D"
            align="left"
          >
            <button
              onClick={() => setViewMode('twin_3d')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition ${
                viewMode === 'twin_3d'
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>3D Architectural Twin</span>
            </button>
          </HoverTooltip>
        </div>

        {/* Right: 3D Camera Angle Presets & HUD Pin Toggle */}
        {viewMode !== 'photo_ar' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 gap-0.5">
              {(
                [
                  {
                    id: 'isometric',
                    label: '3D Orbit',
                    tip: 'Standard isometric 3D perspective showing all three elevation layers simultaneously.',
                  },
                  {
                    id: 'head_strike',
                    label: 'Sit-to-Stand Arc',
                    tip: 'Side-profile camera aligned with the +28cm forward torso lean during toilet/chair stand-up to inspect Layer 3 head-strike clearance.',
                  },
                  {
                    id: 'floor_stance',
                    label: 'Floor Stance',
                    tip: 'Low-angle corridor view focused on Layer 1 (0-30cm) floor passage width and threshold height.',
                  },
                  {
                    id: 'top_down',
                    label: 'Top Plan',
                    tip: 'Orthographic-style overhead floor plan view to inspect 360-degree turning radii and furniture relocation vectors.',
                  },
                ] as { id: CameraPreset; label: string; tip: string }[]
              ).map((preset) => (
                <HoverTooltip
                  key={preset.id}
                  title={`Camera Angle: ${preset.label}`}
                  description={preset.tip}
                  badge="3D Camera"
                  align="right"
                >
                  <button
                    onClick={() => setCameraPreset(preset.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                      cameraPreset === preset.id
                        ? 'bg-indigo-500 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    {preset.label}
                  </button>
                </HoverTooltip>
              ))}
            </div>

            <HoverTooltip
              title="Toggle 3D-to-2D Floating HUD Callout Pins"
              description="Shows or hides real-time floating clearance badges (e.g., Head Strike -8cm, Stance 44cm, Locked Fixture) projected above 3D objects."
              badge="HUD Labels"
              align="right"
            >
              <button
                onClick={() => setShowHudCallouts((v) => !v)}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold flex items-center gap-1 transition ${
                  showHudCallouts
                    ? 'bg-amber-500/15 border-amber-400/50 text-amber-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Tag className="w-3 h-3" />
                <span>Pins</span>
              </button>
            </HoverTooltip>

            <HoverTooltip
              title="Toggle 3-Layer Elevation Planes"
              description="Displays translucent horizontal reference planes at Floor (0-30cm), Mid (30-130cm), and Overhead Head-Strike (130-195cm) heights."
              badge="3 Layers"
              align="right"
            >
              <button
                onClick={() => setShowLayerSlices((v) => !v)}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold flex items-center gap-1 transition ${
                  showLayerSlices
                    ? 'bg-sky-500/15 border-sky-400/50 text-sky-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>Planes</span>
              </button>
            </HoverTooltip>

            <HoverTooltip
              title="Reset 3D Camera Orbit"
              description="Resets the 3D camera back to the default isometric perspective and zoom distance."
              badge="Reset"
              align="right"
            >
              <button
                onClick={() => setCameraPreset('isometric')}
                className="p-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </HoverTooltip>
          </div>
        )}
      </div>

      {/* =====================================================================
          MAIN VIEWPORT AREA: SPLIT HYBRID OR FULL-WIDTH
      ===================================================================== */}
      <div
        className={`grid ${
          viewMode === 'split'
            ? 'grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-slate-800'
            : 'grid-cols-1'
        }`}
      >
        {/* PANEL A: REAL PHOTO AR SIMULATION OVERLAY */}
        {(viewMode === 'split' || viewMode === 'photo_ar') && (
          <div className="w-full h-[460px] sm:h-[500px] p-2.5 bg-slate-950">
            <PhotoAROverlay
              photoUrl={photoUrl}
              roomTitle={roomTitle}
              roomDimensions={roomDimensions}
              objects={objects}
              beforeObjects={beforeObjects}
              waypoints={waypoints}
              activeWaypointIndex={activeWaypointIndex}
              hazards={hazards}
              profile={profile}
              remediationMode={remediationMode}
              activeLayerFilter={activeLayerFilter}
              selectedObjectId={selectedObjectId}
              onSelectObject={onSelectObject}
            />
          </div>
        )}

        {/* PANEL B: HIGH-DETAIL 3D ARCHITECTURAL DIGITAL TWIN */}
        {(viewMode === 'split' || viewMode === 'twin_3d') && (
          <div className="relative w-full h-[460px] sm:h-[500px] bg-slate-950 overflow-hidden select-none">
            {/* Compact Top-Left Status Pill inside 3D Twin (No right-side overlap!) */}
            <div className="absolute top-3 left-3 z-10 pointer-events-none flex items-center gap-2">
              <div
                className={`px-3 py-1 rounded-xl border backdrop-blur-md text-[11px] font-bold flex items-center gap-1.5 shadow-lg ${
                  remediationMode === 'BEFORE'
                    ? 'bg-rose-950/85 border-rose-500/60 text-rose-200'
                    : 'bg-emerald-950/85 border-emerald-500/60 text-emerald-200'
                }`}
              >
                {remediationMode === 'BEFORE' ? (
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
                <span>3D Architectural Twin ({remediationMode})</span>
              </div>
            </div>

            {/* WebGL Mount Point */}
            <div
              ref={mountRef}
              className="w-full h-full cursor-grab active:cursor-grabbing"
            />

            {/* De-Cluttered 1-Line 3D-to-2D Floating Pins (With Vertical Repulsion) */}
            {showHudCallouts && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
                {hudCallouts.map((item) => {
                  const isSelected = item.objectId && item.objectId === selectedObjectId;
                  const toneStyles: Record<HudCalloutDescriptor['tone'], string> = {
                    critical:
                      'bg-rose-950/90 border-rose-400 text-rose-100 shadow-rose-950/50',
                    warning:
                      'bg-amber-950/90 border-amber-400 text-amber-100 shadow-amber-950/50',
                    locked:
                      'bg-amber-950/95 border-amber-300 text-amber-200 shadow-amber-950/50',
                    measured:
                      'bg-sky-950/90 border-sky-400 text-sky-100 shadow-sky-950/50',
                    remediated:
                      'bg-emerald-950/90 border-emerald-400 text-emerald-100 shadow-emerald-950/50',
                  };

                  return (
                    <button
                      key={item.id}
                      ref={(el) => {
                        hudItemRefs.current[item.id] = el;
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.objectId) onSelectObject(item.objectId);
                      }}
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        opacity: 0,
                      }}
                      className={`px-2.5 py-1 rounded-full border text-[11px] font-bold backdrop-blur-md shadow-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                        toneStyles[item.tone]
                      } ${isSelected ? 'ring-2 ring-sky-300 scale-105' : 'hover:brightness-110'}`}
                    >
                      <span>{item.badgeText}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Compact Bottom-Left Step Indicator inside 3D Twin */}
            {activeWp && (
              <div className="absolute bottom-3 left-3 right-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
                <div className="px-3 py-1.5 rounded-xl bg-slate-950/85 border border-slate-800 backdrop-blur-md text-[11px] text-slate-300 flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="font-semibold text-white">
                    Step {activeWp.stepNumber}: {activeWp.label}
                  </span>
                  <span className="text-slate-500 hidden sm:inline">·</span>
                  <span className="font-mono text-sky-300 hidden sm:inline">
                    Head Y={Math.round(activeWp.headHeightM * 100)}cm
                  </span>
                </div>

                <div className="px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800/80 text-[10px] text-slate-400 hidden sm:block">
                  Drag to orbit · Scroll to zoom · Click fixture
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
