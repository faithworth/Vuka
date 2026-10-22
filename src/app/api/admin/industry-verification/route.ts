export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
export async function POST(req: NextRequest) {
 const admin = await requireAdmin();
 if (!admin) return NextResponse.json({error:'Unauthorized'},{status:401});
 try {
  const body = await req.json();
  const id = String(body.industryUserId || '');
  const status = String(body.status || '');
  const notes = String(body.notes || '').trim();
  if (!id || !['approved','rejected','pending'].includes(status)) return NextResponse.json({error:'industryUserId and valid status required'},{status:400});
  const profile = await prisma.industryUser.findUnique({where:{id}});
  if (!profile) return NextResponse.json({error:'Industry profile not found'},{status:404});
  const updated = await prisma.industryUser.update({where:{id},data:{verified:status==='approved',verificationStatus:status,verificationNotes:notes},select:{id:true,userId:true,verified:true,verificationStatus:true,verificationNotes:true}});
  await auditLog.adminAction('industry.verification_reviewed','IndustryUser',id,admin.id,`status=${status} ${notes}`);
  return NextResponse.json({ok:true,profile:updated});
 } catch(e) { console.error('[admin/industry-verification]',e); return NextResponse.json({error:'Could not update Industry verification.'},{status:500}); }
}