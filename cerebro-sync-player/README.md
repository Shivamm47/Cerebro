# Cerebro Code Red Synchronizer

A Stranger Things themed synchronized video broadcasting system utilizing Node.js, Socket.io, and WebRTC.

## Features
- **Broadcaster / Listener Roles:** One host controls playback, pause, and seeking. All listeners synchronize automatically (<200ms drift).
- **Retro Stranger Things UI:** Beautiful CRT scanlines, neon borders, flickering text, and retro boot sequences.
- **Network Link Debugging:** Real-time visibility into WebRTC STUN peer connections, websocket latency, and synchronization drift.
- **WebRTC Integration:** Implements full mesh STUN connections for NAT traversal and verifying peer connectivity.
- **Local Video Override:** Broadcaster can load any local MP4 via the control panel!

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   node server.js
   ```

3. Open a browser and connect!
   - Host machine: `http://localhost:3000`
   - Other devices on LAN: `http://<IPv4-Address>:3000`

## Roles

**Broadcaster:** Has playback controls. Actions are transmitted to connected Listeners instantly. Load your own MP4 to override the placeholder video.
**Listener:** Playback controls are disabled. Device automatically follows Broadcaster's playback head!

## Folder Structure

```
cerebro-sync-player/
├── package.json
├── server.js    <-- Entry point, Socket.io/Express setup
├── README.md
├── media/       <-- Put your videos here!
└── public/
    ├── index.html
    ├── style.css
    └── client.js <-- Frontend synchronization and WebRTC logic
```
