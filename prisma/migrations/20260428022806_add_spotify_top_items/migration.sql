-- CreateTable
CREATE TABLE "TopArtist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spotifyArtistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "genres" TEXT[],
    "popularity" INTEGER,
    "rank" INTEGER NOT NULL,
    "timeRange" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopArtist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopTrack" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spotifyTrackId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "artistNames" TEXT[],
    "albumName" TEXT,
    "image" TEXT,
    "popularity" INTEGER,
    "rank" INTEGER NOT NULL,
    "timeRange" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopTrack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TopArtist_userId_spotifyArtistId_timeRange_key" ON "TopArtist"("userId", "spotifyArtistId", "timeRange");

-- CreateIndex
CREATE UNIQUE INDEX "TopTrack_userId_spotifyTrackId_timeRange_key" ON "TopTrack"("userId", "spotifyTrackId", "timeRange");

-- AddForeignKey
ALTER TABLE "TopArtist" ADD CONSTRAINT "TopArtist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopTrack" ADD CONSTRAINT "TopTrack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
