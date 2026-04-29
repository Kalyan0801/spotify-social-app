import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentDbUser } from "@/lib/current-user";
import type { Prisma } from "@prisma/client";

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
  const requestId = body.requestId as string | undefined;
  const action = body.action as "accept" | "reject" | undefined;

  if (!requestId || !action) {
    return NextResponse.json(
      { error: "Missing requestId or action" },
      { status: 400 }
    );
  }

  if (!["accept", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const friendRequest = await prisma.friendRequest.findUnique({
    where: { id: requestId },
  });

  if (!friendRequest) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  if (friendRequest.receiverId !== currentUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (friendRequest.status !== "PENDING") {
    return NextResponse.json(
      { error: "Request already handled" },
      { status: 409 }
    );
  }

  if (action === "reject") {
    const updated = await prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: "REJECTED" },
    });

    return NextResponse.json({ friendRequest: updated });
  }

  const pair = orderedPair(friendRequest.senderId, friendRequest.receiverId);

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const friendship = await tx.friendship.upsert({
      where: {
        userAId_userBId: pair,
      },
      update: {},
      create: pair,
    });

    const updatedRequest = await tx.friendRequest.update({
      where: { id: requestId },
      data: { status: "ACCEPTED" },
    });

    return { friendship, friendRequest: updatedRequest };
  });

  return NextResponse.json(result);
}