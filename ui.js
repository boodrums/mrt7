import { state, loadSettings, saveSettings, resetFactoryAudioSettings, updateAudioSetting, setTempo, adjustTempo, clearPattern, setDefaultPattern, setPatternStep, setMode, increasePlayBar, resetPlayBar, increaseDropBar, resetDropBar, cycleCountIn, startTimer, stopTimer } from './state.js';
import { WAVEFORMS, FACTORY_DEFAULT_AUDIO_SETTINGS, MAX_TAP_TIMES, MIN_BPM, MAX_BPM } from './config.js';
import { getAudioContext, startAudioEngine, stopAudioEngine, requestWakeLock, releaseWakeLock } from './audio.js';

// --- Element References ---
const elements = {};

/**
 * Finds all necessary DOM elements and stores them.
 */
function queryElements() {
    elements.tempoDisplayValue = document.getElementById('bpm-display-value');
    elements.bpmDisplayWrapper = document.getElementById('bpm-display-wrapper');
    elements.bpmManualInput = document.getElementById('bpm-manual-input');
    elements.startStopBtn = document.getElementById('start-stop-btn');
    elements.rhythmGrid = document.getElementById('rhythm-grid');
    elements.statusMessage = document.getElementById('status-message');
    elements.tempoControls = document.getElementById('tempo-controls');
    elements.clearBtn = document.getElementById('clear-btn');
    elements.defaultBtn = document.getElementById('default-btn');
    elements.playBarIncreaseBtn = document.getElementById('play-bar-increase-btn');
    elements.playBarResetBtn = document.getElementById('play-bar-reset-btn');
    elements.playBarDisplay = document.getElementById('play-bar-display');
    elements.dropBarIncreaseBtn = document.getElementById('drop-bar-increase-btn');
    elements.dropBarResetBtn = document.getElementById('drop-bar-reset-btn');
    elements.dropBarDisplay = document.getElementById('drop-bar-display');
    elements.cycleSummaryPlay = document.getElementById('cycle-summary-play');
    elements.cycleSummaryDrop = document.getElementById('cycle-summary-drop');
    elements.countInBtn = document.getElementById('count-in-btn');
    elements.mode16Btn = document.getElementById('mode-16-btn');
    elements.mode12Btn = document.getElementById('mode-12-btn');
    elements.settingsBtn = document.getElementById('settings-btn');
    elements.settingsModal = document.getElementById('settings-modal');
    elements.closeModalBtn = document.getElementById('close-modal-btn');
    elements.settingsControls = document.getElementById('settings-controls');
    elements.factoryResetBtn = document.getElementById('factory-reset-btn');
    elements.infoBtn = document.getElementById('info-btn');
    elements.infoModal = document.getElementById('info-modal');
    elements.closeInfoModalBtn = document.getElementById('close-info-modal-btn');
    elements.tapTempoBtn = document.getElementById('tap-tempo-btn');
    elements.timerElement = document.getElementById('session-timer');
}

// --- Visual Update Functions ---

function updateTimerDisplay() {
    if (!state.sessionStartTime || !elements.timerElement) return;
    const elapsedMs = Date.now() - state.sessionStartTime;
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = String(Math.floor(totalSeconds / 60) % 60).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    elements.timerElement.textContent = `${minutes}:${seconds}`;
}

function startUiTimer() {
    const startTime = startTimer();
    if (startTime) {
        updateTimerDisplay(); // Set initial time (00:00)
        state.timerInterval = setInterval(updateTimerDisplay, 1000); 
    }
}

function stopUiTimer() {
    stopTimer();
    if (elements.timerElement) {
        elements.timerElement.textContent = '00:00';
    }
}

function updateBpmDisplay() {
    elements.tempoDisplayValue.textContent = `${state.tempo} BPM`;
    elements.bpmManualInput.value = state.tempo; 
}

function updateCycleDisplay() {
    elements.playBarDisplay.textContent = `${state.barsToPlay} BAR${state.barsToPlay !== 1 ? 'S' : ''}`;
    elements.dropBarDisplay.textContent = `${state.barsToDrop} SILENT`;
    elements.cycleSummaryPlay.textContent = state.barsToPlay;
    elements.cycleSummaryDrop.textContent = state.barsToDrop;
    
    if (state.barsToDrop > 0) {
        elements.statusMessage.textContent = `Rhythm Cycle set: Play ${state.barsToPlay} bar${state.barsToPlay > 1 ? 's' : ''}, then silence for ${state.barsToDrop} bar${state.barsToDrop > 1 ? 's' : ''}.`;
    } else if (state.isPlaying && !state.isCountingIn) {
         elements.statusMessage.textContent = `Metronome running at ${state.tempo} BPM.`;
    } else if (!state.isPlaying) {
         elements.statusMessage.textContent = "Ready. Set your pattern and press START.";
    }
}

function updateSquareColor(squareElement, stateValue) {
    squareElement.classList.remove('square-accent-0', 'square-accent-1', 'square-accent-2', 'square-accent-3');
    squareElement.classList.add(`square-accent-${stateValue}`);
}

function updateGridVisuals() {
    for (let i = 0; i < state.GRID_SIZE; i++) {
        const square = document.getElementById(`step-${i}`);
        if (square) {
            updateSquareColor(square, state.pattern[i]);
        }
    }
}

function createGrid() {
    elements.rhythmGrid.innerHTML = '';
    
    elements.rhythmGrid.classList.remove('grid-cols-4', 'grid-cols-3');
    if (state.currentMode === 16) {
        elements.rhythmGrid.classList.add('grid-cols-4');
    } else if (state.currentMode === 12) {
        elements.rhythmGrid.classList.add('grid-cols-3'); 
    }
    
    for (let i = 0; i < state.GRID_SIZE; i++) {
        const square = document.createElement('div');
        square.id = `step-${i}`;
        square.classList.add('grid-square', 'rounded-lg');
        square.dataset.index = i;
        
        updateSquareColor(square, state.pattern[i]);

        square.addEventListener('click', () => {
            const nextState = setPatternStep(i);
            updateSquareColor(square, nextState);
        });

        elements.rhythmGrid.appendChild(square);
    }
}

function updateModeButtons() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
        const mode = parseInt(btn.dataset.mode);
        
        btn.classList.remove('bg-cyan-600', 'bg-gray-200', 'text-white', 'text-gray-700', 'hover:bg-cyan-500', 'hover:bg-gray-300');
        
        if (mode === state.currentMode) {
            btn.classList.add('mode-btn-active');
            btn.classList.remove('mode-btn-inactive');
        } else {
            btn.classList.add('mode-btn-inactive');
            btn.classList.remove('mode-btn-active');
        }
    });
}

function updateCountInButton() {
    elements.countInBtn.textContent = `Count: ${state.countInBars}`; 
    if (state.countInBars > 0) {
        elements.countInBtn.classList.add('count-in-active');
    } else {
        elements.countInBtn.classList.remove('count-in-active');
    }
    elements.statusMessage.textContent = `Count-In set to ${state.countInBars} bar${state.countInBars !== 1 ? 's' : ''}.`;
}

// --- High-Frequency Visuals (RAF Loop) ---

function updateVisuals(step) {
    if (!state.isPlaying) return; 
    if (state.currentVisualSquare) {
        state.currentVisualSquare.classList.remove('is-playing', 'is-silent-playing');
    }
    const newSquare = document.getElementById(`step-${step}`);
    if (newSquare) {
        newSquare.classList.add('is-playing');
        state.currentVisualSquare = newSquare;
    } else {
        state.currentVisualSquare = null;
    }
}

function updateSilentVisuals(step) {
    if (!state.isPlaying) return; 
    if (state.currentVisualSquare) {
        state.currentVisualSquare.classList.remove('is-playing', 'is-silent-playing');
    }
    const newSquare = document.getElementById(`step-${step}`);
    if (newSquare) {
        newSquare.classList.add('is-silent-playing');
        state.currentVisualSquare = newSquare;
    } else {
        state.currentVisualSquare = null;
    }
}

function resetVisuals() {
    if (state.currentVisualSquare) {
        state.currentVisualSquare.classList.remove('is-playing', 'is-silent-playing');
        state.currentVisualSquare = null;
    }
}

function visualUpdateLoop() {
    if (!state.visualLoopRunning) return; // Stop the loop if metronome is stopped

    const audioContext = getAudioContext();
    if (!audioContext) { // Exit if audio context isn't ready
         requestAnimationFrame(visualUpdateLoop);
         return;
    }
    
    const currentTime = audioContext.currentTime;
    
    if (currentTime >= state.currentStepTime) { 
        if (state.currentStep !== state.lastStep) { 
            const visualStep = (state.currentStep === 0) ? (state.GRID_SIZE - 1) : (state.currentStep - 1);
            const totalCycleLength = state.barsToPlay + state.barsToDrop;
            
            let barIndexForVisual = state.currentBarCycle;
            if (visualStep === state.GRID_SIZE - 1 && totalCycleLength > 0) {
                 barIndexForVisual = (state.currentBarCycle + totalCycleLength - 1) % totalCycleLength;
            }

            const isBarDropped = totalCycleLength > 0 && barIndexForVisual >= state.barsToPlay;

            if (!state.isCountingIn) {
                 if (!isBarDropped) {
                    updateVisuals(visualStep);
                 } else {
                    updateSilentVisuals(visualStep);
                 }
            } else {
                 resetVisuals();
            }
            state.lastStep = state.currentStep;
        }
    } else if (state.isCountingIn) {
         resetVisuals();
         state.lastStep = -1;
    }
    
    requestAnimationFrame(visualUpdateLoop);
}


// --- Modal UI Functions ---

function createSettingControl(stateKey, settings) {
    const { name, color, freq, vol, type, squareClass } = settings;
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
    elements.settingsControls.innerHTML = '';
    const stateKeys = ['state3', 'state2', 'state1'];
    
    stateKeys.forEach(key => {
        elements.settingsControls.innerHTML += createSettingControl(key, state.audioSettings[key]);
    });
    
    elements.settingsControls.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', handleSettingChange);
    });
}

function showSettingsModal() {
    renderSettingsModal();
    elements.settingsModal.classList.remove('hidden');
}
function hideSettingsModal() {
    elements.settingsModal.classList.add('hidden');
}
function showInfoModal() {
    elements.infoModal.classList.remove('hidden');
}
function hideInfoModal() {
    elements.infoModal.classList.add('hidden');
}


// --- Event Handlers ---

function handleTempoAdjust(delta) {
    const oldTempo = state.tempo;
    const newTempo = adjustTempo(delta);
    if (oldTempo !== newTempo) {
        updateBpmDisplay();
        if (state.isPlaying && !state.isCountingIn) {
            elements.statusMessage.textContent = `Tempo adjusted to ${state.tempo} BPM.`;
        }
    }
}

function calculateTapTempo() {
    if (state.tapTempoTimes.length < 2) return;
    let totalInterval = 0;
    for (let i = 1; i < state.tapTempoTimes.length; i++) {
        totalInterval += state.tapTempoTimes[i] - state.tapTempoTimes[i - 1];
    }
    const averageIntervalMs = totalInterval / (state.tapTempoTimes.length - 1);
    let newTempo = Math.round(60000 / averageIntervalMs);
    
    setTempo(newTempo);
    updateBpmDisplay();
    elements.statusMessage.textContent = `Tap Tempo set to ${state.tempo} BPM.`;
}

function handleTapTempo() {
    const now = Date.now();
    if (state.tapTempoTimes.length > 0 && (now - state.tapTempoTimes[state.tapTempoTimes.length - 1] > 2000)) {
        state.tapTempoTimes = [];
        elements.statusMessage.textContent = "Tap Tempo sequence reset.";
    }
    
    state.tapTempoTimes.push(now);
    
    if (state.tapTempoTimes.length > MAX_TAP_TIMES) {
        state.tapTempoTimes.shift();
    }
    if (state.tapTempoTimes.length >= 2) {
        calculateTapTempo();
    } else {
        elements.statusMessage.textContent = `Tap ${state.tapTempoTimes.length}. Tap ${2 - state.tapTempoTimes.length} more time(s) to set tempo.`;
    }
}

function handleManualInputDisplay() {
    state.tapTempoTimes = [];
    if (!state.isPlaying) {
        elements.bpmDisplayWrapper.classList.add('hidden');
        elements.bpmManualInput.classList.remove('hidden');
        elements.bpmManualInput.focus();
        elements.bpmManualInput.select();
    }
}

function processManualInput() {
    let newTempo = parseInt(elements.bpmManualInput.value);
    if (isNaN(newTempo)) { newTempo = state.tempo; }
    
    const oldTempo = state.tempo;
    const tempo = setTempo(newTempo);
    
    if (tempo !== oldTempo) {
        updateBpmDisplay();
        if (state.isPlaying && !state.isCountingIn) {
            elements.statusMessage.textContent = `Tempo adjusted manually to ${tempo} BPM.`;
        }
    } else {
        updateBpmDisplay();
    }

    elements.bpmManualInput.classList.add('hidden');
    elements.bpmDisplayWrapper.classList.remove('hidden');
}

function handleClearPattern() {
    clearPattern();
    updateGridVisuals();
    elements.statusMessage.textContent = "Pattern cleared (all pads set to Off).";
}

function handleDefaultPattern() {
    setDefaultPattern();
    updateGridVisuals();
    elements.statusMessage.textContent = `Pattern reset to Default ${state.currentMode}-step.`;
}

function handleModeUpdate(newMode) {
    if (state.isPlaying) { stopMetronome(); }
    const changed = setMode(newMode);
    if (changed) {
        createGrid();
        updateModeButtons();
        elements.statusMessage.textContent = `Mode set to ${state.currentMode}-Step Pattern. Ready to play.`;
    }
}

function handleSettingChange(event) {
    const input = event.target;
    const stateKey = input.dataset.key;
    const setting = input.dataset.setting;
    let value = input.value;
    
    if (setting === 'freq') value = parseInt(value, 10);
    else if (setting === 'vol') value = parseFloat(value);
    
    updateAudioSetting(stateKey, setting, value);
    
    const valSpan = document.getElementById(`${stateKey}-${setting}-val`);
    if (valSpan) {
        if (setting === 'vol') valSpan.textContent = `${(value * 100).toFixed(0)}%`;
        else if (setting === 'freq') valSpan.textContent = `${value} Hz`;
    }
}

function handleFactoryReset() {
    resetFactoryAudioSettings();
    renderSettingsModal();
    elements.statusMessage.textContent = "Audio settings reset to factory defaults.";
}

function handleCycleCountIn() {
    if (state.isPlaying) { stopMetronome(); }
    cycleCountIn();
    updateCountInButton();
}


// --- Main Control Functions ---

// --- FIX 3: ASYNC START/STOP ---
// Made startMetronome async to handle the await
async function startMetronome() {
    if (state.isPlaying) return;

    requestWakeLock();

    // Wait for the audio engine to successfully resume
    // and add error handling
    try {
        await startAudioEngine();
    } catch (err) {
        console.error("Failed to start audio engine:", err);
        elements.statusMessage.textContent = "Error: Could not start audio.";
        return; // Don't proceed if audio failed
    }
    // --- END FIX 3 ---
    
    elements.startStopBtn.textContent = 'STOP'; 
    elements.startStopBtn.classList.remove('is-stopped');
    elements.startStopBtn.classList.add('is-playing');

    state.tapTempoTimes = [];
    resetVisuals(); 
    
    if (state.isCountingIn) {
        elements.statusMessage.textContent = `Starting with ${state.countInBars} count-in bar${state.countInBars > 1 ? 's' : ''}...`;
    } else {
        startUiTimer(); 
        elements.statusMessage.textContent = `Metronome running at ${state.tempo} BPM.`;
    }
    
    updateCycleDisplay(); 
    
    if (!state.visualLoopRunning) {
        state.visualLoopRunning = true;
        requestAnimationFrame(visualUpdateLoop);
    }
}

function stopMetronome() {
    if (!state.isPlaying) return;

    releaseWakeLock();
    stopAudioEngine();
    stopUiTimer(); 
    
    elements.startStopBtn.textContent = 'START'; 
    elements.startStopBtn.classList.remove('is-playing');
    elements.startStopBtn.classList.add('is-stopped');
    
    resetVisuals();
    elements.statusMessage.textContent = "Metronome stopped.";
}


// --- Initialization ---

function addEventListeners() {
    // Main controls
    // The click handler automatically handles the async startMetronome
    elements.startStopBtn.addEventListener('click', () => {
        if (!elements.bpmManualInput.classList.contains('hidden')) {
            processManualInput();
        }
        if (state.isPlaying) { stopMetronome(); } else { startMetronome(); }
    });
    elements.countInBtn.addEventListener('click', handleCycleCountIn);
    elements.mode16Btn.addEventListener('click', () => handleModeUpdate(16));
    elements.mode12Btn.addEventListener('click', () => handleModeUpdate(12));
    elements.clearBtn.addEventListener('click', handleClearPattern);
    elements.defaultBtn.addEventListener('click', handleDefaultPattern);

    // Bar controls
    elements.playBarIncreaseBtn.addEventListener('click', () => { increasePlayBar(); updateCycleDisplay(); });
    elements.playBarResetBtn.addEventListener('click', () => { resetPlayBar(); updateCycleDisplay(); });
    elements.dropBarIncreaseBtn.addEventListener('click', () => { increaseDropBar(); updateCycleDisplay(); });
    elements.dropBarResetBtn.addEventListener('click', () => { resetDropBar(); updateCycleDisplay(); });

    // Tap tempo
    elements.tapTempoBtn.addEventListener('click', handleTapTempo);

    // BPM input
    elements.bpmDisplayWrapper.addEventListener('click', handleManualInputDisplay);
    elements.bpmManualInput.addEventListener('blur', processManualInput);
    elements.bpmManualInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') processManualInput(); });
    elements.tempoControls.addEventListener('click', (e) => {
        const button = e.target.closest('.tempo-btn');
        if (button) handleTempoAdjust(parseInt(button.dataset.delta));
    });
    
    // Modals
    elements.settingsBtn.addEventListener('click', showSettingsModal);
    elements.closeModalBtn.addEventListener('click', hideSettingsModal);
    elements.settingsModal.addEventListener('click', (e) => { if (e.target === elements.settingsModal) hideSettingsModal(); });
    elements.factoryResetBtn.addEventListener('click', handleFactoryReset); 
    
    elements.infoBtn.addEventListener('click', showInfoModal);
    elements.closeInfoModalBtn.addEventListener('click', hideInfoModal);
    elements.infoModal.addEventListener('click', (e) => { if (e.target === elements.infoModal) hideInfoModal(); });

    // Global keys
    document.addEventListener('keydown', (event) => {
        const isManualInputFocused = document.activeElement === elements.bpmManualInput;
        const isSettingsOpen = !elements.settingsModal.classList.contains('hidden');
        const isInfoOpen = !elements.infoModal.classList.contains('hidden');

        if (event.code === 'Space' || event.key === ' ') {
            event.preventDefault();
            if (!isManualInputFocused && !isSettingsOpen && !isInfoOpen) {
                elements.startStopBtn.click();
            }
        } else if (!isManualInputFocused && !isSettingsOpen && !isInfoOpen) {
            let delta = 0;
            if (event.code === 'ArrowRight') delta = 1;
            else if (event.code === 'ArrowLeft') delta = -1;
            else if (event.code === 'ArrowUp') delta = 5;
            else if (event.code === 'ArrowDown') delta = -5;

            if (delta !== 0) {
                event.preventDefault();
                handleTempoAdjust(delta);
            }
        }
    });

    // Re-acquire wake lock on visibility change
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && state.isPlaying) {
            requestWakeLock();
        }
    });

    // Custom event from audio engine to start timer after count-in
    document.addEventListener('countin:finished', () => {
        startUiTimer();
        elements.statusMessage.textContent = `Pattern START. Metronome running at ${state.tempo} BPM.`;
    });
}

/**
 * Initializes the entire UI layer.
 */
export function init() {
    queryElements();
    addEventListeners();
    
    // Initial UI state setup
    updateModeButtons();
    createGrid();
    updateBpmDisplay(); 
    updateCycleDisplay(); 
    elements.countInBtn.textContent = `Count: ${state.countInBars}`; 
    elements.countInBtn.classList.remove('count-in-active');
    elements.startStopBtn.classList.add('is-stopped'); // Set initial class
    elements.statusMessage.textContent = "Ready. Set your pattern and press START.";
}