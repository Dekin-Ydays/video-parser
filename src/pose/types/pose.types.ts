export type MediapipeLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  presence?: number;
};

export type PoseFrame = {
  timestamp: number;
  landmarks: MediapipeLandmark[];
  rawType?: string;
};
