import { getAccessToken } from "./google-auth";
import type { FileEntry } from "./drive";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export async function writeToSheet(
  serviceAccountKey: string,
  spreadsheetId: string,
  files: FileEntry[],
): Promise<void> {
  const token = await getAccessToken(serviceAccountKey);

  // Clear existing data
  await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/Sheet1!A:B:clear`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  // Write header + data
  const values = [
    ["File", "ID"],
    ...files.map((f) => [f.name, f.id]),
  ];

  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/Sheet1!A1?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API write failed (${res.status}): ${text}`);
  }
}
