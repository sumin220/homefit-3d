import React, { useState } from 'react';
import {
  CollisionHazard,
  IndoorMobilityProfile,
  RemediationActionItem,
  SimulationVerificationResult,
} from '../../shared/types';
import {
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  CheckSquare,
  Terminal,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Ruler,
} from 'lucide-react';

interface VerificationConsolePanelProps {
  mode: 'BEFORE' | 'AFTER';
  onTriggerAutoRemediate: () => void;
  verification: SimulationVerificationResult;
  beforeVerification: SimulationVerificationResult;
  afterVerification: SimulationVerificationResult;
  profile: IndoorMobilityProfile;
  remediationChecklist: RemediationActionItem[];
  argonThoughtSummary: string;
  argonRemediationSummary: string;
  usedLiveArgon: boolean;
  isAnalyzing: boolean;
  onSelectHazardObject: (objectId: string, waypointId: string) => void;
}

export const VerificationConsolePanel: React.FC<VerificationConsolePanelProps> = ({
  mode,
  onTriggerAutoRemediate,
  verification,
  beforeVerification,
  afterVerification,
  profile,
  remediationChecklist,
  argonThoughtSummary,
  argonRemediationSummary,
  usedLiveArgon,
  isAnalyzing,
  onSelectHazardObject,
}) => {
  const [activeTab, setActiveTab] = useState<'hazards' | 'checklist' | 'loop'>('hazards');
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({
    'act-1': true,
    'act-2': true,
  });

  const toggleChecklist = (id: string) => {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isPass = verification.overallStatus === 'VERIFIED_SAFE_PASS';

  return (
    <div className="flex flex-col h-full bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden">
      {/* Top Verification Verdict Header */}
      <div
        className={`p-3.5 border-b ${
          isPass
            ? 'bg-emerald-950/40 border-emerald-500/30'
            : 'bg-rose-950/40 border-rose-500/30'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            {isPass ? (
              <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                <ShieldCheck className="w-5 h-5" />
              </div>
            ) : (
              <div className="p-2 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40">
                <ShieldAlert className="w-5 h-5" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded ${
                    isPass
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-rose-600 text-white'
                  }`}
                >
                  {isPass ? 'VERIFIED SAFE (PASS)' : `FAIL: ${verification.criticalCount} CRITICAL HAZARDS`}
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {usedLiveArgon ? 'gemini-4-argon LIVE' : 'gemini-4-argon ENGINE'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                {isPass
                  ? 'All 3 elevation layers passed deterministic 3D kinematic simulation.'
                  : '3D full-body trajectory collided with room obstacles. Run Argon Auto-Patch below.'}
              </p>
            </div>
          </div>
        </div>

        {/* 3-Layer Metric Comparison Mini-Grid */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2">
            <div className="text-[10px] uppercase text-amber-400 font-semibold">
              1. Floor Stance
            </div>
            <div className="text-sm font-mono font-bold text-white mt-0.5">
              {verification.floorClearanceMinCm}cm
              <span className="text-[10px] text-slate-400 font-normal ml-1">
                / {profile.minPassageWidthCm}cm
              </span>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2">
            <div className="text-[10px] uppercase text-sky-400 font-semibold">
              2. Turn Circle Ø
            </div>
            <div className="text-sm font-mono font-bold text-white mt-0.5">
              {verification.midTurningClearanceCm}cm
              <span className="text-[10px] text-slate-400 font-normal ml-1">
                / {profile.turningRadiusCm}cm
              </span>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2">
            <div className="text-[10px] uppercase text-rose-400 font-semibold">
              3. Head Clearance
            </div>
            <div
              className={`text-sm font-mono font-bold mt-0.5 ${
                verification.overheadHeadClearanceMinCm < 15
                  ? 'text-rose-400'
                  : 'text-emerald-400'
              }`}
            >
              {verification.overheadHeadClearanceMinCm >= 0
                ? `+${verification.overheadHeadClearanceMinCm}cm`
                : `${verification.overheadHeadClearanceMinCm}cm`}
            </div>
          </div>
        </div>

        {/* Primary Action Button: Auto-Patch & Re-Verify Loop */}
        {mode === 'BEFORE' ? (
          <button
            onClick={() => {
              onTriggerAutoRemediate();
              setActiveTab('checklist');
            }}
            disabled={isAnalyzing}
            className="w-full mt-3 py-2 px-3 rounded-lg bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>
              Run Argon 3D Autonomous Patch & Re-Verify ({beforeVerification.totalCollisions} Collisions → {afterVerification.totalCollisions})
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="mt-3 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Closed-Loop Verified: {beforeVerification.totalCollisions} hazards resolved → 0 collisions!
            </span>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="grid grid-cols-3 border-b border-slate-800 bg-slate-950 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('hazards')}
          className={`py-2.5 px-2 flex items-center justify-center gap-1.5 border-b-2 transition ${
            activeTab === 'hazards'
              ? 'border-rose-500 text-white bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          <span>3D Hazards ({verification.hazards.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('checklist')}
          className={`py-2.5 px-2 flex items-center justify-center gap-1.5 border-b-2 transition ${
            activeTab === 'checklist'
              ? 'border-emerald-500 text-white bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
          <span>Patch & Welfare ({remediationChecklist.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('loop')}
          className={`py-2.5 px-2 flex items-center justify-center gap-1.5 border-b-2 transition ${
            activeTab === 'loop'
              ? 'border-sky-500 text-white bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-3.5 h-3.5 text-sky-400" />
          <span>Argon Loop Log</span>
        </button>
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {activeTab === 'hazards' && (
          <>
            {verification.hazards.length === 0 ? (
              <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-4 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <div className="text-sm font-bold text-white">
                  Zero 3D Kinematic Collisions Remaining
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {argonRemediationSummary}
                </p>
              </div>
            ) : (
              verification.hazards.map((haz) => (
                <div
                  key={haz.id}
                  onClick={() =>
                    onSelectHazardObject(haz.objectIds[0] || '', haz.waypointId)
                  }
                  className="bg-slate-950/90 border border-slate-800 hover:border-rose-500/50 rounded-xl p-3 space-y-2 cursor-pointer transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        haz.layer === 'overhead'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : haz.layer === 'mid'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {haz.layer.toUpperCase()} LAYER • {haz.severity}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      Measured: {haz.measuredValueCm}cm (Req: {haz.requiredValueCm}cm)
                    </span>
                  </div>

                  <div className="text-xs font-bold text-white">{haz.title}</div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {haz.description}
                  </p>

                  {/* 3D Causal Chain Box */}
                  <div className="bg-rose-950/30 border border-rose-500/20 rounded-lg p-2 text-[11px] text-rose-200">
                    <span className="font-bold text-rose-300">3D Causal Chain: </span>
                    {haz.causalChain}
                  </div>

                  {/* Epistemic Honesty Note */}
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-300/90 pt-0.5">
                    <Ruler className="w-3.5 h-3.5 shrink-0" />
                    <span>{haz.epistemicNote}</span>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {activeTab === 'checklist' && (
          <div className="space-y-3">
            <div className="bg-sky-950/30 border border-sky-500/30 rounded-lg p-2.5 text-xs text-slate-200 leading-relaxed">
              <div className="font-bold text-sky-300 mb-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Argon 3D Spatial Remediation Summary
              </div>
              {argonRemediationSummary}
            </div>

            {remediationChecklist.map((item) => {
              const isChecked = Boolean(checkedItems[item.id]);
              return (
                <div
                  key={item.id}
                  onClick={() => toggleChecklist(item.id)}
                  className={`p-3 rounded-xl border transition cursor-pointer ${
                    isChecked
                      ? 'bg-emerald-950/20 border-emerald-500/40'
                      : 'bg-slate-950/90 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="mt-1 accent-emerald-500"
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            item.priority === 'IMMEDIATE_ZERO_COST'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : item.priority === 'WELFARE_EQUIPMENT'
                              ? 'bg-sky-500/20 text-sky-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {item.priority === 'IMMEDIATE_ZERO_COST'
                            ? 'STEP 1: IMMEDIATE TODAY ($0)'
                            : item.priority === 'WELFARE_EQUIPMENT'
                            ? 'STEP 2: WELFARE EQUIPMENT SUBSIDY'
                            : 'STEP 3: HOME MODIFICATION GRANT'}
                        </span>
                        <span className="text-xs font-mono font-bold text-emerald-300">
                          {item.estimatedCostLabel}
                        </span>
                      </div>

                      <div className="text-xs font-bold text-white">{item.title}</div>
                      <div className="text-[11px] text-slate-400">{item.koreanTitle}</div>

                      <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
                        <div className="bg-rose-950/30 border border-rose-500/20 rounded p-1.5 text-rose-200">
                          <span className="font-bold block text-rose-400">Before:</span>
                          {item.beforeState}
                        </div>
                        <div className="bg-emerald-950/30 border border-emerald-500/20 rounded p-1.5 text-emerald-200">
                          <span className="font-bold block text-emerald-400">After:</span>
                          {item.afterState}
                        </div>
                      </div>

                      {item.koreanWelfareProgramTag && (
                        <div className="text-[11px] text-sky-300 font-medium pt-1">
                          ★ Support Program: {item.koreanWelfareProgramTag}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'loop' && (
          <div className="space-y-3 text-xs">
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono space-y-1.5">
              <div className="text-sky-400 font-bold text-[11px] uppercase">
                Gemini 4 Argon Thought Summary (thinking_level: medium)
              </div>
              <pre className="whitespace-pre-wrap text-[11px] text-slate-300 leading-relaxed font-mono">
                {argonThoughtSummary}
              </pre>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-slate-300 uppercase text-[11px] tracking-wider">
                Closed-Loop Verification Pipeline Trace
              </div>
              {[
                ...beforeVerification.verificationLogs,
                ...afterVerification.verificationLogs,
              ].map((log, i) => (
                <div
                  key={`${log.id}-${i}`}
                  className="bg-slate-950/90 border border-slate-800 rounded-lg p-2.5 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold text-sky-400">
                      [{log.stage}]
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        log.status === 'FAIL'
                          ? 'bg-rose-500/20 text-rose-300'
                          : log.status === 'PASS'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {log.status}
                    </span>
                  </div>
                  <div className="font-semibold text-white">{log.title}</div>
                  <div className="text-[11px] text-slate-400">{log.detail}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
