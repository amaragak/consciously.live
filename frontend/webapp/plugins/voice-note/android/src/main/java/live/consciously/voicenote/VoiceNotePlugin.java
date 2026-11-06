package live.consciously.voicenote;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Android: AudioRecord → AAC/m4a file + optional on-device SpeechRecognizer.
 * When on-device speech isn't available, still record and return empty transcript
 * with a reason (server fallback later).
 */
@CapacitorPlugin(
    name = "VoiceNote",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
    }
)
public class VoiceNotePlugin extends Plugin {
    private static final String TAG = "VoiceNote";

    private final Handler main = new Handler(Looper.getMainLooper());
    private final AtomicBoolean running = new AtomicBoolean(false);
    private Thread captureThread;
    private File outFile;
    private long startedAtMs;
    private final ArrayList<Double> levels = new ArrayList<>();
    private final StringBuilder committed = new StringBuilder();
    private String partial = "";
    private String speechReason;
    private SpeechRecognizer speechRecognizer;
    private boolean restartPending;
    private String language = Locale.getDefault().toLanguageTag();
    private MediaRecorder fallbackRecorder;

    @PluginMethod
    public void isOnDeviceAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        boolean available = SpeechRecognizer.isRecognitionAvailable(getContext());
        boolean onDevice = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                onDevice = SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
            } catch (Exception e) {
                onDevice = false;
            }
        }
        ret.put("available", available);
        ret.put("onDevice", onDevice);
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (running.get()) {
            call.reject("Already recording");
            return;
        }
        language = call.getString("language", Locale.getDefault().toLanguageTag());
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("microphone", call, "micPerm");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void micPerm(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED) {
            begin(call);
        } else {
            call.reject("Microphone permission denied");
        }
    }

    private void begin(PluginCall call) {
        speechReason = null;
        committed.setLength(0);
        partial = "";
        levels.clear();
        startedAtMs = System.currentTimeMillis();

        boolean onDevice = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                onDevice = SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
            } catch (Exception e) {
                onDevice = false;
            }
        }
        if (!onDevice) {
            speechReason = "on-device-unavailable";
        }

        outFile = new File(getContext().getFilesDir(), "voice-note-" + System.currentTimeMillis() + ".m4a");

        // Reliable clip path: MediaRecorder for the m4a. SpeechRecognizer runs
        // separately for live text when on-device is available (Android cannot
        // easily tee AudioRecord into both AAC and the system recogniser).
        try {
            fallbackRecorder = new MediaRecorder();
            fallbackRecorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            fallbackRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            fallbackRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            fallbackRecorder.setAudioEncodingBitRate(64000);
            fallbackRecorder.setAudioSamplingRate(44100);
            fallbackRecorder.setOutputFile(outFile.getAbsolutePath());
            fallbackRecorder.prepare();
            fallbackRecorder.start();
        } catch (IOException | RuntimeException e) {
            teardown(true);
            call.reject("Failed to start: " + e.getMessage());
            return;
        }

        running.set(true);
        startAmplitudePoll();
        if (speechReason == null) {
            startRecognizer(language);
        }
        call.resolve();
    }

    private void startAmplitudePoll() {
        captureThread = new Thread(() -> {
            while (running.get() && fallbackRecorder != null) {
                try {
                    int amp = fallbackRecorder.getMaxAmplitude();
                    double level = Math.min(1.0, amp / 16000.0);
                    synchronized (levels) {
                        levels.add(level);
                        if (levels.size() > 12000) {
                            levels.subList(0, levels.size() - 12000).clear();
                        }
                    }
                    JSObject ev = new JSObject();
                    ev.put("level", level);
                    notifyListeners("level", ev);
                    Thread.sleep(50);
                } catch (Exception e) {
                    break;
                }
            }
        }, "VoiceNoteLevels");
        captureThread.start();
    }

    private SpeechRecognizer createRecognizer() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                if (SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) {
                    return SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
                }
            } catch (Exception e) {
                Log.w(TAG, "on-device recognizer", e);
            }
        }
        return null;
    }

    private void startRecognizer(String lang) {
        main.post(() -> {
            destroyRecognizer();
            speechRecognizer = createRecognizer();
            if (speechRecognizer == null) {
                speechReason = "on-device-unavailable";
                return;
            }
            speechRecognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) {}
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() {}
                @Override public void onEvent(int eventType, Bundle params) {}
                @Override public void onPartialResults(Bundle partialResults) {
                    ArrayList<String> list = partialResults != null
                        ? partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        : null;
                    partial = list != null && !list.isEmpty() ? list.get(0).trim() : "";
                    emitPartial();
                }
                @Override public void onError(int error) {
                    if (!running.get()) return;
                    scheduleRestart(lang);
                }
                @Override public void onResults(Bundle results) {
                    ArrayList<String> list = results != null
                        ? results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        : null;
                    String text = list != null && !list.isEmpty() ? list.get(0).trim() : "";
                    if (!text.isEmpty()) {
                        if (committed.length() > 0) committed.append(' ');
                        committed.append(text);
                        partial = "";
                        emitPartial();
                    }
                    if (running.get()) scheduleRestart(lang);
                }
            });
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
            try {
                speechRecognizer.startListening(intent);
            } catch (Exception e) {
                speechReason = "speech-start-failed";
            }
        });
    }

    private void scheduleRestart(String lang) {
        if (restartPending || !running.get()) return;
        restartPending = true;
        main.postDelayed(() -> {
            restartPending = false;
            if (running.get()) startRecognizer(lang);
        }, 120);
    }

    private void emitPartial() {
        String live = committed.length() == 0
            ? partial
            : (partial.isEmpty() ? committed.toString() : committed + " " + partial);
        JSObject ev = new JSObject();
        ev.put("text", live);
        notifyListeners("partial", ev);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (!running.get()) {
            call.reject("Not recording");
            return;
        }
        running.set(false);
        destroyRecognizer();
        try {
            if (fallbackRecorder != null) fallbackRecorder.stop();
        } catch (RuntimeException e) {
            Log.w(TAG, "recorder.stop", e);
        }
        try {
            if (fallbackRecorder != null) fallbackRecorder.release();
        } catch (RuntimeException ignored) {}
        fallbackRecorder = null;
        if (captureThread != null) {
            try { captureThread.join(500); } catch (InterruptedException ignored) {}
            captureThread = null;
        }

        String transcript = committed.toString().trim();
        if (!partial.isEmpty()) {
            transcript = transcript.isEmpty() ? partial : transcript + " " + partial;
        }
        int durationMs = (int) Math.max(1, System.currentTimeMillis() - startedAtMs);
        JSArray wave = downsample(levels, 60);

        JSObject ret = new JSObject();
        String path = outFile != null ? outFile.getAbsolutePath() : "";
        ret.put("filePath", path);
        ret.put("durationMs", durationMs);
        ret.put("transcript", transcript);
        ret.put("waveform", wave);
        if (speechReason != null) ret.put("reason", speechReason);
        call.resolve(ret);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        teardown(true);
        call.resolve();
    }

    private void destroyRecognizer() {
        if (speechRecognizer != null) {
            try {
                speechRecognizer.cancel();
                speechRecognizer.destroy();
            } catch (Exception e) {
                Log.w(TAG, "destroyRecognizer", e);
            }
            speechRecognizer = null;
        }
    }

    private void teardown(boolean deleteFile) {
        running.set(false);
        destroyRecognizer();
        if (fallbackRecorder != null) {
            try { fallbackRecorder.release(); } catch (Exception ignored) {}
            fallbackRecorder = null;
        }
        if (captureThread != null) {
            try { captureThread.join(300); } catch (InterruptedException ignored) {}
            captureThread = null;
        }
        if (deleteFile && outFile != null && outFile.exists()) {
            //noinspection ResultOfMethodCallIgnored
            outFile.delete();
        }
        outFile = null;
        levels.clear();
        committed.setLength(0);
        partial = "";
    }

    private static JSArray downsample(ArrayList<Double> levels, int count) {
        JSArray out = new JSArray();
        if (levels.isEmpty()) {
            for (int i = 0; i < count; i++) out.put(0.12);
            return out;
        }
        if (levels.size() <= count) {
            for (Double d : levels) out.put(d);
            return out;
        }
        double step = (double) levels.size() / count;
        for (int i = 0; i < count; i++) {
            int start = (int) Math.floor(i * step);
            int end = (int) Math.floor((i + 1) * step);
            double peak = 0;
            for (int j = start; j < Math.max(start + 1, end) && j < levels.size(); j++) {
                peak = Math.max(peak, levels.get(j));
            }
            out.put(peak);
        }
        return out;
    }
}
