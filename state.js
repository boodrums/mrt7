import { FACTORY_DEFAULT_AUDIO_SETTINGS, MIN_BPM, MAX_BPM, MAX_BARS_TO_CYCLE } from './config.js';

// --- Default Pattern Generator ---

function getDefaultPattern(mode) {
    let arr = Array(mode).fill(0);
    if (mode === 16) {
        // 4/4 standard: Beats 1, 2, 3, 4 (16th notes on 0, 4, 8, 12)
        arr[0] = 3; arr[4] = 3; arr[8] = 3; arr[12] = 3; 
    } else if (mode === 12) {
        // 4/4 triplet feel or 3/4 feel: Beats on 1, 4, 7, 10 or 1, 4, 7 (using 0-index: 0, 3, 6, 9)
        arr[0] = 3; arr[3] = 3; arr[6] = 3; arr[9] = 3;
    }
    return arr;
}

// --- Core State Object ---

export const state = {
    // Audio settings: starts with a deep copy of the factory defaults.
    audioSettings: JSON.parse(JSON.stringify(FACTORY_DEFAULT_AUDIO_SETTINGS)),
    
    currentMode: 16,
    GRID_SIZE: 16,
    pattern: getDefaultPattern(16), // Active pattern

    isPlaying: false,
    currentStep: 0, // Current step of the main pattern (0 to GRID_SIZE - 1)
    tempo: 120, // BPM

    // Silent Bar State
    barsToPlay: 1, // N bars of rhythm
    barsToDrop: 0, // N bars of silence
    currentBarCycle: 0, // Current bar in the cycle (0 to barsToPlay + barsToDrop - 1)

    // Count-In State
    countInBars: 0, // 0, 1, or 2
    isCountingIn: false,
    countInStep: 0, // Tracks 16th/12th notes during count-in

    // Tap Tempo State
    tapTempoTimes: [],

    // Timer State
    sessionStartTime: null,
    timerInterval: null,

    // Wakelock
    wakeLock: null, 

    // Visual Optimization
    currentVisualSquare: null, 

    // Scheduling State
    nextNoteTime: 0.0,
    visualLoopRunning: false,
    currentStepTime: 0.0, // The AudioContext time when the current step should happen
    lastStep: -1 // The index of the last step that was visually updated
};


// --- State Management Functions ---

// Settings
export function loadSettings() {
    try {
        const storedSettings = localStorage.getItem('mrt7_audio_settings');
        if (storedSettings) {
            const loaded = JSON.parse(storedSettings);
            // Merge loaded settings with factory defaults to ensure all keys are present
            for (const key in FACTORY_DEFAULT_AUDIO_SETTINGS) {
                if (loaded[key]) {
                    state.audioSettings[key] = { ...FACTORY_DEFAULT_AUDIO_SETTINGS[key], ...loaded[key] };
                } else {
                    state.audioSettings[key] = FACTORY_DEFAULT_AUDIO_SETTINGS[key];
                }
            }
        } else {
            state.audioSettings = JSON.parse(JSON.stringify(FACTORY_DEFAULT_AUDIO_SETTINGS));
        }
    } catch (e) {
        console.error("Error loading audio settings from localStorage, using factory defaults.", e);
        state.audioSettings = JSON.parse(JSON.stringify(FACTORY_DEFAULT_AUDIO_SETTINGS));
    }
}

export function saveSettings() {
    try {
        const settingsToSave = {};
        for (const key in state.audioSettings) {
            const { freq, vol, type } = state.audioSettings[key];
            settingsToSave[key] = { freq, vol, type };
        }
        localStorage.setItem('mrt7_audio_settings', JSON.stringify(settingsToSave));
    } catch (e) {
        console.error("Error saving audio settings to localStorage.", e);
    }
}

export function resetFactoryAudioSettings() {
    state.audioSettings = JSON.parse(JSON.stringify(FACTORY_DEFAULT_AUDIO_SETTINGS));
    localStorage.removeItem('mrt7_audio_settings');
    saveSettings();
}

export function updateAudioSetting(stateKey, setting, value) {
    state.audioSettings[stateKey][setting] = value;
    saveSettings();
}

// Tempo
export function setTempo(newTempo) {
    newTempo = Math.max(MIN_BPM, Math.min(MAX_BPM, newTempo));
    state.tempo = newTempo;
    return state.tempo;
}

export function adjustTempo(delta) {
    const newTempo = state.tempo + delta;
    return setTempo(newTempo);
}

// Pattern
export function clearPattern() {
    state.pattern.fill(0);
}

export function setDefaultPattern() {
    state.pattern = getDefaultPattern(state.currentMode);
}

export function setPatternStep(index) {
    let currentState = state.pattern[index];
    let nextState;
    
    if (currentState === 3) { nextState = 2; } 
    else if (currentState === 2) { nextState = 1; } 
    else if (currentState === 1) { nextState = 0; } 
    else { nextState = 3; } 

    state.pattern[index] = nextState;
    return nextState;
}

// Mode
export function setMode(newMode) {
    if (newMode === state.currentMode) return false;
    
    state.currentMode = newMode;
    state.GRID_SIZE = newMode;
    setDefaultPattern();
    return true;
}

// Bar Cycle
export function increasePlayBar() {
    if (state.barsToPlay < MAX_BARS_TO_CYCLE) {
        state.barsToPlay++;
        state.currentBarCycle = 0; // Reset cycle on change
    }
}
export function resetPlayBar() {
    state.barsToPlay = 1;
    state.currentBarCycle = 0;
}
export function increaseDropBar() {
    if (state.barsToDrop < MAX_BARS_TO_CYCLE) {
        state.barsToDrop++;
        state.currentBarCycle = 0; // Reset cycle on change
    }
}
export function resetDropBar() {
    state.barsToDrop = 0;
    state.currentBarCycle = 0;
}

// Count-In
export function cycleCountIn() {
    state.countInBars = (state.countInBars + 1) % 3; // Cycles 0, 1, 2
}

// Timer
export function startTimer() {
    if (state.timerInterval) return;
    state.sessionStartTime = Date.now();
    return state.sessionStartTime;
}
export function stopTimer() {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
    state.sessionStartTime = null;
}