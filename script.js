// Global variables for Firebase access (required by the environment)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null; 

// --- Metronome State and Constants ---

const WAVEFORMS = ['sine', 'square', 'sawtooth', 'triangle'];

// NEW: This is the definitive, unchangeable source for the factory sounds.
const FACTORY_DEFAULT_AUDIO_SETTINGS = {
    // UPDATED: Using CSS variables for clarity and consistency. 
    state3: { freq: 880, vol: 0.8, type: 'sine', color: 'var(--accent-3)', name: 'Primary (Teal-500)', squareClass: 'square-accent-3' }, 
    state2: { freq: 440, vol: 0.4, type: 'triangle', color: 'var(--accent-2)', name: 'Secondary (Lime-500)', squareClass: 'square-accent-2' }, 
    state1: { freq: 220, vol: 0.2, type: 'square', color: 'var(--accent-1)', name: 'Tertiary (Amber-400)', squareClass: 'square-accent-1' }
};

// audioSettings starts with a deep copy of the factory defaults.
let audioSettings = JSON.parse(JSON.stringify(FACTORY_DEFAULT_AUDIO_SETTINGS)); 

let currentMode = 16; // Default to 16-step mode
let GRID_SIZE = 16;

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

let pattern = getDefaultPattern(currentMode); // Active pattern

let isPlaying = false;
let currentStep = 0; // Current step of the main pattern (0 to GRID_SIZE - 1)
let tempo = 120; // BPM
const MIN_BPM = 30;
const MAX_BPM = 300;

// Silent Bar State Variables
let barsToPlay = 1; // N bars of rhythm
let barsToDrop = 0; // N bars of silence
let currentBarCycle = 0; // Current bar in the cycle (0 to barsToPlay + barsToDrop - 1)

// Count-In State Variables
let countInBars = 0; // 0, 1, or 2
let isCountingIn = false;
let countInStep = 0; // Tracks 16th/12th notes during count-in

// NEW: Tap Tempo State Variables
let tapTempoTimes = [];
const MAX_TAP_TIMES = 4; // Use the last 4 taps for calculation

// NEW: Timer State Variables
let sessionStartTime = null;
let timerInterval = null;

// Wakelock Variable
let wakeLock = null; 

// Element references
const tempoDisplayValue = document.getElementById('bpm-display-value');
const bpmDisplayWrapper = document.getElementById('bpm-display-wrapper');
const bpmManualInput = document.getElementById('bpm-manual-input');
const startStopBtn = document.getElementById('start-stop-btn');
const rhythmGrid = document.getElementById('rhythm-grid');
const statusMessage = document.getElementById('status-message');
const tempoControls = document.getElementById('tempo-controls');
const clearBtn = document.getElementById('clear-btn');
const defaultBtn = document.getElementById('default-btn');

// New Bar Control Elements
const playBarIncreaseBtn = document.getElementById('play-bar-increase-btn');
const playBarResetBtn = document.getElementById('play-bar-reset-btn');
const playBarDisplay = document.getElementById('play-bar-display');
const dropBarIncreaseBtn = document.getElementById('drop-bar-increase-btn');
const dropBarResetBtn = document.getElementById('drop-bar-reset-btn');
const dropBarDisplay = document.getElementById('drop-bar-display');
const cycleSummaryPlay = document.getElementById('cycle-summary-play');
const cycleSummaryDrop = document.getElementById('cycle-summary-drop');

const countInBtn = document.getElementById('count-in-btn');
const mode16Btn = document.getElementById('mode-16-btn');
const mode12Btn = document.getElementById('mode-12-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const settingsControls = document.getElementById('settings-controls');
const factoryResetBtn = document.getElementById('factory-reset-btn');

// Info Modal elements
const infoBtn = document.getElementById('info-btn');
const infoModal = document.getElementById('info-modal');
const closeInfoModalBtn = document.getElementById('close-info-modal-btn');

// NEW: Tap Tempo Element
const tapTempoBtn = document.getElementById('tap-tempo-btn');

// NEW: Timer Element
const timerElement = document.getElementById('session-timer');


const MAX_BARS_TO_CYCLE = 8; // Max bars for either play or silent

let audioContext;
let nextNoteTime = 0.0;
const lookahead = 25.0; // In milliseconds
const scheduleAheadTime = 0.1; // In seconds
let timerWorker = null;

// --- Settings Management (Local Storage) ---

function loadSettings() {
    try {
        const storedSettings = localStorage.getItem('mrt7_audio_settings');
        if (storedSettings) {
            const loaded = JSON.parse(storedSettings);
            // Merge loaded settings with factory defaults to ensure all keys are present
            for (const key in FACTORY_DEFAULT_AUDIO_SETTINGS) {
                if (loaded[key]) {
                    // Load user-saved settings
                    audioSettings[key] = { ...FACTORY_DEFAULT_AUDIO_SETTINGS[key], ...loaded[key] };
                } else {
                    // Use factory default if key is missing from loaded data
                    audioSettings[key] = FACTORY_DEFAULT_AUDIO_SETTINGS[key];
                }
            }
        } else {
            // Use factory defaults if nothing is in local storage
            audioSettings = JSON.parse(JSON.stringify(FACTORY_DEFAULT_AUDIO_SETTINGS));
        }
    } catch (e) {
        console.error("Error loading audio settings from localStorage, using factory defaults.", e);
        audioSettings = JSON.parse(JSON.stringify(FACTORY_DEFAULT_AUDIO_SETTINGS));
    }
}

function saveSettings() {
    try {
        // Strip temporary UI properties before saving
        const settingsToSave = {};
        for (const key in audioSettings) {
            const { freq, vol, type } = audioSettings[key];
            settingsToSave[key] = { freq, vol, type };
        }
        localStorage.setItem('mrt7_audio_settings', JSON.stringify(settingsToSave));
    } catch (e) {
        console.error("Error saving audio settings to localStorage.", e);
    }
}

// Factory Reset Function
function factoryResetSettings() {
    // 1. Reset audioSettings to a fresh deep copy of the FACTORY_DEFAULT
    audioSettings = JSON.parse(JSON.stringify(FACTORY_DEFAULT_AUDIO_SETTINGS));
    
    // 2. Clear the key from localStorage
    localStorage.removeItem('mrt7_audio_settings');
    
    // 3. Re-render the modal to show the default values in the UI
    renderSettingsModal();
    
    statusMessage.textContent = "Audio settings reset to factory defaults (Sine 880Hz, Triangle 440Hz, Square 220Hz).";
}


// --- Audio Generation Functions ---

/**
 * Creates a simple sine wave oscillator sound using dynamic settings.
 * @param {number} time - The time (in AudioContext time) to play the sound.
 * @param {object} settings - {freq, vol, type}
 */
function playSound(time, settings) {
    if (!audioContext) return;

    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Set up oscillator and gain based on custom settings
    osc.type = settings.type;
    osc.frequency.setValueAtTime(settings.freq, time);
    
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(settings.vol, time + 0.001); // Quick attack
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05); // Quick decay
    
    osc.start(time);
    osc.stop(time + 0.05);
}

// --- Screen Wake Lock Functions (for mobile apps) ---

/**
 * Attempts to acquire a screen wake lock to prevent the display from turning off.
 */
async function requestWakeLock() {
    if (!('wakeLock' in navigator) || wakeLock) return;

    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
            console.log('Wake Lock released by system.');
            wakeLock = null; // Important: reset global lock reference
        });
        console.log('Wake Lock acquired.');
    } catch (err) {
        console.error('Failed to acquire wake lock:', err);
        statusMessage.textContent = `Error: Screen sleep may occur.`;
    }
}

/**
 * Releases the screen wake lock.
 */
function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release()
            .then(() => {
                wakeLock = null;
                console.log('Wake Lock released.');
            })
            .catch(err => {
                console.error('Failed to release wake lock:', err);
            });
    }
}

// --- Session Timer Logic ---

function updateTimerDisplay() {
    if (!sessionStartTime || !timerElement) return;

    const elapsedMs = Date.now() - sessionStartTime;
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = String(Math.floor(totalSeconds / 60) % 60).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');

    timerElement.textContent = `${minutes}:${seconds}`;
}

function startTimer() {
    if (timerInterval) return; // Prevent multiple timers

    sessionStartTime = Date.now();
    updateTimerDisplay(); // Set initial time (00:00)

    // Update every second
    timerInterval = setInterval(updateTimerDisplay, 1000); 
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    sessionStartTime = null;
    if (timerElement) {
        timerElement.textContent = '00:00';
    }
}

// --- Scheduling and Metronome Engine ---

function scheduleNote() {
    // Schedule all notes that fall within the lookahead window
    while (nextNoteTime < audioContext.currentTime + scheduleAheadTime) {
        const time = nextNoteTime;
        
        let previousStep = currentStep;

        if (isCountingIn) {
            // --- COUNT-IN PHASE ---
            
            let shouldClick = false;
            const stepsPerCountBar = currentMode;
            
            // Logic to determine which steps receive a click pulse
            if (stepsPerCountBar === 16) {
                if (countInBars === 2) {
                    if (countInStep < 16) { // Bar 1: Half notes (beats 1, 3)
                        if (countInStep === 0 || countInStep === 8) { shouldClick = true; }
                    } else { // Bar 2: Quarter notes (beats 1, 2, 3, 4)
                        if (countInStep % 4 === 0) { shouldClick = true; }
                    }
                } else if (countInBars === 1) { // 1-Bar: Quarter notes
                    if (countInStep % 4 === 0) { shouldClick = true; }
                }
            } else if (stepsPerCountBar === 12) {
                if (countInBars === 2) {
                    if (countInStep < 12) { // Bar 1: Half notes equiv. (beats 1, 3)
                        if (countInStep === 0 || countInStep === 6) { shouldClick = true; }
                    } else { // Bar 2: Quarter notes equiv. (4 clicks)
                        if (countInStep % 3 === 0) { shouldClick = true; }
                    }
                } else if (countInBars === 1) { // 1-Bar: Quarter notes equiv.
                    if (countInStep % 3 === 0) { shouldClick = true; }
                }
            }

            if (shouldClick) {
                // Use the primary sound settings for a consistent, strong count-in pulse
                playSound(time, audioSettings.state3); 
            }
            
            // Advance count-in step
            countInStep++;
            
            // Check if count-in is complete
            const totalSteps = GRID_SIZE * countInBars;
            if (countInStep === totalSteps) {
                isCountingIn = false;
                currentStep = 0; // Start the main pattern from step 0
                currentBarCycle = 0; // Reset bar drop counter
                
                startTimer(); // FIX: Start the timer exactly when the pattern begins!

                statusMessage.textContent = `Pattern START. Metronome running at ${tempo} BPM.`;
            }
            
        } else {
            // --- MAIN RHYTHM GRID MODE ---
            const totalCycleLength = barsToPlay + barsToDrop;
            // The rhythm is dropped (silent) if the current bar in the cycle is >= barsToPlay
            const isBarDropped = totalCycleLength > 0 && currentBarCycle >= barsToPlay;
            const stepState = pattern[currentStep];

            if (!isBarDropped) { // This is the "Play" phase
                // Play sound based on pattern state
                if (stepState === 3) {
                    playSound(time, audioSettings.state3);
                } else if (stepState === 2) {
                    playSound(time, audioSettings.state2);
                } else if (stepState === 1) {
                    playSound(time, audioSettings.state1);
                }
                
                // Normal visuals
                setTimeout(() => updateVisuals(currentStep), (time - audioContext.currentTime) * 1000);

            } else { // This is the "Silent" (Dropped) phase
                // Silent visuals (no sound)
                setTimeout(() => updateSilentVisuals(currentStep), (time - audioContext.currentTime) * 1000);
            }
            
            // Advance main pattern step and check for bar end
            previousStep = currentStep;
            currentStep = (currentStep + 1) % GRID_SIZE;
            if (previousStep === GRID_SIZE - 1) {
                // Bar ended, advance silent/play bar counter
                currentBarCycle = (currentBarCycle + 1) % totalCycleLength;
            }
        }

        // Advance time for next note (always by the subdivision time)
        const secondsPerBeat = 60.0 / tempo;
        // 16-step mode divides beat by 4 (16ths). 12-step mode divides beat by 3 (triplets/12ths).
        const secondsPerStep = secondsPerBeat / (currentMode / 4); 

        nextNoteTime += secondsPerStep; 
    }
}

/**
 * The main loop that runs on an interval to check if notes need scheduling.
 */
function schedulerLoop() {
     if (isPlaying) {
        scheduleNote();
    }
}

// --- Tempo/Pattern/Drop Functions ---

function updateBpmDisplay() {
    tempoDisplayValue.textContent = `${tempo} BPM`;
    bpmManualInput.value = tempo; 
}

function adjustTempo(delta) {
    let newTempo = tempo + delta;
    newTempo = Math.max(MIN_BPM, Math.min(MAX_BPM, newTempo));
    
    if (newTempo !== tempo) {
        tempo = newTempo;
        updateBpmDisplay();
        
        if (isPlaying && !isCountingIn) {
            statusMessage.textContent = `Tempo adjusted to ${tempo} BPM.`;
        }
    }
}

// NEW: Tap Tempo Logic
function calculateTapTempo() {
    // Requires at least two taps (one interval)
    if (tapTempoTimes.length < 2) return;

    let totalInterval = 0;
    for (let i = 1; i < tapTempoTimes.length; i++) {
        // Calculate interval in milliseconds
        totalInterval += tapTempoTimes[i] - tapTempoTimes[i - 1];
    }
    
    const averageIntervalMs = totalInterval / (tapTempoTimes.length - 1);
    
    // Convert ms interval to BPM: (60 seconds/minute * 1000 ms/second) / averageIntervalMs
    let newTempo = Math.round(60000 / averageIntervalMs);
    
    // Clamp the new tempo to the allowed range (30-300)
    newTempo = Math.max(MIN_BPM, Math.min(MAX_BPM, newTempo));
    
    if (newTempo !== tempo) {
        tempo = newTempo;
        updateBpmDisplay();
        statusMessage.textContent = `Tap Tempo set to ${tempo} BPM.`;
    }
}

function handleTapTempo() {
    const now = Date.now();
    
    // Check if the time since the last tap is too long (e.g., > 2 seconds)
    // If it is, reset the sequence.
    if (tapTempoTimes.length > 0 && (now - tapTempoTimes[tapTempoTimes.length - 1] > 2000)) {
        tapTempoTimes = [];
        statusMessage.textContent = "Tap Tempo sequence reset.";
    }
    
    tapTempoTimes.push(now);
    
    // Only keep the last MAX_TAP_TIMES timestamps
    if (tapTempoTimes.length > MAX_TAP_TIMES) {
        tapTempoTimes.shift(); // Remove the oldest tap
    }

    // Calculate tempo when we have enough data (at least two taps)
    if (tapTempoTimes.length >= 2) {
        calculateTapTempo();
    } else {
        statusMessage.textContent = `Tap ${tapTempoTimes.length}. Tap ${2 - tapTempoTimes.length} more time(s) to set tempo.`;
    }
}


function handleManualInputDisplay() {
    // Clear tap history when switching to manual input
    tapTempoTimes = [];
    
    if (!isPlaying) {
        bpmDisplayWrapper.classList.add('hidden');
        bpmManualInput.classList.remove('hidden');
        bpmManualInput.focus();
        // MODIFIED: Select all text to allow for clean, immediate overwrite
        bpmManualInput.select();
    }
}

function processManualInput() {
    let newTempo = parseInt(bpmManualInput.value);
    
    if (isNaN(newTempo)) { newTempo = tempo; }
    newTempo = Math.max(MIN_BPM, Math.min(MAX_BPM, newTempo));
    
    if (newTempo !== tempo) {
        tempo = newTempo;
        updateBpmDisplay();
        if (isPlaying && !isCountingIn) {
            statusMessage.textContent = `Tempo adjusted manually to ${tempo} BPM.`;
        }
    } else {
        updateBpmDisplay();
    }

    bpmManualInput.classList.add('hidden');
    bpmDisplayWrapper.classList.remove('hidden');
}

function clearPattern() {
    pattern.fill(0);
    updateGridVisuals();
    statusMessage.textContent = "Pattern cleared (all pads set to Off).";
}

function defaultPattern() {
    pattern = getDefaultPattern(currentMode);
    updateGridVisuals();
    statusMessage.textContent = `Pattern reset to Default ${currentMode}-step.`;
}

function updateCycleDisplay() {
    playBarDisplay.textContent = `${barsToPlay} BAR${barsToPlay !== 1 ? 'S' : ''}`;
    dropBarDisplay.textContent = `${barsToDrop} SILENT`;
    cycleSummaryPlay.textContent = barsToPlay;
    cycleSummaryDrop.textContent = barsToDrop;
    
    // Status message update based on the cycle
    if (barsToDrop > 0) {
        statusMessage.textContent = `Rhythm Cycle set: Play ${barsToPlay} bar${barsToPlay > 1 ? 's' : ''}, then silence for ${barsToDrop} bar${barsToDrop > 1 ? 's' : ''}.`;
    } else if (isPlaying && !isCountingIn) {
         statusMessage.textContent = `Metronome running at ${tempo} BPM.`;
    } else if (!isPlaying) {
         statusMessage.textContent = "Ready. Set your pattern and press START.";
    }
}

function increasePlayBar() {
    if (barsToPlay < MAX_BARS_TO_CYCLE) {
        barsToPlay++;
        currentBarCycle = 0; // Reset cycle on change
        updateCycleDisplay();
    }
}

function resetPlayBar() {
    barsToPlay = 1; // Default is 1 bar played
    currentBarCycle = 0;
    updateCycleDisplay();
}

function increaseDropBar() {
    if (barsToDrop < MAX_BARS_TO_CYCLE) {
        barsToDrop++;
        currentBarCycle = 0; // Reset cycle on change
        updateCycleDisplay();
    }
}

function resetDropBar() {
    barsToDrop = 0; // Default is 0 bars dropped
    currentBarCycle = 0;
    updateCycleDisplay();
}

function cycleCountIn() {
    countInBars = (countInBars + 1) % 3; // Cycles 0, 1, 2
    
    // 1. Update Text Content (Count: X)
    countInBtn.textContent = `Count: ${countInBars}`; 
    
    // 2. Update Visual Style based on state
    if (countInBars > 0) {
        // Apply the accent style for Count: 1 or Count: 2
        countInBtn.classList.add('count-in-active');
    } else {
        // Remove the accent style for Count: 0 (reverts to dark grey CSS)
        countInBtn.classList.remove('count-in-active');
    }
    
    statusMessage.textContent = `Count-In set to ${countInBars} bar${countInBars !== 1 ? 's' : ''}.`;
    
    if (isPlaying) { stopMetronome(); }
}

function updateModeButtons() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
        const mode = parseInt(btn.dataset.mode);
        
        // Remove old style classes from the script (Tailwind)
        btn.classList.remove('bg-cyan-600', 'bg-gray-200', 'text-white', 'text-gray-700', 'hover:bg-cyan-500', 'hover:bg-gray-300');
        
        // Use custom CSS classes for styling
        if (mode === currentMode) {
            btn.classList.add('mode-btn-active');
            btn.classList.remove('mode-btn-inactive');
        } else {
            btn.classList.add('mode-btn-inactive');
            btn.classList.remove('mode-btn-active');
        }
    });
}

function updateMode(newMode) {
    newMode = parseInt(newMode);
    if (newMode === currentMode) return;
    
    if (isPlaying) { stopMetronome(); }
    
    currentMode = newMode;
    GRID_SIZE = newMode;
    pattern = getDefaultPattern(currentMode);
    
    createGrid(); // Re-render the grid
    updateModeButtons();
    statusMessage.textContent = `Mode set to ${currentMode}-Step Pattern. Ready to play.`;
}


// --- Visuals and UI Handlers ---

function createGrid() {
    rhythmGrid.innerHTML = '';
    
    // 1. Set grid columns based on mode
    rhythmGrid.classList.remove('grid-cols-4', 'grid-cols-3');
    if (currentMode === 16) {
        rhythmGrid.classList.add('grid-cols-4');
    } else if (currentMode === 12) {
        rhythmGrid.classList.add('grid-cols-3'); 
    }
    
    // 2. Create squares up to the new GRID_SIZE
    for (let i = 0; i < GRID_SIZE; i++) {
        const square = document.createElement('div');
        square.id = `step-${i}`;
        square.classList.add('grid-square', 'rounded-lg');
        square.dataset.index = i;
        
        updateSquareColor(square, pattern[i]);

        square.addEventListener('click', () => {
            let currentState = pattern[i];
            let nextState;
            
            if (currentState === 3) { nextState = 2; } 
            else if (currentState === 2) { nextState = 1; } 
            else if (currentState === 1) { nextState = 0; } 
            else { nextState = 3; } 

            pattern[i] = nextState;
            updateSquareColor(square, pattern[i]);
        });

        rhythmGrid.appendChild(square);
    }
}

function updateSquareColor(squareElement, state) {
    squareElement.classList.remove('square-accent-0', 'square-accent-1', 'square-accent-2', 'square-accent-3');
    squareElement.classList.add(`square-accent-${state}`);
}

function updateGridVisuals() {
    for (let i = 0; i < GRID_SIZE; i++) {
        const square = document.getElementById(`step-${i}`);
        if (square) {
            updateSquareColor(square, pattern[i]);
        }
    }
}

function updateVisuals(step) {
    // Normal playing visuals
    document.querySelectorAll('.is-playing, .is-silent-playing').forEach(el => el.classList.remove('is-playing', 'is-silent-playing'));
    
    const currentSquare = document.getElementById(`step-${step}`);
    if (currentSquare) {
        currentSquare.classList.add('is-playing');
    }
}

function updateSilentVisuals(step) {
    // Silent bar visuals
    document.querySelectorAll('.is-playing, .is-silent-playing').forEach(el => el.classList.remove('is-playing', 'is-silent-playing'));
    
    const currentSquare = document.getElementById(`step-${step}`);
    if (currentSquare) {
        currentSquare.classList.add('is-silent-playing');
    }
}

function resetVisuals() {
    document.querySelectorAll('.is-playing, .is-silent-playing').forEach(el => el.classList.remove('is-playing', 'is-silent-playing'));
    currentStep = 0;
    currentBarCycle = 0;
    isCountingIn = false;
    countInStep = 0;
}

// --- Settings Modal Logic ---

function createSettingControl(stateKey, settings) {
    const { name, color, freq, vol, type, squareClass } = settings;
    
    // Generate options for the waveform selector
    const waveformOptions = WAVEFORMS.map(w => 
        `<option value="${w}" ${w === type ? 'selected' : ''}>${w.charAt(0).toUpperCase() + w.slice(1)}</option>`
    ).join('');

    return `
        <div class="p-4 rounded-lg bg-gray-100 border-l-4" style="border-left-color: ${color};">
            <h3 class="text-lg font-semibold text-white mb-3">
                ${name} 
                <span class="text-sm font-normal text-white ml-2">(Grid: 
                    <span class="inline-block w-3 h-3 rounded-full align-middle ${squareClass}" style="border: 1px solid #555;"></span>
                )</span>
            </h3>

            <div class="mb-4">
                <label for="${stateKey}-freq" class="block text-sm font-medium text-gray-300">Pitch (Frequency): <span id="${stateKey}-freq-val">${freq} Hz</span></label>
                <input type="range" id="${stateKey}-freq" data-setting="freq" data-key="${stateKey}" 
                       min="50" max="1500" step="10" value="${freq}" 
                       class="w-full h-2 rounded-lg appearance-none cursor-pointer mt-1">
            </div>

            <div class="mb-4">
                <label for="${stateKey}-vol" class="block text-sm font-medium text-gray-300">Volume: <span id="${stateKey}-vol-val">${(vol * 100).toFixed(0)}%</span></label>
                <input type="range" id="${stateKey}-vol" data-setting="vol" data-key="${stateKey}" 
                       min="0.01" max="1.0" step="0.01" value="${vol}" 
                       class="w-full h-2 rounded-lg appearance-none cursor-pointer mt-1">
            </div>

            <div>
                <label for="${stateKey}-type" class="block text-sm font-medium text-gray-300">Timbre (Waveform):</label>
                <select id="${stateKey}-type" data-setting="type" data-key="${stateKey}"
                        class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm rounded-md bg-white text-gray-800">
                    ${waveformOptions}
                </select>
            </div>
        </div>
    `;
}

function renderSettingsModal() {
    settingsControls.innerHTML = '';
    
    const stateKeys = ['state3', 'state2', 'state1'];
    
    stateKeys.forEach(key => {
        // Use the current audioSettings for rendering
        settingsControls.innerHTML += createSettingControl(key, audioSettings[key]);
    });
    
    // Attach event listeners after rendering
    settingsControls.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', handleSettingChange);
    });
}

function handleSettingChange(event) {
    const input = event.target;
    const stateKey = input.dataset.key;
    const setting = input.dataset.setting;
    let value = input.value;
    
    // Convert to number where appropriate
    if (setting === 'freq') {
        value = parseInt(value, 10);
    } else if (setting === 'vol') {
        value = parseFloat(value);
    }
    
    // Update the global settings object
    audioSettings[stateKey][setting] = value;
    
    // Update the display label
    const valSpan = document.getElementById(`${stateKey}-${setting}-val`);
    if (valSpan) {
        if (setting === 'vol') {
            valSpan.textContent = `${(value * 100).toFixed(0)}%`;
        } else if (setting === 'freq') {
            valSpan.textContent = `${value} Hz`;
        }
    }
    
    saveSettings();
}

function showSettingsModal() {
    renderSettingsModal();
    settingsModal.classList.remove('hidden');
}

function hideSettingsModal() {
    settingsModal.classList.add('hidden');
}

function showInfoModal() {
    infoModal.classList.remove('hidden');
}

function hideInfoModal() {
    infoModal.classList.add('hidden');
}


// --- Main Control Logic ---

function startMetronome() {
    if (isPlaying) return;

    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    isPlaying = true;
    startStopBtn.textContent = 'STOP'; 
    // Change from Cyan START to Green STOP
    startStopBtn.classList.remove('bg-cyan-600', 'hover:bg-cyan-500', 'active:bg-cyan-700', 'focus:ring-cyan-500');
    startStopBtn.classList.add('bg-green-600', 'hover:bg-green-500', 'active:bg-green-700', 'focus:ring-green-500');

    // --- ACQUIRE WAKE LOCK ---
    requestWakeLock();

    // --- Initialization for Scheduling ---
    // nextNoteTime = audioContext.currentTime; // OLD: Caused choked sound
    nextNoteTime = audioContext.currentTime + 0.05; // FIX: Add 50ms buffer for stable sound start
    
    // Reset all counters
    currentStep = 0; 
    currentBarCycle = 0; 
    isCountingIn = false;
    countInStep = 0;
    
    // Clear tap history if starting
    tapTempoTimes = [];

    
    // Set up Count-In if enabled
    if (countInBars > 0) {
        isCountingIn = true;
        statusMessage.textContent = `Starting with ${countInBars} count-in bar${countInBars > 1 ? 's' : ''}...`;
    } else {
        // FIX: Start the timer immediately if no count-in is used
        startTimer(); 
        statusMessage.textContent = `Metronome running at ${tempo} BPM.`;
    }
    
    updateCycleDisplay(); 
    
    timerWorker = setInterval(schedulerLoop, lookahead);
}

function stopMetronome() {
    if (!isPlaying) return;

    isPlaying = false;
    startStopBtn.textContent = 'START'; 
    // Change from Green STOP back to Cyan START
    startStopBtn.classList.remove('bg-green-600', 'hover:bg-green-500', 'active:bg-green-700', 'focus:ring-green-500');
    startStopBtn.classList.add('bg-cyan-600', 'hover:bg-cyan-500', 'active:bg-cyan-700', 'focus:ring-cyan-500');

    // --- RELEASE WAKE LOCK & STOP TIMER ---
    releaseWakeLock();
    stopTimer(); // Stop and reset the session timer

    if (timerWorker) {
        clearInterval(timerWorker);
        timerWorker = null;
    }
    
    resetVisuals();
    statusMessage.textContent = "Metronome stopped.";
}

// --- Event Listeners and Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Load settings first (will use local storage or factory defaults)
    loadSettings();
    
    // Setup Metronome controls
    startStopBtn.addEventListener('click', () => {
        if (isPlaying) { stopMetronome(); } else { startMetronome(); }
    });
    countInBtn.addEventListener('click', cycleCountIn);
    mode16Btn.addEventListener('click', () => updateMode(16));
    mode12Btn.addEventListener('click', () => updateMode(12));
    if (clearBtn) clearBtn.addEventListener('click', clearPattern);
    if (defaultBtn) defaultBtn.addEventListener('click', defaultPattern);
    
    // BAR CONTROL LISTENERS
    if (playBarIncreaseBtn) playBarIncreaseBtn.addEventListener('click', increasePlayBar);
    if (playBarResetBtn) playBarResetBtn.addEventListener('click', resetPlayBar);
    if (dropBarIncreaseBtn) dropBarIncreaseBtn.addEventListener('click', increaseDropBar);
    if (dropBarResetBtn) dropBarResetBtn.addEventListener('click', resetDropBar);

    // NEW: Tap Tempo Listener
    if (tapTempoBtn) tapTempoBtn.addEventListener('click', handleTapTempo);

    // BPM input controls
    bpmDisplayWrapper.addEventListener('click', handleManualInputDisplay);
    bpmManualInput.addEventListener('blur', processManualInput);
    bpmManualInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { processManualInput(); }
    });

    tempoControls.addEventListener('click', (event) => {
        const button = event.target.closest('.tempo-btn');
        if (button) {
            const delta = parseInt(button.dataset.delta);
            adjustTempo(delta);
        }
    });
    
    // Settings Modal controls
    settingsBtn.addEventListener('click', showSettingsModal);
    closeModalBtn.addEventListener('click', hideSettingsModal);
    settingsModal.addEventListener('click', (event) => {
        // Close when clicking outside the modal content
        if (event.target === settingsModal) { hideSettingsModal(); }
    });
    
    // Factory Reset Listener
    if (factoryResetBtn) factoryResetBtn.addEventListener('click', factoryResetSettings); 
    
    // Info Modal controls
    infoBtn.addEventListener('click', showInfoModal);
    closeInfoModalBtn.addEventListener('click', hideInfoModal);
    infoModal.addEventListener('click', (event) => {
        // Close when clicking outside the modal content
        if (event.target === infoModal) { hideInfoModal(); }
    });

    // Global Spacebar and Arrow Key listeners
    document.addEventListener('keydown', (event) => {
        const isManualInputFocused = document.activeElement === bpmManualInput;
        const isSettingsOpen = !settingsModal.classList.contains('hidden');
        const isInfoOpen = !infoModal.classList.contains('hidden');


        if (event.code === 'Space' || event.key === ' ') {
            event.preventDefault();
            if (!isManualInputFocused && !isSettingsOpen && !isInfoOpen) {
                startStopBtn.click();
            }
        } else if (!isManualInputFocused && !isSettingsOpen && !isInfoOpen) {
            let delta = 0;
            if (event.code === 'ArrowRight') {
                delta = 1;
            } else if (event.code === 'ArrowLeft') {
                delta = -1;
            } else if (event.code === 'ArrowUp') {
                delta = 5;
            } else if (event.code === 'ArrowDown') {
                delta = -5;
            }

            if (delta !== 0) {
                event.preventDefault(); // Prevent default browser scrolling
                adjustTempo(delta);
            }
        }
    });

    // Listener to re-acquire wake lock if released when tab becomes visible again
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isPlaying) {
            requestWakeLock();
        }
    });

    // Initial setup calls
    updateModeButtons();
    createGrid();
    updateBpmDisplay(); 
    updateCycleDisplay(); 
    // Ensure the button displays 'Count: 0' on load and sets the correct class
    countInBtn.textContent = `Count: ${countInBars}`; 
    countInBtn.classList.remove('count-in-active'); // Ensure it starts in the dark grey state
    statusMessage.textContent = "Ready. Set your pattern and press START.";
});

// Minimal Firebase setup to satisfy environment requirements
if (firebaseConfig) {
    console.log("Firebase config available but not fully initialized for this local tool.");
}