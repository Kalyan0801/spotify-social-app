import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function getCurrentDbUser() {
  const session = await auth();

  if (!session?.spotifyUserId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      spotifyUserId: session.spotifyUserId,
    },
  });

  return user;
}