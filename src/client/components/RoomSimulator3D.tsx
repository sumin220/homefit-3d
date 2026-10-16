import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  CollisionHazard,
  ElevationLayer,
  IndoorMobilityProfile,
  RoomSceneData,
  SceneObject3D,
  TrajectoryWaypoint,
} from '../../shared/types';
import {
  Play,
  Pause,
  RotateCcw,
  Eye,
  Layers,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  Maximize2,
} from 'lucide-react';

interface RoomSimulator3DProps {
  scene: RoomSceneData;
  mode: 'BEFORE' | 'AFTER';
  onModeChange: (mode: 'BEFORE' | 'AFTER') => void;
  profile: IndoorMobilityProfile;
  hazards: CollisionHazard[];
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
  lockedObjectIds: string[];
  onToggleLockObject: (id: string) => void;
  activeWaypointIndex: number;
  onWaypointChange: (index: number) => void;
}

type CameraPreset = 'isometric' | 'head_profile' | 'top_down';

export const RoomSimulator3D: React.FC<RoomSimulator3DProps> = ({
  scene,
  mode,
  onModeChange,
  profile,
  hazards,
  selectedObjectId,
  onSelectObject,
  lockedObjectIds,
  onToggleLockObject,
  activeWaypointIndex,
  onWaypointChange,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [showElevationBands, setShowElevationBands] = useState<boolean>(true);
  const [activeLayerFilter, setActiveLayerFilter] = useState<ElevationLayer | 'all'>('all');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [animProgress, setAnimProgress] = useState<number>(0);

  // Orbit state refs for smooth pointer dragging
  const orbitRef = useRef({
    theta: -0.68, // horizontal angle
    phi: 1.05, // vertical angle from top
    radius: 3.35,
    target: new THREE.Vector3(0.05, 0.85, 0.0),
    isDragging: false,
    lastX: 0,
    lastY: 0,
  });

  const activeObjects = mode === 'BEFORE' ? scene.beforeObjects : scene.afterObjects;
  const activeWaypoints = mode === 'BEFORE' ? scene.beforeWaypoints : scene.afterWaypoints;

  // Apply camera preset
  useEffect(() => {
    if (cameraPreset === 'isometric') {
      orbitRef.current.theta = -0.68;
      orbitRef.current.phi = 1.05;
      orbitRef.current.radius = 3.35;
      orbitRef.current.target.set(0.05, 0.85, 0.0);
    } else if (cameraPreset === 'head_profile') {
      // Side/front view focusing on the Sit-to-Stand Head-Strike zone (Y=1.2m-1.8m)
      orbitRef.current.theta = -0.12;
      orbitRef.current.phi = 1.38;
      orbitRef.current.radius = 2.55;
      orbitRef.current.target.set(0.18, 1.18, -0.05);
    } else if (cameraPreset === 'top_down') {
      orbitRef.current.theta = 0.0;
      orbitRef.current.phi = 0.28;
      orbitRef.current.radius = 3.6;
      orbitRef.current.target.set(0.0, 0.4, 0.0);
    }
  }, [cameraPreset]);

  // Animation loop for character waypoint progression
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setAnimProgress((prev) => {
        const next = prev + 0.012;
        if (next >= 1) {
          return 0;
        }
        return next;
      });
    }, 35);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Sync activeWaypointIndex with animProgress when playing
  useEffect(() => {
    if (!isPlaying || activeWaypoints.length === 0) return;
    const idx = Math.min(
      activeWaypoints.length - 1,
      Math.floor(animProgress * activeWaypoints.length)
    );
    if (idx !== activeWaypointIndex) {
      onWaypointChange(idx);
    }
  }, [animProgress, isPlaying, activeWaypoints.length]);

  // Main Three.js Scene Builder & Render Loop
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 720;
    const height = container.clientHeight || 480;

    const threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color('#090d16');

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 50);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight('#ffffff', 0.85);
    threeScene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight('#f8fafc', 1.15);
    dirLight.position.set(-2.5, 4.2, 3.2);
    dirLight.castShadow = true;
    threeScene.add(dirLight);

    const pointLight = new THREE.PointLight('#38bdf8', 0.5, 8);
    pointLight.position.set(0, 2.0, 0.5);
    threeScene.add(pointLight);

    // Room Floor & Grid
    const roomW = scene.roomDimensions.width;
    const roomH = scene.roomDimensions.height;
    const roomD = scene.roomDimensions.depth;

    const floorGeo = new THREE.BoxGeometry(roomW, 0.04, roomD);
    const floorMat = new THREE.MeshStandardMaterial({
      color: scene.floorColor,
      roughness: mode === 'BEFORE' && scene.id === 'parent-bathroom-accident' ? 0.2 : 0.65,
      metalness: 0.05,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(0, -0.02, 0);
    floorMesh.receiveShadow = true;
    threeScene.add(floorMesh);

    const gridHelper = new THREE.GridHelper(
      Math.max(roomW, roomD),
      12,
      '#475569',
      '#334155'
    );
    gridHelper.position.y = 0.002;
    threeScene.add(gridHelper);

    // Semi-transparent Back Wall & Right Wall (where grab bar & overhead glass cabinet mount)
    const wallMat = new THREE.MeshStandardMaterial({
      color: scene.wallColor,
      transparent: true,
      opacity: 0.24,
      roughness: 0.7,
    });

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(roomW, roomH, 0.04), wallMat);
    backWall.position.set(0, roomH / 2, -roomD / 2 - 0.02);
    threeScene.add(backWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.04, roomH, roomD), wallMat);
    rightWall.position.set(roomW / 2 + 0.02, roomH / 2, 0);
    threeScene.add(rightWall);

    const leftWallWire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.02, roomH, roomD)),
      new THREE.LineBasicMaterial({ color: '#334155' })
    );
    leftWallWire.position.set(-roomW / 2, roomH / 2, 0);
    threeScene.add(leftWallWire);

    // Shattered green tempered glass shards on the bathroom floor in BEFORE mode for Preset 1
    if (mode === 'BEFORE' && scene.id === 'parent-bathroom-accident') {
      const shardGeo = new THREE.TetrahedronGeometry(0.028, 0);
      const shardMat = new THREE.MeshStandardMaterial({
        color: '#10b981',
        emissive: '#059669',
        emissiveIntensity: 0.45,
        roughness: 0.15,
        metalness: 0.3,
      });
      for (let i = 0; i < 42; i++) {
        const shard = new THREE.Mesh(shardGeo, shardMat);
        // Cluster around left/front of toilet and under cabinet as seen in real photo
        const sx = -0.45 + (Math.sin(i * 17.3) * 0.5 + 0.5) * 0.75;
        const sz = -0.25 + (Math.cos(i * 23.1) * 0.5 + 0.5) * 0.85;
        shard.position.set(sx, 0.015, sz);
        shard.rotation.set(i * 0.7, i * 1.3, i * 0.4);
        shard.scale.set(1.2, 0.35, 1.0);
        threeScene.add(shard);
      }
    }

    // 3-Tier Elevation Layer Slice Bands (Floor 0-30cm, Mid 30-130cm, Overhead 130-190cm)
    if (showElevationBands) {
      const bands: Array<{ yMin: number; yMax: number; color: string; layer: ElevationLayer }> = [
        { yMin: 0.0, yMax: 0.3, color: '#f59e0b', layer: 'floor' },
        { yMin: 0.3, yMax: 1.3, color: '#38bdf8', layer: 'mid' },
        { yMin: 1.3, yMax: 1.9, color: '#f43f5e', layer: 'overhead' },
      ];
      bands.forEach((b) => {
        if (activeLayerFilter !== 'all' && activeLayerFilter !== b.layer) return;
        const h = b.yMax - b.yMin;
        const bandBox = new THREE.BoxGeometry(roomW - 0.02, h, roomD - 0.02);
        const edges = new THREE.EdgesGeometry(bandBox);
        const line = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({
            color: b.color,
            transparent: true,
            opacity: activeLayerFilter === b.layer ? 0.75 : 0.28,
          })
        );
        line.position.set(0, b.yMin + h / 2, 0);
        threeScene.add(line);
      });
    }

    // Render 3D Scene Objects
    const hazardObjectIds = new Set(hazards.flatMap((h) => h.objectIds));

    activeObjects.forEach((obj) => {
      const isSelected = obj.id === selectedObjectId;
      const isHazard = hazardObjectIds.has(obj.id) && mode === 'BEFORE';
      const isLocked = lockedObjectIds.includes(obj.id) || Boolean(obj.lockedByUser);
      const isFilteredOut = activeLayerFilter !== 'all' && obj.layer !== activeLayerFilter;

      const geo = new THREE.BoxGeometry(
        obj.dimensions.width,
        obj.dimensions.height,
        obj.dimensions.depth
      );

      const isGlassCabinet = obj.category === 'overhead_cabinet';
      const mat = new THREE.MeshStandardMaterial({
        color: isHazard && isGlassCabinet ? '#ef4444' : obj.color,
        transparent: isGlassCabinet || isFilteredOut,
        opacity: isFilteredOut ? 0.18 : isGlassCabinet ? 0.72 : 0.94,
        roughness: isGlassCabinet ? 0.15 : 0.45,
        metalness: obj.category === 'grab_bar' ? 0.75 : 0.1,
        emissive: isSelected
          ? '#38bdf8'
          : isHazard
          ? '#dc2626'
          : mode === 'AFTER' && obj.remediationAction
          ? '#0284c7'
          : '#000000',
        emissiveIntensity: isSelected ? 0.45 : isHazard ? 0.35 : obj.remediationAction ? 0.22 : 0,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      threeScene.add(mesh);

      // Outline border for every object
      const edgeColor = isSelected
        ? '#38bdf8'
        : isHazard
        ? '#f87171'
        : isLocked
        ? '#fbbf24'
        : '#cbd5e1';
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: edgeColor })
      );
      edges.position.copy(mesh.position);
      threeScene.add(edges);
    });

    // Trajectory Path Line on Floor + Overhead Head-Trajectory Ribbon
    if (activeWaypoints.length > 1) {
      const floorPts = activeWaypoints.map((wp) => new THREE.Vector3(wp.x, 0.03, wp.z));
      const floorLineGeo = new THREE.BufferGeometry().setFromPoints(floorPts);
      const floorLine = new THREE.Line(
        floorLineGeo,
        new THREE.LineBasicMaterial({
          color: mode === 'BEFORE' ? '#f43f5e' : '#22c55e',
          linewidth: 3,
        })
      );
      threeScene.add(floorLine);

      // 3D Head-Arc Trajectory Curve (showing how the head moves at Y=1.48-1.62m!)
      const headPts = activeWaypoints.map((wp) => {
        const rad = (wp.facingAngleDeg * Math.PI) / 180;
        const hx = wp.x + Math.sin(rad) * wp.headForwardOffsetM;
        const hz = wp.z - Math.cos(rad) * wp.headForwardOffsetM;
        return new THREE.Vector3(hx, wp.headHeightM, hz);
      });
      const headLineGeo = new THREE.BufferGeometry().setFromPoints(headPts);
      const headLine = new THREE.Line(
        headLineGeo,
        new THREE.LineDashedMaterial({
          color: mode === 'BEFORE' ? '#fb7185' : '#38bdf8',
          dashSize: 0.08,
          gapSize: 0.04,
        })
      );
      headLine.computeLineDistances();
      threeScene.add(headLine);
    }

    // 3D Collision Hazard Pulsing Spheres
    const hazardMeshes: THREE.Mesh[] = [];
    hazards.forEach((haz) => {
      const sphereGeo = new THREE.SphereGeometry(
        haz.layer === 'overhead' ? 0.16 : 0.13,
        24,
        24
      );
      const sphereMat = new THREE.MeshBasicMaterial({
        color: haz.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b',
        transparent: true,
        opacity: 0.42,
        wireframe: false,
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.position.set(
        haz.collisionPoint3D.x,
        haz.collisionPoint3D.y,
        haz.collisionPoint3D.z
      );
      threeScene.add(sphere);
      hazardMeshes.push(sphere);

      const wireSphere = new THREE.Mesh(
        new THREE.SphereGeometry(haz.layer === 'overhead' ? 0.18 : 0.15, 12, 12),
        new THREE.MeshBasicMaterial({
          color: '#fecaca',
          wireframe: true,
          transparent: true,
          opacity: 0.65,
        })
      );
      wireSphere.position.copy(sphere.position);
      threeScene.add(wireSphere);
    });

    // Articulated 3D Human Character (Crutches User or Wheelchair User)
    const characterGroup = new THREE.Group();
    const wp =
      activeWaypoints[Math.min(activeWaypointIndex, activeWaypoints.length - 1)] ||
      activeWaypoints[0];

    if (wp) {
      const rad = (wp.facingAngleDeg * Math.PI) / 180;
      const forwardLeanX = Math.sin(rad) * wp.headForwardOffsetM;
      const forwardLeanZ = -Math.cos(rad) * wp.headForwardOffsetM;

      // Turning / Stance Clearance Ring on Floor
      const ringRadiusM = (profile.turningRadiusCm / 100) / 2;
      const ringGeo = new THREE.RingGeometry(ringRadiusM - 0.025, ringRadiusM, 36);
      const ringMat = new THREE.MeshBasicMaterial({
        color: mode === 'BEFORE' && hazards.length > 0 ? '#f43f5e' : '#38bdf8',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.set(wp.x, 0.02, wp.z);
      threeScene.add(ringMesh);

      if (profile.id === 'crutches') {
        // Legs
        const legMat = new THREE.MeshStandardMaterial({ color: '#334155' });
        const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.78, 12), legMat);
        leftLeg.position.set(wp.x - 0.1, 0.39, wp.z);
        characterGroup.add(leftLeg);

        const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.78, 12), legMat);
        rightLeg.position.set(wp.x + 0.1, 0.39, wp.z);
        characterGroup.add(rightLeg);

        // Torso (pitched forward during sit-to-stand or stepping around clutter)
        const torsoMat = new THREE.MeshStandardMaterial({
          color: mode === 'BEFORE' ? '#f97316' : '#0ea5e9',
        });
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.56, 0.2), torsoMat);
        torso.position.set(
          wp.x + forwardLeanX * 0.55,
          1.06,
          wp.z + forwardLeanZ * 0.55
        );
        characterGroup.add(torso);

        // Head Sphere (at exact 3D head height & forward pitch offset!)
        const isHeadColliding =
          mode === 'BEFORE' &&
          hazards.some((h) => h.hazardType === 'OVERHEAD_GLASS_HEAD_STRIKE') &&
          (wp.posture === 'sit_to_stand_lean' || wp.posture === 'overhead_reach');

        const headMat = new THREE.MeshStandardMaterial({
          color: isHeadColliding ? '#ef4444' : '#fde047',
          emissive: isHeadColliding ? '#dc2626' : '#000000',
          emissiveIntensity: isHeadColliding ? 0.65 : 0,
        });
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 24, 24), headMat);
        head.position.set(wp.x + forwardLeanX, wp.headHeightM, wp.z + forwardLeanZ);
        characterGroup.add(head);

        // Dual Crutches (Left & Right)
        const crutchMat = new THREE.MeshStandardMaterial({
          color: '#94a3b8',
          metalness: 0.7,
          roughness: 0.2,
        });
        const crutchSpreadM = (profile.minPassageWidthCm / 100) / 2;
        const leftCrutch = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.014, 1.22, 10),
          crutchMat
        );
        leftCrutch.position.set(wp.x - crutchSpreadM, 0.61, wp.z + 0.04);
        leftCrutch.rotation.z = -0.08;
        characterGroup.add(leftCrutch);

        const rightCrutch = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.014, 1.22, 10),
          crutchMat
        );
        rightCrutch.position.set(wp.x + crutchSpreadM, 0.61, wp.z + 0.04);
        rightCrutch.rotation.z = 0.08;
        characterGroup.add(rightCrutch);
      } else {
        // Wheelchair Character Model
        const frameMat = new THREE.MeshStandardMaterial({ color: '#0284c7' });
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.08, 0.5), frameMat);
        seat.position.set(wp.x, 0.48, wp.z);
        characterGroup.add(seat);

        const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.48, 0.06), frameMat);
        backrest.position.set(wp.x, 0.74, wp.z + 0.22);
        characterGroup.add(backrest);

        // Wheelchair Wheels
        const wheelMat = new THREE.MeshStandardMaterial({ color: '#1e293b' });
        const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.04, 20);
        const leftWheel = new THREE.Mesh(wheelGeo, wheelMat);
        leftWheel.rotation.z = Math.PI / 2;
        leftWheel.position.set(wp.x - 0.3, 0.3, wp.z + 0.08);
        characterGroup.add(leftWheel);

        const rightWheel = new THREE.Mesh(wheelGeo, wheelMat);
        rightWheel.rotation.z = Math.PI / 2;
        rightWheel.position.set(wp.x + 0.3, 0.3, wp.z + 0.08);
        characterGroup.add(rightWheel);

        // Seated User Torso & Head
        const torso = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 0.48, 0.2),
          new THREE.MeshStandardMaterial({ color: '#38bdf8' })
        );
        torso.position.set(wp.x + forwardLeanX * 0.4, 0.78, wp.z + forwardLeanZ * 0.4);
        characterGroup.add(torso);

        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 20, 20),
          new THREE.MeshStandardMaterial({ color: '#fde047' })
        );
        head.position.set(wp.x + forwardLeanX * 0.6, 1.18, wp.z + forwardLeanZ * 0.6);
        characterGroup.add(head);
      }
    }

    threeScene.add(characterGroup);

    // Render animation frame (orbit camera + pulsing hazard spheres)
    let frameId = 0;
    let pulseTick = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      pulseTick += 0.06;

      // Pulse hazard spheres
      hazardMeshes.forEach((m, idx) => {
        const s = 1 + Math.sin(pulseTick + idx) * 0.16;
        m.scale.set(s, s, s);
      });

      const { theta, phi, radius, target } = orbitRef.current;
      camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = target.y + radius * Math.cos(phi);
      camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(target);

      renderer.render(threeScene, camera);
    };
    animate();

    // Pointer orbit interaction
    const domEl = renderer.domElement;
    const onPointerDown = (e: PointerEvent) => {
      orbitRef.current.isDragging = true;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!orbitRef.current.isDragging) return;
      const dx = e.clientX - orbitRef.current.lastX;
      const dy = e.clientY - orbitRef.current.lastY;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
      orbitRef.current.theta -= dx * 0.007;
      orbitRef.current.phi = Math.max(0.2, Math.min(1.52, orbitRef.current.phi - dy * 0.007));
    };
    const onPointerUp = () => {
      orbitRef.current.isDragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbitRef.current.radius = Math.max(
        1.8,
        Math.min(5.2, orbitRef.current.radius + e.deltaY * 0.002)
      );
    };

    domEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    domEl.addEventListener('wheel', onWheel, { passive: false });

    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth || 720;
      const newH = container.clientHeight || 480;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      domEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      domEl.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [
    scene,
    mode,
    profile,
    hazards,
    selectedObjectId,
    lockedObjectIds,
    activeWaypointIndex,
    showElevationBands,
    activeLayerFilter,
  ]);

  const currentWaypoint: TrajectoryWaypoint | undefined =
    activeWaypoints[Math.min(activeWaypointIndex, activeWaypoints.length - 1)] ||
    activeWaypoints[0];

  return (
    <div className="flex flex-col h-full bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden">
      {/* Top 3D Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-950/90 border-b border-slate-800">
        <div className="flex items-center gap-2">
          {/* Before vs After Mode Switcher */}
          <div className="inline-flex rounded-lg bg-slate-900 p-0.5 border border-slate-700">
            <button
              onClick={() => onModeChange('BEFORE')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                mode === 'BEFORE'
                  ? 'bg-rose-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Before (Hazard State)
            </button>
            <button
              onClick={() => onModeChange('AFTER')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                mode === 'AFTER'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              After (Argon 3D Patched)
            </button>
          </div>

          {/* Camera Angle Presets */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800 text-xs">
            <Eye className="w-3.5 h-3.5 text-sky-400 mr-1" />
            <button
              onClick={() => setCameraPreset('isometric')}
              className={`px-2 py-0.5 rounded ${
                cameraPreset === 'isometric'
                  ? 'bg-sky-500/20 text-sky-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              3D Orbit
            </button>
            <button
              onClick={() => setCameraPreset('head_profile')}
              className={`px-2 py-0.5 rounded ${
                cameraPreset === 'head_profile'
                  ? 'bg-rose-500/20 text-rose-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Head-Strike Arc
            </button>
            <button
              onClick={() => setCameraPreset('top_down')}
              className={`px-2 py-0.5 rounded ${
                cameraPreset === 'top_down'
                  ? 'bg-amber-500/20 text-amber-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Floor Stance
            </button>
          </div>
        </div>

        {/* Elevation Layer Filter Buttons */}
        <div className="flex items-center gap-1 text-xs">
          <button
            onClick={() => setShowElevationBands((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded border ${
              showElevationBands
                ? 'border-sky-500/50 bg-sky-500/10 text-sky-300'
                : 'border-slate-700 bg-slate-900 text-slate-400'
            }`}
            title="Toggle 3D elevation slice boxes"
          >
            <Layers className="w-3.5 h-3.5" />
            3-Tier Slices
          </button>
          {(['all', 'floor', 'mid', 'overhead'] as const).map((layer) => (
            <button
              key={layer}
              onClick={() => setActiveLayerFilter(layer)}
              className={`px-2 py-1 rounded capitalize transition ${
                activeLayerFilter === layer
                  ? 'bg-slate-700 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {layer === 'all'
                ? 'All'
                : layer === 'floor'
                ? 'Floor (0-30cm)'
                : layer === 'mid'
                ? 'Mid (30-130cm)'
                : 'Overhead (130-190cm)'}
            </button>
          ))}
        </div>
      </div>

      {/* Main Three.js Viewport + HUD Overlays */}
      <div className="relative flex-1 min-h-[340px]">
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Top-Left HUD: Real-time 3D Kinematic Telemetry */}
        <div className="absolute top-3 left-3 bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-lg p-2.5 text-xs space-y-1 max-w-xs pointer-events-none">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] uppercase tracking-wider text-sky-400 font-semibold">
              3D Kinematic Telemetry
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                mode === 'BEFORE' && hazards.length > 0
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              }`}
            >
              {mode === 'BEFORE' && hazards.length > 0
                ? `${hazards.length} COLLISIONS DETECTED`
                : '0 COLLISIONS (SAFE)'}
            </span>
          </div>
          {currentWaypoint && (
            <>
              <div className="text-slate-200 font-semibold">{currentWaypoint.label}</div>
              <div className="text-slate-400 text-[11px] leading-snug">
                {currentWaypoint.description}
              </div>
              <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px] font-mono border-t border-slate-800/80">
                <div className="text-amber-300">
                  Torso Pitch: +{currentWaypoint.torsoForwardPitchDeg}°
                </div>
                <div className="text-rose-300">
                  Head Y: {(currentWaypoint.headHeightM * 100).toFixed(0)}cm
                </div>
              </div>
            </>
          )}
        </div>

        {/* Top-Right Legend: 3 Elevation Layers */}
        <div className="absolute top-3 right-3 bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-lg p-2 text-[11px] space-y-1 pointer-events-none hidden md:block">
          <div className="text-slate-400 font-semibold mb-1">3D Volumetric Zones</div>
          <div className="flex items-center gap-1.5 text-rose-300">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
            Overhead [130–190cm]: Head-Strike & Reach
          </div>
          <div className="flex items-center gap-1.5 text-sky-300">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-500 inline-block" />
            Mid-Torso [30–130cm]: Turn Ø & Grab Bar
          </div>
          <div className="flex items-center gap-1.5 text-amber-300">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
            Floor [0–30cm]: Crutch Tips, Caddies & Lip
          </div>
        </div>

        {/* Bottom Waypoint Timeline Scrubber */}
        <div className="absolute bottom-3 left-3 right-3 bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsPlaying((p) => !p)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isPlaying ? 'Pause' : 'Simulate'}
            </button>
            <button
              onClick={() => {
                setIsPlaying(false);
                onWaypointChange(0);
              }}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Reset to Step 1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-1 justify-end overflow-x-auto">
            {activeWaypoints.map((wp, idx) => {
              const isStepActive = idx === activeWaypointIndex;
              const hasHazardAtStep =
                mode === 'BEFORE' && hazards.some((h) => h.waypointId === wp.id);
              return (
                <button
                  key={wp.id}
                  onClick={() => {
                    setIsPlaying(false);
                    onWaypointChange(idx);
                  }}
                  className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition flex items-center gap-1 ${
                    isStepActive
                      ? hasHazardAtStep
                        ? 'bg-rose-600 text-white ring-2 ring-rose-400'
                        : 'bg-sky-600 text-white ring-2 ring-sky-400'
                      : hasHazardAtStep
                      ? 'bg-rose-950/80 text-rose-300 border border-rose-700/60 hover:bg-rose-900/60'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {hasHazardAtStep && <AlertTriangle className="w-3 h-3 text-rose-300" />}
                  Step {wp.stepNumber}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Interactive Fixture Bar (Human-in-the-Loop Lock Controls) */}
      <div className="px-3.5 py-2.5 bg-slate-950 border-t border-slate-800">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            Human-in-the-Loop Fixture Constraints (Click to Lock/Unlock Built-in or Heavy Objects):
          </span>
          <span className="text-[11px] text-slate-400">
            Drag 3D view to orbit • Scroll to zoom
          </span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {scene.beforeObjects.map((obj: SceneObject3D) => {
            const isLocked = lockedObjectIds.includes(obj.id);
            const isSelected = selectedObjectId === obj.id;
            const isHazardObj = hazards.some((h) => h.objectIds.includes(obj.id));
            return (
              <div
                key={obj.id}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs whitespace-nowrap transition cursor-pointer ${
                  isSelected
                    ? 'border-sky-400 bg-sky-500/15 text-white'
                    : isHazardObj && mode === 'BEFORE'
                    ? 'border-rose-500/40 bg-rose-950/30 text-rose-200'
                    : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                }`}
                onClick={() => onSelectObject(isSelected ? null : obj.id)}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: obj.color }}
                />
                <span className="font-medium">{obj.name.split('(')[0].trim()}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLockObject(obj.id);
                  }}
                  className={`ml-1 p-0.5 rounded transition ${
                    isLocked
                      ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                  title={
                    isLocked
                      ? 'Locked (Cannot Move/Demolish) — Click to unlock'
                      : 'Click to lock this fixture so Argon must work around it'
                  }
                >
                  {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
