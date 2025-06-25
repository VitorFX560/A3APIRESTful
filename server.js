// server.js
import express from 'express';
import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const serviceAccount = require('./services/serviceAccountKey.json');
import * as deckService from './deckService.js';

// Inicializa Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
app.use(express.json());

// --- ROTAS CRUD para Decks ---

// GET /decks - Lista todos os decks com id, name e description
app.get('/decks', async (req, res) => {
  try {
    const ids = await deckService.listarDecks();
    const decks = await Promise.all(
      ids.map(async (id) => {
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

// POST /decks - Cria um novo deck com name e description
app.post('/decks', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'O campo "name" é obrigatório.' });
    const deckId = name.trim();
    await deckService.createDeckSkeleton(deckId);
    if (description) {
      await deckService.updateDeckRaw(deckId, { description });
    }
    res.status(201).json({ deckId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /decks/:deckId - Lê name e description de um deck
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

// PUT /decks/:deckId - Atualiza name e/ou description do deck
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

// DELETE /decks/:deckId - Deleta o deck inteiro
app.delete('/decks/:deckId', async (req, res) => {
  try {
    const { deckId } = req.params;
    await deckService.deleteDeckRaw(deckId);
    res.json({ message: 'Deck excluído com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ROTAS para Cards ---

// GET /decks/:deckId/cards?section=...&group=...
app.get('/decks/:deckId/cards', async (req, res) => {
  try {
    const { deckId } = req.params;
    const { section, group } = req.query;
    if (!section) {
      return res.status(400).json({ error: 'Query param "section" é obrigatório.' });
    }
    let cards;
    if (section === 'Main Deck') {
      if (!group) {
        return res.status(400).json({ error: 'Query param "group" é obrigatório para Main Deck.' });
      }
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

// POST /decks/:deckId/cards - Cria um card
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

// PUT /decks/:deckId/cards/:cardId - Atualiza um card
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

// DELETE /decks/:deckId/cards/:cardId?section=...&group=...
app.delete('/decks/:deckId/cards/:cardId', async (req, res) => {
  try {
    const { deckId, cardId } = req.params;
    const { section, group } = req.query;
    if (!section) {
      return res.status(400).json({ error: 'Query param "section" é obrigatório.' });
    }
    if (section === 'Main Deck' && !group) {
      return res.status(400).json({ error: 'Query param "group" é obrigatório para Main Deck.' });
    }
    await deckService.removeCard(deckId, section, cardId, group);
    res.json({ message: 'Card excluído com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health Check
app.get('/', (req, res) => {
  res.send('API RESTful de Decks e Cards rodando');
});

// Inicia servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API ouvindo na porta ${PORT}`));
