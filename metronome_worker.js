let timerID = null;
let interval = 25; // Default lookahead in ms

self.onmessage = function(e) {
    if (e.data.command === "start") {
        interval = e.data.interval;
        if (timerID) clearInterval(timerID);
        // Start the fixed-interval timer to tell the main thread to schedule notes.
        timerID = setInterval(function() {
            self.postMessage("tick");
        }, interval);
    } else if (e.data.command === "stop") {
        if (timerID) {
            clearInterval(timerID);
            timerID = null;
        }
    }
};