-- CreateTable
CREATE TABLE "ArtistTopTracksCache" (
    "id" TEXT NOT NULL,
    "spotifyArtistId" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "tracks" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtistTopTracksCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArtistTopTracksCache_spotifyArtistId_key" ON "ArtistTopTracksCache"("spotifyArtistId");
