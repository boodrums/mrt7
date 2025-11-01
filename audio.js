import { state } from './state.js';
import { FACTORY_DEFAULT_AUDIO_SETTINGS, VISUAL_LATENCY_MS, LOOKAHEAD_MS, SCHEDULE_AHEAD_TIME_SEC } from './config.js';

let audioContext;
let schedulerWorker;

/**
 * Initializes the AudioContext
 */
export function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

/**
 * Creates a simple oscillator sound.
 * @param {number} time - The time (in AudioContext time) to play the sound.
 * @param {object} settings - {freq, vol, type}
 */
function playSound(time, settings) {
    if (!audioContext) return;

    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioContext.destination);

    osc.type = settings.type;
    osc.frequency.setValueAtTime(settings.freq, time);
    
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(settings.vol, time + 0.001); // Quick attack
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05); // Quick decay
    
    osc.start(time);
    osc.stop(time + 0.05);
}

/**
 * Attempts to acquire a screen wake lock.
 */
export async function requestWakeLock() {
    if (!('wakeLock' in navigator) || state.wakeLock) return;
    try {
        state.wakeLock = await navigator.wakeLock.request('screen');
        state.wakeLock.addEventListener('release', () => {
            console.log('Wake Lock released by system.');
            state.wakeLock = null; // Important: reset global lock reference
        });
        console.log('Wake Lock acquired.');
    } catch (err) {
        console.error('Failed to acquire wake lock:', err);
    }
}

/**
 * Releases the screen wake lock.
 */
export function releaseWakeLock() {
    if (state.wakeLock) {
        state.wakeLock.release()
            .then(() => {
                state.wakeLock = null;
                console.log('Wake Lock released.');
            })
            .catch(err => {
                console.error('Failed to release wake lock:', err);
            });
    }
}


/**
 * The main scheduling function.
 * Called by the worker, it schedules notes in advance.
 */
function scheduleNote() {
    // Schedule all notes that fall within the lookahead window
    while (state.nextNoteTime < audioContext.currentTime + SCHEDULE_AHEAD_TIME_SEC) {
        const time = state.nextNoteTime;
        
        let previousStep = state.currentStep;

        if (state.isCountingIn) {
            // --- COUNT-IN PHASE ---
            let shouldClick = false;
            const stepsPerCountBar = state.currentMode;
            
            if (stepsPerCountBar === 16) {
                if (state.countInBars === 2) {
                    if (state.countInStep < 16) { // Bar 1
                        if (state.countInStep === 0 || state.countInStep === 8) { shouldClick = true; }
                    } else { // Bar 2
                        if (state.countInStep % 4 === 0) { shouldClick = true; }
                    }
                } else if (state.countInBars === 1) { // 1-Bar
                    if (state.countInStep % 4 === 0) { shouldClick = true; }
                }
            } else if (stepsPerCountBar === 12) {
                if (state.countInBars === 2) {
                    if (state.countInStep < 12) { // Bar 1
                        if (state.countInStep === 0 || state.countInStep === 6) { shouldClick = true; }
                    } else { // Bar 2
                        if (state.countInStep % 3 === 0) { shouldClick = true; }
                    }
                } else if (state.countInBars === 1) { // 1-Bar
                    if (state.countInStep % 3 === 0) { shouldClick = true; }
                }
            }

            if (shouldClick) {
                playSound(time, state.audioSettings.state3); 
                state.currentStepTime = time - (VISUAL_LATENCY_MS / 1000);
            }
            
            state.countInStep++;
            
            const totalSteps = state.GRID_SIZE * state.countInBars;
            if (state.countInStep === totalSteps) {
                state.isCountingIn = false;
                state.currentStep = 0; 
                state.currentBarCycle = 0; 
                
                // The UI layer is responsible for starting the timer
                // This is signalled by dispatching a custom event
                document.dispatchEvent(new Event('countin:finished'));
            }
            
        } else {
            // --- MAIN RHYTHM GRID MODE ---
            const totalCycleLength = state.barsToPlay + state.barsToDrop;
            const isBarDropped = totalCycleLength > 0 && state.currentBarCycle >= state.barsToPlay;
            const stepState = state.pattern[state.currentStep];

            const secondsPerBeat = 60.0 / state.tempo;
            const secondsPerStep = secondsPerBeat / (state.currentMode / 4); 
            const msPerStep = secondsPerStep * 1000;

            let actualCompensationMs = VISUAL_LATENCY_MS;
            if (msPerStep > 100) { 
                actualCompensationMs = Math.min(msPerStep / 10, 15);
            }

            state.currentStepTime = time - (actualCompensationMs / 1000);
            
            if (!isBarDropped) {
                if (stepState === 3) {
                    playSound(time, state.audioSettings.state3);
                } else if (stepState === 2) {
                    playSound(time, state.audioSettings.state2);
                } else if (stepState === 1) {
                    playSound(time, state.audioSettings.state1);
                }
            }
            
            previousStep = state.currentStep;
            state.currentStep = (state.currentStep + 1) % state.GRID_SIZE;
            if (previousStep === state.GRID_SIZE - 1) {
                state.currentBarCycle = (state.currentBarCycle + 1) % totalCycleLength;
            }
        }

        const secondsPerBeat = 60.0 / state.tempo;
        const secondsPerStep = secondsPerBeat / (state.currentMode / 4); 
        state.nextNoteTime += secondsPerStep; 
    }
}

/**
 * Handles 'tick' messages from the Web Worker.
 */
function handleWorkerTick() {
    if (state.isPlaying) {
        scheduleNote();
    }
}

/**
 * Starts the audio engine and the scheduling worker.
 */
export function startAudioEngine() {
    getAudioContext(); // Ensure context is created and resumed
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    if (!schedulerWorker) {
        schedulerWorker = new Worker("metronome_worker.js");
        schedulerWorker.onmessage = handleWorkerTick;
    }
    schedulerWorker.postMessage({ command: "start", interval: LOOKAHEAD_MS });

    state.isPlaying = true;
    
    // Reset all counters
    state.currentStep = 0; 
    state.currentBarCycle = 0; 
    state.isCountingIn = false;
    state.countInStep = 0;
    
    // Set up Count-In if enabled
    if (state.countInBars > 0) {
        state.isCountingIn = true;
    }
    
    // --- Initialization for Scheduling ---
    state.nextNoteTime = audioContext.currentTime + 0.05; // 50ms buffer
    
    // --- DEFINITIVE FIX FOR RACE CONDITION ---
    state.currentStepTime = audioContext.currentTime + 3600.0; 
    state.lastStep = -1; 
}

/**
 * Stops the audio engine and the scheduling worker.
 */
export function stopAudioEngine() {
    if (!state.isPlaying) return;

    state.isPlaying = false;
    
    if (schedulerWorker) {
        schedulerWorker.postMessage({ command: "stop" });
    }
    
    state.visualLoopRunning = false; 
}