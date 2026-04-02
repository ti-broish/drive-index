import { getAccessToken } from "./google-auth";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

interface DriveListResponse {
  nextPageToken?: string;
  files: DriveFile[];
}

interface WatchResponse {
  id: string;
  resourceId: string;
  expiration: string;
}

export interface FileEntry {
  name: string;
  id: string;
}

async function driveGet(
  path: string,
  token: string,
  params?: Record<string, string>,
): Promise<Response> {
  const url = new URL(`${DRIVE_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive API ${path} failed (${res.status}): ${text}`);
  }
  return res;
}

export async function listFilesInFolder(
  serviceAccountKey: string,
  folderId: string,
): Promise<FileEntry[]> {
  const token = await getAccessToken(serviceAccountKey);
  return listFilesRecursive(token, folderId);
}

async function listFilesRecursive(
  token: string,
  folderId: string,
): Promise<FileEntry[]> {
  const files: FileEntry[] = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, string> = {
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    };
    if (pageToken) {
      params.pageToken = pageToken;
    }

    const res = await driveGet("/files", token, params);
    const data: DriveListResponse = await res.json();

    for (const item of data.files) {
      files.push({ name: item.name, id: item.id });
      if (item.mimeType === "application/vnd.google-apps.folder") {
        const children = await listFilesRecursive(token, item.id);
        files.push(...children);
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}

// Uses the Changes API to watch for any changes on the drive.
// When a notification fires, the worker does a full reindex of the folder.
export async function setupWatch(
  serviceAccountKey: string,
  folderId: string,
  webhookUrl: string,
  webhookSecret: string,
): Promise<WatchResponse> {
  const token = await getAccessToken(serviceAccountKey);

  // Get the current change token — we watch from this point forward
  const startRes = await driveGet("/changes/startPageToken", token, {
    supportsAllDrives: "true",
  });
  const { startPageToken } = await startRes.json<{ startPageToken: string }>();

  const channelId = crypto.randomUUID();

  const res = await fetch(
    `${DRIVE_API}/changes/watch?pageToken=${encodeURIComponent(startPageToken)}&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address: webhookUrl,
        token: webhookSecret,
        params: {
          ttl: "604800",
        },
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Watch setup failed (${res.status}): ${text}`);
  }

  return res.json();
}

export async function stopWatch(
  serviceAccountKey: string,
  channelId: string,
  resourceId: string,
): Promise<void> {
  const token = await getAccessToken(serviceAccountKey);

  const res = await fetch(`${DRIVE_API}/channels/stop`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: channelId, resourceId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stop watch failed (${res.status}): ${text}`);
  }
}
