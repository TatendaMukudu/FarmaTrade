-- The four verticals the Objective layer needs to cover all of agricultural
-- commerce rather than only goods. Additive enum values, no data change:
-- PostCategory was designed for exactly this ("new verticals are future enum
-- values, not new subsystems").
ALTER TYPE "PostCategory" ADD VALUE 'LABOR';
ALTER TYPE "PostCategory" ADD VALUE 'STORAGE';
ALTER TYPE "PostCategory" ADD VALUE 'FINANCE';
ALTER TYPE "PostCategory" ADD VALUE 'SERVICES';
