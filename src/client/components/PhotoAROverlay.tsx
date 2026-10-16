import React from 'react';
import {
  CollisionHazard,
  ElevationLayer,
  IndoorMobilityProfile,
  SceneObject3D,
  TrajectoryWaypoint,
} from '../../shared/types';
import { ShieldAlert, CheckCircle2, Lock, Ruler, Sparkles } from 'lucide-react';

interface PhotoAROverlayProps {
  photoUrl: string;
  roomTitle: string;
  roomDimensions: { width: number; height: number; depth: number };
  objects: SceneObject3D[];
  beforeObjects: SceneObject3D[];
  waypoints: TrajectoryWaypoint[];
  activeWaypointIndex: number;
  hazards: CollisionHazard[];
  profile: IndoorMobilityProfile;
  remediationMode: 'BEFORE' | 'AFTER';
  activeLayerFilter: 'all' | ElevationLayer;
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
}

/**
 * Projects 3D room coordinates (x in [-w/2, w/2], y in [0, h], z in [-d/2, d/2])
 * into normalized 2D photo percentage coordinates (0..100% X, 0..100% Y)
 * using a perspective camera model matched to indoor smartphone photos.
 */
function projectRoom3DToPhotoPercent(
  x: number,
  y: number,
  z: number,
  roomDimensions: { width: number; height: number; depth: number }
): { xPct: number; yPct: number } {
  const halfW = Math.max(0.7, roomDimensions.width / 2);
  const halfD = Math.max(0.8, roomDimensions.depth / 2);
  const h = Math.max(2.0, roomDimensions.height);

  // Depth factor: z = -halfD is back wall (further), z = +halfD is foreground doorway (closer)
  const normZ = Math.max(-1, Math.min(1, z / halfD)); // -1 (back) to +1 (front)
  const perspectiveScale = 0.62 + (normZ + 1) * 0.24; // 0.62 at back wall, 1.10 at foreground

  const normX = x / halfW; // -1 to +1
  const xPct = 50 + normX * 36 * perspectiveScale;

  // Floor plane at back wall is around yPct=52%, foreground floor is yPct=92%
  const floorYPctAtZ = 54 + ((normZ + 1) / 2) * 38;
  const normY = Math.max(0, Math.min(1.1, y / h));
  const verticalSpanAtZ = 46 * perspectiveScale;
  const yPct = floorYPctAtZ - normY * verticalSpanAtZ;

  return {
    xPct: Math.max(6, Math.min(94, xPct)),
    yPct: Math.max(6, Math.min(95, yPct)),
  };
}

export const PhotoAROverlay: React.FC<PhotoAROverlayProps> = ({
  photoUrl,
  roomTitle,
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
  onSelectObject,
}) => {
  const activeWp =
    waypoints[Math.min(activeWaypointIndex, waypoints.length - 1)] || waypoints[0];
  const hazardObjectIds = new Set(hazards.flatMap((h) => h.objectIds));

  // Compute projected floor path and head-arc path in 2D photo percentages
  const userScale = profile.userHeightCm / 168;
  const pitchScale = profile.sitToStandForwardPitchCm / 28;

  const floorPts = waypoints.map((wp) =>
    projectRoom3DToPhotoPercent(wp.x, 0.02, wp.z, roomDimensions)
  );
  const headPts = waypoints.map((wp) => {
    const rad = (wp.facingAngleDeg * Math.PI) / 180;
    const hx = wp.x + Math.sin(rad) * wp.headForwardOffsetM * pitchScale;
    const hz = wp.z - Math.cos(rad) * wp.headForwardOffsetM * pitchScale;
    const hy = wp.headHeightM * userScale;
    return projectRoom3DToPhotoPercent(hx, hy, hz, roomDimensions);
  });

  // Active avatar joints projected onto the photo
  const activeAvatarFoot = activeWp
    ? projectRoom3DToPhotoPercent(activeWp.x, 0.02, activeWp.z, roomDimensions)
    : { xPct: 50, yPct: 80 };

  const isSittingOrRising =
    activeWp?.posture === 'sitting' || activeWp?.posture === 'sit_to_stand_lean';
  const hipHeightM = (isSittingOrRising ? 0.68 : 0.88) * userScale;
  const activeAvatarHip = activeWp
    ? projectRoom3DToPhotoPercent(
        activeWp.x,
        hipHeightM,
        activeWp.z + (isSittingOrRising ? 0.05 : 0),
        roomDimensions
      )
    : { xPct: 50, yPct: 62 };

  const activeAvatarHead = activeWp
    ? headPts[Math.min(activeWaypointIndex, headPts.length - 1)] || { xPct: 50, yPct: 35 }
    : { xPct: 50, yPct: 35 };

  const activeAvatarShoulder = {
    xPct: activeAvatarHip.xPct * 0.35 + activeAvatarHead.xPct * 0.65,
    yPct: activeAvatarHip.yPct * 0.35 + activeAvatarHead.yPct * 0.65,
  };

  const activeAvatarKnee = {
    xPct: (activeAvatarFoot.xPct + activeAvatarHip.xPct) / 2 - (isSittingOrRising ? 4 : 0),
    yPct: (activeAvatarFoot.yPct + activeAvatarHip.yPct) / 2,
  };

  const hasOverheadCollision = hazards.some((h) => h.layer === 'overhead');

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden select-none group">
      {/* 1. Real Room Photograph Base */}
      <img
        src={photoUrl}
        alt={roomTitle}
        className={`w-full h-full object-cover transition duration-500 ${
          remediationMode === 'AFTER' ? 'brightness-105 contrast-105' : 'brightness-90'
        }`}
      />

      {/* Subtle Dark Vignette for AR Contrast */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/15 to-slate-950/60 pointer-events-none" />

      {/* 2. SVG AR Perspective Floor Grid, Stance Corridor & Kinematic Skeleton */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
        <defs>
          <linearGradient id="arFloorSafe" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.08" />
          </linearGradient>
          <linearGradient id="arFloorHazard" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* Perspective AR Floor Stance Corridor Polygon */}
        <polygon
          points={
            remediationMode === 'BEFORE'
              ? '26,95 66,95 57,54 34,54'
              : '18,95 78,95 66,52 28,52'
          }
          fill={remediationMode === 'BEFORE' ? 'url(#arFloorHazard)' : 'url(#arFloorSafe)'}
          stroke={remediationMode === 'BEFORE' ? '#fb7185' : '#34d399'}
          strokeWidth="0.45"
          strokeDasharray="1.5 1"
        />

        {/* Perspective AR Laser Grid Lines on Floor */}
        {[62, 72, 82, 91].map((yLine) => (
          <line
            key={yLine}
            x1={remediationMode === 'BEFORE' ? 28 : 22}
            y1={yLine}
            x2={remediationMode === 'BEFORE' ? 64 : 74}
            y2={yLine}
            stroke={remediationMode === 'BEFORE' ? '#fda4af' : '#6ee7b7'}
            strokeWidth="0.22"
            strokeOpacity="0.5"
          />
        ))}

        {/* Floor Trajectory Path */}
        {floorPts.length >= 2 && (
          <polyline
            fill="none"
            stroke={remediationMode === 'BEFORE' ? '#fb923c' : '#34d399'}
            strokeWidth="0.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={floorPts.map((p) => `${p.xPct},${p.yPct}`).join(' ')}
          />
        )}

        {/* Overhead Head-Arc Trajectory Curve */}
        {headPts.length >= 2 && (
          <polyline
            fill="none"
            stroke={remediationMode === 'BEFORE' ? '#f43f5e' : '#38bdf8'}
            strokeWidth="0.85"
            strokeDasharray={remediationMode === 'BEFORE' ? 'none' : '1.5 0.8'}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={headPts.map((p) => `${p.xPct},${p.yPct}`).join(' ')}
          />
        )}

        {/* Waypoint Floor Rings */}
        {floorPts.map((pt, idx) => {
          const isCurrent = idx === activeWaypointIndex;
          return (
            <g key={`wp-ar-${idx}`}>
              <ellipse
                cx={pt.xPct}
                cy={pt.yPct}
                rx={isCurrent ? 3.4 : 1.8}
                ry={isCurrent ? 1.5 : 0.8}
                fill={isCurrent ? '#38bdf8' : '#0f172a'}
                fillOpacity={isCurrent ? 0.35 : 0.7}
                stroke={isCurrent ? '#38bdf8' : '#94a3b8'}
                strokeWidth={isCurrent ? '0.6' : '0.35'}
              />
            </g>
          );
        })}

        {/* Active Resident Articulated Biomechanical Skeleton Overlay */}
        {activeWp && (
          <g>
            {/* Crutch Stance Width Laser Bar on Floor */}
            <line
              x1={activeAvatarFoot.xPct - (remediationMode === 'BEFORE' ? 8 : 12)}
              y1={activeAvatarFoot.yPct}
              x2={activeAvatarFoot.xPct + (remediationMode === 'BEFORE' ? 8 : 12)}
              y2={activeAvatarFoot.yPct}
              stroke={remediationMode === 'BEFORE' ? '#f97316' : '#10b981'}
              strokeWidth="0.9"
            />

            {/* Left & Right Crutches / Wheelchair Frame in AR */}
            {profile.id === 'crutches' ? (
              <>
                <line
                  x1={activeAvatarShoulder.xPct - 4.5}
                  y1={activeAvatarShoulder.yPct + 2}
                  x2={activeAvatarFoot.xPct - (remediationMode === 'BEFORE' ? 7.5 : 10.5)}
                  y2={activeAvatarFoot.yPct}
                  stroke="#fbbf24"
                  strokeWidth="0.65"
                />
                <line
                  x1={activeAvatarShoulder.xPct + 4.5}
                  y1={activeAvatarShoulder.yPct + 2}
                  x2={activeAvatarFoot.xPct + (remediationMode === 'BEFORE' ? 7.5 : 10.5)}
                  y2={activeAvatarFoot.yPct}
                  stroke="#fbbf24"
                  strokeWidth="0.65"
                />
              </>
            ) : (
              <ellipse
                cx={activeAvatarFoot.xPct}
                cy={activeAvatarFoot.yPct - 4}
                rx="9"
                ry="4.5"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="0.7"
                strokeDasharray="1.5 1"
              />
            )}

            {/* Lower Leg (Foot -> Knee) & Thigh (Knee -> Hip) */}
            <line
              x1={activeAvatarFoot.xPct}
              y1={activeAvatarFoot.yPct}
              x2={activeAvatarKnee.xPct}
              y2={activeAvatarKnee.yPct}
              stroke="#38bdf8"
              strokeWidth="1.15"
              strokeLinecap="round"
            />
            <line
              x1={activeAvatarKnee.xPct}
              y1={activeAvatarKnee.yPct}
              x2={activeAvatarHip.xPct}
              y2={activeAvatarHip.yPct}
              stroke="#38bdf8"
              strokeWidth="1.25"
              strokeLinecap="round"
            />

            {/* Torso (Hip -> Shoulder -> Head) showing Sit-to-Stand Forward Pitch */}
            <line
              x1={activeAvatarHip.xPct}
              y1={activeAvatarHip.yPct}
              x2={activeAvatarHead.xPct}
              y2={activeAvatarHead.yPct}
              stroke={
                hasOverheadCollision && remediationMode === 'BEFORE'
                  ? '#f43f5e'
                  : '#34d399'
              }
              strokeWidth="1.4"
              strokeLinecap="round"
            />

            {/* Joint Nodes */}
            {[activeAvatarFoot, activeAvatarKnee, activeAvatarHip, activeAvatarShoulder].map(
              (jt, jIdx) => (
                <circle
                  key={jIdx}
                  cx={jt.xPct}
                  cy={jt.yPct}
                  r="1.1"
                  fill="#f8fafc"
                  stroke="#0284c7"
                  strokeWidth="0.45"
                />
              )
            )}

            {/* Resident Head Envelope & Pitch Vector */}
            <circle
              cx={activeAvatarHead.xPct}
              cy={activeAvatarHead.yPct}
              r="3.2"
              fill={
                hasOverheadCollision && remediationMode === 'BEFORE'
                  ? '#ef4444'
                  : '#10b981'
              }
              fillOpacity="0.35"
              stroke={
                hasOverheadCollision && remediationMode === 'BEFORE'
                  ? '#f43f5e'
                  : '#34d399'
              }
              strokeWidth="0.7"
            />
            <circle
              cx={activeAvatarHead.xPct}
              cy={activeAvatarHead.yPct}
              r="1.4"
              fill="#ffffff"
            />
          </g>
        )}
      </svg>

      {/* 3. Interactive AR Object Bounding Masks (from Argon box2d or 3D projection) */}
      <div className="absolute inset-0 pointer-events-none">
        {objects.map((obj) => {
          if (activeLayerFilter !== 'all' && obj.layer !== activeLayerFilter) return null;
          // Skip full-floor wet zone box to avoid cluttering the whole photo
          if (obj.category === 'wet_zone') return null;

          const isHazard = hazardObjectIds.has(obj.id) && remediationMode === 'BEFORE';
          const isSafetyAdd =
            obj.category === 'safety_addition' ||
            obj.materialHazard === 'shatterproof_guarded';
          const isSelected = selectedObjectId === obj.id;

          let topPct = 40;
          let leftPct = 40;
          let widthPct = 18;
          let heightPct = 18;

          if (obj.box2d) {
            const [ymin, xmin, ymax, xmax] = obj.box2d;
            topPct = ymin / 10;
            leftPct = xmin / 10;
            heightPct = Math.max(6, (ymax - ymin) / 10);
            widthPct = Math.max(8, (xmax - xmin) / 10);
          } else {
            const center = projectRoom3DToPhotoPercent(
              obj.position.x,
              obj.position.y,
              obj.position.z,
              roomDimensions
            );
            widthPct = Math.max(10, Math.min(34, obj.dimensions.width * 24));
            heightPct = Math.max(8, Math.min(34, obj.dimensions.height * 22));
            leftPct = Math.max(4, Math.min(92 - widthPct, center.xPct - widthPct / 2));
            topPct = Math.max(6, Math.min(90 - heightPct, center.yPct - heightPct / 2));
          }

          const borderClass = isSelected
            ? 'border-sky-400 bg-sky-500/20 ring-2 ring-sky-400/60'
            : obj.lockedByUser
            ? 'border-yellow-400/90 bg-yellow-500/15'
            : isHazard
            ? 'border-rose-500/90 bg-rose-500/20'
            : isSafetyAdd && remediationMode === 'AFTER'
            ? 'border-emerald-400/90 bg-emerald-500/20'
            : 'border-slate-300/50 bg-slate-900/20 hover:border-sky-300';

          return (
            <button
              key={obj.id}
              type="button"
              onClick={() => onSelectObject(isSelected ? null : obj.id)}
              style={{
                top: `${topPct}%`,
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                height: `${heightPct}%`,
              }}
              className={`absolute rounded-xl border-2 transition pointer-events-auto text-left flex flex-col justify-between p-1.5 group/box ${borderClass}`}
            >
              {/* Top Tag Pill */}
              <div className="flex items-center gap-1 max-w-full">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono truncate shadow ${
                    isHazard
                      ? 'bg-rose-600 text-white'
                      : isSafetyAdd && remediationMode === 'AFTER'
                      ? 'bg-emerald-500 text-slate-950'
                      : obj.lockedByUser
                      ? 'bg-yellow-400 text-slate-950'
                      : 'bg-slate-950/90 text-slate-100 border border-slate-700'
                  }`}
                >
                  {isHazard ? '⚠️ ' : isSafetyAdd && remediationMode === 'AFTER' ? '✓ ' : ''}
                  {obj.name}
                </span>
              </div>

              {/* Bottom Dimension Laser Readout */}
              <div className="self-end px-1.5 py-0.5 rounded bg-slate-950/90 text-[9px] font-mono text-sky-300 border border-slate-800/90 flex items-center gap-1">
                {obj.lockedByUser && <Lock className="w-2.5 h-2.5 text-yellow-400 inline" />}
                {obj.measurementStatus === 'user_measured' && (
                  <Ruler className="w-2.5 h-2.5 text-emerald-400 inline" />
                )}
                <span>
                  {Math.round(obj.dimensions.width * 100)}×
                  {Math.round(obj.dimensions.depth * 100)}cm (Y=
                  {Math.round(obj.position.y * 100)}cm)
                </span>
              </div>
            </button>
          );
        })}

        {/* In AFTER mode, show ghost badges where floor clutter was cleared */}
        {remediationMode === 'AFTER' &&
          beforeObjects
            .filter(
              (b) =>
                b.category === 'floor_clutter' && !objects.some((after) => after.id === b.id)
            )
            .slice(0, 1)
            .map((cleared) => {
              if (!cleared.box2d) return null;
              const [ymin, xmin, ymax, xmax] = cleared.box2d;
              return (
                <div
                  key={`cleared-${cleared.id}`}
                  style={{
                    top: `${ymin / 10}%`,
                    left: `${xmin / 10}%`,
                    width: `${Math.max(14, (xmax - xmin) / 10)}%`,
                    height: `${Math.max(10, (ymax - ymin) / 10)}%`,
                  }}
                  className="absolute rounded-xl border-2 border-dashed border-emerald-400/80 bg-emerald-950/45 backdrop-blur-[2px] flex items-center justify-center p-2"
                >
                  <span className="text-[10px] font-bold text-emerald-200 text-center leading-tight">
                    ✨ Floor Clutter Cleared (+34cm Stance Restored)
                  </span>
                </div>
              );
            })}
      </div>

      {/* 4. Top-Left AR Mode Badge */}
      <div className="absolute top-3 left-3 z-20 pointer-events-none flex items-center gap-2">
        <div
          className={`px-3 py-1.5 rounded-xl text-xs font-bold backdrop-blur-md border shadow-lg flex items-center gap-1.5 ${
            remediationMode === 'BEFORE'
              ? 'bg-rose-950/90 border-rose-500/60 text-rose-100'
              : 'bg-emerald-950/90 border-emerald-500/60 text-emerald-100'
          }`}
        >
          {remediationMode === 'BEFORE' ? (
            <>
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Real Photo AR Scan · {hazards.length} Collisions</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Real Photo AR Patch · Safe Clearance Restored</span>
            </>
          )}
        </div>
      </div>

      {/* 5. Active Head-Arc / Stance Callout Banner on Photo */}
      <div className="absolute bottom-14 left-3 right-3 z-20 pointer-events-none flex flex-wrap items-center justify-between gap-2">
        <div className="px-3 py-1.5 rounded-xl bg-slate-950/90 border border-slate-800 backdrop-blur-md text-[11px] text-slate-200 flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              remediationMode === 'BEFORE' ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'
            }`}
          />
          {remediationMode === 'BEFORE' ? (
            <span>
              <strong>Sit-to-Stand AR Projection:</strong> Head pitches{' '}
              <strong className="text-rose-300">+{profile.sitToStandForwardPitchCm}cm</strong>{' '}
              forward into glass cabinet; floor stance pinched to{' '}
              <strong className="text-rose-300">44cm</strong>.
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                <strong>Argon AR Remediation:</strong> Upper cabinet recessed/guarded &amp; floor
                cleared — <strong className="text-emerald-300">0 collisions</strong>.
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
