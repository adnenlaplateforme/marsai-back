import dotenv from 'dotenv';

// Charge l'environnement de test (base dédiée + secrets de test).
// override: true → .env.test fait autorité, même si des variables sont déjà
// présentes dans le shell.
dotenv.config({ path: '.env.test', override: true });

// Filets de sécurité si .env.test est absent (ex: CI sans le fichier local).
process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-secret';
