import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const purchase = await prisma.purchase.findUnique({
    where: { id: params.id },
    include: {
      beat: { select: { title: true } },
      release: { select: { title: true } },
    },
  });
  if (!purchase) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(purchase);
}
