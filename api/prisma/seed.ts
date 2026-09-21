import { PrismaClient, Role, TaskStatus, Priority } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@portask.dev" },
    update: {},
    create: {
      email: "admin@portask.dev",
      passwordHash: await bcrypt.hash("admin123", 10),
      name: "Ari Admin",
      role: Role.ADMIN,
    },
  });

  const employee = await prisma.user.upsert({
    where: { email: "employee@portask.dev" },
    update: {},
    create: {
      email: "employee@portask.dev",
      passwordHash: await bcrypt.hash("employee123", 10),
      name: "Emma Employee",
      role: Role.EMPLOYEE,
    },
  });

  const company = await prisma.company.upsert({
    where: { name: "Acme Corp" },
    update: {},
    create: { name: "Acme Corp" },
  });

  const client = await prisma.user.upsert({
    where: { email: "client@portask.dev" },
    update: { companyId: company.id },
    create: {
      email: "client@portask.dev",
      passwordHash: await bcrypt.hash("client123", 10),
      name: "Cara Client",
      role: Role.CLIENT,
      companyId: company.id,
    },
  });

  const project = await prisma.project.upsert({
    where: { id: "seed-project-1" },
    update: {},
    create: {
      id: "seed-project-1",
      name: "Website Redesign",
      description: "Full redesign of the Acme marketing site.",
      companyId: company.id,
      progress: 40,
      startDate: new Date(),
      dueDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: { projectId: project.id, userId: employee.id },
    },
    update: {},
    create: { projectId: project.id, userId: employee.id },
  });

  const tasks = await prisma.task.findMany({ where: { projectId: project.id } });
  if (tasks.length === 0) {
    await prisma.task.createMany({
      data: [
        {
          title: "Wireframes",
          description: "Low-fidelity wireframes for all key pages.",
          projectId: project.id,
          assigneeId: employee.id,
          status: TaskStatus.DONE,
          priority: Priority.HIGH,
          clientVisible: true,
        },
        {
          title: "Homepage hero design",
          description: "High-fidelity hero section design.",
          projectId: project.id,
          assigneeId: employee.id,
          status: TaskStatus.IN_PROGRESS,
          priority: Priority.HIGH,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          clientVisible: true,
        },
        {
          title: "Contact form integration",
          description: "Wire up the contact form to the CRM.",
          projectId: project.id,
          assigneeId: employee.id,
          status: TaskStatus.BLOCKED,
          priority: Priority.MEDIUM,
          clientVisible: false,
        },
      ],
    });
  }

  await prisma.milestone.upsert({
    where: { id: "seed-milestone-1" },
    update: {},
    create: {
      id: "seed-milestone-1",
      name: "Design sign-off",
      projectId: project.id,
      dueDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
    },
  });

  const updates = await prisma.projectUpdate.findMany({
    where: { projectId: project.id },
  });
  if (updates.length === 0) {
    await prisma.projectUpdate.create({
      data: {
        title: "Kickoff complete",
        body: "Kicked off the redesign. Wireframes are approved and the first artboards are in progress.",
        progress: 40,
        projectId: project.id,
        authorId: employee.id,
      },
    });
  }

  const deliverables = await prisma.deliverable.findMany({
    where: { projectId: project.id },
  });
  if (deliverables.length === 0) {
    await prisma.deliverable.create({
      data: {
        name: "Hero concept v1",
        description: "First pass at the hero section.",
        projectId: project.id,
        uploaderId: employee.id,
        status: "AWAITING_CLIENT_REVIEW",
      },
    });
  }

  console.log("Seeded demo data.");
  console.log(`  Admin:     ${admin.email}`);
  console.log(`  Employee:  ${employee.email}`);
  console.log(`  Client:    ${client.email} (${company.name})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());