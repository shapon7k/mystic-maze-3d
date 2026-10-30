/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';

interface VirtualJoystickProps {
  onMove: (x: number, y: number) => void;
  className?: string;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({ onMove, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTouchId = useRef<number | null>(null);
  const currentRadius = useRef<number>(44);

  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);

  const calculatePosition = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Dynamically adapt travel radius to actual rendered element size
    const travelRadius = Math.max(32, Math.min(54, (rect.width - 28) * 0.5));
    currentRadius.current = travelRadius;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);

    const clampedDist = Math.min(dist, travelRadius);
    const angle = Math.atan2(dy, dx);
    const clampedX = Math.cos(angle) * clampedDist;
    const clampedY = Math.sin(angle) * clampedDist;

    setKnobPos({ x: clampedX, y: clampedY });
    // In game: forward is -dy (up on screen), backward is +dy (down on screen)
    onMove(clampedX / travelRadius, -clampedY / travelRadius);
  }, [onMove]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only bind to first unassigned touch pointer
    if (activeTouchId.current !== null) return;
    activeTouchId.current = e.pointerId;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setIsActive(true);
    calculatePosition(e.clientX, e.clientY);
  }, [calculatePosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== activeTouchId.current) return;
    calculatePosition(e.clientX, e.clientY);
  }, [calculatePosition]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== activeTouchId.current) return;
    activeTouchId.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setIsActive(false);
    setKnobPos({ x: 0, y: 0 });
    onMove(0, 0);
  }, [onMove]);

  useEffect(() => {
    const handleGlobalBlur = () => {
      activeTouchId.current = null;
      setIsActive(false);
      setKnobPos({ x: 0, y: 0 });
      onMove(0, 0);
    };
    window.addEventListener('blur', handleGlobalBlur);
    return () => window.removeEventListener('blur', handleGlobalBlur);
  }, [onMove]);

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`relative w-28 h-28 sm:w-32 sm:h-32 md:w-36 md:h-36 rounded-full flex items-center justify-center touch-none select-none ${className}`}
      style={{
        background: isActive
          ? 'radial-gradient(circle, rgba(56, 189, 248, 0.18) 0%, rgba(15, 23, 42, 0.8) 100%)'
          : 'radial-gradient(circle, rgba(30, 41, 59, 0.45) 0%, rgba(15, 23, 42, 0.65) 100%)',
        border: isActive ? '2px solid rgba(56, 189, 248, 0.7)' : '2px solid rgba(148, 163, 184, 0.25)',
        boxShadow: isActive ? '0 0 20px rgba(56, 189, 248, 0.35)' : 'none',
      }}
    >
      {/* Direction Crosslines */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30">
        <div className="w-full h-[1px] bg-sky-400" />
        <div className="h-full w-[1px] bg-sky-400 absolute" />
      </div>

      {/* Central Stick Knob */}
      <div
        className="w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full pointer-events-none flex items-center justify-center transition-transform duration-75"
        style={{
          transform: `translate3d(${knobPos.x}px, ${knobPos.y}px, 0)`,
          background: isActive
            ? 'linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)'
            : 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
          boxShadow: isActive ? '0 0 16px #38bdf8' : '0 2px 6px rgba(0,0,0,0.5)',
          border: '1.5px solid rgba(255, 255, 255, 0.4)',
        }}
      >
        <div className="w-3.5 h-3.5 rounded-full bg-white/40" />
      </div>
    </div>
  );
};
