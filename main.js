import { state, loadSettings } from './state.js';
import { init as initUI } from './ui.js';

// Global Firebase variables required by the environment
// These are now scoped to the module and not true globals
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null; 

if (firebaseConfig) {
    console.log("Firebase config available but not fully initialized for this local tool.");
}

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Load settings into the state
    loadSettings();
    
    // 2. Initialize the UI (which sets up all elements and listeners)
    initUI();
});