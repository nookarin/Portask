import { prisma } from "../db.js";

export async function logActivity(
  userId: string,
  projectId: string,
  action: string,
  detail?: string
) {
  await prisma.activityLog.create({ data: { userId, projectId, action, detail } });
}

export async function notify(userId: string, message: string) {
  await prisma.notification.create({ data: { userId, message } });
}