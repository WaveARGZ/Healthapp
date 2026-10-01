import { normalizePhoto } from "@/lib/photos/body-warp";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Shrink a camera image before it is kept in local storage or edited on Canvas. */
export async function normalizePhotoFile(file: File): Promise<string> {
  return normalizePhoto(await readAsDataUrl(file));
}
