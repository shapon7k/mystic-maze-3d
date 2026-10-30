/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Play, RotateCcw, Shuffle, Settings as SettingsIcon, Home, AlertTriangle } from 'lucide-react';

interface PauseModalProps {
  onResume: () => void;
  onRestartRun: () => void;
  onNewMaze: () => void;
  onOpenSettings: () => void;
  onMainMenu: () => void;
  currentSeed: number;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onRestartRun,
  onNewMaze,
  onOpenSettings,
  onMainMenu,
  currentSeed,
}) => {
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);

  return (
    <div className="absolute inset-0 z-40 bg-slate-950/80 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-sm max-h-[92vh] overflow-y-auto bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-4 sm:p-6 text-center animate-in fade-in zoom-in-95 duration-150 my-auto">
        <h2 className="text-xl sm:text-2xl font-bold uppercase tracking-widest text-cyan-200">
          Exploration Paused
        </h2>
        <p className="text-xs font-mono text-slate-400 mt-1">
          Labyrinth Seed: <span className="text-cyan-400">{currentSeed}</span>
        </p>

        {showRestartConfirm ? (
          <div className="mt-5 p-4 rounded-lg bg-amber-950/40 border border-amber-600/40 text-left">
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Confirm Restart?</span>
            </div>
            <p className="text-xs text-amber-200/80 mt-1.5 leading-relaxed">
              Restarting will reset your position to the entrance and reset the timer. Your exploration progress in this run will be lost.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRestartConfirm(false);
                  onRestartRun();
                }}
                className="flex-1 py-2 px-3 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Yes, Restart
              </button>
              <button
                type="button"
                onClick={() => setShowRestartConfirm(false)}
                className="flex-1 py-2 px-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 sm:mt-6 flex flex-col gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="w-full py-2.5 sm:py-3 px-3 sm:px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs sm:text-sm tracking-wider uppercase transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-cyan-900/30"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Resume Exploration</span>
            </button>

            <button
              type="button"
              onClick={() => setShowRestartConfirm(true)}
              className="w-full py-2 sm:py-2.5 px-3 sm:px-4 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Restart Current Run</span>
            </button>

            <button
              type="button"
              onClick={onNewMaze}
              className="w-full py-2 sm:py-2.5 px-3 sm:px-4 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Shuffle className="w-4 h-4" />
              <span>Generate New Maze</span>
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="w-full py-2 sm:py-2.5 px-3 sm:px-4 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <SettingsIcon className="w-4 h-4" />
              <span>Settings</span>
            </button>

            <button
              type="button"
              onClick={onMainMenu}
              className="w-full py-2 sm:py-2.5 px-3 sm:px-4 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 font-medium text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer mt-0.5 sm:mt-1"
            >
              <Home className="w-4 h-4" />
              <span>Return to Main Menu</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
