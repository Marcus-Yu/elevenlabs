import { useState } from "react";
import { getModelProcessingConsent, setModelProcessingConsent, useQuery } from "wasp/client/operations";

/** Reusable account-wide consent control; gateway rules remain authoritative. */
export function ModelProcessingConsent({ description = "Allow Atlas to send relevant information to model providers." }: { description?: string }) {
  const { data, isLoading, error } = useQuery(getModelProcessingConsent);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(false);
  async function change(granted: boolean) {
    setBusy(true); setFailure(false);
    try { await setModelProcessingConsent({ granted }); }
    catch { setFailure(true); }
    finally { setBusy(false); }
  }
  return <section aria-label="Model processing consent">
    <h2>Model processing</h2>
    <p>{description}</p>
    {isLoading ? <p role="status">Checking consent…</p> : error ? <p role="alert">Could not load consent.</p> : <>
      <p>Consent: {data?.granted ? "On" : "Off"}</p>
      <button type="button" disabled={busy} onClick={() => void change(!data?.granted)}>{data?.granted ? "Revoke consent" : "Allow model processing"}</button>
    </>}
    {failure && <p role="alert">Could not update consent. Try again.</p>}
  </section>;
}
