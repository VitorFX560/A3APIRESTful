// deckService.js
import admin from 'firebase-admin';

// Função para obter instância do Firestore após init
function getDb() {
  return admin.firestore();
}

/**
 * Lista todos os IDs de decks.
 */
export async function listarDecks() {
  const snapshot = await getDb().collection('Decks').get();
  return snapshot.docs.map(doc => doc.id);
}

/**
 * Retorna o DocumentSnapshot de um deck.
 */
export function getDeckRaw(deckId) {
  return getDb().doc(`Decks/${deckId}`).get();
}

/**
 * Cria o esqueleto do deck: Main Deck com grupos e Cards, e Extra Deck.
 */
export async function createDeckSkeleton(deckId) {
  const db = getDb();
  const deckRef = db.doc(`Decks/${deckId}`);
  await deckRef.set({ name: deckId });

  const mainGroups = ['Monstros', 'Magias', 'Armadilhas'];
  for (const group of mainGroups) {
    const groupRef = deckRef.collection('Main Deck').doc(group);
    await groupRef.set({});
    await groupRef.collection('Cards').doc('_init').set({});
    await groupRef.collection('Cards').doc('_init').delete();
  }

  const extraRef = deckRef.collection('Extra Deck');
  await extraRef.doc('_init').set({});
  await extraRef.doc('_init').delete();
}

/**
 * Atualiza campos de um deck.
 */
export function updateDeckRaw(deckId, data) {
  return getDb().doc(`Decks/${deckId}`).update(data);
}

/**
 * Deleta um deck inteiro.
 */
export function deleteDeckRaw(deckId) {
  return getDb().recursiveDelete(getDb().doc(`Decks/${deckId}`));
}

/**
 * Lista cards de um deck por seção/categoria.
 */
export async function listCards(deckId, section, group) {
  const db = getDb();
  let collRef;

  if (section === 'Main Deck') {
    collRef = db
      .collection('Decks').doc(deckId)
      .collection('Main Deck').doc(group)
      .collection('Cards');
  } else {
    collRef = db.collection(`Decks/${deckId}/Extra Deck`);
  }

  const snap = await collRef.get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Cria ou atualiza um card no deck.
 */
export function upsertCard(deckId, section, cardId, attrs, group) {
  const db = getDb();
  let docRef;

  if (section === 'Main Deck') {
    docRef = db
      .collection('Decks').doc(deckId)
      .collection('Main Deck').doc(group)
      .collection('Cards').doc(cardId);
  } else {
    docRef = db.doc(`Decks/${deckId}/Extra Deck/${cardId}`);
  }

  return docRef.set(attrs);
}

/**
 * Remove um card de um deck.
 */
export function removeCard(deckId, section, cardId, group) {
  const db = getDb();
  let docRef;

  if (section === 'Main Deck') {
    docRef = db
      .collection('Decks').doc(deckId)
      .collection('Main Deck').doc(group)
      .collection('Cards').doc(cardId);
  } else {
    docRef = db.doc(`Decks/${deckId}/Extra Deck/${cardId}`);
  }

  return docRef.delete();
}

/**
 * Retorna um DocumentSnapshot de um card específico.
 */
export async function getCard(deckId, section, cardId, group) {
  const db = getDb();
  let docRef;

  if (section === 'Main Deck') {
    docRef = db
      .collection('Decks').doc(deckId)
      .collection('Main Deck').doc(group)
      .collection('Cards').doc(cardId);
  } else {
    docRef = db.doc(`Decks/${deckId}/Extra Deck/${cardId}`);
  }

  return docRef.get();
}
