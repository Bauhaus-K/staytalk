-- Runs once on first container start.
CREATE DATABASE staytalk_test OWNER staytalk;

\connect staytalk
CREATE EXTENSION IF NOT EXISTS pg_trgm;

\connect staytalk_test
CREATE EXTENSION IF NOT EXISTS pg_trgm;
