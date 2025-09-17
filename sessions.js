/**
 * Session middleware for Express
 * Uses express-session with secret from .env
 */

const session = require('express-session');

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false, // don't save empty sessions
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 1 day session
  }
});

module.exports = sessionMiddleware;
