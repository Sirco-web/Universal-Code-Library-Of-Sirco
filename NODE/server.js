'use strict';

// --- Import required modules ---
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const https = require('https');
const path = require('path');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const readline = require('readline');
const { getLocalIP, checkLatestPassword, loadNewsletterDB } = require('./helpers');

// --- Initialize Express app ---
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

// --- Import ban system ---
const banSystem = require('./ban-system');
app.use(banSystem.bannedIPMiddleware);

// --- Import endpoint handlers ---
const {
    verifyAccount,
    accountSignup,
    banUser,
    tempBanUser,
    deleteUser,
    cookieVerify,
    cookieSignup,
    sendNewsletter,
    collect,
    bannedIps,
    bannedMacs,
    unbanIp,
    unbanMac,
    latestJson,
    adminSettings,
    adminSettingsUpdate,
    bannedAccounts
} = require('./endpoints');

// --- Global variables ---
let TRAFFIC_MODE = null;
let GMAIL_USER = process.env.GMAIL_USER;
let GMAIL_PASS = process.env.GMAIL_PASS;
let apiKeys = [];
let transporter = null;
let currentApiIndex = 0;

// --- Constants ---
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const LOG_FILE_PATH = path.join(DATA_DIR, 'analytics-log.json');
const NEWSLETTER_FILE_PATH = path.join(DATA_DIR, 'newsletter-signups.json');
const COOKIE_SIGNUP_FILE = path.join(DATA_DIR, 'cookie-signups.json');
const COOKIE_CLOUD_FILE = path.join(DATA_DIR, 'cookie-cloud.json');
const BANNED_IPS_FILE = path.join(DATA_DIR, 'banned-ips.json');
const BANNED_MACS_FILE = path.join(DATA_DIR, 'banned-mac-codes.json');
const PORT = process.env.PORT || 3443;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || './key.pem';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || './cert.pem';
const LATEST_PASSWORD = process.env.LATEST_PASSWORD || 'letmein';
const LATEST_COOKIE = 'latest_auth';
const ADMIN_SETTINGS_FILE = path.join(DATA_DIR, 'admin-settings.json');

// --- Directory Creation ---
if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// --- Helper Functions ---
function getTrafficType(req) {
    const url = req.originalUrl.split('?')[0];
    if (url.startsWith('/collect')) return 'analytics';
    if (url.startsWith('/newsletter')) return 'newsletter';
    if (url.startsWith('/cookie-signup')) return 'cookie-signup';
    if (url.startsWith('/cookie-cloud')) return 'cookie-cloud';
    if (url.startsWith('/shortener')) return 'shortener';
    return 'other';
}

// --- Middleware ---
app.use((req, res, next) => {
    const type = getTrafficType(req);
    const shouldLog = TRAFFIC_MODE === 'all' || TRAFFIC_MODE === type;

    if (shouldLog) {
        console.log('[IN] ' + req.method + ' ' + req.originalUrl);
        if (Object.keys(req.body || {}).length > 0) {
            console.log('[IN] Body:', JSON.stringify(req.body, null, 2));
        }
        if (Object.keys(req.query || {}).length > 0) {
            console.log('[IN] Query:', JSON.stringify(req.query, null, 2));
        }
    }

    const origJson = res.json;
    const origSend = res.send;
    
    res.json = function(data) {
        if (shouldLog) {
            console.log('[OUT] ' + req.method + ' ' + req.originalUrl + ' -> Status: ' + res.statusCode);
            console.log('[OUT] JSON:', JSON.stringify(data, null, 2));
        }
        return origJson.call(this, data);
    };
    
    res.send = function(data) {
        if (shouldLog) {
            console.log('[OUT] ' + req.method + ' ' + req.originalUrl + ' -> Status: ' + res.statusCode);
            let out = data;
            if (typeof data !== 'string') {
                try { 
                    out = JSON.stringify(data, null, 2); 
                } catch (e) {
                    out = String(data);
                }
            }
            if (typeof out === 'string' && out.length > 1000) {
                out = out.slice(0, 1000) + '... [truncated]';
            }
            console.log('[OUT] Body:', out);
        }
        return origSend.call(this, data);
    };
    
    next();
});

// --- Routes ---
app.get('/', (req, res) => res.send('Server is running'));
app.use(express.static(PUBLIC_DIR));

app.post('/verify-account', verifyAccount);
app.post('/account-signup', banSystem.bannedIPMiddleware, accountSignup);
app.post('/ban-user', banUser);
app.post('/temp-ban-user', tempBanUser);
app.post('/delete-user', deleteUser);
app.post('/cookie-verify', cookieVerify);
app.post('/cookie-signup', banSystem.bannedIPMiddleware, cookieSignup);
app.post('/send-newsletter', sendNewsletter);
app.post('/collect', collect);
app.get('/banned-ips', bannedIps);
app.get('/banned-macs', bannedMacs);
app.post('/unban-ip', unbanIp);
app.post('/unban-mac', unbanMac);
app.get('/latest.json', latestJson);
app.get('/admin-settings', adminSettings);
app.post('/admin-settings/update', adminSettingsUpdate);
app.post('/banned-accounts', bannedAccounts);

// --- HTML Routes ---
app.get('/latest', (req, res) => {
    const latestPath = path.resolve(__dirname, 'latest.html');
    if (!fs.existsSync(latestPath)) {
        return res.status(404).send('latest.html not found in project root. Please add latest.html to your project root.');
    }
    res.sendFile(latestPath);
});

app.get('/latest.html', (req, res) => {
    const latestPath = path.resolve(__dirname, 'latest.html');
    if (!fs.existsSync(latestPath)) {
        return res.status(404).send('latest.html not found in project root. Please add latest.html to your project root.');
    }
    res.sendFile(latestPath);
});

app.get('/my-ip', (req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.connection.remoteAddress;
    res.json({ ip });
});

// --- Traffic Monitoring Menu ---
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function printMenu() {
    console.log('\n=== Traffic Monitor Menu ===');
    console.log('1. View ALL traffic');
    console.log('2. View only Analytics traffic');
    console.log('3. View only Newsletter traffic');
    console.log('4. View only Cookie Signup traffic');
    console.log('5. View only Cookie Cloud traffic');
    console.log('6. View only Shortener traffic');
    console.log('0. Stop viewing traffic');
    console.log('q. Quit menu');
    console.log('===========================');
    process.stdout.write('Select option: ');
}

function setTrafficMode(mode) {
    TRAFFIC_MODE = mode;
    if (mode === null) {
        console.log('\n[Monitor] Traffic viewing stopped.');
    } else {
        console.log('\n[Monitor] Now viewing: ' + (mode === 'all' ? 'ALL traffic' : mode + ' traffic only'));
    }
}

function startMenu() {
    printMenu();
    rl.on('line', (input) => {
        switch (input.trim()) {
            case '1': setTrafficMode('all'); break;
            case '2': setTrafficMode('analytics'); break;
            case '3': setTrafficMode('newsletter'); break;
            case '4': setTrafficMode('cookie-signup'); break;
            case '5': setTrafficMode('cookie-cloud'); break;
            case '6': setTrafficMode('shortener'); break;
            case '0': setTrafficMode(null); break;
            case 'q': rl.close(); return;
            default: console.log('Invalid option.');
        }
        printMenu();
    });
}

// --- Start server ---
if (fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
    const sslOptions = {
        key: fs.readFileSync(SSL_KEY_PATH),
        cert: fs.readFileSync(SSL_CERT_PATH)
    };
    https.createServer(sslOptions, app).listen(HTTPS_PORT, () => {
        console.log(`Analytics backend listening on HTTPS port ${HTTPS_PORT}`);
        console.log(`Access from your Pi's browser: https://` + getLocalIP() + `:${HTTPS_PORT}`);
    });
} else {
    app.listen(PORT, () => {
        console.log(`Analytics backend listening on HTTP port ${PORT} (SSL certs not found)`);
        console.log(`Access from your Pi's browser: http://` + getLocalIP() + `:${PORT}`);
    });
}

startMenu();
