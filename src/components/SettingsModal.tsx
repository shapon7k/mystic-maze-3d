/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SKIN_URLS, SKIN_NAMES } from '../game/Skins';
import React from 'react';
import { X, Volume2, Sliders, Monitor, Sparkles, Eye, User } from 'lucide-react';
import { GameSettings } from '../types/game';

interface SettingsModalProps {
  settings: GameSettings;
  onUpdateSettings: (newSettings: GameSettings) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings,
  onClose,
}) => {
  return (
    <div className="absolute inset-0 z-50 bg-slate-950/85 flex justify-center p-3 overflow-y-auto">
      <div className="m-auto w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2 text-cyan-300 font-bold text-lg uppercase tracking-wider">
            <Sliders className="w-5 h-5" />
            <span>Settings</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 space-y-5 text-sm">
          {/* Camera Perspective */}
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-300 mb-2 font-medium">
              <Eye className="w-3.5 h-3.5 text-slate-400" />
              <span>Camera Perspective</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onUpdateSettings({ ...settings, cameraMode: 'first-person' })}
                className={`py-2 text-xs font-semibold uppercase tracking-wider rounded border transition cursor-pointer flex items-center justify-center gap-2 ${
                  settings.cameraMode === 'first-person'
                    ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(56,189,248,0.25)]'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>First-Person</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ ...settings, cameraMode: 'third-person' })}
                className={`py-2 text-xs font-semibold uppercase tracking-wider rounded border transition cursor-pointer flex items-center justify-center gap-2 ${
                  settings.cameraMode === 'third-person'
                    ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(56,189,248,0.25)]'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Third-Person</span>
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 italic">
              {settings.cameraMode === 'first-person'
                ? 'Immersive eye-level view. Character model is hidden.'
                : 'Behind-character chase camera with wall collision and restricted height.'}
            </p>
          </div>

          {/* Character Skin */}
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-300 mb-2 font-medium">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>Character</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {SKIN_URLS.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, characterSkin: i })}
                  className={`flex flex-col items-center gap-1 py-1.5 rounded border transition cursor-pointer ${
                    (settings.characterSkin ?? 0) === i
                      ? 'bg-cyan-950/80 border-cyan-400 shadow-[0_0_10px_rgba(56,189,248,0.25)]'
                      : 'bg-slate-800/80 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <div
                    className="w-10 h-10"
                    style={{
                      backgroundImage: `url(${url})`,
                      backgroundSize: '320px 320px',
                      backgroundPosition: '-40px -40px',
                      imageRendering: 'pixelated',
                    }}
                  />
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-300">
                    {SKIN_NAMES[i]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Look Sensitivity */}
          <div>
            <div className="flex justify-between items-center text-xs text-slate-300 mb-1.5 font-medium">
              <span>Look Sensitivity</span>
              <span className="font-mono text-cyan-300">{settings.lookSensitivity.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.4"
              max="2.5"
              step="0.1"
              value={settings.lookSensitivity}
              onChange={(e) =>
                onUpdateSettings({ ...settings, lookSensitivity: parseFloat(e.target.value) })
              }
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* Invert Y Axis */}
          <div className="flex items-center justify-between py-1">
            <span className="text-xs text-slate-300 font-medium">Invert Vertical Look (Y-Axis)</span>
            <button
              type="button"
              onClick={() => onUpdateSettings({ ...settings, invertY: !settings.invertY })}
              className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                settings.invertY ? 'bg-cyan-500' : 'bg-slate-800'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                  settings.invertY ? 'right-1' : 'left-1'
                }`}
              />
            </button>
          </div>

          {/* Sound FX Volume */}
          <div>
            <div className="flex justify-between items-center text-xs text-slate-300 mb-1.5 font-medium">
              <span className="flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                <span>Sound Effects Volume</span>
              </span>
              <span className="font-mono text-cyan-300">{Math.round(settings.soundVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.soundVolume}
              onChange={(e) =>
                onUpdateSettings({ ...settings, soundVolume: parseFloat(e.target.value) })
              }
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* Ambient Music Volume */}
          <div>
            <div className="flex justify-between items-center text-xs text-slate-300 mb-1.5 font-medium">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                <span>Mystic Ambient Drone</span>
              </span>
              <span className="font-mono text-cyan-300">{Math.round(settings.musicVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.musicVolume}
              onChange={(e) =>
                onUpdateSettings({ ...settings, musicVolume: parseFloat(e.target.value) })
              }
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* Graphics Quality */}
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-300 mb-2 font-medium">
              <Monitor className="w-3.5 h-3.5 text-slate-400" />
              <span>Graphics Quality (Android Performance)</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as const).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, quality: q })}
                  className={`py-2 text-xs font-semibold uppercase tracking-wider rounded border transition cursor-pointer ${
                    settings.quality === q
                      ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(56,189,248,0.25)]'
                      : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-500 italic">
              {settings.quality === 'low'
                ? 'Optimized for low-end mobile devices (1x pixel ratio, simplified lighting).'
                : settings.quality === 'medium'
                ? 'Balanced performance with soft shadows.'
                : 'High fidelity with full shadows and enhanced fog.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs uppercase tracking-wider transition cursor-pointer"
        >
          Save & Close
        </button>
      </div>
    </div>
  );
};
