/**
 * Nodemailer module to send emails via Gmail SMTP
 */

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Send an email asynchronously
 * @param {string} to - recipient email
 * @param {string} subject - subject line
 * @param {string} text - email body text
 */
function sendEmail(to, subject, text) {
  return transporter.sendMail({
    from: `"FB Chat App" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text
  });
}

module.exports = { sendEmail };
