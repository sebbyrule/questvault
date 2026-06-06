-- Runs once on first docker-compose up.
-- Creates the test database and enables the pgvector extension on both.

CREATE DATABASE questvault_test
  WITH OWNER questvault
  ENCODING 'UTF8';

\connect questvault_dev
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

\connect questvault_test
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
