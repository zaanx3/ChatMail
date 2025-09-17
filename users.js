/**
 * users.js - user storage, management, and persistence
 * Password hashing with bcrypt
 * Email verification and saving users to JSON file
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const usersFile = path.join(__dirname, 'users.json');

// Load users from file on startup; if error, initialize empty object
let users = {};
try {
  users = JSON.parse(fs.readFileSync(usersFile));
} catch {
  users = {};
}

/**
 * Save users in-memory object to JSON file
 */
function saveUsers() {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

/**
 * Create new user with hashed password and generate verification code
 * Saves user to memory and persists immediately
 * @param {string} email - user email, unique ID
 * @param {string} username - unique username
 * @param {string} phone - phone number string
 * @param {string} password - plain text password
 */
async function createUser(email, username, phone, password) {
  const passwordHash = await bcrypt.hash(password, 10);
  const verificationCode = crypto.randomInt(100000, 999999).toString();

  users[email] = {
    email,
    username,
    phone,
    passwordHash,
    verified: false,
    verificationCode
  };
  saveUsers();
}

/**
 * Retrieve user object by email
 * @param {string} email
 * @returns {object|undefined} user or undefined if not found
 */
function getUser(email) {
  return users[email];
}

/**
 * Check if username already exists
 * @param {string} username
 * @returns {boolean}
 */
function usernameExists(username) {
  return Object.values(users).some(user => user.username === username);
}

/**
 * Compare given password with stored password hash
 * @param {string} password - plain text password
 * @param {string} hash - stored bcrypt hash
 * @returns {Promise<boolean>} password match result
 */
async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Verify user's email by matching verification code
 * Updates verified status and clears code when successful
 * Saves changes to file
 * @param {string} email
 * @param {string} code
 * @returns {object} { success: boolean, error?: string }
 */
function verifyUser(email, code) {
  const user = users[email];
  if (!user) {
    return { success: false, error: 'User not found.' };
  }
  if (user.verified) {
    return { success: false, error: 'User already verified.' };
  }
  if (user.verificationCode === code) {
    user.verified = true;
    user.verificationCode = null;
    saveUsers();
    return { success: true };
  }
  return { success: false, error: 'Invalid verification code.' };
}

module.exports = {
  createUser,
  getUser,
  usernameExists,
  verifyPassword,
  verifyUser
};
