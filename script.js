import { sound } from "./sounds.js";

console.log("GesturePlay AI: Script Loaded");

let HandLandmarker, FilesetResolver;

// --- State Management ---
const state = {
    view: 'dashboard', 
    currentGame: null,
    isMuted: localStorage.getItem('gp_muted') === 'true',
    showSkeleton: false,
    highScores: JSON.parse(localStorage.getItem('gp_highscores')) || { flappy: 0, ninja: 0, racing: 0, strike: 0, boxing: 0 },
    stats: JSON.parse(localStorage.getItem('gp_stats')) || { totalScore: 0, gamesPlayed: 0 },
    webcamReady: false,
    handLandmarker: null,
    lastVideoTime: -1,
    results: null
};

// --- DOM Elements ---
const elements = {
    loader: document.getElementById('loader'),
    progressBar: document.getElementById('progress-bar'),
    loaderStatus: document.getElementById('loader-status'),
    dashboard: document.getElementById('dashboard'),
    gameScreen: document.getElementById('game-screen'),
    gameCanvas: document.getElementById('game-canvas'),
    video: document.getElementById('webcam-video'),
    meshCanvas: document.getElementById('hand-mesh-canvas'),
    statusDot: document.querySelector('.status-dot'),
    statusText: document.querySelector('.status-text'),
    gameTitle: document.getElementById('current-game-title'),
    gameScore: document.getElementById('game-score'),
    finalScore: document.getElementById('final-score'),
    gameOverOverlay: document.getElementById('game-over-overlay'),
    instructionOverlay: document.getElementById('instruction-overlay'),
    instructionsText: document.getElementById('game-instructions-text'),
    newHighScoreMsg: document.getElementById('new-high-score-msg'),
    quoteText: document.getElementById('game-quote')
};

async function init() {
    // Check for file protocol which blocks modules/CORS
    if (window.location.protocol === 'file:') {
        elements.loaderStatus.innerHTML = `
            <span style="color: #ff3e3e">PROTOCOL ERROR:</span><br>
            Browsers block AI modules on <code>file://</code> paths.<br><br>
            <span style="color: var(--primary)">SOLUTION:</span> Run via a local server.<br>
            (e.g., Live Server, <code>npx serve</code>, or Python server)
        `;
        return;
    }

    updateLoader(10, 'Syncing Neural Modules...');
    
    try {
        // Dynamic import to catch load errors
        const mp = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs");
        HandLandmarker = mp.HandLandmarker;
        FilesetResolver = mp.FilesetResolver;

        console.log("Loading FilesetResolver...");
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        
        console.log("Creating HandLandmarker...");
        state.handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 2
        });
        
        console.log("MediaPipe Ready.");
        updateLoader(40, 'Calibrating Optical Sensors...');
        
        // 2. Setup Webcam
        await setupWebcam();
        updateLoader(70, 'Syncing Data Streams...');
        
        // 3. Load Stats & UI
        loadDashboardData();
        fetchGamingQuote();
        sound.init();
        
        updateLoader(100, 'Neural Link Established.');
        
        // Hide loader after a short delay
        setTimeout(() => {
            elements.loader.style.opacity = '0';
            setTimeout(() => elements.loader.style.visibility = 'hidden', 500);
        }, 800);

        // Start Tracking Loop
        requestAnimationFrame(predictLoop);

    } catch (err) {
        console.error("Initialization failed:", err);
        elements.loaderStatus.innerHTML = `
            <span style="color: #ff3e3e">CONNECTION LOST:</span><br>
            Failed to load AI models or Webcam.<br>
            Check your internet and webcam permissions.
        `;
    }
}

async function setupWebcam() {
    const constraints = { video: { width: 640, height: 480 } };
    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        elements.video.srcObject = stream;
        elements.video.play();
        return new Promise((resolve) => {
            elements.video.onloadedmetadata = () => {
                state.webcamReady = true;
                elements.statusDot.classList.add('ready');
                elements.statusText.textContent = "Webcam Active";
                resolve();
            };
        });
    } catch (err) {
        state.webcamReady = false;
        elements.statusText.textContent = "Webcam Error";
        throw err;
    }
}

function updateLoader(percent, status) {
    elements.progressBar.style.width = `${percent}%`;
    elements.loaderStatus.textContent = status;
}

// --- Tracking Loop ---
async function predictLoop() {
    if (state.handLandmarker && state.webcamReady) {
        let startTimeMs = performance.now();
        // Ensure video is playing and has frames
        if (elements.video.readyState >= 2 && elements.video.currentTime !== state.lastVideoTime) {
            state.lastVideoTime = elements.video.currentTime;
            try {
                state.results = state.handLandmarker.detectForVideo(elements.video, startTimeMs);
                drawHandMesh(state.results);
            } catch (err) {
                console.error("Detection error:", err);
            }
        }
    }
    requestAnimationFrame(predictLoop);
}

function drawHandMesh(results) {
    const ctx = elements.meshCanvas.getContext('2d');
    ctx.clearRect(0, 0, elements.meshCanvas.width, elements.meshCanvas.height);
    
    // Also draw on the game canvas if skeleton is toggled
    const gameCtx = elements.gameCanvas.getContext('2d');

    if (results.landmarks) {
        results.landmarks.forEach((landmarks, index) => {
            const isRightHand = results.handedness[index][0].categoryName === 'Right';
            const color = isRightHand ? '#00f2ff' : '#bc13fe';

            // Draw on preview canvas
            drawSkeleton(ctx, landmarks, color, 2);

            // Draw on game canvas if enabled
            if (state.showSkeleton && state.view === 'game') {
                drawSkeleton(gameCtx, landmarks, color, 4);
            }
        });
    }
}

function drawSkeleton(ctx, landmarks, color, size) {
    // Connections for hand skeleton
    const connections = [
        [0, 1, 2, 3, 4], // Thumb
        [0, 5, 6, 7, 8], // Index
        [0, 9, 10, 11, 12], // Middle
        [0, 13, 14, 15, 16], // Ring
        [0, 17, 18, 19, 20], // Pinky
        [5, 9, 13, 17] // Palm base
    ];

    ctx.strokeStyle = color;
    ctx.lineWidth = size / 2;
    ctx.fillStyle = color;

    connections.forEach(path => {
        ctx.beginPath();
        for (let i = 0; i < path.length; i++) {
            const landmark = landmarks[path[i]];
            const x = landmark.x * ctx.canvas.width;
            const y = landmark.y * ctx.canvas.height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    });

    landmarks.forEach(landmark => {
        const x = landmark.x * ctx.canvas.width;
        const y = landmark.y * ctx.canvas.height;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, 2 * Math.PI);
        ctx.fill();
    });
}

// --- Dashboard Logic ---
function loadDashboardData() {
    document.getElementById('total-score-display').textContent = state.stats.totalScore;
    document.getElementById('games-played-display').textContent = state.stats.gamesPlayed;
    document.getElementById('high-flappy').textContent  = state.highScores.flappy;
    document.getElementById('high-ninja').textContent   = state.highScores.ninja;
    document.getElementById('high-racing').textContent  = state.highScores.racing;
    document.getElementById('high-strike').textContent  = state.highScores.strike  || 0;
    document.getElementById('high-boxing').textContent  = state.highScores.boxing  || 0;
}

async function fetchGamingQuote() {
    try {
        const quotes = [
            "The screen is just a window, your hand is the key.",
            "Precision is the difference between a high score and a game over.",
            "In the neon world, gestures are your only weapon.",
            "Neural link stabilized. Ready for input.",
            "Move like the wind, strike like the lightning."
        ];
        await new Promise(r => setTimeout(r, 500));
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        elements.quoteText.textContent = `"${randomQuote}"`;
    } catch (err) {
        console.log("Quote fetch failed", err);
    }
}

async function fetchLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '<p>Retrieving neural records...</p>';
    
    try {
        const response = await fetch('./assets/leaderboard.json');
        const data = await response.json();
        
        list.innerHTML = data.leaderboard.map(player => `
            <div class="leaderboard-item">
                <span class="rank">#${player.rank}</span>
                <span class="name">${player.name}</span>
                <span class="score">${player.score}</span>
            </div>
        `).join('');
    } catch (err) {
        list.innerHTML = '<p class="danger-text">Link to Central Hub failed.</p>';
        console.error(err);
    }
}

function validateAndSaveScore(gameKey, score) {
    if (score > state.highScores[gameKey]) {
        state.highScores[gameKey] = score;
        localStorage.setItem('gp_highscores', JSON.stringify(state.highScores));
        
        // Simple validation example for college project
        const playerName = prompt("NEW HIGH SCORE! Enter your handle (3-10 characters):");
        if (playerName && playerName.length >= 3 && playerName.length <= 10) {
            console.log(`Saving score for ${playerName}`);
            // In a real app, you'd fetch/POST here
        } else if (playerName) {
            alert("Invalid handle. Score saved locally only.");
        }
        return true;
    }
    return false;
}

// --- Game Navigation ---
const gameConfig = {
    flappy: {
        title: "Sky Glide",
        instructions: "Keep your hand palm-open. Move it UP to fly higher, DOWN to dive. Avoid the neon pillars!",
        module: './games/flappy.js'
    },
    ninja: {
        title: "Blade Master",
        instructions: "Your index finger is a laser blade. Swipe quickly through the fruits. Avoid the RED bombs!",
        module: './games/ninja.js'
    },
    racing: {
        title: "Neon Racer",
        instructions: "Hold your hand like a steering wheel or move it LEFT and RIGHT to dodge traffic.",
        module: './games/racing.js'
    },
    strike: {
        title: "Shadow Strike",
        instructions: "Punch the glowing nodes as they appear. Use BOTH hands for maximum combo!",
        module: './games/strike.js'
    },
    boxing: {
        title: "Boxing Arena",
        instructions: "Your webcam is the ring. Make a FIST with either hand and punch incoming pads. Move your head to DODGE body blows. Speed increases with score!",
        module: './games/boxing.js'
    },
    doodle: {
        title: "Air Canvas Pro",
        instructions: "Pinch index finger to DRAW. Open PALM to ERASE. FIST to STOP.",
        module: './games/doodle.js'
    }
};

async function switchView(viewName, gameKey = null) {
    state.view = viewName;
    
    if (viewName === 'game' && gameKey) {
        const config = gameConfig[gameKey];
        state.currentGameKey = gameKey; // Store current game key
        elements.gameTitle.textContent = config.title;
        elements.instructionsText.textContent = config.instructions;
        elements.dashboard.classList.remove('active');
        elements.gameScreen.classList.add('active');
        elements.instructionOverlay.classList.remove('hidden');
        elements.gameOverOverlay.classList.add('hidden');
        
        // Load Game Logic Dynamically
        try {
            const { GameInstance } = await import(config.module);
            if (state.currentGame) state.currentGame.destroy();
            state.currentGame = new GameInstance(elements.gameCanvas, state);
            
            // Handle Game Over
            state.currentGame.onGameOver = (score) => {
                const isNewHigh = validateAndSaveScore(state.currentGameKey, score);
                if (isNewHigh) {
                    elements.newHighScoreMsg.classList.remove('hidden');
                } else {
                    elements.newHighScoreMsg.classList.add('hidden');
                }
                
                // Update stats
                state.stats.totalScore += score;
                state.stats.gamesPlayed += 1;
                localStorage.setItem('gp_stats', JSON.stringify(state.stats));
            };
        } catch (err) {
            console.error("Failed to load game module", err);
        }
    } else {
        if (state.currentGame) state.currentGame.destroy();
        state.currentGame = null;
        elements.gameScreen.classList.remove('active');
        elements.dashboard.classList.add('active');
        loadDashboardData();
    }
}

// --- Event Listeners ---
document.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => {
        const gameKey = card.getAttribute('data-game');
        switchView('game', gameKey);
    });
});

document.getElementById('back-to-dashboard').addEventListener('click', () => switchView('dashboard'));
document.getElementById('exit-game-btn').addEventListener('click', () => switchView('dashboard'));

document.getElementById('start-game-btn').addEventListener('click', () => {
    elements.instructionOverlay.classList.add('hidden');
    if (state.currentGame) state.currentGame.start();
});

document.getElementById('restart-game-btn').addEventListener('click', () => {
    elements.gameOverOverlay.classList.add('hidden');
    if (state.currentGame) state.currentGame.start();
});

document.getElementById('mute-btn').addEventListener('click', () => {
    state.isMuted = !state.isMuted;
    localStorage.setItem('gp_muted', state.isMuted);
    document.getElementById('mute-icon').textContent = state.isMuted ? '🔇' : '🔊';
    sound.isMuted = state.isMuted;
});

document.getElementById('toggle-skeleton').addEventListener('change', (e) => {
    state.showSkeleton = e.target.checked;
});

// Leaderboard Modal
const leaderboardModal = document.getElementById('leaderboard-modal');
document.getElementById('settings-btn').addEventListener('click', () => {
    leaderboardModal.classList.remove('hidden');
    fetchLeaderboard();
});

document.getElementById('close-leaderboard').addEventListener('click', () => {
    leaderboardModal.classList.add('hidden');
});

// Initialize on Load
window.addEventListener('DOMContentLoaded', init);

// Export for games to use
export { state, elements, validateAndSaveScore };
