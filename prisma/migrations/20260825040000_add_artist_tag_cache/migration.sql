-- CreateTable
CREATE TABLE "ArtistTagCache" (
    "id" TEXT NOT NULL,
    "spotifyArtistId" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtistTagCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArtistTagCache_spotifyArtistId_key" ON "ArtistTagCache"("spotifyArtistId");
