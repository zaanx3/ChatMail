/**
 * WebSocket chat module to handle real-time messaging
 */

const WebSocket = require('ws');

// Map user emails to WebSocket connections
const clients = new Map();

/**
 * Attach WebSocket server to existing HTTP server
 * @param {http.Server} server
 * @param {object} userManager - users.js module for user data
 */
function attachWebSocketServer(server, userManager) {
  const wss = new WebSocket.Server({ server });

  // Broadcast online users to all clients
  function broadcastOnlineUsers() {
    const online = Array.from(clients.keys());
    const msg = JSON.stringify({ type: 'online-users', online });
    clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
  }

  wss.on('connection', (ws, req) => {
    let userEmail = null;

    // On receive message
    ws.on('message', message => {
      try {
        const data = JSON.parse(message);

        // First message: user logs in with email to register WebSocket
        if (data.type === 'login') {
          userEmail = data.email;
          const user = userManager.getUser(userEmail);
          if (!user || !user.verified) {
            ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized (not verified).' }));
            ws.close();
            return;
          }
          clients.set(userEmail, ws);
          broadcastOnlineUsers();
          return;
        }

        // Process private chat messages
        if (data.type === 'private-message') {
          const { to, text } = data;
          if (!userEmail || !to || !text) return; // Invalid data

          const receiverWs = clients.get(to);

          // Message packet
          const packet = {
            type: 'private-message',
            from: userEmail,
            to,
            text,
            timestamp: Date.now()
          };

          // Send to receiver if online
          if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
            receiverWs.send(JSON.stringify(packet));
          }

          // Echo back to sender (to confirm send)
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(packet));
          }
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    // On disconnect
    ws.on('close', () => {
      if (userEmail) {
        clients.delete(userEmail);
        broadcastOnlineUsers();
      }
    });
  });
}

module.exports = { attachWebSocketServer };
