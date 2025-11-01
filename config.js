// --- Metronome Constants ---

export const WAVEFORMS = ['sine', 'square', 'sawtooth', 'triangle'];

// The definitive, unchangeable source for the factory sounds.
export const FACTORY_DEFAULT_AUDIO_SETTINGS = {
    state3: { freq: 880, vol: 0.8, type: 'sine', color: 'var(--accent-3)', name: 'Primary (Teal-500)', squareClass: 'square-accent-3' }, 
    state2: { freq: 440, vol: 0.4, type: 'triangle', color: 'var(--accent-2)', name: 'Secondary (Lime-500)', squareClass: 'square-accent-2' }, 
    state1: { freq: 220, vol: 0.2, type: 'square', color: 'var(--accent-1)', name: 'Tertiary (Amber-400)', squareClass: 'square-accent-1' }
};

// --- Tempo and Timing Constants ---

export const MIN_BPM = 30;
export const MAX_BPM = 300;
export const MAX_TAP_TIMES = 4; // Use the last 4 taps for calculation
export const MAX_BARS_TO_CYCLE = 8; // Max bars for either play or silent

// Estimated base latency for visual/setTimeout compensation (milliseconds)
export const VISUAL_LATENCY_MS = 50; // Set base latency to the value that allows 300 BPM

// --- SCHEDULING CONSTANTS ---
export const LOOKAHEAD_MS = 25.0; // In milliseconds
export const SCHEDULE_AHEAD_TIME_SEC = 0.1; // In seconds