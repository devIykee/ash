import { newId } from "@/domain/ids";
import { DISCLOSURES } from "@/domain/types";
import type { Tx } from "@/store/types";
import { assertPerson, type Actor } from "./common";
import { createOperation, saveOperation } from "./events";

export async function recordMemoCheck(
  tx: Tx,
  actor: Actor,
  input: { findingCount: number; dismissedCount: number; rulesVersion: string },
) {
  assertPerson(actor);
  const id = newId("op");
  const created = await createOperation(tx, {
    id,
    type: "memo_check",
    state: "draft",
    initiatorId: actor.user.id,
    participantIds: [actor.user.id],
    label: `Memo check, ${input.findingCount} findings`,
    parentId: null,
    payment: null,
    access: null,
    disclosures: [DISCLOSURES.memo],
  });
  await tx.put(
    "memo_check",
    id,
    {
      findingCount: input.findingCount,
      dismissedCount: input.dismissedCount,
      rulesVersion: input.rulesVersion,
      memoStored: false,
    },
    null,
  );
  const saved = await saveOperation(tx, created, { ...created.data, state: "completed" }, "completed", "counts only");
  return {
    version: saved.version,
    operation: saved.data,
    storedFields: ["findingCount", "dismissedCount", "rulesVersion", "memoStored"],
  };
}
