import { getAccessToken } from "./google-auth";
import type { FileEntry } from "./drive";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export async function writeToSheet(
  serviceAccountKey: string,
  spreadsheetId: string,
  sheetName: string,
  files: FileEntry[],
): Promise<void> {
  const token = await getAccessToken(serviceAccountKey);

  // Clear existing data rows (preserve header in row 1)
  await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A2:B:clear`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  // Write file names in column A, IDs in column B, starting at row 2
  const values = files.map((f) => [f.name, f.id]);

  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A2?valueInputOption=RAW`,
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
