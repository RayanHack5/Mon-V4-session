import express from 'express';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser } from '@whiskeysockets/baileys';
import { upload } from './mega.js'; // Assure-toi que le chemin est correct

const router = express.Router();

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
    let dirs = '/tmp/' + (num || 'session');

    removeFile(dirs);

    const { state, saveCreds } = await useMultiFileAuthState(dirs);

    try {
        let GlobalTechInc = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: Browsers.ubuntu("Chrome"),
        });

        if (!GlobalTechInc.authState.creds.registered) {
            await delay(2000);
            num = num.replace(/[^0-9]/g, '');
            const code = await GlobalTechInc.requestPairingCode(num);
            if (!res.headersSent) {
                return res.send({ code });
            }
        }

        GlobalTechInc.ev.on('creds.update', saveCreds);

        GlobalTechInc.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
            if (connection === "open") {
                await delay(10000);
                const sessionPath = path.join(dirs, 'creds.json');

                const megaUrl = await upload(fs.createReadStream(sessionPath), `session-${Date.now()}.json`);
                let stringSession = 'KERM-MD-V1~' + megaUrl.replace('https://mega.nz/file/', '');

                const userJid = jidNormalizedUser(num + '@s.whatsapp.net');
                await GlobalTechInc.sendMessage(userJid, { text: stringSession });

                await GlobalTechInc.sendMessage(userJid, { text: '🎉 *Welcome to KERM-MD-V1!* 🚀\n\n🔒 *Your Session ID* is ready!  ⚠️ _Keep it private and secure — dont share it with anyone._\n\n🔑 *Copy & Paste the SESSION_ID Above*🛠️ Add it to your environment variable: *SESSION_ID*.\n\n💡 *Whats Next?*\n1️⃣ Explore all the cool features of Kerm MD V1.\n2️⃣ Stay updated with our latest releases and support.\n3️⃣ Enjoy seamless WhatsApp automation! 🤖\n🔗 *Join Our Support Channel:* 👉\n[Click Here to Join](https://whatsapp.com/channel/0029Vafn6hc7DAX3fzsKtn45)\n⭐ *Show Some Love!* Give us a ⭐ on GitHub and support the development: 👉 [KERM-MD-V1 GitHub Repo](https://github.com/Kgtech-cmr/)\n🚀 _Thanks for choosing KERM-MD-V1 — Let the automation begin!_ ✨' }); // etc.

                removeFile(dirs);
                return res.end(); // NE PAS utiliser process.exit
            } else if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
                console.log('Reconnexion...');
                await delay(10000);
            }
        });
    } catch (err) {
        console.error('Erreur session :', err);
        if (!res.headersSent) {
            res.status(503).send({ code: 'Service Unavailable' });
        }
    }
});

export default router;