-- CreateTable
CREATE TABLE "ArtistSimilarCache" (
    "id" TEXT NOT NULL,
    "spotifyArtistId" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "similars" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtistSimilarCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArtistSimilarCache_spotifyArtistId_key" ON "ArtistSimilarCache"("spotifyArtistId");
