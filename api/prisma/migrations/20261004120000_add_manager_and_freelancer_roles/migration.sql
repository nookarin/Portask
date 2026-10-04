-- AlterEnum
-- Both values are appended in a single migration, which needs PostgreSQL 12 or newer.
-- On 11 and earlier this has to be split into one migration per value; the project
-- targets 16 (see .github/workflows/ci.yml and docker-compose.prod.yml).
ALTER TYPE "Role" ADD VALUE 'MANAGER';
ALTER TYPE "Role" ADD VALUE 'FREELANCER';