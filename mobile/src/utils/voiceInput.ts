import { NativeModules, Platform } from 'react-native';

interface VoiceInputNative {
  startVoiceRecognition(prompt: string, languageTag: string): Promise<string>;
}

const VoiceInputModule = NativeModules.VoiceInputModule as VoiceInputNative | undefined;

export async function recognizeSpeech(
  prompt = 'Speak Consignor / Party Name',
  languageTag = 'en-IN',
): Promise<string> {
  if (Platform.OS !== 'android' || !VoiceInputModule) {
    throw new Error('Voice input is supported on Android devices with Google Speech Services.');
  }
  const text = await VoiceInputModule.startVoiceRecognition(prompt, languageTag);
  return (text ?? '').trim();
}
