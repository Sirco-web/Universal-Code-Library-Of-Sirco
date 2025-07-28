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
const DEVICE_DB_FILE = path.join(DATA_DIR, 'devices.json');

// --- Directory Creation ---
if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// --- Initialize JSON Files ---
const FILES_TO_INIT = ['profiles.json', 'roles.json', 'users.json'];
FILES_TO_INIT.forEach(file => {
    const filepath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filepath)) {
        fs.writeFileSync(filepath, '{}');
    }
});

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

// --- Device Endpoints ---
app.post('/device-register', (req, res) => {
    const { device_code, ...info } = req.body;
    if (!device_code) return res.status(400).json({ error: 'Missing device_code' });
    let db = {};
    if (fs.existsSync(DEVICE_DB_FILE)) {
        try { db = JSON.parse(fs.readFileSync(DEVICE_DB_FILE, 'utf8')); } catch { db = {}; }
    }
    if (!db[device_code]) {
        db[device_code] = { ...info, device_code, history: [], last_seen: Date.now(), status: 'online' };
        fs.writeFileSync(DEVICE_DB_FILE, JSON.stringify(db, null, 2));
    }
    res.json({ success: true });
});

app.post('/device-check', (req, res) => {
    const { device_code } = req.body;
    if (!device_code) return res.status(400).json({ error: 'Missing device_code' });
    let db = {};
    if (fs.existsSync(DEVICE_DB_FILE)) {
        try { db = JSON.parse(fs.readFileSync(DEVICE_DB_FILE, 'utf8')); } catch { db = {}; }
    }
    res.json({ exists: !!db[device_code] });
});

app.post('/device-ping', (req, res) => {
    const { device_code, ...info } = req.body;
    if (!device_code) return res.status(400).json({ error: 'Missing device_code' });
    let db = {};
    if (fs.existsSync(DEVICE_DB_FILE)) {
        try { db = JSON.parse(fs.readFileSync(DEVICE_DB_FILE, 'utf8')); } catch { db = {}; }
    }
    if (!db[device_code]) {
        db[device_code] = { ...info, device_code, history: [], last_seen: Date.now(), status: info.status || 'online' };
    } else {
        db[device_code] = {
            ...db[device_code],
            ...info,
            last_seen: Date.now(),
            status: info.status || db[device_code].status || 'online'
        };
        db[device_code].history = db[device_code].history || [];
        db[device_code].history.push({
            timestamp: Date.now(),
            page: info.page,
            status: info.status,
            time_on_page: info.time_on_page
        });
        // Keep only last 100 history entries
        if (db[device_code].history.length > 100) db[device_code].history = db[device_code].history.slice(-100);
    }
    fs.writeFileSync(DEVICE_DB_FILE, JSON.stringify(db, null, 2));
    res.json({ success: true });
});

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

// --- Live endpoints ---
app.get('/live', (req, res) => {
    const livePath = path.resolve(__dirname, 'live.html');
    if (!fs.existsSync(livePath)) {
        return res.status(404).send('live.html not found in project root. Please add live.html to your project root.');
    }
    res.sendFile(livePath);
});

app.get('/live-data', (req, res) => {
    if (!fs.existsSync(DEVICE_DB_FILE)) {
        return res.json({});
    }
    let db = {};
    try { db = JSON.parse(fs.readFileSync(DEVICE_DB_FILE, 'utf8')); } catch { db = {}; }
    res.json(db);
});

// --- Traffic Monitoring Menu ---
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function printMenu(selected) {
    console.log('\n=== Traffic Monitor Menu ===');
    console.log((selected === 'all' ? '>' : ' ') + ' 1. View ALL traffic');
    console.log((selected === 'analytics' ? '>' : ' ') + ' 2. View only Analytics traffic');
    console.log((selected === 'newsletter' ? '>' : ' ') + ' 3. View only Newsletter traffic');
    console.log((selected === 'cookie-signup' ? '>' : ' ') + ' 4. View only Cookie Signup traffic');
    console.log((selected === 'cookie-cloud' ? '>' : ' ') + ' 5. View only Cookie Cloud traffic');
    console.log((selected === 'shortener' ? '>' : ' ') + ' 6. View only Shortener traffic');
    console.log((selected === 'newsletter-signups' ? '>' : ' ') + ' 7. View Newsletter Signups');
    console.log((selected === 'accounts' ? '>' : ' ') + ' 9. View Accounts');
    console.log((selected === 'verify-user' ? '>' : ' ') + ' 8. Verify a User');
    console.log(' 0. Stop viewing traffic');
    console.log(' q. Quit menu');
    console.log('===========================');
    process.stdout.write('Select option: ');
}

let lastMenuTab = null;

function setTrafficMode(mode) {
    TRAFFIC_MODE = mode;
    lastMenuTab = mode;
    if (mode === null) {
        console.log('\n[Monitor] Traffic viewing stopped.');
    } else if (mode !== 'newsletter-signups' && mode !== 'verify-user') {
        console.log('\n[Monitor] Now viewing: ' + (mode === 'all' ? 'ALL traffic' : mode + ' traffic only'));
    }
}

function showNewsletterSignups() {
    try {
        const NEWSLETTER_FILE_PATH = path.join(__dirname, 'data', 'newsletter-signups.json');
        if (!fs.existsSync(NEWSLETTER_FILE_PATH)) {
            console.log('No newsletter signups found.');
        } else {
            const data = fs.readFileSync(NEWSLETTER_FILE_PATH, 'utf8');
            const signups = JSON.parse(data);
            console.log('\n--- Newsletter Signups ---');
            if (signups && typeof signups === 'object' && !Array.isArray(signups)) {
                Object.values(signups).forEach((entry, i) => {
                    console.log(`${i + 1}. Name: ${entry.name}, Email: ${entry.email}, Time: ${entry.timestamp}`);
                });
            } else if (Array.isArray(signups)) {
                signups.forEach((entry, i) => {
                    console.log(`${i + 1}. Name: ${entry.name}, Email: ${entry.email}, Time: ${entry.timestamp}`);
                });
            } else {
                console.log(signups);
            }
            console.log('--------------------------\n');
        }
    } catch (e) {
        console.log('Error reading newsletter signups:', e.message);
    }
}

function showAccounts() {
    try {
        const ACCOUNTS_FILE_PATH = path.join(__dirname, 'data', 'accounts.json');
        if (!fs.existsSync(ACCOUNTS_FILE_PATH)) {
            console.log('No accounts found.');
        } else {
            const data = fs.readFileSync(ACCOUNTS_FILE_PATH, 'utf8');
            const accounts = JSON.parse(data);
            console.log('\n--- Accounts ---');
            if (accounts && typeof accounts === 'object' && !Array.isArray(accounts)) {
                Object.values(accounts).forEach((entry, i) => {
                    console.log(`${i + 1}. Username: ${entry.username}, Name: ${entry.name}, Email: ${entry.email}, Time: ${entry.timestamp}`);
                });
            } else if (Array.isArray(accounts)) {
                accounts.forEach((entry, i) => {
                    console.log(`${i + 1}. Username: ${entry.username}, Name: ${entry.name}, Email: ${entry.email}, Time: ${entry.timestamp}`);
                });
            } else {
                console.log(accounts);
            }
            console.log('--------------------------\n');
        }
    } catch (e) {
        console.log('Error reading accounts:', e.message);
    }
}

async function verifyUserPrompt() {
    const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl2.question('Enter username to verify: ', (username) => {
        rl2.question('Enter verification code: ', (code) => {
            // Call verifyAccount endpoint
            const axios = require('axios');
            axios.post('http://localhost:' + PORT + '/verify-account', { username, code })
                .then(res => {
                    console.log('Verification result:', res.data);
                    rl2.close();
                })
                .catch(err => {
                    console.log('Error verifying user:', err.message);
                    rl2.close();
                });
        });
    });
}

function startMenu() {
    printMenu(lastMenuTab);
    rl.on('line', (input) => {
        switch (input.trim()) {
            case '1': setTrafficMode('all'); break;
            case '2': setTrafficMode('analytics'); break;
            case '3': setTrafficMode('newsletter'); break;
            case '4': setTrafficMode('cookie-signup'); break;
            case '5': setTrafficMode('cookie-cloud'); break;
            case '6': setTrafficMode('shortener'); break;
            case '7':
                lastMenuTab = 'newsletter-signups';
                showNewsletterSignups();
                break;
            case '9':
                lastMenuTab = 'accounts';
                showAccounts();
                break;
            case '8':
                lastMenuTab = 'verify-user';
                verifyUserPrompt();
                break;
            case '0': setTrafficMode(null); break;
            case 'q': rl.close(); return;
            default: console.log('Invalid option.');
        }
        printMenu(lastMenuTab);
    });
}

// --- Auto-delete unverified accounts older than 72 hours ---
setInterval(() => {
    const ACCOUNTS_FILE_PATH = path.join(__dirname, 'data', 'accounts.json');
    if (!fs.existsSync(ACCOUNTS_FILE_PATH)) return;
    let changed = false;
    try {
        const data = fs.readFileSync(ACCOUNTS_FILE_PATH, 'utf8');
        let accounts = JSON.parse(data);
        const now = Date.now();
        for (const [username, acc] of Object.entries(accounts)) {
            if (!acc.verified && acc.timestamp) {
                const created = new Date(acc.timestamp).getTime();
                if (now - created > 72 * 60 * 60 * 1000) {
                    delete accounts[username];
                    changed = true;
                    console.log(`[Auto-Delete] Removed unverified account: ${username}`);
                }
            }
        }
        if (changed) {
            fs.writeFileSync(ACCOUNTS_FILE_PATH, JSON.stringify(accounts, null, 2));
        }
    } catch (e) {
        console.log('Error in auto-delete unverified accounts:', e.message);
    }
}, 60 * 60 * 1000); // Run every hour

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

// --- Add new cookie-related endpoints ---
app.get('/cookie-profile', (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'Missing username' });
    
    let profiles = {};
    const profilesPath = path.join(DATA_DIR, 'profiles.json');
    
    if (fs.existsSync(profilesPath)) {
        try {
            profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
        } catch (e) { /* ignore error */ }
    }
    
    res.json(profiles[username] || { name: username });
});

app.get('/cookie-role', (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'Missing username' });
    
    let roles = {};
    const rolesPath = path.join(DATA_DIR, 'roles.json');
    
    if (fs.existsSync(rolesPath)) {
        try {
            roles = JSON.parse(fs.readFileSync(rolesPath, 'utf8'));
        } catch (e) { /* ignore error */ }
    }
    
    res.json(roles[username] || { role: 'Active user' });
});

app.post('/cookie-verify', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Missing username or password' });
    }

    let users = {};
    const usersPath = path.join(DATA_DIR, 'users.json');

    if (fs.existsSync(usersPath)) {
        try {
            users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
        } catch (e) { /* ignore error */ }
    }

    const user = users[username];
    if (!user || user.password !== password) {
        return res.json({ valid: false, error: 'Invalid credentials' });
    }

    if (user.banned) {
        return res.json({ valid: false, error: 'Account is banned.' });
    }

    res.json({ valid: true });
});
