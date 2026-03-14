const socket = io();

// DOM Elements
const bootScreen = document.getElementById('boot-screen');
const bootText = document.getElementById('boot-text');
const btnEnter = document.getElementById('btn-enter');
const roleSelection = document.getElementById('role-selection');
const mainApp = document.getElementById('main-app');

const btnBroadcaster = document.getElementById('btn-broadcaster');
const btnListener = document.getElementById('btn-listener');

const roleDisplay = document.getElementById('role-display');
const syncIndicator = document.getElementById('sync-indicator');
const peerCounter = document.getElementById('peer-counter');

const video = document.getElementById('sync-video');
const broadcasterControls = document.getElementById('broadcaster-controls');
const listenerControls = document.getElementById('listener-controls');

const btnPlay = document.getElementById('btn-play');
const btnPause = document.getElementById('btn-pause');
const seekBar = document.getElementById('seek-bar');
const timeDisplay = document.getElementById('time-display');
const listenerTimeDisplay = document.getElementById('listener-time-display');
const localVideoUpload = document.getElementById('local-video-upload');

const syncTimecode = document.getElementById('sync-timecode');
const syncLatency = document.getElementById('sync-latency');
const syncDrift = document.getElementById('sync-drift');
const syncPeers = document.getElementById('sync-peers');
const debugLog = document.getElementById('debug-log');

// State
let role = null; // 'broadcaster' or 'listener'
let isSynced = false;
let pingStart = 0;
let latency = 0;
let peers = {}; // WebRTC RTCPeerConnections

const STUN_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

// Utils
function logDebug(msg, type = 'sys') {
    const el = document.createElement('div');
    el.className = `log-line`;
    el.innerHTML = `<span class="${type}">[${new Date().toISOString().substring(11,23)}] ${msg}</span>`;
    debugLog.appendChild(el);
    debugLog.scrollTop = debugLog.scrollHeight;
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function setSyncStatus(synced) {
    isSynced = synced;
    if (synced) {
        syncIndicator.className = 'sync-status green';
        syncIndicator.innerText = '● SYNC LOCKED';
    } else {
        syncIndicator.className = 'sync-status red';
        syncIndicator.innerText = '● SYNC LOST';
    }
}

// Boot Sequence
const bootMessages = [
    "INITIALIZING CEREBRO NODE...",
    "ESTABLISHING UPSIDE DOWN LINK...",
    "CHECKING QUANTUM ENTANGLEMENT...",
    "SIGNAL LOCKED."
];

let bootIndex = 0;
function runBootSequence() {
    if (bootIndex < bootMessages.length) {
        bootText.innerHTML += `> ${bootMessages[bootIndex]}<br>`;
        bootIndex++;
        setTimeout(runBootSequence, 800);
    } else {
        btnEnter.classList.remove('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    runBootSequence();
});

btnEnter.addEventListener('click', () => {
    bootScreen.classList.remove('active');
    roleSelection.classList.remove('hidden');
    roleSelection.classList.add('active');
});

// Role Selection
btnBroadcaster.addEventListener('click', () => {
    socket.emit('join_broadcaster');
    logDebug("Requesting BROADCASTER role...", "info");
});

btnListener.addEventListener('click', () => {
    socket.emit('join_listener');
    logDebug("Requesting LISTENER role...", "info");
});

// Socket Events Setup
socket.on('role_assigned', (assignedRole) => {
    role = assignedRole;
    roleSelection.classList.remove('active');
    roleSelection.classList.add('hidden');
    mainApp.classList.remove('hidden');
    mainApp.classList.add('active');
    
    roleDisplay.innerText = `ROLE: ${role.toUpperCase()}`;
    logDebug(`Assigned role: ${role.toUpperCase()}`, "ok");

    if (role === 'broadcaster') {
        broadcasterControls.classList.remove('hidden');
        setSyncStatus(true); // Broadcaster is always the source of truth
    } else {
        listenerControls.classList.remove('hidden');
        setSyncStatus(false);
    }
    
    // Periodically send ping for latency
    setInterval(() => {
        pingStart = Date.now();
        socket.emit('ping');
    }, 2000);
});

socket.on('error_message', (msg) => { // Like broadcaster already exists
    alert(msg);
    logDebug(`Error: ${msg}`, "err");
});

socket.on('sync_video_url', (url) => {
    if (role !== 'broadcaster' && !video.src.includes(url)) {
        logDebug(`New video signal detected. Updating Source...`, "info");
        const currentTime = video.currentTime;
        const isPaused = video.paused;
        
        video.src = url;
        video.load();
        
        video.currentTime = currentTime;
        if (!isPaused) {
            video.play().catch(e => logDebug(`Play blocked: ${e.message}`, "err"));
        }
    }
});

socket.on('peer_count', (count) => {
    peerCounter.innerText = `Connected Nodes: ${count}`;
    syncPeers.innerText = `${count} connected`;
});

socket.on('system_message', (msg) => {
    logDebug(msg, "info");
});

socket.on('broadcaster_disconnected', () => {
    logDebug("BROADCASTER DISCONNECTED. Signal lost.", "err");
    setSyncStatus(false);
    if (role === 'listener') video.pause();
});

socket.on('pong', () => {
    latency = Math.max(1, Date.now() - pingStart);
    syncLatency.innerText = `${latency} ms`;
});

// Video Sync Logic
if (role !== 'broadcaster') {
    // Listen to sync events from broadcaster
    socket.on('sync', (data) => {
        if (!data) return;
        syncToBroadcaster(data);
    });

    socket.on('play', (data) => {
        syncToBroadcaster(data);
        video.play().catch(e => logDebug(`Play blocked: ${e.message}`, "err"));
    });

    socket.on('pause', (data) => {
        syncToBroadcaster(data);
        video.pause();
    });

    socket.on('seek', (data) => {
        syncToBroadcaster(data);
    });
}

function syncToBroadcaster(data) {
    if (role === 'broadcaster') return;
    
    // Calculate drift based on timestamp
    const drift = Math.abs(video.currentTime - data.time);
    syncDrift.innerText = `${Math.round(drift * 1000)} ms`;
    
    // If drift is significant (> 200ms), force update
    if (drift > 0.2) {
        logDebug(`Syncing... Drift: ${Math.round(drift * 1000)}ms`, "sys");
        video.currentTime = data.time;
    }
    
    if (data.action === 'play' && video.paused) {
        video.play().catch(e => {}); 
    } else if (data.action === 'pause' && !video.paused) {
        video.pause();
    }
    
    if (drift <= 0.2) {
        setSyncStatus(true);
    } else {
        setSyncStatus(false);
    }
}

// Broadcaster Controls Events
btnPlay.addEventListener('click', () => {
    video.play();
    socket.emit('play', { time: video.currentTime });
    logDebug(`Emmited PLAY at ${video.currentTime.toFixed(2)}s`);
});

btnPause.addEventListener('click', () => {
    video.pause();
    socket.emit('pause', { time: video.currentTime });
    logDebug(`Emmited PAUSE at ${video.currentTime.toFixed(2)}s`);
});

video.addEventListener('seeked', () => {
    if (role === 'broadcaster') {
        socket.emit('seek', { time: video.currentTime });
        logDebug(`Emmited SEEK to ${video.currentTime.toFixed(2)}s`);
    }
});

// For continuous sync
setInterval(() => {
    if (role === 'broadcaster') {
        socket.emit('sync', { 
            action: video.paused ? 'pause' : 'play', 
            time: video.currentTime 
        });
        syncDrift.innerText = `0 ms (SOURCE)`;
    }
}, 1000);

// UI Updates
video.addEventListener('timeupdate', () => {
    const t = formatTime(video.currentTime);
    const d = formatTime(video.duration);
    syncTimecode.innerText = `${t} / ${d}`;
    timeDisplay.innerText = `${t} / ${d}`;
    listenerTimeDisplay.innerText = `${t} / ${d}`;
    
    if (role === 'broadcaster' && video.duration) {
        seekBar.max = video.duration;
        seekBar.value = video.currentTime;
    }
});

seekBar.addEventListener('input', () => {
    if (role === 'broadcaster') {
        video.currentTime = seekBar.value;
    }
});

// Load Local Video
localVideoUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        video.src = url;
        logDebug(`Loaded local video: ${file.name}`, "ok");
        
        if (role === 'broadcaster') {
            logDebug(`Uploading video to network... please wait...`, "sys");
            socket.emit('new_video_file', { file: file, name: file.name });
        }
    }
});

// --- WebRTC Peer Discovery (For Debug Panel and Network Requirement) ---
socket.on('new_peer', async (peerId) => {
    // Only broadcaster initiates to simplify mesh, OR everyone connects to everyone.
    // Let's have everyone attempt to connect to the new peer.
    logDebug(`New peer discovered: ${peerId}`, "info");
    createPeerConnection(peerId, true);
});

socket.on('peer_disconnected', (peerId) => {
    if (peers[peerId]) {
        peers[peerId].close();
        delete peers[peerId];
        logDebug(`Peer WebRTC disconnected: ${peerId}`, "err");
    }
});

socket.on('webrtc_offer', async (data) => {
    logDebug(`Received WebRTC offer from ${data.sender}`, "sys");
    const pc = createPeerConnection(data.sender, false);
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('webrtc_answer', { target: data.sender, sdp: pc.localDescription });
});

socket.on('webrtc_answer', async (data) => {
    logDebug(`Received WebRTC answer from ${data.sender}`, "sys");
    const pc = peers[data.sender];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    }
});

socket.on('webrtc_ice_candidate', async (data) => {
    const pc = peers[data.sender];
    if (pc && data.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        logDebug(`Added ICE candidate from ${data.sender}`, "sys");
    }
});

function createPeerConnection(peerId, isInitiator) {
    const pc = new RTCPeerConnection(STUN_SERVERS);
    peers[peerId] = pc;

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            logDebug(`Generated ICE candidate`, "ok");
            socket.emit('webrtc_ice_candidate', { target: peerId, candidate: event.candidate });
        }
    };

    pc.onconnectionstatechange = () => {
        logDebug(`WebRTC state with ${peerId}: ${pc.connectionState}`, "info");
    };

    if (isInitiator) {
        pc.createOffer().then(offer => {
            return pc.setLocalDescription(offer);
        }).then(() => {
            logDebug(`Sending WebRTC offer to ${peerId}`, "sys");
            socket.emit('webrtc_offer', { target: peerId, sdp: pc.localDescription });
        });
    }

    return pc;
}

// Add simple ping handler for latency calc on server side
// Actually, I didn't add ping on server.js. Let's handle generic ping/pong socket.io built-in, but socket.io doesn't expose it easily.
// Let's override the periodic ping to emit custom ping.
// I'll emit 'ping' and server should respond with 'pong'. Wait, server won't respond if not defined.
// I'll define it on server.js or I'll just use socket.on('ping', ...) if it works, or I'll quickly patch server.js.
