-- CreateTable
CREATE TABLE "GemRecommendationCache" (
    "id" TEXT NOT NULL,
    "viewerUserId" TEXT NOT NULL,
    "friendUserId" TEXT NOT NULL,
    "spotifyArtistId" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "recommendations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GemRecommendationCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GemRecommendationCache_viewerUserId_friendUserId_idx" ON "GemRecommendationCache"("viewerUserId", "friendUserId");

-- CreateIndex
CREATE UNIQUE INDEX "GemRecommendationCache_viewerUserId_friendUserId_spotifyArtistId_key" ON "GemRecommendationCache"("viewerUserId", "friendUserId", "spotifyArtistId");
