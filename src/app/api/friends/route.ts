import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentDbUser } from "@/lib/current-user";

export async function GET() {
  const currentUser = await getCurrentDbUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [friendshipsA, friendshipsB, incomingRequests, outgoingRequests] =
    await Promise.all([
      prisma.friendship.findMany({
        where: { userAId: currentUser.id },
        include: {
          userB: {
            select: {
              id: true,
              displayName: true,
              email: true,
              image: true,
            },
          },
        },
      }),

      prisma.friendship.findMany({
        where: { userBId: currentUser.id },
        include: {
          userA: {
            select: {
              id: true,
              displayName: true,
              email: true,
              image: true,
            },
          },
        },
      }),

      prisma.friendRequest.findMany({
        where: {
          receiverId: currentUser.id,
          status: "PENDING",
        },
        include: {
          sender: {
            select: {
              id: true,
              displayName: true,
              email: true,
              image: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),

      prisma.friendRequest.findMany({
        where: {
          senderId: currentUser.id,
          status: "PENDING",
        },
        include: {
          receiver: {
            select: {
              id: true,
              displayName: true,
              email: true,
              image: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  type FriendshipWithUserB = (typeof friendshipsA)[number];
  type FriendshipWithUserA = (typeof friendshipsB)[number];

  const friends = [
    ...friendshipsA.map((friendship: FriendshipWithUserB) => friendship.userB),
    ...friendshipsB.map((friendship: FriendshipWithUserA) => friendship.userA),
  ];

  return NextResponse.json({
    friends,
    incomingRequests,
    outgoingRequests,
  });
}