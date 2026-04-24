// Initial test to check if the database is connected

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const userCount = await prisma.user.count();

        return NextResponse.json({
            ok: true,
            message: "Database connected successfully",
            userCount,
        });
    } catch (error) {
        console.error("DB connection error:", error);

        return NextResponse.json(
            {
            ok: false,
            message: "Database connection failed",
            },
            { status: 500 }
        );
    }
}