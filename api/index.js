import express from 'express';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import path from 'path';
import code from '../pair.js'; // modifié en fonction de ton arborescence

const app = express();

// Résolution des chemins
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use('/code', code);
app.use('/pair', (req, res) => {
  res.sendFile(path.join(__dirname, '../pair.html'));
});
app.use('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../main.html'));
});

// Vercel : export handler (pas de app.listen)
export default app;