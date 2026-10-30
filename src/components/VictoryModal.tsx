/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Award, RotateCcw, Shuffle, Home, Clock, Footprints, Navigation } from 'lucide-react';
import { RunStatistics, DIFFICULTY_PRESETS } from '../types/game';

interface VictoryModalProps {
  stats: RunStatistics;
  onPlayAgain: () => void;
  onNewMaze: () => void;
  onMainMenu: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  stats,
  onPlayAgain,
  onNewMaze,
  onMainMenu,
}) => {
  const totalSeconds = Math.floor(stats.elapsedTimeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((stats.elapsedTimeMs % 1000) / 100);
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}s`;

  const difficultyName = DIFFICULTY_PRESETS[stats.difficulty]?.name || stats.difficulty;

  const tile = 'bg-slate-950/70 border border-slate-800 rounded-lg px-2.5 py-1.5 flex items-center gap-2 min-w-0';
  const label = 'text-[10px] uppercase font-bold text-slate-400 leading-tight';

  return (
    <div className="absolute inset-0 z-40 bg-slate-950/85 flex items-center justify-center p-2 overflow-hidden">
      <div className="w-full max-w-3xl max-h-full bg-slate-900 border border-cyan-500/50 rounded-2xl shadow-[0_0_50px_rgba(56,189,248,0.25)] p-3 sm:p-5 grid grid-cols-1 landscape:grid-cols-2 gap-3 sm:gap-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Part 1: Title */}
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 landscape:w-14 landscape:h-14 rounded-full bg-cyan-950/80 border border-cyan-400 flex items-center justify-center shadow-[0_0_24px_rgba(56,189,248,0.5)]">
            <Award className="w-6 h-6 landscape:w-7 landscape:h-7 text-cyan-300" />
          </div>
          <h2 className="mt-2 text-xl landscape:text-2xl font-extrabold uppercase tracking-widest bg-gradient-to-r from-cyan-300 via-indigo-200 to-purple-300 bg-clip-text text-transparent">
            Sanctuary Discovered
          </h2>
          <p className="mt-1 text-xs text-slate-300">
            You navigated the shadowed halls and reached the heart portal independently.
          </p>
          <div className="mt-2 text-[11px] font-mono text-slate-400">
            {difficultyName} · #{stats.seed}
          </div>
        </div>

        {/* Part 2: Stats + actions */}
        <div className="flex flex-col justify-center gap-2 min-w-0">
          <div className="grid grid-cols-3 gap-2 text-left">
            <div className={tile}>
              <Clock className="w-4 h-4 text-indigo-300 shrink-0" />
              <div className="min-w-0">
                <div className={label}>Time</div>
                <div className="text-sm font-mono font-semibold text-cyan-200 tabular-nums truncate">{formattedTime}</div>
              </div>
            </div>
            <div className={tile}>
              <Footprints className="w-4 h-4 text-cyan-300 shrink-0" />
              <div className="min-w-0">
                <div className={label}>Steps</div>
                <div className="text-sm font-mono font-semibold text-slate-200 tabular-nums">{stats.stepsTaken}</div>
              </div>
            </div>
            <div className={tile}>
              <Navigation className="w-4 h-4 text-purple-300 shrink-0" />
              <div className="min-w-0">
                <div className={label}>Distance</div>
                <div className="text-sm font-mono font-semibold text-purple-200 tabular-nums">
                  {Math.round(stats.distanceTraveledMeters)} m
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onNewMaze}
            className="w-full py-2.5 px-3 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-sm tracking-wider uppercase transition flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(56,189,248,0.3)]"
          >
            <Shuffle className="w-4 h-4" />
            <span>Generate New Labyrinth</span>
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onPlayAgain}
              className="py-2 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Replay Same Maze</span>
            </button>
            <button
              type="button"
              onClick={onMainMenu}
              className="py-2 px-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-slate-100 font-medium text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>Main Menu</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
