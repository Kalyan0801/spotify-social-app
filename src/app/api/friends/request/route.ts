import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentDbUser } from "@/lib/current-user";

function orderedPair(userId1: string, userId2: string) {
  return userId1 < userId2
    ? { userAId: userId1, userBId: userId2 }
    : { userAId: userId2, userBId: userId1 };
}

export async function POST(request: Request) {
  const currentUser = await getCurrentDbUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const receiverId = body.receiverId as string | undefined;

  if (!receiverId) {
    return NextResponse.json({ error: "Missing receiverId" }, { status: 400 });
  }

  if (receiverId === currentUser.id) {
    return NextResponse.json(
      { error: "You cannot add yourself" },
      { status: 400 }
    );
  }

  const receiver = await prisma.user.findUnique({
    where: { id: receiverId },
  });

  if (!receiver) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const pair = orderedPair(currentUser.id, receiverId);

  const existingFriendship = await prisma.friendship.findUnique({
    where: {
      userAId_userBId: pair,
    },
  });

  if (existingFriendship) {
    return NextResponse.json(
      { error: "You are already friends" },
      { status: 409 }
    );
  }

  const existingRequestEitherDirection = await prisma.friendRequest.findFirst({
    where: {
      status: "PENDING",
      OR: [
        {
          senderId: currentUser.id,
          receiverId,
        },
        {
          senderId: receiverId,
          receiverId: currentUser.id,
        },
      ],
    },
  });

  if (existingRequestEitherDirection) {
    return NextResponse.json(
      { error: "A pending friend request already exists" },
      { status: 409 }
    );
  }

  const friendRequest = await prisma.friendRequest.create({
    data: {
      senderId: currentUser.id,
      receiverId,
    },
  });

  return NextResponse.json({ friendRequest });
}