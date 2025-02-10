-- AlterTable
ALTER TABLE "Stream" ALTER COLUMN "active" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "role" DROP NOT NULL;
