import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminApi, requireAuth } from "@/lib/auth/requireAuth";
import { parseDiagnostic, STATUSES } from "@/lib/admin/types";
import { findPossibleDuplicates } from "@/lib/admin/duplicates";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAuth();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const diagnostic = await prisma.diagnostic.findUnique({
    where: { id },
    include: {
      notes: { orderBy: { createdAt: "desc" } },
      activityEvents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!diagnostic) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const duplicates = await findPossibleDuplicates(id);

  return NextResponse.json({ diagnostic: parseDiagnostic(diagnostic), duplicates });
}

const patchSchema = z.object({
  status: z.enum(STATUSES).optional(),
  reviewedEstimateMin: z.number().int().min(0).max(100_000).nullable().optional(),
  reviewedEstimateMax: z.number().int().min(0).max(100_000).nullable().optional(),
  finalProposalAmount: z.number().int().min(0).max(100_000).nullable().optional(),
  finalProposalNote: z.string().max(500).nullable().optional(),
  finalImplementationFee: z.number().int().min(0).max(100_000).nullable().optional(),
  // Never a client-sent timestamp — always "now", server-side, and only
  // ever set here. Gates GET-ability of /proposal/[token].
  sendProposal: z.literal(true).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAuth();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid update." }, { status: 400 });

  if (parsed.data.sendProposal) {
    const existing = await prisma.diagnostic.findUnique({ where: { id }, select: { finalProposalAmount: true, contextToken: true } });
    const amountAfterThisPatch = parsed.data.finalProposalAmount ?? existing?.finalProposalAmount;
    if (amountAfterThisPatch == null) {
      return NextResponse.json({ error: "Set a final proposal amount before sending." }, { status: 400 });
    }
    if (!existing?.contextToken) {
      return NextResponse.json(
        { error: "This diagnostic has no context token (submitted before that feature existed) — can't generate a shareable link." },
        { status: 400 }
      );
    }
  }

  const activityLabels: string[] = [];
  if (parsed.data.status) activityLabels.push(`Status → ${parsed.data.status}`);
  if (parsed.data.reviewedEstimateMin !== undefined || parsed.data.reviewedEstimateMax !== undefined) {
    activityLabels.push("Reviewed estimate updated");
  }
  if (parsed.data.finalProposalAmount !== undefined || parsed.data.finalImplementationFee !== undefined) {
    activityLabels.push("Final proposal recorded");
  }
  if (parsed.data.sendProposal) activityLabels.push("Proposal sent to client");

  const diagnostic = await prisma.diagnostic.update({
    where: { id },
    data: {
      ...(parsed.data.status && { status: parsed.data.status, statusUpdatedAt: new Date() }),
      ...(parsed.data.reviewedEstimateMin !== undefined && { reviewedEstimateMin: parsed.data.reviewedEstimateMin }),
      ...(parsed.data.reviewedEstimateMax !== undefined && { reviewedEstimateMax: parsed.data.reviewedEstimateMax }),
      ...(parsed.data.finalProposalAmount !== undefined && { finalProposalAmount: parsed.data.finalProposalAmount }),
      ...(parsed.data.finalProposalNote !== undefined && { finalProposalNote: parsed.data.finalProposalNote }),
      ...(parsed.data.finalImplementationFee !== undefined && {
        finalImplementationFee: parsed.data.finalImplementationFee,
      }),
      ...(parsed.data.sendProposal && { proposalSentAt: new Date() }),
      ...(activityLabels.length > 0 && {
        activityEvents: { create: activityLabels.map((label) => ({ label })) },
      }),
    },
  });

  return NextResponse.json({ diagnostic: parseDiagnostic(diagnostic) });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // `requireAdminApi` rather than `requireAuth`: a deletion has to be
  // attributable, so the verified admin's id is needed, not merely the
  // fact that someone passed the gate.
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  /*
   * The audit row is written by a database trigger, not here — see
   * `20261004220000_diagnostic_deletion_audit` for why. What this has to
   * do is tell the trigger WHO is deleting, which it cannot otherwise
   * know.
   *
   * `set_config(..., true)` is transaction-local, so the setting lives
   * exactly as long as the delete it describes and cannot leak into the
   * next query on a pooled connection. Both statements run in one
   * transaction with the delete, so the audit row and the deletion commit
   * together or not at all.
   */
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('modus.actor_id', ${auth.userId}, true)`;
    await tx.$executeRaw`SELECT set_config('modus.delete_source', 'admin-api', true)`;
    await tx.diagnostic.delete({ where: { id } });
  });

  return NextResponse.json({ ok: true });
}
