import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser } from '@whiskeysockets/baileys';
import { upload } from './mega.js';

const router = express.Router();

// Ensure the session directory exists
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
    } catch (e) {
        console.error('Error removing file:', e);
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    let dirs = './' + (num || `session`);
    
    // Remove existing session if present
    await removeFile(dirs);
    
    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            let GlobalTechInc = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: ["Ubuntu", "Chrome", "20.0.04"],
            });

            if (!GlobalTechInc.authState.creds.registered) {
                await delay(2000);
                num = num.replace(/[^0-9]/g, '');
                const code = await GlobalTechInc.requestPairingCode(num);
                if (!res.headersSent) {
                    console.log({ num, code });
                    await res.send({ code });
                }
            }

            GlobalTechInc.ev.on('creds.update', saveCreds);
            GlobalTechInc.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    await delay(10000);
                    const sessionGlobal = fs.readFileSync(dirs + '/creds.json');

                    // Helper to generate a random Mega file ID
                    function generateRandomId(length = 6, numberLength = 4) {
                        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                        let result = '';
                        for (let i = 0; i < length; i++) {
                            result += characters.charAt(Math.floor(Math.random() * characters.length));
                        }
                        const number = Math.floor(Math.random() * Math.pow(10, numberLength));
                        return `${result}${number}`;
                    }

                    // Upload session file to Mega
                    const megaUrl = await upload(fs.createReadStream(`${dirs}/creds.json`), `${generateRandomId()}.json`);
                    let stringSession = megaUrl.replace('https://mega.nz/file/', ''); // Extract session ID from URL
                    stringSession = 'KERM-MD-V1~' + stringSession;  // Prepend your name to the session ID

                    // Send the session ID to the target number
                    const userJid = jidNormalizedUser(num + '@s.whatsapp.net');
                    await GlobalTechInc.sendMessage(userJid, { text: stringSession });

                    // Send confirmation message
                    await GlobalTechInc.sendMessage(userJid, { text: '🎉 *Welcome to KERM-MD-V1!* 🚀\n\n🔒 *Your Session ID* is ready!  ⚠️ _Keep it private and secure — dont share it with anyone._\n\n🔑 *Copy & Paste the SESSION_ID Above*🛠️ Add it to your environment variable: *SESSION_ID*.\n\n💡 *Whats Next?*\n1️⃣ Explore all the cool features of Kerm MD V1.\n2️⃣ Stay updated with our latest releases and support.\n3️⃣ Enjoy seamless WhatsApp automation! 🤖\n🔗 *Join Our Support Channel:* 👉\n[Click Here to Join](https://whatsapp.com/channel/0029Vafn6hc7DAX3fzsKtn45)\n⭐ *Show Some Love!* Give us a ⭐ on GitHub and support the development: 👉 [KERM-MD-V1 GitHub Repo](https://github.com/Kgtech-cmr/)\n🚀 _Thanks for choosing KERM-MD-V1 — Let the automation begin!_ ✨'});
                    
                    //  Clean up session after use
                    await delay(100);
                    removeFile(dirs);
                    return res.end(0);
                } else if (connection === 'close' && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
                    console.log('Connection closed unexpectedly:', lastDisconnect.error);
                    await delay(10000);
                    initiateSession(); // Retry session initiation if needed
                }
            });
        } catch (err) {
            console.error('Error initializing session:', err);
            if (!res.headersSent) {
                res.status(503).send({ code: 'Service Unavailable' });
            }
        }
    }

    await initiateSession();
});

// Global uncaught exception handler
process.on('uncaughtException', (err) => {
    console.log('Caught exception: ' + err);
});

export default router;