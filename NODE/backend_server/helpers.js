// helpers.js
// Utility/helper functions for the server
const fs = require('fs');
const path = require('path');

function getTrafficType(req) {
    const url = req.originalUrl.split('?')[0];
    if (url.startsWith('/collect')) return 'analytics';
    if (url.startsWith('/newsletter')) return 'newsletter';
    if (url.startsWith('/cookie-signup')) return 'cookie-signup';
    if (url.startsWith('/cookie-cloud')) return 'cookie-cloud';
    if (url.startsWith('/shortener')) return 'shortener';
    return 'other';
}

function getLocalIP() {
    const os = require('os');
    const ifaces = os.networkInterfaces();
    for (const iface of Object.values(ifaces)) {
        for (const info of iface) {
            if (info.family === 'IPv4' && !info.internal) {
                return info.address;
            }
        }
    }
    return 'localhost';
}

function checkLatestPassword(req) {
    return (
        req.body?.password === process.env.LATEST_PASSWORD ||
        req.query?.password === process.env.LATEST_PASSWORD || 
        req.cookies?.latest_auth === process.env.LATEST_PASSWORD
    );
}

function loadNewsletterDB() {
    const NEWSLETTER_FILE_PATH = path.join(__dirname, 'data/newsletter-signups.json');
    if (!fs.existsSync(NEWSLETTER_FILE_PATH)) return {};
    try {
        return JSON.parse(fs.readFileSync(NEWSLETTER_FILE_PATH, 'utf8'));
    } catch {
        return {};
    }
}

module.exports = {
    getTrafficType,
    getLocalIP,
    checkLatestPassword,
    loadNewsletterDB
};
