import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, onDisconnect, remove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// 1. Initialize Firebase (Replace with your actual config)
const firebaseConfig = {
  apiKey: "AIzaSyCqcVmes8Ie-u_cQ0uP8T3KGqTMinxPwK0",
  authDomain: "thps-live-slides.firebaseapp.com",
  databaseURL: "https://thps-live-slides-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "thps-live-slides",
  storageBucket: "thps-live-slides.firebasestorage.app",
  messagingSenderId: "559550645484",
  appId: "1:559550645484:web:419bc6be49c309a1fb91c9"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM Elements
const lobbyUI = document.getElementById('lobby-ui');
const hostUI = document.getElementById('host-ui');
const playerUI = document.getElementById('player-ui');
const roomInput = document.getElementById('room-code');

// App State
let currentRoom = null;
let myPlayerId = `p_${Math.random().toString(36).substr(2, 9)}`;
let players = {}; 

// ==========================================
// HOST LOGIC (The Screen)
// ==========================================
document.getElementById('host-btn').addEventListener('click', () => {
    // Generate random 4-digit code
    currentRoom = Math.floor(1000 + Math.random() * 9000).toString();
    
    // Create room in Firebase
    set(ref(db, `rooms/${currentRoom}`), { created: Date.now(), players: {} });
    
    // Clean up room when host closes window
    onDisconnect(ref(db, `rooms/${currentRoom}`)).remove();

    // UI Updates
    lobbyUI.classList.add('hidden');
    hostUI.classList.remove('hidden');
    document.getElementById('display-room-code').innerText = currentRoom;

    // Listen for players moving
    const playersRef = ref(db, `rooms/${currentRoom}/players`);
    onValue(playersRef, (snapshot) => {
        players = snapshot.val() || {};
        drawCanvas();
    });

    initCanvas();
});

// ==========================================
// PLAYER LOGIC (The Mobile Controller)
// ==========================================
document.getElementById('join-btn').addEventListener('click', () => {
    const code = roomInput.value.toUpperCase();
    if (code.length !== 4) return alert("Enter a 4-digit code");

    // Check if room exists
    onValue(ref(db, `rooms/${code}/created`), (snapshot) => {
        if (!snapshot.exists()) {
            return alert("Room not found!");
        }

        currentRoom = code;
        const myColor = `#${Math.floor(Math.random()*16777215).toString(16)}`; // Random hex

        // Add player to room
        const myPlayerRef = ref(db, `rooms/${currentRoom}/players/${myPlayerId}`);
        set(myPlayerRef, { x: 400, y: 300, color: myColor });
        
        // Remove player when they close their phone
        onDisconnect(myPlayerRef).remove();

        // UI Updates
        lobbyUI.classList.add('hidden');
        playerUI.classList.remove('hidden');
        document.getElementById('player-color-indicator').style.backgroundColor = myColor;

        setupControls(myPlayerRef);
    }, { onlyOnce: true });
});

function setupControls(playerRef) {
    const speed = 20;
    
    // Abstract button logic to update Firebase X/Y
    const move = (dx, dy) => {
        // Read current local state (simplified for MVP, ideally read from snapshot)
        // We will just send an increment to Firebase
        const updateRef = ref(db, `rooms/${currentRoom}/players/${myPlayerId}`);
        
        // Fetch current position and add to it
        onValue(updateRef, (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                update(updateRef, { 
                    x: data.x + dx, 
                    y: data.y + dy 
                });
            }
        }, { onlyOnce: true });
    };

    // Attach to D-Pad
    document.getElementById('btn-up').addEventListener('pointerdown', () => move(0, -speed));
    document.getElementById('btn-down').addEventListener('pointerdown', () => move(0, speed));
    document.getElementById('btn-left').addEventListener('pointerdown', () => move(-speed, 0));
    document.getElementById('btn-right').addEventListener('pointerdown', () => move(speed, 0));
}

// ==========================================
// RENDER LOGIC (Host Canvas)
// ==========================================
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

function initCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        drawCanvas();
    });
}

function drawCanvas() {
    // Clear screen
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw all players
    Object.values(players).forEach(p => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
    });
}
