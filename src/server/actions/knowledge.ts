"use server";

import { revalidatePath } from "next/cache";
import { scheduleEmbedding } from "@/server/services/embedding-runtime";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireTenant } from "@/server/auth/session";
import { knowledgeInputSchema } from "@/server/services/knowledge";

export type KnowledgeFormState =
  | {
      fieldErrors?: Partial<
        Record<"question" | "content" | "category" | "language", "required" | "tooLong">
      >;
      error?: "generic";
    }
  | undefined;

const localeSchema = z.enum(["ko", "ja", "en"]).catch("ko");

function formToInput(formData: FormData) {
  return {
    propertyId: formData.get("propertyId"),
    category: formData.get("category"),
    question: formData.get("question"),
    content: formData.get("content"),
    language: formData.get("language"),
    active: formData.get("active") === "on",
  };
}

export async function saveKnowledgeItem(
  _prev: KnowledgeFormState,
  formData: FormData,
): Promise<KnowledgeFormState> {
  const locale = localeSchema.parse(formData.get("locale"));
  const { user, db } = await requireTenant(locale);
  const id = typeof formData.get("id") === "string" ? String(formData.get("id")) : "";

  const parsed = knowledgeInputSchema.safeParse(formToInput(formData));
  if (!parsed.success) {
    const fieldErrors: NonNullable<KnowledgeFormState>["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "question" || key === "content" || key === "category" || key === "language") {
        fieldErrors[key] = issue.code === "too_big" ? "tooLong" : "required";
      }
    }
    return { fieldErrors };
  }
  const input = parsed.data;

  // Property must belong to the tenant (scoped lookup).
  const property = await db.property.findUnique({ where: { id: input.propertyId } });
  if (!property) return { error: "generic" };

  if (id) {
    const result = await db.knowledgeItem.updateMany({
      where: { id, propertyId: property.id },
      data: {
        category: input.category,
        question: input.question,
        content: input.content,
        language: input.language,
        active: input.active,
        embeddingModel: null, // content changed: vector is stale
      },
    });
    if (result.count === 0) return { error: "generic" };
  } else {
    const created = await db.knowledgeItem.create({
      data: { ...input, organizationId: user.organizationId },
    });
    // Created from an unanswered question: link it so the question leaves the list.
    const escalationId = formData.get("escalationId");
    if (typeof escalationId === "string" && escalationId) {
      await db.escalation.updateMany({
        where: {
          id: escalationId,
          reason: "UNKNOWN_ANSWER",
          conversation: { propertyId: property.id },
        },
        data: { addedKnowledgeItemId: created.id },
      });
      revalidatePath(`/${locale}/knowledge/unanswered`);
    }
  }

  scheduleEmbedding(user.organizationId, property.id);
  revalidatePath(`/${locale}/knowledge`);
  redirect(`/${locale}/knowledge?property=${property.id}`);
}

export async function deleteKnowledgeItem(formData: FormData) {
  const locale = localeSchema.parse(formData.get("locale"));
  const { db } = await requireTenant(locale);
  const id = z.string().min(1).parse(formData.get("id"));
  const propertyId = z.string().min(1).parse(formData.get("propertyId"));
  await db.knowledgeItem.deleteMany({ where: { id, propertyId } });
  revalidatePath(`/${locale}/knowledge`);
  redirect(`/${locale}/knowledge?property=${propertyId}`);
}

/** Removes an unanswered question from the list without adding knowledge. */
export async function dismissUnansweredQuestion(formData: FormData) {
  const locale = localeSchema.parse(formData.get("locale"));
  const { db } = await requireTenant(locale);
  const id = z.string().min(1).parse(formData.get("escalationId"));
  await db.escalation.updateMany({
    where: { id, reason: "UNKNOWN_ANSWER" },
    data: { knowledgeDismissedAt: new Date() },
  });
  revalidatePath(`/${locale}/knowledge/unanswered`);
}
