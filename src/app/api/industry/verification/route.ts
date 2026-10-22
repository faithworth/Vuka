export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
export async function POST(req: NextRequest) {
 try {
  const user = await getServerUser();
  if (!user || user.role !== 'industry') return NextResponse.json({error:'Unauthorized'},{status:401});
  const profile = await prisma.industryUser.findUnique({where:{userId:user.id}});
  if (!profile) return NextResponse.json({error:'Industry profile not found'},{status:404});
  const body = await req.json().catch(()=>({}));
  const companyName = String(body.companyName ?? profile.companyName ?? '').trim();
  const role = String(body.role ?? profile.role ?? '').trim();
  const website = String(body.website ?? profile.website ?? '').trim();
  if (companyName.length < 2 || role.length < 2) return NextResponse.json({error:'Add your company name and professional role before requesting verification.'},{status:400});
  const updated = await prisma.industryUser.update({where:{id:profile.id},data:{companyName,role,website,verificationStatus:'pending',verificationSubmittedAt:new Date(),verificationNotes:''},select:{verificationStatus:true,verificationSubmittedAt:true}});
  return NextResponse.json({ok:true,...updated});
 } catch (e) { console.error('[industry/verification]',e); return NextResponse.json({error:'Could not submit verification request.'},{status:500}); }
}