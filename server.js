// server.js
import express from 'express';
import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const serviceAccount = require('./services/serviceAccountKey.json');
import * as deckService from './deckService.js';
import { auth } from './auth.js';  // middleware de autenticação

// Inicializa Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
app.use(express.json());

// Rota pública de login — recebe email/senha e retorna um ID Token
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
  }
  try {
    // Faz a chamada REST ao Identity Toolkit para verificar credenciais
    const apiKey = 'AIzaSyDhVyOHZWAKBvDVE1B5IHHECoYZLIyQs78'; // sua Web API Key
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true })
      }
    );
    const data = await response.json();
    if (!response.ok) {
      return res.status(401).json({ error: data.error.message || 'Autenticação falhou.' });
    }
    // devolve o ID Token para o cliente usar nas próximas requisições
    res.json({ idToken: data.idToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// A partir daqui, todas as rotas ficam protegidas
app.use(auth);

// Health Check (protegido agora)
app.get('/', (req, res) => res.send('API RESTful de Decks e Cards rodando'));

// --- ROTAS CRUD para Decks ---
app.get('/decks', async (req, res) => {
  try {
    const ids = await deckService.listarDecks();
    const decks = await Promise.all(
      ids.map(async id => {
        const doc = await deckService.getDeckRaw(id);
        const data = doc.data() || {};
        return { id, name: data.name || null, description: data.description || null };
      })
    );
    res.json(decks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/decks', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'O campo "name" é obrigatório.' });
    const deckId = name.trim();
    await deckService.createDeckSkeleton(deckId);
    if (description) await deckService.updateDeckRaw(deckId, { description });
    res.status(201).json({ deckId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/decks/:deckId', async (req, res) => {
  try {
    const { deckId } = req.params;
    const doc = await deckService.getDeckRaw(deckId);
    if (!doc.exists) return res.status(404).json({ error: 'Deck não encontrado.' });
    const data = doc.data();
    res.json({ id: deckId, name: data.name || null, description: data.description || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.put('/decks/:deckId', async (req, res) => {
  try {
    const { deckId } = req.params;
    const { name, description } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (description) updates.description = description;
    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'Envie ao menos "name" ou "description".' });
    }
    await deckService.updateDeckRaw(deckId, updates);
    res.json({ message: 'Deck atualizado.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete('/decks/:deckId', async (req, res) => {
  try {
    const { deckId } = req.params;
    await deckService.deleteDeckRaw(deckId);
    res.json({ message: 'Deck excluído com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ROTAS PARA CARDS ---
app.get('/decks/:deckId/cards', async (req, res) => {
  try {
    const { deckId } = req.params;
    const { section, group } = req.query;
    if (!section) return res.status(400).json({ error: 'Query param "section" é obrigatório.' });
    let cards;
    if (section === 'Main Deck') {
      if (!group) return res.status(400).json({ error: 'Query param "group" é obrigatório para Main Deck.' });
      cards = await deckService.listCards(deckId, section, group);
    } else if (section === 'Extra Deck') {
      cards = await deckService.listCards(deckId, section);
    } else {
      return res.status(400).json({ error: 'Section inválido. Use "Main Deck" ou "Extra Deck".' });
    }
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/decks/:deckId/cards/:cardId', async (req, res) => {
  try {
    const { deckId, cardId } = req.params;
    const { section, group } = req.query;
    if (!section) return res.status(400).json({ error: 'Query param "section" é obrigatório.' });
    if (section === 'Main Deck' && !group) {
      return res.status(400).json({ error: 'Query param "group" é obrigatório para Main Deck.' });
    }
    const docSnap = await deckService.getCard(deckId, section, cardId, group);
    if (!docSnap.exists) return res.status(404).json({ error: 'Card não encontrado.' });
    res.json({ id: cardId, ...docSnap.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/decks/:deckId/cards', async (req, res) => {
  try {
    const { deckId } = req.params;
    const { section, cardId, attrs, group } = req.body;
    if (!section || !cardId || !attrs) {
      return res.status(400).json({ error: 'Envie "section", "cardId" e "attrs".' });
    }
    if (section === 'Main Deck' && !group) {
      return res.status(400).json({ error: 'Para Main Deck, "group" é obrigatório.' });
    }
    await deckService.upsertCard(deckId, section, cardId, attrs, group);
    res.json({ message: 'Card criado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.put('/decks/:deckId/cards/:cardId', async (req, res) => {
  try {
    const { deckId, cardId } = req.params;
    const { section, attrs, group } = req.body;
    if (!section || !attrs) {
      return res.status(400).json({ error: 'Envie "section" e "attrs".' });
    }
    if (section === 'Main Deck' && !group) {
      return res.status(400).json({ error: 'Para Main Deck, "group" é obrigatório.' });
    }
    await deckService.upsertCard(deckId, section, cardId, attrs, group);
    res.json({ message: 'Card atualizado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete('/decks/:deckId/cards/:cardId', async (req, res) => {
  try {
    const { deckId, cardId } = req.params;
    const { section, group } = req.query;
    if (!section) return res.status(400).json({ error: 'Query param "section" é obrigatório.' });
    if (section === 'Main Deck' && !group) return res.status(400).json({ error: 'Query param "group" é obrigatório para Main Deck.' });
    await deckService.removeCard(deckId, section, cardId, group);
    res.json({ message: 'Card excluído com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Inicia servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API ouvindo na porta ${PORT}`));
