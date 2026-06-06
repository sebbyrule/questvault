import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getTicketDetail,
  getProjectMembers,
  getProjectLabels,
  getProjectSprints,
  getCurrentUser,
} from "@/lib/queries";
import { TicketDetail } from "@/components/ticket-detail";

export const metadata: Metadata = { title: "Ticket" };
export const dynamic = "force-dynamic";

export default async function TicketDetailPage({
  params,
}: {
  params: { ticketId: string };
}) {
  const ticket = await getTicketDetail(params.ticketId);
  if (!ticket) notFound();

  const [members, projectLabels, sprints, currentUser] = await Promise.all([
    getProjectMembers(ticket.projectId),
    getProjectLabels(ticket.projectId),
    getProjectSprints(ticket.projectId),
    getCurrentUser(),
  ]);

  return (
    <TicketDetail
      ticket={ticket}
      members={members}
      projectLabels={projectLabels}
      sprints={sprints}
      currentUser={currentUser}
    />
  );
}
