/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine } from './game/GameEngine';
import { AudioManager } from './game/AudioManager';
import { GameState, GameSettings, DifficultyLevel, RunStatistics } from './types/game';
import { MenuFlow } from './components/MenuFlow';
import { GameHUD } from './components/GameHUD';
import { PauseModal } from './components/PauseModal';
import { VictoryModal } from './components/VictoryModal';
import { SettingsModal } from './components/SettingsModal';

const DEFAULT_SETTINGS: GameSettings = {
  lookSensitivity: 1.0,
  soundVolume: 0.8,
  musicVolume: 0.6,
  quality: 'medium',
  isMuted: false,
  invertY: false,
  cameraMode: 'first-person',
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const audioManagerRef = useRef<AudioManager | null>(null);

  // React UI States
  const [gameState, setGameState] = useState<GameState>('TITLE');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('novice');
  const [currentSeed, setCurrentSeed] = useState<number>(12345);
  const [settings, setSettings] = useState<GameSettings>(() => {
    try {
      const saved = localStorage.getItem('mystic_maze_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          cameraMode: parsed.cameraMode === 'third-person' ? 'third-person' : 'first-person',
        };
      }
      return DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // HUD stats
  const [elapsedTimeMs, setElapsedTimeMs] = useState(0);
  const [stepsTaken, setStepsTaken] = useState(0);
  const [isSprinting, setIsSprinting] = useState(false);
  const [cameraMode, setCameraMode] = useState<'first-person' | 'third-person'>(settings.cameraMode);
  const [runStats, setRunStats] = useState<RunStatistics | null>(null);

  // Timer reference
  const timerStartRef = useRef<number>(0);
  const timerAccumulatedRef = useRef<number>(0);
  const timerIntervalRef = useRef<number | null>(null);

  // Initialize Three.js Engine and Audio
  useEffect(() => {
    if (!canvasMountRef.current) return;

    const audioMgr = new AudioManager();
    audioManagerRef.current = audioMgr;

    const engine = new GameEngine(canvasMountRef.current, audioMgr);
    engineRef.current = engine;
    engine.applySettings(settings);

    setCurrentSeed(engine.mazeData.seed);

    // Victory callback from engine
    engine.onVictory = () => {
      // Calculate final stats
      const finalTime = timerAccumulatedRef.current + (performance.now() - timerStartRef.current);
      const stats: RunStatistics = {
        elapsedTimeMs: finalTime,
        stepsTaken: engine.playerController.stepsTaken,
        distanceTraveledMeters: engine.playerController.distanceTraveled,
        difficulty: engine.mazeData.difficulty,
        seed: engine.mazeData.seed,
        completedAt: new Date(),
      };
      setRunStats(stats);
      setGameState('VICTORY');

      if (timerIntervalRef.current) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };

    return () => {
      if (timerIntervalRef.current) {
        window.clearInterval(timerIntervalRef.current);
      }
      engine.dispose();
      audioMgr.dispose();
    };
  }, []);

  // Screen Wake Lock while actively exploring
  useEffect(() => {
    let wakeLockSentinel: { release: () => Promise<void> } | null = null;

    if (gameState === 'PLAYING' && 'wakeLock' in navigator) {
      (navigator as unknown as { wakeLock: { request: (type: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock
        .request('screen')
        .then((sentinel) => {
          wakeLockSentinel = sentinel;
        })
        .catch(() => {
          // Gracefully ignore wake lock errors (e.g. system power saver mode)
        });
    }

    return () => {
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
      }
    };
  }, [gameState]);

  // Save settings when changed
  const handleUpdateSettings = useCallback((newSettings: GameSettings) => {
    setSettings(newSettings);
    if (newSettings.cameraMode && newSettings.cameraMode !== cameraMode) {
      setCameraMode(newSettings.cameraMode);
    }
    try {
      localStorage.setItem('mystic_maze_settings', JSON.stringify(newSettings));
    } catch {
      // ignore
    }
    if (engineRef.current) {
      engineRef.current.applySettings(newSettings);
    }
  }, [cameraMode]);

  // Start new run
  const handleStartGame = useCallback((diff: DifficultyLevel, seed?: number) => {
    if (!engineRef.current || !audioManagerRef.current) return;
    audioManagerRef.current.ensureContext();
    audioManagerRef.current.playUIClick();

    setDifficulty(diff);
    engineRef.current.initMaze(diff, seed);
    setCurrentSeed(engineRef.current.mazeData.seed);

    engineRef.current.setGameState('PLAYING');
    setGameState('PLAYING');

    // Reset and start timer
    timerAccumulatedRef.current = 0;
    timerStartRef.current = performance.now();
    setElapsedTimeMs(0);
    setStepsTaken(0);

    if (timerIntervalRef.current) window.clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = window.setInterval(() => {
      if (engineRef.current) {
        const currentElapsed = timerAccumulatedRef.current + (performance.now() - timerStartRef.current);
        setElapsedTimeMs(currentElapsed);
        setStepsTaken(engineRef.current.playerController.stepsTaken);
      }
    }, 100);
  }, []);

  // Pause
  const handlePause = useCallback((silent = false) => {
    if (gameState !== 'PLAYING') return;
    if (!silent && audioManagerRef.current) audioManagerRef.current.playUIClick();

    // Accumulate elapsed time
    timerAccumulatedRef.current += performance.now() - timerStartRef.current;
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (engineRef.current) {
      engineRef.current.setGameState('PAUSED');
    }
    setGameState('PAUSED');
  }, [gameState]);

  // Resume
  const handleResume = useCallback(() => {
    if (gameState !== 'PAUSED') return;
    if (audioManagerRef.current) audioManagerRef.current.playUIClick();

    timerStartRef.current = performance.now();
    if (timerIntervalRef.current) window.clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = window.setInterval(() => {
      if (engineRef.current) {
        const currentElapsed = timerAccumulatedRef.current + (performance.now() - timerStartRef.current);
        setElapsedTimeMs(currentElapsed);
        setStepsTaken(engineRef.current.playerController.stepsTaken);
      }
    }, 100);

    if (engineRef.current) {
      engineRef.current.setGameState('PLAYING');
    }
    setGameState('PLAYING');
  }, [gameState]);

  // Restart Current Run (same maze seed)
  const handleRestartRun = useCallback(() => {
    if (!engineRef.current || !audioManagerRef.current) return;
    audioManagerRef.current.playUIClick();

    handleStartGame(difficulty, currentSeed);
  }, [difficulty, currentSeed, handleStartGame]);

  // New Maze (fresh random seed)
  const handleNewMaze = useCallback(() => {
    if (!engineRef.current || !audioManagerRef.current) return;
    audioManagerRef.current.playUIClick();

    const freshSeed = Math.floor(Math.random() * 900000 + 100000);
    handleStartGame(difficulty, freshSeed);
  }, [difficulty, handleStartGame]);

  // Return to Main Menu
  const handleMainMenu = useCallback(() => {
    if (!engineRef.current || !audioManagerRef.current) return;
    audioManagerRef.current.playUIClick();

    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    engineRef.current.setGameState('TITLE');
    setGameState('TITLE');
  }, []);

  // Toggle Mute
  const handleToggleMute = useCallback(() => {
    const nextMuted = !settings.isMuted;
    handleUpdateSettings({ ...settings, isMuted: nextMuted });
  }, [settings, handleUpdateSettings]);

  // Mobile / UI Joystick Input
  const handleJoystickMove = useCallback((x: number, y: number) => {
    if (engineRef.current && gameState === 'PLAYING') {
      engineRef.current.playerController.currentInput.moveX = x;
      engineRef.current.playerController.currentInput.moveZ = y;
    }
  }, [gameState]);

  // Touch Camera Look Delta
  const handleLookDelta = useCallback((dx: number, dy: number) => {
    if (engineRef.current && gameState === 'PLAYING') {
      engineRef.current.playerController.currentInput.lookDeltaX += dx;
      engineRef.current.playerController.currentInput.lookDeltaY += dy;
    }
  }, [gameState]);

  // Sprint Toggle
  const handleToggleSprint = useCallback((active: boolean) => {
    setIsSprinting(active);
    if (engineRef.current) {
      engineRef.current.playerController.currentInput.isSprinting = active;
    }
  }, []);

  // Hand actions
  const handleAttack = useCallback(() => {
    audioManagerRef.current?.ensureContext();
    engineRef.current?.doAttack();
  }, []);
  const handleDefend = useCallback((active: boolean) => {
    engineRef.current?.setDefend(active);
  }, []);
  const handleEmote = useCallback(() => {
    engineRef.current?.doEmote();
  }, []);

  // Toggle Camera View Mode (First-Person vs Third-Person)
  const handleToggleCamera = useCallback(() => {
    const nextMode = cameraMode === 'first-person' ? 'third-person' : 'first-person';
    setCameraMode(nextMode);
    const updatedSettings: GameSettings = { ...settings, cameraMode: nextMode };
    setSettings(updatedSettings);
    try {
      localStorage.setItem('mystic_maze_settings', JSON.stringify(updatedSettings));
    } catch {
      // ignore
    }
    if (engineRef.current) {
      engineRef.current.playerController.setCameraMode(nextMode);
    }
  }, [cameraMode, settings]);

  // Keyboard and Desktop Controls
  useEffect(() => {
    const heldKeys = new Set<string>();

    const updateKeyboardMovement = () => {
      if (!engineRef.current || engineRef.current.gameState !== 'PLAYING') return;

      let moveZ = 0;
      let moveX = 0;

      if (heldKeys.has('KeyW') || heldKeys.has('ArrowUp')) moveZ += 1;
      if (heldKeys.has('KeyS') || heldKeys.has('ArrowDown')) moveZ -= 1;
      if (heldKeys.has('KeyD') || heldKeys.has('ArrowRight')) moveX += 1;
      if (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft')) moveX -= 1;

      const sprinting = heldKeys.has('ShiftLeft') || heldKeys.has('ShiftRight');
      setIsSprinting(sprinting);

      // Only overwrite if keyboard is actively providing input
      if (moveZ !== 0 || moveX !== 0 || heldKeys.size > 0) {
        engineRef.current.playerController.currentInput.moveZ = moveZ;
        engineRef.current.playerController.currentInput.moveX = moveX;
        engineRef.current.playerController.currentInput.isSprinting = sprinting;
      } else {
        // If no keys pressed, check if joystick was also 0
        if (
          engineRef.current.playerController.currentInput.moveX === 0 &&
          engineRef.current.playerController.currentInput.moveZ === 0
        ) {
          engineRef.current.playerController.currentInput.isSprinting = false;
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      audioManagerRef.current?.ensureContext();

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (gameState === 'PLAYING') {
          handlePause();
        } else if (gameState === 'PAUSED') {
          handleResume();
        }
        return;
      }

      if (e.code === 'KeyV' || e.code === 'KeyC') {
        if (gameState === 'PLAYING') {
          handleToggleCamera();
          return;
        }
      }

      if (gameState === 'TITLE' && (e.code === 'Enter' || e.code === 'Space')) {
        handleStartGame(difficulty);
        return;
      }

      if (gameState === 'PLAYING') {
        if (e.code === 'KeyJ') {
          if (!e.repeat) handleAttack();
          return;
        }
        if (e.code === 'KeyK') {
          handleDefend(true);
          return;
        }
        if (e.code === 'KeyE') {
          if (!e.repeat) handleEmote();
          return;
        }
      }

      heldKeys.add(e.code);
      updateKeyboardMovement();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyK') handleDefend(false);
      heldKeys.delete(e.code);
      updateKeyboardMovement();
    };

    const handleWindowBlur = () => {
      heldKeys.clear();
      updateKeyboardMovement();
      if (gameState === 'PLAYING') {
        handlePause(true);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && gameState === 'PLAYING') {
        heldKeys.clear();
        updateKeyboardMovement();
        handlePause(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [gameState, difficulty, handlePause, handleResume, handleStartGame, handleToggleCamera]);

  // Desktop Mouse Look Support (drag on canvas to look)
  useEffect(() => {
    let isMouseDown = false;
    let lastX = 0;
    let lastY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      if (gameState !== 'PLAYING') return;
      audioManagerRef.current?.ensureContext();
      isMouseDown = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isMouseDown || gameState !== 'PLAYING' || !engineRef.current) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      engineRef.current.playerController.currentInput.lookDeltaX += dx;
      engineRef.current.playerController.currentInput.lookDeltaY += dy;
    };

    const handleMouseUp = () => {
      isMouseDown = false;
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [gameState]);

  return (
    <div className="relative w-full h-full h-[100dvh] overflow-hidden bg-slate-950 font-sans select-none touch-none">
      {/* Three.js Isolated Canvas Mount (Persistent, never re-renders) */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full h-[100dvh] z-0 cursor-grab active:cursor-grabbing"
      />

      {/* Screens 1-3: Splash -> Main Menu -> Play Setup (16:9 stage) */}
      {gameState === 'TITLE' && (
        <MenuFlow
          initialDifficulty={difficulty}
          onStartGame={handleStartGame}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      )}

      {/* Screen 2: In-Game HUD (During active exploration) */}
      {gameState === 'PLAYING' && (
        <GameHUD
          elapsedTimeMs={elapsedTimeMs}
          stepsTaken={stepsTaken}
          isMuted={settings.isMuted}
          isSprinting={isSprinting}
          cameraMode={cameraMode}
          onJoystickMove={handleJoystickMove}
          onLookDelta={handleLookDelta}
          onToggleSprint={handleToggleSprint}
          onAttack={handleAttack}
          onDefend={handleDefend}
          onEmote={handleEmote}
          onToggleMute={handleToggleMute}
          onToggleCamera={handleToggleCamera}
          onPause={handlePause}
        />
      )}

      {/* Screen 3: Pause Menu */}
      {gameState === 'PAUSED' && (
        <PauseModal
          currentSeed={currentSeed}
          onResume={handleResume}
          onRestartRun={handleRestartRun}
          onNewMaze={handleNewMaze}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onMainMenu={handleMainMenu}
        />
      )}

      {/* Screen 4: Victory / Level Completed Screen */}
      {gameState === 'VICTORY' && runStats && (
        <VictoryModal
          stats={runStats}
          onPlayAgain={handleRestartRun}
          onNewMaze={handleNewMaze}
          onMainMenu={handleMainMenu}
        />
      )}

      {/* Settings Modal (Overlayable from Title or Pause) */}
      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
}
