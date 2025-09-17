require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

const usersFile = path.join(__dirname, 'users.json');
let users = {};
try { users = JSON.parse(fs.readFileSync(usersFile)); } catch { users = {}; }
function saveUsers() {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

const messagesFile = path.join(__dirname, 'messages.json');
let messages = {};
try { messages = JSON.parse(fs.readFileSync(messagesFile)); } catch { messages = {}; }
function saveMessages() {
  fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 24*60*60*1000 }
}));
app.use(express.static(path.join(__dirname)));

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.post('/api/signup', async (req, res) => {
  const { email, username, phone, password, confirm } = req.body;
  if (!email || !username || !phone || !password || !confirm)
    return res.status(400).json({ error: 'All fields are required.' });
  if (password !== confirm)
    return res.status(400).json({ error: 'Passwords do not match.' });
  if (users[email])
    return res.status(400).json({ error: 'Email already registered.' });
  if (Object.values(users).some(u => u.username === username))
    return res.status(400).json({ error: 'Username already taken.' });
  const passwordHash = await bcrypt.hash(password, 10);
  const verificationCode = crypto.randomInt(100000, 999999).toString();
  users[email] = { email, username, phone, passwordHash, verified: false, verificationCode };
  saveUsers();
  try {
    await transporter.sendMail({
      from: `"FB Chat App" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify Your Email',
      text: `Your verification code is: ${verificationCode}`
    });
    res.json({ message: 'Signup successful. Verification code sent to email.' });
  } catch (err) {
    console.error('Email send error:', err);
    res.status(500).json({ error: 'Failed to send verification email.' });
  }
});

app.post('/api/verify', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email and code required.' });
  const user = users[email];
  if (!user) return res.status(400).json({ error: 'User not found.' });
  if (user.verified) return res.status(400).json({ error: 'User already verified.' });
  if (user.verificationCode !== code) return res.status(400).json({ error: 'Invalid verification code.' });
  user.verified = true;
  user.verificationCode = null;
  saveUsers();
  res.json({ message: 'Email verified successfully!' });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
  const user = users[email];
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (!user.verified) return res.status(403).json({ error: 'Email not verified.' });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid password.' });
  req.session.userEmail = email;
  res.json({ message: 'Login successful.', username: user.username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Logout failed.' });
    res.json({ message: 'Logged out successfully.' });
  });
});

function requireLogin(req, res, next) {
  if (!req.session.userEmail) return res.redirect('/');
  next();
}

app.get('/chat.html', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'chat.html'));
});

app.get('/api/session-user', (req, res) => {
  if (!req.session.userEmail) return res.status(401).json({ error: 'Not logged in' });
  const user = users[req.session.userEmail];
  if (!user) return res.status(401).json({ error: 'Invalid session' });
  res.json({ email: user.email, username: user.username });
});

app.get('/app.apk', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.apk'));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Map();

function storeMessage(from, to, text) {
  const msg = { from, to, text, timestamp: Date.now() };
  messages[from] = messages[from] || [];
  messages[to] = messages[to] || [];
  messages[from].push(msg);
  messages[to].push(msg);
  saveMessages();
}

function cleanupOldMessages() {
  const expirationTime = Date.now() - 3 * 24 * 60 * 60 * 1000; // 3 days ago
  let changed = false;
  for (const userEmail in messages) {
    const oldLength = messages[userEmail].length;
    messages[userEmail] = messages[userEmail].filter(msg => msg.timestamp > expirationTime);
    if (messages[userEmail].length !== oldLength) {
      changed = true;
    }
  }
  if (changed) saveMessages();
}
setInterval(cleanupOldMessages, 60 * 60 * 1000);

function broadcastOnlineUsers() {
  const online = Array.from(clients.keys());
  const msg = JSON.stringify({ type: 'online-users', onlineUsers: online });
  for (const clientWs of clients.values()) {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(msg);
    }
  }
}

wss.on('connection', (ws) => {
  let email = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'login') {
        email = data.email;
        if (users[email] && users[email].verified) {
          clients.set(email, ws);
          const expiry = Date.now() - 3 * 24 * 60 * 60 * 1000;
          const recentMsgs = (messages[email] || []).filter(m => m.timestamp > expiry);
          ws.send(JSON.stringify({ type: 'message-history', messages: recentMsgs }));
          broadcastOnlineUsers();
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
          ws.close();
        }
        return;
      }

      if (data.type === 'private-message') {
        if (!email) return;
        storeMessage(email, data.to, data.text);

        const pkt = {
          type: 'private-message',
          from: email,
          to: data.to,
          text: data.text,
          timestamp: Date.now()
        };

        const toSocket = clients.get(data.to);
        if (toSocket && toSocket.readyState === WebSocket.OPEN) {
          toSocket.send(JSON.stringify(pkt));
        }
      }
    } catch (err) {
      console.error('WS error:', err);
    }
  });

  ws.on('close', () => {
    if (email) {
      clients.delete(email);
      broadcastOnlineUsers();
    }
  });
});

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

