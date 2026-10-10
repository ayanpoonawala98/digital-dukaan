import './load-env.js';
import 'pg';
import 'pg-hstore';
import { Sequelize } from 'sequelize';

const useSsl = process.env.DATABASE_SSL !== 'false';

export const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: false,
  dialectOptions: useSsl ? { ssl: { require: true, rejectUnauthorized: false } } : {},
  pool: { max: 3, min: 0, idle: 5000 },
  define: { underscored: false }
});
