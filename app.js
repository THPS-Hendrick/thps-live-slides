import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, onDisconnect, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCqcVmes8Ie-u_cQ0uP8T3KGqTMinxPwK0",
  authDomain: "thps-live-slides.firebaseapp.com",
  databaseURL: "https://thps-live-slides-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "thps-live-slides",
  storageBucket: "thps-live-slides.firebasestorage.app",
  messagingSenderId: "559550645484",
  appId: "1:559550645484:web:419bc6be49c309a1fb91c9"
};
const firebaseConfig = { /* ... */ };
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM Elements
const lobbyUI = document.getElementById('lobby-ui');
const hostDashboard = document.getElementById('host-dashboard');
const hostUI = document.getElementById('host-ui');
const playerUI = document.getElementById('player-ui');

// App State
let currentRoom = null;
let myPlayerId = `p_${Math.random().toString(36).substr(2, 9)}`;
let players = {}; 

// Presentation Data Structure
const presentations = {
    pitch: [
        { title: "Pitch Like a Pro", type: "title", roam: true },
        { title: "Rule 1: Hook the Audience", type: "content", roam: false }, // Sprites pushed out
        { title: "Survey: Do you get nervous?", type: "survey", roam: true, zones: ["Yes", "No"] }
    ],
    network: [
        { title: "Networking Skills", type: "title", roam: true },
        { title: "The Handshake", type: "content", roam: false }
    ]
};

let currentLevel = [];
let slideIndex = 0;
let slideRect = { x: 0, y: 0, w: 0, h: 0 }; // The 16:9 boundary

// ==========================================
// HOST: START & LEVEL SELECT
// ==========================================
document.getElementById('host-btn').addEventListener('click', () => {
    currentRoom = Math.floor(1000 + Math.random() * 9000).toString();
    set(ref(db, `rooms/${currentRoom}`), { created: Date.now(), player_count: 0, players: {} });
    onDisconnect(ref(db, `rooms/${currentRoom}`)).remove();

    lobbyUI.classList.add('hidden');
    hostDashboard.classList.remove('hidden');
    document.getElementById('dash-room-code').innerText = currentRoom;
});

// Host clicks a specific presentation
document.querySelectorAll('.level-select-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const levelKey = e.target.getAttribute('data-level');
        currentLevel = presentations[levelKey];
        slideIndex = 0;

        hostDashboard.classList.add('hidden');
        hostUI.classList.remove('hidden');
        document.getElementById('display-room-code').innerText = currentRoom;
        
        onValue(ref(db, `rooms/${currentRoom}/players`), (snapshot) => {
            players = snapshot.val() || {};
            drawCanvas();
        });

        initCanvas();
        setupClicker();
    });
});

// ==========================================
// HOST: CLICKER & PHYSICS
// ==========================================
function setupClicker() {
    window.addEventListener('keydown', (e) => {
        // USB Clickers usually send PageDown/PageUp or Arrows
        if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
            if (slideIndex < currentLevel.length - 1) {
                slideIndex++;
                handleSlideTransition();
            }
        } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
            if (slideIndex > 0) {
                slideIndex--;
                handleSlideTransition();
            }
        }
    });
}

function handleSlideTransition() {
    document.getElementById('slide-counter').innerText = `Slide ${slideIndex + 1}/${currentLevel.length}`;
    const slideRules = currentLevel[slideIndex];

    // THE SWEEP: If roam is false, forcefully push all sprites outside the 16:9 slide
    if (!slideRules.roam) {
        let updates = {};
        Object.keys(players).forEach(pid => {
            let p = players[pid];
            // Check if player is inside the slide boundary
            if (p.x > slideRect.x && p.x < slideRect.x + slideRect.w &&
                p.y > slideRect.y && p.y < slideRect.y + slideRect.h) {
                
                // Throw them below the slide
                updates[`rooms/${currentRoom}/players/${pid}/y`] = slideRect.y + slideRect.h + 50;
                // Alternatively, throw them left/right based on where they are
            }
        });
        
        // Execute a single mass-update to Firebase
        if (Object.keys(updates).length > 0) {
            update(ref(db), updates);
        }
    }
    drawCanvas();
}

// ==========================================
// RENDER LOGIC (Host Canvas)
// ==========================================
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

function initCanvas() {
    window.addEventListener('resize', calculateSlideBoundary);
    calculateSlideBoundary();
    handleSlideTransition(); // Init first slide
}

function calculateSlideBoundary() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Calculate perfect 16:9 box in center of screen
    let targetRatio = 16 / 9;
    let windowRatio = canvas.width / canvas.height;
    
    if (windowRatio > targetRatio) {
        slideRect.h = canvas.height * 0.8; // Leave 20% margin
        slideRect.w = slideRect.h * targetRatio;
    } else {
        slideRect.w = canvas.width * 0.8;
        slideRect.h = slideRect.w / targetRatio;
    }
    
    slideRect.x = (canvas.width - slideRect.w) / 2;
    slideRect.y = (canvas.height - slideRect.h) / 2;
    drawCanvas();
}

function drawCanvas() {
    if(!currentLevel[slideIndex]) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const slide = currentLevel[slideIndex];
    
    // Draw the 16:9 Slide Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(slideRect.x, slideRect.y, slideRect.w, slideRect.h);
    
    // Draw Slide Title
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(slide.title, slideRect.x + (slideRect.w/2), slideRect.y + (slideRect.h/2));

    // Draw Dominoes
    const width = 36, height = 54;
    Object.values(players).forEach(p => {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - width/2, p.y - height/2, width, height);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x - width/2, p.y - height/2, width, height);
        
        ctx.beginPath();
        ctx.moveTo(p.x - width/2, p.y);
        ctx.lineTo(p.x + width/2, p.y);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px sans-serif';
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 4;
        ctx.fillText(p.initials, p.x, p.y - height/4);
        ctx.fillText(p.number, p.x, p.y + height/4);
        ctx.shadowBlur = 0;
    });
}

// ==========================================
// PLAYER LOGIC (Abbreviated, keep your existing player join code here)
// ==========================================
// [PASTE YOUR EXISTING document.getElementById('join-btn') logic here]

// ==========================================
// PLAYER LOGIC
// ==========================================
document.getElementById('join-btn').addEventListener('click', () => {
    const code = roomInput.value.toUpperCase();
    const initials = initialsInput.value.toUpperCase();
    
    if (code.length !== 4) return alert("Enter a 4-digit code");
    if (initials.length < 1) return alert("Enter your initials");

    onValue(ref(db, `rooms/${code}/created`), (snapshot) => {
        if (!snapshot.exists()) return alert("Room not found!");
        currentRoom = code;

        // Atomic transaction to secure the next available join number
        const countRef = ref(db, `rooms/${currentRoom}/player_count`);
        
        runTransaction(countRef, (currentCount) => {
            return (currentCount || 0) + 1;
        }).then((result) => {
            if (!result.committed) return alert("Failed to join room.");
            
            // Subtract 1 so the first player is 00, second is 01, etc.
            const joinNumber = result.snapshot.val() - 1; 
            
            // Format number as string with leading zero (00, 01... 99)
            const formattedNumber = joinNumber.toString().padStart(2, '0');
            
            // Generate a distinct color using the Golden Angle (137.5 degrees)
            // This ensures colors are visually separated even if 100 people join
            const hue = (joinNumber * 137.5) % 360;
            const myColor = `hsl(${hue}, 70%, 50%)`;

            const myPlayerRef = ref(db, `rooms/${currentRoom}/players/${myPlayerId}`);
            
            set(myPlayerRef, { 
                x: window.innerWidth / 2, // Spawn in middle of screen
                y: window.innerHeight - 100, 
                color: myColor,
                initials: initials.substring(0, 2),
                number: formattedNumber
            });
            
            onDisconnect(myPlayerRef).remove();

            // Update Mobile UI
            lobbyUI.classList.add('hidden');
            playerUI.classList.remove('hidden');
            
            const dominoNode = document.getElementById('player-domino');
            dominoNode.style.backgroundColor = myColor;
            document.getElementById('domino-initials').innerText = initials;
            document.getElementById('domino-number').innerText = formattedNumber;

            setupControls(myPlayerRef);
        });

    }, { onlyOnce: true });
});

function setupControls(playerRef) {
    const speed = 25; // slightly faster for responsiveness
    
    const move = (dx, dy) => {
        const updateRef = ref(db, `rooms/${currentRoom}/players/${myPlayerId}`);
        onValue(updateRef, (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                update(updateRef, { x: data.x + dx, y: data.y + dy });
            }
        }, { onlyOnce: true });
    };

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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const width = 36;
    const height = 54;
    
    Object.values(players).forEach(p => {
        // Draw Domino Base
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - width/2, p.y - height/2, width, height);
        
        // Draw Domino Border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x - width/2, p.y - height/2, width, height);
        
        // Draw Center Divider line
        ctx.beginPath();
        ctx.moveTo(p.x - width/2, p.y);
        ctx.lineTo(p.x + width/2, p.y);
        ctx.stroke();

        // Draw Text (Initials on top, Number on bottom)
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 14px sans-serif';
        
        // Add text shadow for legibility
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 4;
        
        ctx.fillText(p.initials, p.x, p.y - height/4);
        ctx.fillText(p.number, p.x, p.y + height/4);
        
        // Reset shadow for next draw
        ctx.shadowBlur = 0;
    });
}
