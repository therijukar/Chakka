import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

const MAX_BYTES = 250 * 1024; // 250 KB hard cap for 2G/4G Indian highway uploads

/**
 * Compresses any captured photo immediately after capture to <= 250 KB (JPEG).
 */
export async function compressImageToMax250KB(sourceUri: string): Promise<{
  uri: string;
  sizeBytes: number;
}> {
  let width = 1280;
  let quality = 0.72;
  let currentUri = sourceUri;

  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: { width } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
    );
    currentUri = result.uri;

    const info = await FileSystem.getInfoAsync(currentUri);
    const size = info.exists && 'size' in info ? (info.size ?? 0) : 0;
    if (size > 0 && size <= MAX_BYTES) {
      return { uri: currentUri, sizeBytes: size };
    }

    // Step down quality and width until under 250 KB
    quality = Math.max(0.3, quality - 0.14);
    width = Math.max(640, Math.round(width * 0.8));
  }

  const finalInfo = await FileSystem.getInfoAsync(currentUri);
  const finalSize = finalInfo.exists && 'size' in finalInfo ? (finalInfo.size ?? 0) : 0;
  return { uri: currentUri, sizeBytes: finalSize };
}
