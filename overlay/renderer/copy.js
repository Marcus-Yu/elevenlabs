// Plain-language copy for the overlay cards (same wording as the web app).

export const TITLES = { brief: "Your hire", research: "Research", shortlist: "Candidates", gateway: "Privacy and approvals" };

const STATUS = { needs_ok: "Needs your OK", approved: "Approved", scanning: "Searching…", done: "Done", PENDING: "Waiting", EXECUTED: "Done" };
export const statusWord = (s) => STATUS[s] ?? s;

/** "3/3" → "Meets 3 of 3 criteria". */
export function fitText(fit) {
  const [got, of] = String(fit).split("/");
  return of ? `Meets ${got} of ${of} criteria` : String(fit);
}

/** "...Raise the minimum to 4 years?" → "Confirm: raise minimum to 4 years". */
export function confirmLabel(explanation) {
  const m = /raise the minimum to (\d+) years?/i.exec(explanation || "");
  return m ? `Confirm: raise minimum to ${m[1]} years` : "Confirm change";
}
