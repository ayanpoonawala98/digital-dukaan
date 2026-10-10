// Server-side ImageKit upload. The private key must never reach the browser.
export async function uploadImageKit(file, fileName, folder) {
  const key = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!key) throw new Error('IMAGEKIT_PRIVATE_KEY is missing');
  const data = new FormData();
  data.append('file', new Blob([file]), fileName);
  data.append('fileName', fileName);
  data.append('folder', folder);
  data.append('useUniqueFileName', 'true');
  const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
    method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` }, body: data
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.url !== 'string' || !result.url.startsWith('https://')) throw new Error(`ImageKit upload failed (${response.status})`);
  return result.url;
}
