const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e9 }); // 1GB limit for video sharing

const PORT = process.env.PORT || 3000;

const mediaPath = path.join(__dirname, 'media');
if (!fs.existsSync(mediaPath)) {
    fs.mkdirSync(mediaPath, { recursive: true });
}

app.use(express.static(path.join(__dirname, 'public')));
app.use('/media', express.static(mediaPath));

let broadcasterId = null;
const clients = new Set();
let currentVideoState = {
    action: 'pause',
    time: 0,
    timestamp: Date.now(),
    url: '/media/video.mp4'
};

io.on('connection', (socket) => {
    console.log(`[CEREBRO] New connection: ${socket.id}`);
    clients.add(socket.id);
    
    // Broadcast updated peer count
    io.emit('peer_count', clients.size);

    socket.on('disconnect', () => {
        console.log(`[CEREBRO] Disconnected: ${socket.id}`);
        clients.delete(socket.id);
        if (socket.id === broadcasterId) {
            broadcasterId = null;
            io.emit('broadcaster_disconnected');
        }
        io.emit('peer_count', clients.size);
        
        // Let others know for WebRTC signaling
        socket.broadcast.emit('peer_disconnected', socket.id);
    });

    // Role Selection
    socket.on('join_broadcaster', () => {
        if (!broadcasterId) {
            broadcasterId = socket.id;
            socket.emit('role_assigned', 'broadcaster');
            socket.broadcast.emit('system_message', 'BROADCASTER ONLINE');
            console.log(`[CEREBRO] Broadcaster set: ${socket.id}`);
        } else {
            socket.emit('error_message', 'Broadcaster already exists.');
        }
    });

    socket.on('join_listener', () => {
        socket.emit('role_assigned', 'listener');
        socket.emit('sync_video_url', currentVideoState.url);
        // Give listener the current state
        socket.emit('sync', currentVideoState);
        console.log(`[CEREBRO] Listener joined: ${socket.id}`);
        
        // For WebRTC Mesh - notify others
        socket.broadcast.emit('new_peer', socket.id);
    });

    // Video Sync Signaling
    socket.on('new_video_file', (data) => {
        if (socket.id === broadcasterId && data.file) {
            console.log(`[CEREBRO] Receiving new video from broadcaster: ${data.name}`);
            const filePath = path.join(mediaPath, 'shared_video.mp4');
            fs.writeFile(filePath, data.file, (err) => {
                if (err) {
                    console.error("[CEREBRO] Error saving shared video:", err);
                } else {
                    console.log(`[CEREBRO] Video saved correctly.`);
                    currentVideoState.url = `/media/shared_video.mp4?t=${Date.now()}`;
                    io.emit('sync_video_url', currentVideoState.url);
                }
            });
        }
    });

    socket.on('sync', (data) => {
        if (socket.id === broadcasterId) {
            currentVideoState = {
                action: data.action,
                time: data.time,
                timestamp: Date.now()
            };
            socket.broadcast.emit('sync', data);
        }
    });

    socket.on('play', (data) => {
        if (socket.id === broadcasterId) {
            currentVideoState.action = 'play';
            currentVideoState.time = data.time;
            socket.broadcast.emit('play', data);
        }
    });

    socket.on('pause', (data) => {
        if (socket.id === broadcasterId) {
            currentVideoState.action = 'pause';
            currentVideoState.time = data.time;
            socket.broadcast.emit('pause', data);
        }
    });

    socket.on('seek', (data) => {
        if (socket.id === broadcasterId) {
            currentVideoState.time = data.time;
            socket.broadcast.emit('seek', data);
        }
    });

    // WebRTC Signaling (for debug panel peer connections)
    socket.on('webrtc_offer', (data) => {
        io.to(data.target).emit('webrtc_offer', {
            sender: socket.id,
            sdp: data.sdp
        });
    });

    socket.on('webrtc_answer', (data) => {
        io.to(data.target).emit('webrtc_answer', {
            sender: socket.id,
            sdp: data.sdp
        });
    });

    socket.on('webrtc_ice_candidate', (data) => {
        io.to(data.target).emit('webrtc_ice_candidate', {
            sender: socket.id,
            candidate: data.candidate
        });
    });

    socket.on('ping', () => {
        socket.emit('pong');
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`
=========================================
      CEREBRO CODE RED SYNCHRONIZER      
=========================================
Listening on:
Local:   http://localhost:${PORT}
Network: http://<Your-IPv4-Address>:${PORT}
=========================================
`);
});
