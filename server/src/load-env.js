// Loads the repo-root .env before anything reads process.env. ES module imports run before the importing file's own code,
// so db.js imports this first; otherwise DATABASE_URL is still undefined when Sequelize is created.
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') });
