package `in`.fleetapp.driver

import android.app.Activity
import android.content.Intent
import android.speech.RecognizerIntent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

class VoiceInputModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var pendingPromise: Promise? = null

  private val activityEventListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != REQUEST_CODE_VOICE) return
      val promise = pendingPromise ?: return
      pendingPromise = null

      if (resultCode == Activity.RESULT_OK && data != null) {
        val matches = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
        promise.resolve(matches?.firstOrNull() ?: "")
      } else {
        promise.resolve("")
      }
    }
  }

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName(): String = "VoiceInputModule"

  @ReactMethod
  fun startVoiceRecognition(prompt: String, languageTag: String, promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "No active screen to launch voice input")
      return
    }
    pendingPromise = promise

    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, if (languageTag.isNotEmpty()) languageTag else Locale.getDefault().toLanguageTag())
      putExtra(RecognizerIntent.EXTRA_PROMPT, if (prompt.isNotEmpty()) prompt else "Speak Party / Consignor Name")
    }

    try {
      activity.startActivityForResult(intent, REQUEST_CODE_VOICE)
    } catch (e: Exception) {
      pendingPromise = null
      promise.reject("VOICE_UNAVAILABLE", e.message ?: "Voice recognition is not available on this device")
    }
  }

  companion object {
    private const val REQUEST_CODE_VOICE = 9412
  }
}
