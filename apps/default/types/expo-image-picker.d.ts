declare module "expo-image-picker" {
  export type MediaType = "images" | "videos";
  export interface ImagePickerResult {
    canceled: boolean;
    assets?: Array<{
      uri: string;
      mimeType?: string;
      fileName?: string;
      width: number;
      height: number;
      duration?: number;
    }>;
  }
  export enum CameraType {
    back = "back",
    front = "front",
  }
  export interface ImagePickerOptions {
    mediaTypes?: MediaType[];
    allowsEditing?: boolean;
    quality?: number;
    aspect?: [number, number];
    cameraType?: CameraType;
  }
  export function launchImageLibraryAsync(options?: ImagePickerOptions): Promise<ImagePickerResult>;
  export function launchCameraAsync(options?: ImagePickerOptions): Promise<ImagePickerResult>;
  export function requestMediaLibraryPermissionsAsync(): Promise<{ status: string }>;
  export function requestCameraPermissionsAsync(): Promise<{ status: string; granted: boolean }>;
}
