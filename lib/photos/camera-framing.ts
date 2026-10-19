/** Center crop matching a 3:4 camera preview rendered with object-fit: cover. */
export function getPortraitCrop(videoWidth: number, videoHeight: number) {
  if (!Number.isFinite(videoWidth) || !Number.isFinite(videoHeight) || videoWidth <= 0 || videoHeight <= 0) {
    throw new Error("カメラ映像のサイズを取得できません。");
  }
  const width = Math.min(videoWidth, videoHeight * 3 / 4);
  const height = width * 4 / 3;
  return { x: (videoWidth - width) / 2, y: (videoHeight - height) / 2, width, height };
}
