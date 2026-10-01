export interface WeightEntry {
  id: string;
  measuredOn: string;
  weightKg: number;
  createdAt: string;
}

export type BodyPhotoView = "front" | "back";

export const bodyPhotoViewLabels: Record<BodyPhotoView, string> = {
  front: "正面",
  back: "背面",
};

export interface BodyPhotoEntry {
  id: string;
  view: BodyPhotoView;
  imageUrl: string;
  capturedAt: string;
  createdAt: string;
}
