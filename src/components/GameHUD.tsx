/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useCallback, useEffect } from 'react';
import { Pause, Volume2, VolumeX, Zap, Eye, User, Swords, Shield, Smile } from 'lucide-react';
import { VirtualJoystick } from './VirtualJoystick';

interface GameHUDProps {
  elapsedTimeMs: number;
  stepsTaken: number;
  isMuted: boolean;
  isSprinting: boolean;
  cameraMode: 'first-person' | 'third-person';
  onJoystickMove: (x: number, y: number) => void;
  onLookDelta: (dx: number, dy: number) => void;
  onToggleSprint: (active: boolean) => void;
  onAttack: () => void;
  onDefend: (active: boolean) => void;
  onEmote: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onPause: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  elapsedTimeMs,
  stepsTaken,
  isMuted,
  isSprinting,
  cameraMode,
  onJoystickMove,
  onLookDelta,
  onToggleSprint,
  onAttack,
  onDefend,
  onEmote,
  onToggleMute,
  onToggleCamera,
  onPause,
}) => {
  // Touch Camera Look Zone (Right half of the viewport)
  const lookAreaRef = useRef<HTMLDivElement>(null);
  const activeLookId = useRef<number | null>(null);
  const lastLookPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleLookPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only accept touch or mouse drag on right zone
    if (activeLookId.current !== null) return;
    activeLookId.current = e.pointerId;
    lastLookPos.current = { x: e.clientX, y: e.clientY };
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  const handleLookPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== activeLookId.current) return;
    const dx = e.clientX - lastLookPos.current.x;
    const dy = e.clientY - lastLookPos.current.y;
    lastLookPos.current = { x: e.clientX, y: e.clientY };

    onLookDelta(dx, dy);
  }, [onLookDelta]);

  const handleLookPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== activeLookId.current) return;
    activeLookId.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  // Format Elapsed Time MM:SS.d
  const totalSeconds = Math.floor(elapsedTimeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((elapsedTimeMs % 1000) / 100);

  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;

  // Global blur reset
  useEffect(() => {
    const handleBlur = () => {
      activeLookId.current = null;
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-20 flex flex-col justify-between p-2.5 sm:p-4 md:p-6">
      {/* Invisible Touch Look Layer on Right Half */}
      <div
        ref={lookAreaRef}
        onPointerDown={handleLookPointerDown}
        onPointerMove={handleLookPointerMove}
        onPointerUp={handleLookPointerUp}
        onPointerCancel={handleLookPointerUp}
        className="absolute top-0 right-0 w-1/2 h-full pointer-events-auto touch-none z-0"
      />

      {/* TOP PERIMETER: Stats & Controls */}
      <header className="relative z-10 flex items-center justify-between w-full">
        {/* Left: Timer & Steps */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="bg-slate-900/80 border border-slate-700/60 rounded px-2.5 sm:px-3.5 py-1 sm:py-1.5 shadow-md flex items-center gap-2">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#38bdf8]" />
            <div className="flex flex-col">
              <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-400 font-medium">Time</span>
              <span className="text-xs sm:text-base font-mono font-semibold tracking-wider text-cyan-200 tabular-nums">
                {formattedTime}
              </span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-700/60 rounded px-2.5 sm:px-3 py-1 sm:py-1.5 shadow-md hidden sm:flex flex-col">
            <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-400 font-medium">Steps</span>
            <span className="text-xs sm:text-sm font-mono font-medium text-slate-300 tabular-nums">
              {stepsTaken}
            </span>
          </div>
        </div>

        {/* Right: Camera Mode, Sound & Pause Buttons */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={onToggleCamera}
            aria-label={cameraMode === 'first-person' ? 'Switch to Third-Person View' : 'Switch to First-Person View'}
            title={cameraMode === 'first-person' ? 'Third-Person View (V)' : 'First-Person View (V)'}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded bg-slate-900/80 border transition flex items-center justify-center shadow-md cursor-pointer active:scale-95 ${
              cameraMode === 'third-person'
                ? 'border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.3)]'
                : 'border-slate-700/60 text-slate-300 hover:text-cyan-300'
            }`}
          >
            {cameraMode === 'third-person' ? (
              <User className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-300" />
            ) : (
              <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded bg-slate-900/80 border border-slate-700/60 text-slate-300 hover:text-cyan-300 active:scale-95 transition flex items-center justify-center shadow-md cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>

          <button
            type="button"
            onClick={onPause}
            aria-label="Pause Game"
            className="h-9 sm:h-10 px-2.5 sm:px-3.5 rounded bg-slate-900/80 border border-slate-700/60 text-slate-200 hover:text-cyan-300 active:scale-95 transition flex items-center gap-1.5 sm:gap-2 shadow-md cursor-pointer font-medium text-xs sm:text-sm"
          >
            <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
            <span>Pause</span>
          </button>
        </div>
      </header>

      {/* BOTTOM PERIMETER: Touch Joystick & Action Buttons */}
      <footer className="relative z-10 flex items-end justify-between w-full">
        {/* Lower Left: Virtual Movement Joystick */}
        <div className="pointer-events-auto touch-none pb-1 sm:pb-0">
          <VirtualJoystick onMove={onJoystickMove} />
        </div>

        {/* Center: Desktop Controls Hint (subtle, non-obtrusive, hidden on small screens) */}
        <div className="hidden lg:block pointer-events-none pb-2 text-center text-xs text-slate-400/80 font-mono tracking-wide bg-slate-950/60 px-4 py-1.5 rounded border border-slate-800/40">
          WASD / Arrows to Move · Mouse Drag to Look · Shift to Sprint · J Attack · K Defend · E Emote · V to Toggle View · Esc to Pause
        </div>

        {/* Lower Right: Action Buttons (Emote / Defend on top, Attack / Sprint below) */}
        <div className="pointer-events-auto grid grid-cols-2 gap-1.5 sm:gap-2 pb-1 sm:pb-2 touch-none select-none">
          <button
            type="button"
            onPointerDown={onEmote}
            className="w-11 h-11 sm:w-13 sm:h-13 md:w-14 md:h-14 rounded-full flex flex-col items-center justify-center border bg-slate-900/80 border-slate-700 text-slate-300 active:scale-95 active:border-fuchsia-400 active:text-fuchsia-300 transition-all shadow-lg cursor-pointer"
          >
            <Smile className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-[8px] uppercase font-bold tracking-widest">Emote</span>
          </button>

          <button
            type="button"
            onPointerDown={() => onDefend(true)}
            onPointerUp={() => onDefend(false)}
            onPointerLeave={() => onDefend(false)}
            onPointerCancel={() => onDefend(false)}
            className="w-11 h-11 sm:w-13 sm:h-13 md:w-14 md:h-14 rounded-full flex flex-col items-center justify-center border bg-slate-900/80 border-slate-700 text-slate-300 active:scale-95 active:bg-sky-500/30 active:border-sky-400 active:text-sky-300 transition-all shadow-lg cursor-pointer"
          >
            <Shield className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-[8px] uppercase font-bold tracking-widest">Defend</span>
          </button>

          <button
            type="button"
            onPointerDown={onAttack}
            className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full flex flex-col items-center justify-center border bg-rose-950/70 border-rose-500/70 text-rose-300 active:scale-95 active:bg-rose-500/30 transition-all shadow-[0_0_14px_rgba(244,63,94,0.3)] cursor-pointer"
          >
            <Swords className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[8px] sm:text-[9px] uppercase font-bold tracking-widest">Attack</span>
          </button>

          <button
            type="button"
            onPointerDown={() => onToggleSprint(true)}
            onPointerUp={() => onToggleSprint(false)}
            onPointerLeave={() => onToggleSprint(false)}
            className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full flex flex-col items-center justify-center border transition-all active:scale-95 shadow-lg select-none cursor-pointer ${
              isSprinting
                ? 'bg-amber-500/30 border-amber-400 text-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.4)]'
                : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            <Zap className={`w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 ${isSprinting ? 'fill-current animate-pulse' : ''}`} />
            <span className="text-[8px] sm:text-[9px] md:text-[10px] uppercase font-bold tracking-widest mt-0.5">Sprint</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
