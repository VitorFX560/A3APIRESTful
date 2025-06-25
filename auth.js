// auth.js
import admin from 'firebase-admin';

/**
 * Middleware que verifica o Firebase ID Token no cabeçalho
 * Authorization: Bearer <ID_TOKEN>
 */
export async function auth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  const idToken = match[1];
  try {
    // valida o token junto ao Firebase Auth
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.uid = decoded.uid;  // opcional: disponibiliza o UID do usuário
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido.' });
  }
}
