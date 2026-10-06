export interface WorkoutPreferences {
  facilityEquipment: string[];
  customEquipment: string[];
  favoriteExercises: string[];
}

export const defaultWorkoutPreferences: WorkoutPreferences = {
  facilityEquipment: [],
  customEquipment: [],
  favoriteExercises: [],
};
