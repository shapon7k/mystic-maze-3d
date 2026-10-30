/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Dices, Info, Play, Settings as SettingsIcon, ShieldAlert, X } from 'lucide-react';
import { DifficultyLevel, DIFFICULTY_PRESETS } from '../types/game';

type MenuScreen = 'splash' | 'menu' | 'setup';

interface MenuFlowProps {
  initialDifficulty: DifficultyLevel;
  onStartGame: (difficulty: DifficultyLevel, seed?: number) => void;
  onOpenSettings: () => void;
}

// The splash screen is shown once per app launch, not every time the player returns to the menu
let splashAlreadyShown = false;

const Emblem: React.FC<{ small?: boolean }> = ({ small }) => (
  <svg viewBox="0 0 100 100" className={`mm-emblem${small ? ' mm-emblem-sm' : ''}`}>
    <rect x="6" y="6" width="88" height="88" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="6 3" />
    <rect x="16" y="16" width="68" height="68" fill="none" stroke="#a855f7" strokeWidth="2" strokeDasharray="4 4" />
    <rect x="28" y="28" width="44" height="44" fill="none" stroke="#818cf8" strokeWidth="2" />
    <polygon points="50,18 64,50 50,82 36,50" fill="rgba(56, 189, 248, 0.25)" stroke="#38bdf8" strokeWidth="2" />
    <circle cx="50" cy="50" r="4" fill="#ffffff" />
  </svg>
);

/** Screen 1: splash with loading bar. Tap anywhere to continue. */
const SplashScreen: React.FC<{ onContinue: () => void }> = ({ onContinue }) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 2400);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      className="mm-screen"
      style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', cursor: 'pointer' }}
      onClick={onContinue}
    >
      <Emblem />
      <h1 className="mm-title" style={{ marginTop: '1.6cqw' }}>Mystic Maze 3D</h1>
      <p className="mm-tagline">Explore. Observe. Remember. Navigate. Escape.</p>
      <div style={{ marginTop: '4cqw', height: '4.4cqw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {ready ? (
          <span className="mm-label mm-pulse">Tap to continue</span>
        ) : (
          <div className="mm-bar"><span /></div>
        )}
      </div>
    </div>
  );
};

/** Screen 2: main menu */
const MainMenuScreen: React.FC<{
  onPlay: () => void;
  onSettings: () => void;
  onAbout: () => void;
}> = ({ onPlay, onSettings, onAbout }) => (
  <div className="mm-screen" style={{ alignItems: 'center', gap: '5cqw' }}>
    <div style={{ flex: 1.15 }}>
      <Emblem small />
      <h1 className="mm-title" style={{ marginTop: '1.2cqw' }}>Mystic Maze 3D</h1>
      <p className="mm-tagline">
        A procedural labyrinth of ancient square stone halls, glowing runes and a hidden sanctum.
      </p>
      <div className="mm-badge">
        <ShieldAlert style={{ width: '1.9cqw', height: '1.9cqw' }} />
        <span>No minimap · No compass · Trust your memory</span>
      </div>
    </div>

    <div style={{ flex: 0.85, display: 'flex', flexDirection: 'column', gap: '1.8cqw' }}>
      <button type="button" className="mm-btn mm-primary" onClick={onPlay}>
        <Play fill="currentColor" />
        <span>Play</span>
      </button>
      <button type="button" className="mm-btn" onClick={onSettings}>
        <SettingsIcon />
        <span>Settings</span>
      </button>
      <button type="button" className="mm-btn" onClick={onAbout}>
        <Info />
        <span>About</span>
      </button>
    </div>

    <div className="mm-footer" style={{ position: 'absolute', left: '5.5cqw', bottom: '2.2cqw' }}>
      v1.0 · Plays fully offline
    </div>
  </div>
);

/** Screen 3: pick the labyrinth (difficulty + optional seed) and enter */
const PlaySetupScreen: React.FC<{
  initialDifficulty: DifficultyLevel;
  onBack: () => void;
  onEnter: (difficulty: DifficultyLevel, seed?: number) => void;
}> = ({ initialDifficulty, onBack, onEnter }) => {
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(initialDifficulty);
  const [seedInput, setSeedInput] = useState('');
  const keys = Object.keys(DIFFICULTY_PRESETS) as DifficultyLevel[];

  const handleEnter = () => {
    const parsed = seedInput.trim() !== '' ? parseInt(seedInput, 10) : undefined;
    onEnter(difficulty, parsed === undefined || isNaN(parsed) ? undefined : parsed);
  };

  return (
    <div className="mm-screen" style={{ flexDirection: 'column', justifyContent: 'space-between' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="mm-title mm-title-sm">Choose your labyrinth</h1>
        <button type="button" className="mm-btn mm-ghost" onClick={onBack}>
          <ArrowLeft />
          <span>Back</span>
        </button>
      </header>

      <div>
        <div className="mm-label" style={{ marginBottom: '1.2cqw' }}>Difficulty</div>
        <div style={{ display: 'flex', gap: '2cqw' }}>
          {keys.map((key, index) => {
            const preset = DIFFICULTY_PRESETS[key];
            return (
              <button
                key={key}
                type="button"
                className={`mm-card${difficulty === key ? ' mm-selected' : ''}`}
                onClick={() => setDifficulty(key)}
              >
                <span className="mm-card-name">{preset.name}</span>
                <span className="mm-card-grid">{preset.rows} × {preset.cols}</span>
                <span className="mm-card-sub">{preset.rows * preset.cols} chambers</span>
                <span className="mm-dots">
                  {[0, 1, 2].map((d) => (
                    <i key={d} className={d <= index ? 'mm-on' : ''} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mm-hint" style={{ margin: '1.2cqw 0 0' }}>{DIFFICULTY_PRESETS[difficulty].description}</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '2cqw' }}>
        <div style={{ display: 'flex', flex: 1, gap: '1cqw' }}>
          <input
            type="number"
            inputMode="numeric"
            className="mm-input"
            placeholder="Seed (optional)"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
          />
          <button
            type="button"
            className="mm-iconbtn"
            title="Random seed"
            onClick={() => setSeedInput(String(Math.floor(Math.random() * 900000 + 100000)))}
          >
            <Dices />
          </button>
        </div>
        <div style={{ flex: 1 }}>
          <button type="button" className="mm-btn mm-primary" onClick={handleEnter}>
            <Play fill="currentColor" />
            <span>Enter Labyrinth</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const AboutPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="mm-overlay" onClick={onClose}>
    <div className="mm-panel" onClick={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h2>About Mystic Maze 3D</h2>
        <button type="button" className="mm-iconbtn" onClick={onClose} title="Close">
          <X />
        </button>
      </div>
      <p>
        Find the exit of a new, procedurally generated stone labyrinth every run. There are no maps, arrows or hints:
        you discover the way by exploring, remembering and backtracking.
      </p>
      <ul>
        <li>Left thumb: joystick to move. Drag the right side of the screen to look around.</li>
        <li>Sprint and view buttons sit on the screen. Pause any time from the top bar.</li>
        <li>Desktop: WASD to move, mouse drag to look, Shift to sprint, Esc to pause.</li>
        <li>The game works fully offline and collects no data.</li>
      </ul>
    </div>
  </div>
);

export const MenuFlow: React.FC<MenuFlowProps> = ({ initialDifficulty, onStartGame, onOpenSettings }) => {
  const [screen, setScreen] = useState<MenuScreen>(splashAlreadyShown ? 'menu' : 'splash');
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <div className="mm-stage-wrap">
      <div className="mm-stage">
        {screen === 'splash' && (
          <SplashScreen
            onContinue={() => {
              splashAlreadyShown = true;
              setScreen('menu');
            }}
          />
        )}
        {screen === 'menu' && (
          <MainMenuScreen
            onPlay={() => setScreen('setup')}
            onSettings={onOpenSettings}
            onAbout={() => setAboutOpen(true)}
          />
        )}
        {screen === 'setup' && (
          <PlaySetupScreen
            initialDifficulty={initialDifficulty}
            onBack={() => setScreen('menu')}
            onEnter={onStartGame}
          />
        )}
        {aboutOpen && <AboutPanel onClose={() => setAboutOpen(false)} />}
      </div>
    </div>
  );
};
