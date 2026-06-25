import { prismaClient } from '@/app/lib/db';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const user = await prismaClient.user.findFirst({
    where: { email: session.user.email },
    select: { id: true, email: true },
  });

  if (!user) {
    return NextResponse.json({ message: 'User not found' }, { status: 404 });
  }

  return NextResponse.json(user);
}
