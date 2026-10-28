"use client";

import { storage } from "@/client/storage";
import { useEffect, useState } from "react";

export function SavedFileKey({ offerId }: { offerId: string }) {
  const [fileKey, setFileKey] = useState("");

  useEffect(() => {
    setFileKey(storage.get(`ash-content-key:${offerId}`) ?? "");
  }, [offerId]);

  if (!fileKey) {
    return <p className="banner">This browser does not have the file key. Paste it on the exchange if you saved a copy. Without it, delivery cannot be allowed from this browser.</p>;
  }

  return (
    <label>
      File key saved in this browser
      <textarea readOnly value={fileKey} spellCheck={false} />
      <span className="field-hint">Leave this browser open. Allow delivery uses this key. It is not sent to the buyer as plain text.</span>
    </label>
  );
}
